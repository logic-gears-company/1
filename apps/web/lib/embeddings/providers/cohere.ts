/**
 * Proveedor Cohere Embed v4 — el ÚNICO archivo que conoce la API de Cohere.
 *
 * Contrato verificado en https://docs.cohere.com/reference/embed :
 *   POST https://api.cohere.com/v2/embed
 *   body: { model, input_type, texts, embedding_types, output_dimension, truncate }
 *   resp: { id, embeddings: { float: number[][] }, texts, meta: { billed_units } }
 *   límites: máx. 96 textos por llamada; output_dimension ∈ {256,512,1024,1536}.
 *
 * Se usa `fetch` directo en lugar del SDK `cohere-ai`: una dependencia menos
 * en un VPS de 4 GB, y el proveedor queda en ~150 líneas fáciles de sustituir.
 *
 * NUNCA se loguea el texto enviado ni la API key.
 */

import {
  EMBEDDING_DIMENSION,
  EmbeddingError,
  assertDimension,
  type EmbeddingProvider,
  type EmbedRequest,
  type EmbedResult,
} from "../types";

const ENDPOINT = "https://api.cohere.com/v2/embed";
const MODEL = "embed-v4.0";
const MAX_BATCH = 96; // documentado por Cohere

/** Tiempo máximo por llamada. Un embedding tarda ≪ 1 s; 15 s ya es un fallo. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Límite duro de caracteres por texto. embed-v4 admite ~128k tokens, pero
 * para memoria conversacional un fragmento de más de 8.000 caracteres es un
 * error de troceado, no un caso de uso. Se rechaza antes de gastar cuota.
 */
const MAX_CHARS_PER_TEXT = 8_000;

function readApiKey(): string | undefined {
  const key = process.env.COHERE_API_KEY?.trim();
  return key ? key : undefined;
}

/** Mapa de purpose → input_type de Cohere. Aislado aquí a propósito. */
function toInputType(purpose: EmbedRequest["purpose"]): "search_document" | "search_query" {
  return purpose === "query" ? "search_query" : "search_document";
}

function parseRetryAfter(res: Response): number | undefined {
  const h = res.headers.get("retry-after");
  if (!h) return undefined;
  const n = Number(h);
  return Number.isFinite(n) && n >= 0 ? Math.ceil(n) : undefined;
}

