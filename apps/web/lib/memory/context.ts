/**
 * Context Builder — capa de datos. [§16, §17, §37, §38]
 *
 *   BD ──► (ajustes ∥ memorias ∥ tareas ∥ eventos) ──► buildContextBlock ──► system prompt
 *
 * `context-format.ts` es PURO (sin BD). Este archivo es la parte con E/S que le
 * da de comer. Se mantienen separados para que el ensamblado —lo delicado— se
 * pruebe sin base de datos.
 *
 * PRINCIPIOS
 * ──────────
 * 1. NUNCA romper el chat. La memoria mejora la respuesta; no es requisito para
 *    darla. Cualquier error aquí se registra y se devuelve contexto vacío.
 * 2. NUNCA bloquear el primer token [§38]. Las cuatro lecturas van en paralelo
 *    y con un TIMEOUT duro: si la BD tarda, se responde sin contexto.
 * 3. RESPETAR LA PRIVACIDAD [§37]. Si `memory_enabled` es falso no se lee ni una
 *    memoria: ni siquiera se hace la consulta.
 * 4. AISLAMIENTO. Todas las consultas filtran por `userId` de la sesión.
 */

import { prisma } from "@ai-saas/database";
import { createLogger } from "@/lib/observability/logger";
import { buildContextBlock, type BuiltContext, type ContextMemory } from "./context-format";
import type { MemoryCategory, MemoryKind } from "./taxonomy";
import { searchSemanticMemories } from "./semantic";

const log = createLogger("memory.context");

/** Cuánto se espera al contexto antes de responder sin él. */
export const CONTEXT_TIMEOUT_MS = 1_200;

/** Cuántas filas se traen de cada tabla (el presupuesto de tokens recorta después). */
const MEMORY_FETCH_LIMIT = 60;
const TASK_FETCH_LIMIT = 10;
const EVENT_FETCH_LIMIT = 8;
/** Ventana de eventos a considerar. */
const EVENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface UserContextSettings {
  memoryEnabled: boolean;
  memoryLearningEnabled: boolean;
  proactiveEnabled: boolean;
}

/** Valores por defecto si el usuario nunca tocó sus ajustes (no hay fila). */
export const DEFAULT_SETTINGS: UserContextSettings = {
  memoryEnabled: true,
  memoryLearningEnabled: true,
  proactiveEnabled: false,
};

export async function loadSettings(userId: string): Promise<UserContextSettings> {
  const row = await prisma.userSettings.findUnique({
    where: { userId },
    select: { memoryEnabled: true, memoryLearningEnabled: true, proactiveEnabled: true },
  });
  return row ?? DEFAULT_SETTINGS;
}

export interface LoadedContext {
  /** Texto para el system prompt. Cadena vacía si no hay nada que aportar. */
  text: string;
  settings: UserContextSettings;
  built: BuiltContext | null;
  /** IDs de las memorias incluidas, para marcar `last_used_at`. */
  memoryIds: string[];
  /**
   * Las mismas memorias con su `lastUsedAt` actual (ya leído: cero consultas
   * extra). Es lo que necesita `usage-rules.selectIdsToTouch` para decidir qué
   * marcar sin volver a la BD. Aditivo: `memoryIds` no cambia.
   */
  memoryUsage: { id: string; lastUsedAt: Date | null }[];
  /** true si se degradó a contexto vacío por error o timeout. */
  degraded: boolean;
}

const EMPTY = (settings: UserContextSettings, degraded: boolean): LoadedContext => ({
  text: "",
  settings,
  built: null,
  memoryIds: [],
  memoryUsage: [],
  degraded,
});

/** Rechaza si `p` no termina en `ms`. Limpia el temporizador (sin fugas). */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} superó ${ms} ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Carga y ensambla el contexto del usuario para UNA petición de chat.
 * Nunca lanza.
 */
