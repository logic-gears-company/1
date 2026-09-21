/**
 * Almacén de memorias: CRUD por usuario. [§3, §10, §36, §37]
 *
 * AISLAMIENTO POR USUARIO — el control PRIMARIO hoy
 * ─────────────────────────────────────────────────
 * Prisma se conecta con un rol que se salta RLS (ver docs/SEGURIDAD-RLS.md), así
 * que las políticas de la BD NO protegen estas consultas. Lo que impide que un
 * usuario lea o borre memorias ajenas es que TODA función de este archivo:
 *   · recibe `userId` como PRIMER argumento, obligatorio;
 *   · lo incluye en el `where` de CADA consulta, también en update/delete
 *     (nunca `where: { id }` a secas: eso permitiría IDOR — actuar sobre la
 *     memoria de otro conociendo su id).
 * El `userId` sale SIEMPRE de la sesión del servidor (`auth()`), jamás del
 * cuerpo de la petición. Los endpoints usan `.strict()` en sus schemas para
 * que ni siquiera se pueda enviar un `userId` ajeno.
 *
 * Los `updateMany`/`deleteMany` con `where: { id, userId }` devuelven
 * `count: 0` si la memoria no es del usuario: el llamador lo ve como "no
 * encontrada" (404), sin revelar que el id existe para otra persona.
 */

import { prisma, Prisma } from "@ai-saas/database";
import { createLogger } from "@/lib/observability/logger";
import { syncMemoryEmbedding } from "./semantic";
import {
  type MemoryCategory,
  type MemoryEdit,
  type MemoryInput,
  type MemoryView,
  memoryInputSchema,
} from "./schemas";

const log = createLogger("memory.store");

type Row = Awaited<ReturnType<typeof prisma.userMemory.findFirstOrThrow>>;

