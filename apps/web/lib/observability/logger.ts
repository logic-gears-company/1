/**
 * Logger estructurado con REDACCIÓN de secretos. [§27]
 *
 * Una línea JSON por evento, apta para cualquier agregador (Vercel, Loki,
 * Datadog). Sin dependencias.
 *
 * REGLA DE ORO: un log nunca debe poder filtrar un secreto ni contenido
 * privado del usuario. Se aplican TRES defensas, porque una sola falla:
 *   1. Por NOMBRE de campo: `apiKey`, `password`, `token`, ... → "[REDACTED]".
 *   2. Por VALOR: cualquier string con forma de clave conocida (sk-…, Bearer …,
 *      JWT, postgres://user:pass@…) se enmascara aunque el campo se llame "foo".
 *   3. Por CONTENIDO: los campos de texto libre del usuario (`content`,
 *      `message`, `value`, `text`, `prompt`) NO se registran nunca; se sustituyen
 *      por su longitud. Los logs sirven para depurar el sistema, no para leer
 *      las conversaciones de la gente.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return raw in LEVEL_ORDER ? (raw as LogLevel) : "info";
}

/** Nombres de campo cuyo VALOR jamás se imprime. Comparación sin mayúsculas ni separadores. */
const SECRET_FIELD = /(api.?key|secret|password|passwd|token|authorization|cookie|credential|private.?key|service.?role)/i;

/** Campos de texto libre del usuario: se registra su LONGITUD, no su contenido. */
const CONTENT_FIELD = /^(content|message|messages|text|prompt|value|body|input|output|reason)$/i;

/** Formas de secreto reconocibles por VALOR. */
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/g, // OpenAI / Anthropic / genéricos
  /\bgsk_[A-Za-z0-9]{16,}/g, // Groq
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, // cabeceras Authorization
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
  /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"']*:[^\s"'@]+@/gi, // URL con credenciales
  /\b[A-Fa-f0-9]{40,}\b/g, // hashes/claves hex largas
];

const MAX_DEPTH = 5;
const MAX_STRING = 500;
const MAX_ARRAY = 20;

export function redactString(input: string): string {
  let out = input;
  for (const re of SECRET_VALUE_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out.length > MAX_STRING ? `${out.slice(0, MAX_STRING)}…[+${out.length - MAX_STRING}]` : out;
}

/** Copia profunda SEGURA: nunca muta la entrada y tolera ciclos. */
export function redact(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return `[${typeof value}]`;

  if (value instanceof Error) {
    // El stack puede contener rutas y, a veces, fragmentos de entrada: solo el mensaje.
    return { name: value.name, message: redactString(value.message) };
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "[InvalidDate]" : value.toISOString();

  if (typeof value === "object") {
    if (seen.has(value as object)) return "[Circular]";
    if (depth >= MAX_DEPTH) return "[MaxDepth]";
    seen.add(value as object);

    if (Array.isArray(value)) {
      const head = value.slice(0, MAX_ARRAY).map((v) => redact(v, depth + 1, seen));
      return value.length > MAX_ARRAY ? [...head, `[+${value.length - MAX_ARRAY} más]`] : head;
    }

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_FIELD.test(k)) {
        out[k] = "[REDACTED]";
      } else if (CONTENT_FIELD.test(k) && typeof v === "string") {
        out[k] = `[${v.length} chars]`; // contenido del usuario: solo su tamaño
      } else if (CONTENT_FIELD.test(k) && Array.isArray(v)) {
        out[k] = `[${v.length} items]`;
      } else {
        out[k] = redact(v, depth + 1, seen);
      }
    }
    return out;
  }
  return "[Unserializable]";
}

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
  /** Logger hijo que añade campos fijos (p.ej. requestId, userId) a cada línea. */
  child(bound: Record<string, unknown>): Logger;
}

function emit(level: LogLevel, scope: string, bound: Record<string, unknown>, event: string, fields?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel()]) return;

  let line: string;
  try {
    line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      scope,
      event,
      ...(redact({ ...bound, ...fields }) as Record<string, unknown>),
    });
  } catch {
    // Un logger que lanza excepciones tumba la petición que intentaba observar.
    line = JSON.stringify({ ts: new Date().toISOString(), level, scope, event, logError: "serialization_failed" });
  }

  // error/warn a stderr, el resto a stdout: convención de los agregadores.
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export function createLogger(scope: string, bound: Record<string, unknown> = {}): Logger {
  return {
    debug: (e, f) => emit("debug", scope, bound, e, f),
    info: (e, f) => emit("info", scope, bound, e, f),
    warn: (e, f) => emit("warn", scope, bound, e, f),
    error: (e, f) => emit("error", scope, bound, e, f),
    child: (extra) => createLogger(scope, { ...bound, ...extra }),
  };
}