export const cohereProvider: EmbeddingProvider = {
  name: "cohere",
  model: MODEL,
  maxBatchSize: MAX_BATCH,

  isConfigured() {
    return readApiKey() !== undefined;
  },

  async embedBatch(req) {
    const apiKey = readApiKey();
    if (!apiKey) {
      throw new EmbeddingError(
        "NOT_CONFIGURED",
        "COHERE_API_KEY no está configurada en el servidor.",
        { reachedProvider: false }
      );
    }

    if (req.texts.length === 0) {
      throw new EmbeddingError("INVALID_INPUT", "No hay textos que embeber.", {
        reachedProvider: false,
      });
    }
    if (req.texts.length > MAX_BATCH) {
      throw new EmbeddingError(
        "INVALID_INPUT",
        `Lote de ${req.texts.length} textos; el máximo de Cohere es ${MAX_BATCH}.`,
        { reachedProvider: false }
      );
    }
    for (let i = 0; i < req.texts.length; i++) {
      const t = req.texts[i];
      if (typeof t !== "string" || t.trim().length === 0) {
        throw new EmbeddingError("INVALID_INPUT", `El texto ${i} está vacío.`, {
          reachedProvider: false,
        });
      }
      if (t.length > MAX_CHARS_PER_TEXT) {
        throw new EmbeddingError(
          "INVALID_INPUT",
          `El texto ${i} tiene ${t.length} caracteres; el máximo es ${MAX_CHARS_PER_TEXT}.`,
          { reachedProvider: false }
        );
      }
    }

    // Combina el timeout propio con la cancelación externa, si la hay.
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = req.signal ? AbortSignal.any([timeout, req.signal]) : timeout;

    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Client-Name": "axis-web",
        },
        body: JSON.stringify({
          model: MODEL,
          input_type: toInputType(req.purpose),
          texts: req.texts,
          embedding_types: ["float"],
          output_dimension: EMBEDDING_DIMENSION,
          // "END": si un texto excede el límite del modelo, se recorta el final
          // en lugar de fallar el lote entero (ya limitamos por caracteres).
          truncate: "END",
        }),
        signal,
      });
    } catch (cause) {
      const aborted = cause instanceof DOMException && cause.name === "AbortError";
      const timedOut = cause instanceof DOMException && cause.name === "TimeoutError";
      // Un TIMEOUT puede haber llegado a Cohere (que la procesó y contó aunque
      // la respuesta no volviera): se deja como gastada. Una cancelación
      // nuestra o un fallo de conexión (DNS, conexión rechazada → TypeError de
      // fetch) no llegaron a salir: esas sí se devuelven.
      const neverLeft = !timedOut;
      throw new EmbeddingError(
        "PROVIDER_UNAVAILABLE",
        aborted
          ? "Petición de embeddings cancelada."
          : timedOut
          ? `Cohere no respondió en ${REQUEST_TIMEOUT_MS / 1000} s.`
          : "No se pudo contactar con Cohere.",
        { retryable: !aborted, cause, reachedProvider: !neverLeft }
      );
    }

    if (!res.ok) {
      // Se lee el cuerpo solo para diagnóstico corto; nunca se propaga tal cual
      // porque podría reflejar parte de la entrada.
      if (res.status === 429) {
        throw new EmbeddingError(
          "PROVIDER_RATE_LIMITED",
          "Cohere devolvió 429: límite de la clave gratuita alcanzado (por minuto o mensual).",
          { retryable: true, retryAfterSec: parseRetryAfter(res) }
        );
      }
      if (res.status === 401 || res.status === 403) {
        throw new EmbeddingError(
          "AUTH_FAILED",
          `Cohere rechazó la API key (HTTP ${res.status}). Revisa COHERE_API_KEY.`
        );
      }
      if (res.status === 400 || res.status === 422) {
        throw new EmbeddingError(
          "INVALID_INPUT",
          `Cohere rechazó la petición (HTTP ${res.status}): parámetros inválidos.`
        );
      }
      throw new EmbeddingError(
        "PROVIDER_UNAVAILABLE",
        `Cohere respondió HTTP ${res.status}.`,
        { retryable: res.status >= 500 }
      );
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch (cause) {
      throw new EmbeddingError("BAD_RESPONSE", "Cohere devolvió un cuerpo no-JSON.", { cause });
    }

    const body = json as {
      embeddings?: { float?: unknown };
      meta?: { billed_units?: { input_tokens?: unknown } };
    };

    const floats = body?.embeddings?.float;
    if (!Array.isArray(floats)) {
      throw new EmbeddingError(
        "BAD_RESPONSE",
        "La respuesta de Cohere no contiene `embeddings.float`."
      );
    }
    if (floats.length !== req.texts.length) {
      throw new EmbeddingError(
        "BAD_RESPONSE",
        `Cohere devolvió ${floats.length} vectores para ${req.texts.length} textos.`
      );
    }

    const vectors = floats as number[][];
    // Garantiza que lo que va a Postgres cabe EXACTAMENTE en halfvec(1024).
    assertDimension(vectors, "cohere");

    const tokens = body?.meta?.billed_units?.input_tokens;
    const result: Omit<EmbedResult, "apiCalls"> = {
      vectors,
      dimension: EMBEDDING_DIMENSION,
      model: MODEL,
      provider: "cohere",
      billedTokens: typeof tokens === "number" ? tokens : undefined,
    };
    return result;
  },
};
