/**
 * API pública de embeddings. Es lo ÚNICO que el sistema de memoria importa.
 *
 *   import { embedTexts, embedQuery, getEmbeddingStatus } from "@/lib/embeddings";
 *
 * ORDEN DE GARANTÍAS (importa; cambiarlo rompe "nunca facturar"):
 *   1. Validación de entrada      → sin coste
 *   2. Circuit breaker            → sin coste
 *   3. Reserva de presupuesto     → sin coste, atómica, fail-closed
 *   4. Llamada de red             → única fase que puede gastar cuota
 *
 * Todo error sale como `EmbeddingError` con un código estable. El llamador
 * decide (degradar a búsqueda sin vectores, encolar, avisar) según el código.
 */

import { prisma } from "@ai-saas/database";
import { EmbeddingBudget, type BudgetStatus } from "./budget";
import { PrismaBudgetStore } from "./budget-store";
import { CircuitBreaker } from "./circuit-breaker";
import { cohereProvider } from "./providers/cohere";
import { callsToRelease } from "./release-policy";
import {
  EMBEDDING_DIMENSION,
  EmbeddingError,
  type EmbedRequest,
  type EmbedResult,
  type EmbeddingProvider,
} from "./types";

export { EMBEDDING_DIMENSION, EmbeddingError } from "./types";
export type { EmbedResult, EmbeddingErrorCode, EmbeddingPurpose } from "./types";

// ─── Selección del proveedor ────────────────────────────────────────────────
// Único punto de cambio para sustituir Cohere: registrar otro proveedor aquí
// y poner EMBEDDINGS_PROVIDER=<nombre>. NO hay fallback a otro proveedor:
// tu condición es explícita ("no configurar ningún fallback de pago").
const PROVIDERS: Record<string, EmbeddingProvider> = {
  cohere: cohereProvider,
};

function selectProvider(): EmbeddingProvider {
  const name = (process.env.EMBEDDINGS_PROVIDER ?? "cohere").toLowerCase();
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new EmbeddingError(
      "NOT_CONFIGURED",
      `EMBEDDINGS_PROVIDER="${name}" no existe. Disponibles: ${Object.keys(PROVIDERS).join(", ")}.`
    );
  }
  return provider;
}

// ─── Singletons de proceso ──────────────────────────────────────────────────
// Se cuelgan de globalThis para sobrevivir al hot-reload de `next dev`, igual
// que hace @ai-saas/database con Prisma.
const g = globalThis as unknown as {
  __axisEmbedBudget?: EmbeddingBudget;
  __axisEmbedBreaker?: CircuitBreaker;
};

function budget(): EmbeddingBudget {
  return (g.__axisEmbedBudget ??= new EmbeddingBudget(new PrismaBudgetStore(prisma)));
}

function breaker(): CircuitBreaker {
  // 3 fallos seguidos → abierto 60 s. Un 429 por cuota NO cuenta como fallo
  // de salud (lo gestiona el presupuesto), ver `shouldTrip` más abajo.
  return (g.__axisEmbedBreaker ??= new CircuitBreaker({ failureThreshold: 3, cooldownMs: 60_000 }));
}