export async function loadUserContext(
  userId: string,
  opts: {
    now?: Date;
    timeoutMs?: number;
    userName?: string | null;
    timezone?: string | null;
    query?: string;
  } = {}
): Promise<LoadedContext> {
  const now = opts.now ?? new Date();
  let settings = DEFAULT_SETTINGS;

  try {
    return await withTimeout(
      (async (): Promise<LoadedContext> => {
        // 1) Ajustes primero: si la memoria está apagada no se lee NADA más.
        settings = await loadSettings(userId);
        if (!settings.memoryEnabled) return EMPTY(settings, false);

        // 2) Lo demás, en paralelo.
        const [tzRow, memRows, taskRows, eventRows, semanticHits] = await Promise.all([
          opts.timezone !== undefined
            ? Promise.resolve({ timezone: opts.timezone })
            : prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
          prisma.userMemory.findMany({
            where: {
              userId,
              status: "active",
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
            take: MEMORY_FETCH_LIMIT,
          }),
          prisma.task.findMany({
            where: { userId, status: { in: ["open", "in_progress"] } },
            orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { priority: "desc" }],
            take: TASK_FETCH_LIMIT,
          }),
          prisma.event.findMany({
            where: {
              userId,
              startsAt: { gte: new Date(now.getTime() - 3_600_000), lte: new Date(now.getTime() + EVENT_WINDOW_MS) },
            },
            orderBy: { startsAt: "asc" },
            take: EVENT_FETCH_LIMIT,
          }),
          opts.query ? searchSemanticMemories(userId, opts.query, { limit: 8 }) : Promise.resolve([]),
        ]);

        const semanticById = new Map(semanticHits.map((h) => [h.id, h.relevance]));

        const missingSemanticIds = semanticHits
          .map((h) => h.id)
          .filter((id) => !memRows.some((r) => r.id === id));

        const semanticRows = missingSemanticIds.length
          ? await prisma.userMemory.findMany({
              where: {
                id: { in: missingSemanticIds },
                userId,
                status: "active",
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
              },
            })
          : [];

        const allMemoryRows = [...memRows, ...semanticRows];

        const memories: ContextMemory[] = allMemoryRows.map((r) => ({
          id: r.id,
          category: r.category as MemoryCategory,
          key: r.key,
          value: r.value,
          kind: r.kind as MemoryKind,
          relevance: semanticById.get(r.id),
          confidence: r.confidence,
          importance: r.importance,
          expiresAt: r.expiresAt,
          updatedAt: r.updatedAt,
        }));

        const built = buildContextBlock({
          userName: opts.userName,
          timezone: tzRow?.timezone ?? null,
          memories,
          tasks: taskRows.map((t) => ({ title: t.title, status: t.status, priority: t.priority, dueAt: t.dueAt })),
          events: eventRows.map((e) => ({ title: e.title, startsAt: e.startsAt, allDay: e.allDay })),
          now,
        });

        // Los ids que el ensamblador ELIGIÓ de verdad (por puntuación, no por el
        // orden de la consulta). Es lo que se marca como "usado".
        const memoryIds = built.includedMemoryIds;
        // lastUsedAt de cada memoria INCLUIDA, en el mismo orden (por puntuación).
        const lastUsedById = new Map(allMemoryRows.map((r) => [r.id, r.lastUsedAt ?? null] as const));
        const memoryUsage = memoryIds.map((id) => ({ id, lastUsedAt: lastUsedById.get(id) ?? null }));

        log.info("context.loaded", {
          userId,
          approxTokens: built.approxTokens,
          included: built.included,
          dropped: built.dropped,
        });
        return { text: built.text, settings, built, memoryIds, memoryUsage, degraded: false };
      })(),
      opts.timeoutMs ?? CONTEXT_TIMEOUT_MS,
      "loadUserContext"
    );
  } catch (err) {
    // Fallo o timeout: el chat sigue, sin contexto.
    log.warn("context.degraded", { userId, err });
    return EMPTY(settings, true);
  }
}
