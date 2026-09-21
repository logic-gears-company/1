/**
 * Aprendizaje en segundo plano tras cada respuesta. [§4, §38]
 *
 * Nunca bloquea ni rompe el chat: se invoca sin `await` desde `onFinish` y
 * captura todo error. Cadencia: `shouldAttemptExtraction` (filtro de coste).
 */
import { prisma } from "@ai-saas/database";
import { createLogger } from "@/lib/observability/logger";
import { decideSuppression, evaluateCandidate, shouldAttemptExtraction, type EvalSettings } from "./evaluate";
import { extractCandidates, type ModelCall } from "./extract";
import { suppressKey, upsertMemory } from "./store";

const log = createLogger("memory.learn");

/**
 * LÍMITE CONOCIDO (README §6.6/§6.7): el extractor solo corre en el turno 0 y cada 3.º
 * (`shouldAttemptExtraction`, por coste). Un "no recuerdes esto" en un turno intermedio
 * no llega a él. Sin palabras clave (§20), la solución completa son las tools
 * `memory_remember`/`memory_forget` (Fase 6), que decide el modelo en cada turno.
 */
export async function learnFromMessage(args: {
  userId: string;
  conversationId: string;
  message: string;
  settings: EvalSettings;
  callModel: ModelCall;
  now?: Date;
}): Promise<{ persisted: number; discarded: number; suppressed: number }> {
  const { userId, conversationId, message, settings, callModel } = args;
  const now = args.now ?? new Date();
  try {
    // Turnos de usuario desde la última extracción: se aproxima con el nº de
    // mensajes USER de la conversación (módulo la cadencia de 3).
    const userTurns = await prisma.message.count({ where: { conversationId, userId, role: "USER" } });
    const turnsSince = userTurns <= 1 ? 0 : (userTurns - 1) % 3;
    if (!shouldAttemptExtraction(message, { ...settings, turnsSinceLastExtraction: turnsSince })) {
      return { persisted: 0, discarded: 0, suppressed: 0 };
    }

    const candidates = await extractCandidates(message, callModel, { now });
    let persisted = 0;
    let discarded = 0;
    let suppressed = 0;
    for (const c of candidates) {
      // "No recuerdes esto": la supresión va ANTES de evaluar (evaluateCandidate lo descarta
      // sin más). Un fallo al suprimir no debe impedir procesar el resto de candidatos.
      const sup = decideSuppression(c, settings);
      if (sup.suppress) {
        try {
          await suppressKey(userId, sup.category, sup.key);
          suppressed++;
        } catch (err) {
          log.error("learn.suppress_failed", { userId, err });
        }
        continue;
      }
      const d = evaluateCandidate(c, settings, now);
      if (d.action === "discard") {
        discarded++;
        log.info("learn.discarded", { userId, reason: d.reason });
        continue;
      }
      const r = await upsertMemory(userId, { ...d.input, sourceConversationId: conversationId });
      if (r.ok) persisted++;
      else discarded++;
    }
    log.info("learn.done", { userId, persisted, discarded, suppressed });
    return { persisted, discarded, suppressed };
  } catch (err) {
    log.error("learn.failed", { userId, err });
    return { persisted: 0, discarded: 0, suppressed: 0 };
  }
}
