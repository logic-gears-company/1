/**
 * Marcado de `last_used_at` de las memorias: E/S. [§6.8, §38]
 * La decisión de QUÉ marcar vive en usage-rules.ts (pura).
 *
 * Contrato (mismo que learn.ts):
 *  · NUNCA lanza y NUNCA bloquea el chat: se invoca sin `await` desde `onFinish`.
 *  · `userId` en el `where` (invariante 7 del README): aunque los ids salen de
 *    nuestro propio contexto, un id ajeno jamás debe poder actualizarse.
 *  · Un solo `updateMany` con `id IN (...)`: 1 escritura por respuesta, no 1 por fila.
 *
 * Interacción con el trigger `user_memories_touch`: la migración
 * 20260921000100_memory_last_used_touch hace que este UPDATE NO altere
 * `updated_at`. SIN esa migración, marcar el uso movería `updated_at` y
 * contaminaría la puntuación de frescura. Aplícala antes de desplegar esto.
 */
import { prisma } from "@ai-saas/database";
import { createLogger } from "@/lib/observability/logger";
import { selectIdsToTouch, type TouchCandidate } from "./usage-rules";

const log = createLogger("memory.usage");

/**
 * Marca como usadas las memorias que corresponda. Devuelve cuántas filas se
 * escribieron (0 si el debounce las descartó todas, o si algo falló).
 */
export async function touchMemoriesUsed(
  userId: string,
  used: readonly TouchCandidate[] | undefined,
  now: Date = new Date()
): Promise<number> {
  try {
    if (!userId || !used || used.length === 0) return 0;
    const ids = selectIdsToTouch(used, now);
    if (ids.length === 0) return 0;

    const res = await prisma.userMemory.updateMany({
      where: { userId, id: { in: ids } },
      data: { lastUsedAt: now },
    });
    log.info("memory.touched", { userId, requested: used.length, written: res.count });
    return res.count;
  } catch (err) {
    // Es un extra de mantenimiento: si falla, el chat NO debe enterarse.
    log.warn("memory.touch_failed", { userId, err });
    return 0;
  }
}
