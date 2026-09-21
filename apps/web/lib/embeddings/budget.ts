/**
 * Presupuesto mensual de llamadas a la API de embeddings.
 *
 * POR QUÉ EXISTE
 * ──────────────
 * La clave trial de Cohere permite 1.000 llamadas/MES en total. Tu condición
 * es "nunca facturar automáticamente". Depender de que Cohere nos frene con
 * un 429 es frágil: si algún día se pega por error una clave de PRODUCCIÓN
 * en el .env, Cohere no frenaría y empezaría a cobrar. Por eso el tope vive
 * en NUESTRO código y es más conservador que el de Cohere: es un cinturón
 * además de los tirantes.
 *
 * DISEÑO
 * ──────
 * 1. RESERVAR ANTES DE LLAMAR, de forma atómica en la base de datos. Si se
 *    contara "después", dos peticiones simultáneas podrían pasar las dos con
 *    una sola llamada restante. La reserva es un único UPDATE condicional.
 * 2. El contador vive en Postgres (no en memoria) para sobrevivir a
 *    reinicios y a varias instancias de Next.js.
 * 3. Si la llamada falla ANTES de llegar al proveedor (red caída, timeout de
 *    conexión), se DEVUELVE la reserva. Si llegó al proveedor (aunque
 *    respondiera error), se considera consumida: Cohere sí la cuenta.
 * 4. Si la base de datos no responde, se DENIEGA (fail-closed). Ante la duda
 *    no se llama: perder un embedding es barato, una factura no.
 */

import { EmbeddingError } from "./types";

/** Tope de Cohere trial, documentado: 1.000 llamadas/mes. */
export const COHERE_TRIAL_MONTHLY_CALLS = 1000;

/**
 * Tope propio. Por defecto 900: deja un 10 % de margen para llamadas que
 * Cohere cuente y nosotros no (reintentos internos, pruebas manuales con la
 * misma clave desde el dashboard, desfase de zona horaria en el corte de mes).
 * Configurable, pero NUNCA puede superar el tope documentado de Cohere.
 */
export function getMonthlyCallCap(): number {
  const raw = process.env.EMBEDDINGS_MONTHLY_CALL_CAP;
  const parsed = raw === undefined || raw === "" ? 900 : Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 900;
  return Math.min(Math.floor(parsed), COHERE_TRIAL_MONTHLY_CALLS);
}

/** "2026-09" en UTC. El corte de mes de Cohere no está documentado por zona. */
export function currentPeriod(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Abstracción mínima del almacén, para poder probar la lógica sin Postgres
 * y para que este archivo no dependa de Prisma directamente.
 */
export interface BudgetStore {
  /**
   * Reserva `calls` llamadas si y solo si `used + calls <= cap`.
   * DEBE ser atómico. Devuelve el nuevo total usado, o `null` si no cabía.
   */
  tryReserve(period: string, calls: number, cap: number): Promise<number | null>;
  /** Devuelve llamadas reservadas que nunca llegaron al proveedor. */
  release(period: string, calls: number): Promise<void>;
  /** Lectura para mostrar el estado. No se usa para decidir. */
  getUsed(period: string): Promise<number>;
}

export interface BudgetReservation {
  readonly period: string;
  readonly calls: number;
  /** Llamar si la petición NO llegó a salir hacia el proveedor. */
  release(): Promise<void>;
}

export interface BudgetStatus {
  period: string;
  used: number;
  cap: number;
  remaining: number;
  exhausted: boolean;
}

export class EmbeddingBudget {
  constructor(
    private readonly store: BudgetStore,
    private readonly capOverride?: number
  ) {}

  private cap(): number {
    return this.capOverride ?? getMonthlyCallCap();
  }

  /**
   * Reserva `calls` llamadas o lanza `BUDGET_EXHAUSTED` SIN haber hecho
   * ninguna llamada de red. Fail-closed si el almacén falla.
   */
  async reserve(calls: number, now: Date = new Date()): Promise<BudgetReservation> {
    if (!Number.isInteger(calls) || calls < 1) {
      throw new EmbeddingError("INVALID_INPUT", "Reserva de presupuesto inválida.");
    }

    const period = currentPeriod(now);
    const cap = this.cap();

    let newTotal: number | null;
    try {
      newTotal = await this.store.tryReserve(period, calls, cap);
    } catch (cause) {
      // FAIL-CLOSED: no sabemos cuánto llevamos gastado → no llamamos.
      throw new EmbeddingError(
        "BUDGET_EXHAUSTED",
        "No se pudo verificar el presupuesto de embeddings; se cancela la llamada por seguridad.",
        { retryable: true, cause }
      );
    }

    if (newTotal === null) {
      throw new EmbeddingError(
        "BUDGET_EXHAUSTED",
        `Presupuesto mensual de embeddings agotado (${cap} llamadas en ${period}). ` +
          `No se realizó ninguna llamada. Se reanuda el mes siguiente.`,
        { retryable: false }
      );
    }

    let released = false;
    return {
      period,
      calls,
      release: async () => {
        if (released) return; // idempotente: nunca devolver dos veces
        released = true;
        try {
          await this.store.release(period, calls);
        } catch {
          // Si no se puede devolver, se queda gastada. Es el lado seguro.
        }
      },
    };
  }

  async status(now: Date = new Date()): Promise<BudgetStatus> {
    const period = currentPeriod(now);
    const cap = this.cap();
    let used = 0;
    try {
      used = await this.store.getUsed(period);
    } catch {
      used = cap; // si no se puede leer, mostrar como agotado (lado seguro)
    }
    const remaining = Math.max(0, cap - used);
    return { period, used, cap, remaining, exhausted: remaining === 0 };
  }
}
