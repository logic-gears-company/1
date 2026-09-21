/**
 * Almacén Postgres del presupuesto de embeddings.
 *
 * ATOMICIDAD (el punto que importa)
 * ─────────────────────────────────
 * `tryReserve` es UNA sola sentencia SQL:
 *
 *   INSERT ... ON CONFLICT (period) DO UPDATE
 *     SET calls_used = calls_used + $n
 *     WHERE api_call_budget.calls_used + $n <= $cap
 *   RETURNING calls_used
 *
 * - Si la fila del mes no existe: se crea con `calls_used = n` (solo si n ≤ cap).
 * - Si existe y cabe: se incrementa.
 * - Si existe y NO cabe: el WHERE del DO UPDATE es falso → no se actualiza nada
 *   → RETURNING devuelve 0 filas → `null` → presupuesto agotado.
 *
 * Postgres bloquea la fila durante el UPDATE, así que dos peticiones
 * simultáneas se serializan: es imposible que ambas vean "queda 1" y pasen.
 * Un patrón "SELECT y luego UPDATE" NO tendría esa garantía.
 */

import type { PrismaClient } from "@ai-saas/database";
import type { BudgetStore } from "./budget";

/** Identificador del recurso medido. Permite añadir otros presupuestos luego. */
const RESOURCE = "embeddings";

export class PrismaBudgetStore implements BudgetStore {
  constructor(private readonly db: PrismaClient) {}

  async tryReserve(period: string, calls: number, cap: number): Promise<number | null> {
    // Un lote mayor que todo el tope nunca cabe; evita insertar una fila con
    // calls_used > cap en la rama INSERT (el WHERE de DO UPDATE no la protege).
    if (calls > cap) return null;

    const rows = await this.db.$queryRaw<{ calls_used: number }[]>`
      INSERT INTO api_call_budget (resource, period, calls_used, updated_at)
      VALUES (${RESOURCE}, ${period}, ${calls}, NOW())
      ON CONFLICT (resource, period) DO UPDATE
        SET calls_used = api_call_budget.calls_used + ${calls},
            updated_at = NOW()
        WHERE api_call_budget.calls_used + ${calls} <= ${cap}
      RETURNING calls_used
    `;
    return rows.length === 0 ? null : Number(rows[0].calls_used);
  }

  async release(period: string, calls: number): Promise<void> {
    // GREATEST(…, 0): nunca bajar de cero aunque se libere de más.
    await this.db.$executeRaw`
      UPDATE api_call_budget
         SET calls_used = GREATEST(calls_used - ${calls}, 0),
             updated_at = NOW()
       WHERE resource = ${RESOURCE} AND period = ${period}
    `;
  }

  async getUsed(period: string): Promise<number> {
    const rows = await this.db.$queryRaw<{ calls_used: number }[]>`
      SELECT calls_used FROM api_call_budget
       WHERE resource = ${RESOURCE} AND period = ${period}
    `;
    return rows.length === 0 ? 0 : Number(rows[0].calls_used);
  }
}
