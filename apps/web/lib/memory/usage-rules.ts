/**
 * Política PURA de `last_used_at` de las memorias. [§6.8 del README, §12 del prompt maestro]
 *
 * Sin E/S ni dependencias: se prueba sin BD. `usage-store.ts` solo la ejecuta.
 *
 * POR QUÉ HAY UN DEBOUNCE
 * ───────────────────────
 * `context.ts` devuelve, en cada respuesta del chat, los ids de las memorias que
 * de verdad entraron al prompt (~10). Si cada respuesta reescribiera esas filas,
 * un chat activo haría ~10 UPDATE por mensaje sobre las MISMAS filas: escrituras
 * inútiles en un plan Free (y versiones de fila que Postgres tiene que limpiar).
 *
 * `last_used_at` solo necesita precisión de HORAS (sirve para saber qué memorias
 * llevan semanas sin usarse y podar/priorizar, no para auditar cada uso). Por eso
 * una memoria marcada hace menos de `LAST_USED_DEBOUNCE_MS` no se reescribe.
 */

/** Una memoria ya marcada hace menos que esto NO se vuelve a escribir. */
export const LAST_USED_DEBOUNCE_MS = 6 * 60 * 60 * 1000; // 6 h

/** Máximo de ids por UPDATE. El presupuesto de contexto ya limita a ~10; esto es una red. */
export const MAX_IDS_PER_TOUCH = 100;

export interface TouchCandidate {
  id: string;
  lastUsedAt: Date | null;
}

/**
 * Ids de memoria que hay que marcar como usadas ahora.
 *
 * - Conserva el orden de entrada (las primeras son las de mayor puntuación: si
 *   hubiera que recortar por el tope, se pierden las menos relevantes).
 * - Colapsa duplicados y descarta ids que no sean strings no vacíos.
 * - `lastUsedAt` futuro (reloj desfasado) cuenta como "reciente": no debe forzar
 *   una escritura en cada petición.
 * - `lastUsedAt` inválido (Invalid Date) se marca: así se autorrepara.
 */
export function selectIdsToTouch(candidates: readonly TouchCandidate[], now: Date): string[] {
  const nowMs = now.getTime();
  const seen = new Set<string>();
  const out: string[] = [];

  for (const c of candidates) {
    if (out.length >= MAX_IDS_PER_TOUCH) break;
    if (typeof c?.id !== "string" || c.id.trim() === "") continue;
    if (seen.has(c.id)) continue;
    seen.add(c.id);

    if (c.lastUsedAt !== null) {
      // Reciente (incluye el futuro) => no se toca.
      // Un Invalid Date da `getTime() === NaN`, y `NaN < x` es SIEMPRE false
      // (IEEE-754): cae fuera del `continue` y se marca, que es lo que queremos
      // (autorreparación). Depende de esa propiedad, no de una comprobación aparte.
      if (nowMs - c.lastUsedAt.getTime() < LAST_USED_DEBOUNCE_MS) continue;
    }
    out.push(c.id);
  }
  return out;
}
