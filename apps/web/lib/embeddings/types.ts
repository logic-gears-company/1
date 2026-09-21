/**
 * Contrato del proveedor de embeddings.
 *
 * REGLA DE AISLAMIENTO: el sistema de memoria semántica (retrieval, context
 * builder, herramientas) importa SOLO de este archivo y de `index.ts`.
 * Nada fuera de `lib/embeddings/providers/*` puede nombrar a Cohere. Así,
 * cambiar de proveedor es escribir un archivo nuevo en `providers/` y cambiar
 * una variable de entorno; la arquitectura de memoria no se toca.
 */

/**
 * Dimensión FIJA del esquema de base de datos.
 *
 * Las columnas `chunks.embedding` y `memory_embeddings.embedding` son
 * `halfvec(1024)`. Esta constante es la única fuente de verdad en código y
 * el proveedor está OBLIGADO a devolver exactamente este número de
 * dimensiones (ver `assertDimension`). Si algún día se cambia de modelo,
 * hay que cambiar esto Y hacer una migración: no puede desincronizarse en
 * silencio.
 */
export const EMBEDDING_DIMENSION = 1024 as const;

/**
 * "document": texto que se guarda para ser encontrado después.
 * "query":    texto de búsqueda que se compara contra los documentos.
 * Cohere v4 (y la mayoría de modelos modernos) son asimétricos: usar el
 * tipo equivocado degrada la relevancia sin dar ningún error.
 */
export type EmbeddingPurpose = "document" | "query";

export interface EmbedRequest {
  texts: string[];
  purpose: EmbeddingPurpose;
  /** Para trazas y para el registro de presupuesto. Nunca contiene el texto. */
  operation: string;
  /** Opcional: aborta la petición (p.ej. cierre de la conexión del usuario). */
  signal?: AbortSignal;
}

export interface EmbedResult {
  /** Un vector por texto, en el MISMO orden que `texts`. */
  vectors: number[][];
  dimension: typeof EMBEDDING_DIMENSION;
  model: string;
  provider: string;
  /** Tokens facturables según el proveedor, si los reporta. */
  billedTokens?: number;
  /** Llamadas HTTP reales realizadas (una por lote). */
  apiCalls: number;
}

/**
 * Códigos de error CONTROLADOS. El resto del sistema decide qué hacer según
 * el código; nunca parsea mensajes de texto.
 */
export type EmbeddingErrorCode =
  /** Cuota mensual local agotada. No se hizo NINGUNA llamada de red. */
  | "BUDGET_EXHAUSTED"
  /** El proveedor respondió 429 / cuota gratuita agotada. */
  | "PROVIDER_RATE_LIMITED"
  /** Falta la API key o el proveedor no está configurado. */
  | "NOT_CONFIGURED"
  /** El proveedor rechazó la clave (401/403). */
  | "AUTH_FAILED"
  /** El proveedor devolvió un vector con dimensión distinta a la del esquema. */
  | "DIMENSION_MISMATCH"
  /** Entrada inválida (vacía, demasiado larga, etc.). */
  | "INVALID_INPUT"
  /** Error de red / timeout / 5xx del proveedor. */
  | "PROVIDER_UNAVAILABLE"
  /** Respuesta del proveedor con forma inesperada. */
  | "BAD_RESPONSE"
  /** El circuit breaker está abierto: no se intenta hasta enfriarse. */
  | "CIRCUIT_OPEN";

export class EmbeddingError extends Error {
  readonly code: EmbeddingErrorCode;
  /** True si reintentar más tarde tiene sentido (cuota, red). */
  readonly retryable: boolean;
  /** Segundos sugeridos de espera, si se conocen. */
  readonly retryAfterSec?: number;
  /**
   * ¿La petición HTTP llegó a SALIR hacia el proveedor?
   *
   * Es lo que decide si la llamada de presupuesto se devuelve o se queda
   * gastada, y solo el proveedor lo sabe con certeza (el orquestador no debe
   * adivinarlo). Por defecto es `true`: ante la duda se asume que la llamada
   * salió y NO se devuelve, que es el lado seguro para "nunca facturar".
   * Solo se pone `false` en los puntos donde es imposible que haya salido
   * (validación de entrada, falta de API key, error antes del `fetch`).
   */
  readonly reachedProvider: boolean;

  constructor(
    code: EmbeddingErrorCode,
    message: string,
    opts: {
      retryable?: boolean;
      retryAfterSec?: number;
      cause?: unknown;
      reachedProvider?: boolean;
    } = {}
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "EmbeddingError";
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.retryAfterSec = opts.retryAfterSec;
    this.reachedProvider = opts.reachedProvider ?? true;
  }
}

/** Lo que TODO proveedor de embeddings debe implementar. Nada más. */
export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  /** Máximo de textos por llamada HTTP (Cohere: 96). */
  readonly maxBatchSize: number;
  /** ¿Está configurado (API key presente)? No hace red. */
  isConfigured(): boolean;
  /**
   * Embebe UN lote (ya dividido en `maxBatchSize`). Debe lanzar
   * `EmbeddingError`, nunca un Error genérico. No conoce el presupuesto:
   * eso lo aplica el orquestador de `index.ts`.
   */
  embedBatch(req: EmbedRequest): Promise<Omit<EmbedResult, "apiCalls">>;
}

/** Comprueba que cada vector tenga la dimensión exacta del esquema. */
export function assertDimension(vectors: number[][], provider: string): void {
  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i];
    if (!Array.isArray(v) || v.length !== EMBEDDING_DIMENSION) {
      throw new EmbeddingError(
        "DIMENSION_MISMATCH",
        `El proveedor "${provider}" devolvió ${
          Array.isArray(v) ? v.length : "un valor no-array"
        } dimensiones en el vector ${i}; el esquema exige exactamente ${EMBEDDING_DIMENSION}. ` +
          `No se guardó nada.`
      );
    }
    // Un NaN/Infinity en pgvector hace fallar el INSERT entero.
    for (let j = 0; j < v.length; j++) {
      if (!Number.isFinite(v[j])) {
        throw new EmbeddingError(
          "BAD_RESPONSE",
          `El proveedor "${provider}" devolvió un valor no finito en el vector ${i}, posición ${j}.`
        );
      }
    }
  }
}