export function toView(r: Row): MemoryView {
  return {
    id: r.id,
    category: r.category as MemoryCategory,
    key: r.key,
    value: r.value,
    kind: r.kind as MemoryView["kind"],
    durability: r.durability as MemoryView["durability"],
    source: r.source as MemoryView["source"],
    confidence: r.confidence,
    importance: r.importance,
    reason: r.reason,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Filtro común: solo memorias ACTIVAS y NO caducadas. La caducidad se evalúa
 *  al leer (no depende de que un job de purga haya corrido). */
function liveWhere(userId: string, now: Date): Prisma.UserMemoryWhereInput {
  return {
    userId,
    status: "active",
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

// ── Lectura ─────────────────────────────────────────────────────────────────

export async function listMemories(
  userId: string,
  opts: { categories?: MemoryCategory[]; limit?: number; now?: Date } = {}
): Promise<MemoryView[]> {
  const rows = await prisma.userMemory.findMany({
    where: {
      ...liveWhere(userId, opts.now ?? new Date()),
      ...(opts.categories?.length ? { category: { in: opts.categories } } : {}),
    },
    orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
    take: Math.min(opts.limit ?? 200, 500),
  });
  return rows.map(toView);
}

export async function getMemory(userId: string, id: string): Promise<MemoryView | null> {
  const r = await prisma.userMemory.findFirst({ where: { id, userId, status: "active" } });
  return r ? toView(r) : null;
}

// ── Escritura ───────────────────────────────────────────────────────────────

export type UpsertOutcome =
  | { ok: true; memory: MemoryView; created: boolean }
  | { ok: false; reason: "suppressed" | "invalid"; detail?: string };

/**
 * Crea o actualiza la memoria activa de (usuario, categoría, clave).
 *
 * "NO RECUERDES ESTO" [§37]: si el usuario suprimió esa clave, NO se reaprende.
 * Devuelve `{ ok:false, reason:"suppressed" }` sin escribir nada. Solo el propio
 * usuario puede reactivarla (`allowSuppressed`, usado por la edición manual).
 */
export async function upsertMemory(
  userId: string,
  raw: unknown,
  opts: { allowSuppressed?: boolean } = {}
): Promise<UpsertOutcome> {
  const parsed = memoryInputSchema.safeParse(raw);
  if (!parsed.success) {
    log.warn("memory.rejected", { userId, issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    return { ok: false, reason: "invalid", detail: parsed.error.issues[0]?.message };
  }
  const m: MemoryInput = parsed.data;

  if (!opts.allowSuppressed) {
    const blocked = await prisma.userMemory.findFirst({
      where: { userId, category: m.category, key: m.key, status: "suppressed" },
      select: { id: true },
    });
    if (blocked) {
      log.info("memory.blocked_by_suppression", { userId, category: m.category, key: m.key });
      return { ok: false, reason: "suppressed" };
    }
  }

  const data = {
    value: m.value,
    kind: m.kind,
    durability: m.durability,
    source: m.source,
    confidence: m.confidence,
    importance: m.importance,
    reason: m.reason ?? null,
    sourceConversationId: m.sourceConversationId ?? null,
    expiresAt: m.expiresAt ?? null,
  };

  // Atómico frente a dos peticiones concurrentes: el índice único parcial
  // (user_id, category, key) WHERE status='active' garantiza una sola fila
  // activa. Si dos hilos intentan crear a la vez, uno choca (P2002) y se
  // reintenta como actualización.
  for (let attempt = 0; attempt < 2; attempt++) {
    const existing = await prisma.userMemory.findFirst({
      where: { userId, category: m.category, key: m.key, status: "active" },
      select: { id: true },
    });

    try {
      if (existing) {
        // where incluye userId aunque `existing` ya salió filtrado por él: el
        // filtro de aislamiento no depende de que una consulta previa acierte.
        const res = await prisma.userMemory.updateMany({ where: { id: existing.id, userId }, data });
        if (res.count === 0) continue; // se borró entre medias: reintenta
        const fresh = await prisma.userMemory.findFirstOrThrow({ where: { id: existing.id, userId } });
        log.info("memory.updated", { userId, category: m.category, key: m.key, source: m.source });
        const view = toView(fresh);
        void syncMemoryEmbedding(userId, view).catch(() => undefined);
        return { ok: true, memory: view, created: false };
      }
      const created = await prisma.userMemory.create({
        data: { userId, category: m.category, key: m.key, ...data },
      });
      log.info("memory.created", { userId, category: m.category, key: m.key, source: m.source, kind: m.kind });
      const view = toView(created);
      void syncMemoryEmbedding(userId, view).catch(() => undefined);
      return { ok: true, memory: view, created: true };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && attempt === 0) continue;
      log.error("memory.write_failed", { userId, err });
      throw err;
    }
  }
  return { ok: false, reason: "invalid", detail: "conflicto de escritura concurrente" };
}

/**
 * Edición manual desde "Tu memoria" [§10]. Lo que el usuario corrige a mano es,
 * por definición, lo que él afirma: pasa a `source=user_edit`, `kind=stated_state`,
 * `confidence=1`. Así una inferencia editada deja de ser una inferencia.
 */
export async function editMemory(userId: string, id: string, patch: MemoryEdit): Promise<MemoryView | null> {
  const current = await prisma.userMemory.findFirst({ where: { id, userId, status: "active" } });
  if (!current) return null;

  // Coherencia con el CHECK de caducidad: una memoria temporal no puede quedar
  // sin fecha, ni una permanente con ella.
  let expiresAt: Date | null | undefined = patch.expiresAt;
  if (current.durability === "temporal" && expiresAt === null) expiresAt = current.expiresAt; // no quitar la caducidad
  if (current.durability === "permanent" && expiresAt) expiresAt = null;

  const res = await prisma.userMemory.updateMany({
    where: { id, userId, status: "active" },
    data: {
      ...(patch.value !== undefined ? { value: patch.value } : {}),
      ...(patch.importance !== undefined ? { importance: patch.importance } : {}),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
      source: "user_edit",
      kind: "stated_state",
      confidence: 1,
    },
  });
  if (res.count === 0) return null;
  log.info("memory.edited", { userId, id });
  const fresh = await prisma.userMemory.findFirst({ where: { id, userId } });
  return fresh ? toView(fresh) : null;
}

// ── Olvidar ─────────────────────────────────────────────────────────────────

/** Borra UNA memoria. `count:0` ⇒ no existe o no es tuya (mismo resultado, a propósito). */
export async function deleteMemory(userId: string, id: string): Promise<boolean> {
  const res = await prisma.userMemory.deleteMany({ where: { id, userId } });
  if (res.count > 0) log.info("memory.deleted", { userId, id });
  return res.count > 0;
}

/**
 * "Olvida esto Y no lo vuelvas a aprender" [§37 "No recuerdes esto"].
 * Sustituye la memoria por una fila `suppressed` que bloquea el reaprendizaje.
 * La fila suprimida NO conserva el valor: solo (categoría, clave) — para no
 * retener el dato que el usuario pidió olvidar.
 */
export async function suppressMemory(userId: string, id: string): Promise<boolean> {
  const current = await prisma.userMemory.findFirst({ where: { id, userId }, select: { category: true, key: true } });
  if (!current) return false;

  await prisma.$transaction([
    prisma.userMemory.deleteMany({ where: { id, userId } }),
    prisma.userMemory.deleteMany({ where: { userId, category: current.category, key: current.key, status: "suppressed" } }),
    prisma.userMemory.create({
      data: {
        userId,
        category: current.category,
        key: current.key,
        value: "[suprimida]",
        kind: "stated_state",
        durability: "stable",
        source: "user_edit",
        confidence: 1,
        importance: 1,
        status: "suppressed",
        reason: "El usuario pidió no recordar esto.",
      },
    }),
  ]);
  log.info("memory.suppressed", { userId, category: current.category, key: current.key });
  return true;
}

/**
 * "No recuerdes esto" desde el CHAT (README §6.7): suprime por (categoría, clave),
 * sin necesitar el `id` ni que la memoria exista todavía. Bloquea el reaprendizaje
 * y borra la memoria viva si la había. Idempotente: llamarla dos veces no falla
 * (respeta el índice único parcial de `suppressed`).
 *
 * La fila suprimida NO conserva el valor: solo (categoría, clave).
 * Devuelve `true` si había una memoria viva que se borró.
 */
export async function suppressKey(userId: string, category: MemoryCategory, key: string): Promise<boolean> {
  const [removed] = await prisma.$transaction([
    prisma.userMemory.deleteMany({ where: { userId, category, key, status: "active" } }),
    prisma.userMemory.deleteMany({ where: { userId, category, key, status: "suppressed" } }),
    prisma.userMemory.create({
      data: {
        userId,
        category,
        key,
        value: "[suprimida]",
        kind: "stated_state",
        durability: "stable",
        source: "user_edit",
        confidence: 1,
        importance: 1,
        status: "suppressed",
        reason: "El usuario pidió no recordar esto.",
      },
    }),
  ]);
  log.info("memory.suppressed_key", { userId, category, key, hadLive: removed.count > 0 });
  return removed.count > 0;
}

/** "Forget everything" [§10]. Devuelve cuántas filas se borraron. Incluye las suprimidas:
 *  olvidar TODO significa volver a empezar de cero, también las reglas de "no recordar". */
export async function forgetAll(userId: string): Promise<number> {
  const res = await prisma.userMemory.deleteMany({ where: { userId } });
  // memory_embeddings cae en cascada (ON DELETE CASCADE desde user_memories).
  log.info("memory.forget_all", { userId, deleted: res.count });
  return res.count;
}

/** Purga las memorias caducadas de UN usuario (mantenimiento oportunista; §12). */
export async function purgeExpired(userId: string, now: Date = new Date()): Promise<number> {
  const res = await prisma.userMemory.deleteMany({
    where: { userId, status: "active", expiresAt: { lte: now } },
  });
  if (res.count > 0) log.info("memory.purged_expired", { userId, deleted: res.count });
  return res.count;
}
