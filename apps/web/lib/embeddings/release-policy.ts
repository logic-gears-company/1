/**
 * Política de devolución del presupuesto tras un fallo. Función PURA.
 *
 * Vive en su propio archivo porque es la decisión más delicada para la
 * garantía "nunca facturar" y debe poder probarse de forma aislada, sin
 * Prisma ni red. `index.ts` la usa; las pruebas la ejercitan directamente
 * (no una copia, que podría divergir).
 *
 * Regla:
 *   · Lotes posteriores al que falló → nunca se intentaron → se devuelven.
 *   · El lote que falló → se devuelve SOLO si el proveedor declaró que la
 *     petición nunca salió (`reachedProvider === false`).
 *   · Todo lo demás (429, 5xx, timeout, error desconocido) se queda gastado
 *     porque Cohere sí pudo contarlo.
 */

export interface ReleaseInput {
  /** Nº total de lotes reservados. */
  totalBatches: number;
  /** Índice (0-based) del lote que estaba en curso cuando falló. */
  failedIndex: number;
  /** Declaración del proveedor sobre si la petición llegó a salir. */
  reachedProvider: boolean;
}

export function callsToRelease({ totalBatches, failedIndex, reachedProvider }: ReleaseInput): number {
  if (!Number.isInteger(totalBatches) || totalBatches < 0) return 0;
  if (!Number.isInteger(failedIndex) || failedIndex < 0 || failedIndex >= totalBatches) return 0;

  const untried = totalBatches - failedIndex - 1;
  const failedNeverLeft = reachedProvider ? 0 : 1;
  return untried + failedNeverLeft;
}