/** Errores que indican que el proveedor está enfermo (y no que nosotros fallamos). */
function shouldTrip(err: EmbeddingError): boolean {
  return err.code === "PROVIDER_UNAVAILABLE" || err.code === "BAD_RESPONSE";
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ─── API ────────────────────────────────────────────────────────────────────

/**
 * Embebe varios textos gastando el MÍNIMO de llamadas: lotes de hasta 96.
 * Con 1.000 llamadas/mes, 96 textos por llamada son ~96.000 textos/mes; el
 * cuello de botella es el número de llamadas, no de textos. Por eso conviene
 * acumular y embeber en lote, no un texto por mensaje.
 */
export async function embedTexts(
  texts: string[],
  opts: { purpose?: EmbedRequest["purpose"]; operation: string; signal?: AbortSignal }
): Promise<EmbedResult> {
  const provider = selectProvider();
  const purpose = opts.purpose ?? "document";

  // 1. Validación (sin coste)
  if (texts.length === 0) {
    return {
      vectors: [],
      dimension: EMBEDDING_DIMENSION,
      model: provider.model,
      provider: provider.name,
      apiCalls: 0,
    };
  }
  if (!provider.isConfigured()) {
    throw new EmbeddingError(
      "NOT_CONFIGURED",
      `El proveedor de embeddings "${provider.name}" no está configurado (falta la API key).`
    );
  }

  const batches = chunk(texts, provider.maxBatchSize);

  // 2. Circuit breaker (sin coste)
  breaker().assertClosed();

  // 3. Reserva de TODAS las llamadas por adelantado. Así, o cabe el trabajo
  //    completo, o no se hace nada: nunca se deja un lote a medias por falta
  //    de cuota a mitad de camino.
  const reservation = await budget().reserve(batches.length);

  // 4. Red
  const vectors: number[][] = [];
  let billedTokens = 0;
  let apiCalls = 0;
  // Índice del lote en curso. Todo lo que está DESPUÉS de él nunca se intentó.
  let current = 0;

  try {
    for (; current < batches.length; current++) {
      const r = await provider.embedBatch({
        texts: batches[current],
        purpose,
        operation: opts.operation,
        signal: opts.signal,
      });
      apiCalls++;
      vectors.push(...r.vectors);
      billedTokens += r.billedTokens ?? 0;
      breaker().recordSuccess();
    }
  } catch (err) {
    const e =
      err instanceof EmbeddingError
        ? err
        : // Error desconocido: se asume que la petición SÍ salió (lado seguro).
          new EmbeddingError("PROVIDER_UNAVAILABLE", "Error inesperado en el proveedor.", {
            retryable: true,
            cause: err,
            reachedProvider: true,
          });

    if (shouldTrip(e)) breaker().recordFailure();

    // Qué devolver del presupuesto:
    //  · lotes DESPUÉS del que falló: nunca se intentaron → se devuelven siempre.
    //  · el lote que falló: solo si el PROVEEDOR declara que la petición nunca
    //    salió (validación, sin API key, error antes de conectar). Si salió
    //    —aunque dé 429, 500 o timeout— Cohere ya la cuenta y se queda gastada.
    const toRelease = callsToRelease({
      totalBatches: batches.length,
      failedIndex: current,
      reachedProvider: e.reachedProvider,
    });
    if (toRelease > 0) await releasePartial(reservation, toRelease);

    throw e;
  }

  return {
    vectors,
    dimension: EMBEDDING_DIMENSION,
    model: provider.model,
    provider: provider.name,
    billedTokens,
    apiCalls,
  };
}

/** Embebe UNA consulta de búsqueda (purpose "query"). Cuesta 1 llamada. */
export async function embedQuery(
  text: string,
  opts: { operation: string; signal?: AbortSignal }
): Promise<number[]> {
  const r = await embedTexts([text], { ...opts, purpose: "query" });
  return r.vectors[0];
}

/** Estado del presupuesto y del proveedor, para el panel de ajustes/observabilidad. */
export async function getEmbeddingStatus(): Promise<{
  provider: string;
  model: string;
  dimension: number;
  configured: boolean;
  budget: BudgetStatus;
  circuit: "closed" | "open" | "half-open";
}> {
  const provider = selectProvider();
  return {
    provider: provider.name,
    model: provider.model,
    dimension: EMBEDDING_DIMENSION,
    configured: provider.isConfigured(),
    budget: await budget().status(),
    circuit: breaker().state(),
  };
}

// ─── interno ────────────────────────────────────────────────────────────────

/**
 * `BudgetReservation.release()` devuelve todo lo reservado. Cuando solo
 * una parte no se envió, se hace una reserva-espejo negativa a través del
 * store. Se mantiene en este archivo para que `budget.ts` siga simple.
 */
async function releasePartial(
  reservation: Awaited<ReturnType<EmbeddingBudget["reserve"]>>,
  calls: number
): Promise<void> {
  try {
    await new PrismaBudgetStore(prisma).release(reservation.period, calls);
  } catch {
    // Lado seguro: si no se puede devolver, queda como gastada.
  }
}
