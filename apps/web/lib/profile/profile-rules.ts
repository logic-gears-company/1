/**
 * Reglas PURAS del perfil del usuario: zona horaria, idioma y nombre. [§7, §15]
 *
 * Sin E/S ni dependencias externas: se prueba sin red ni BD (mismo patrón que
 * `memory/evaluate.ts` ↔ `memory/learn.ts`). La ruta API solo orquesta.
 *
 * PRINCIPIOS
 * ──────────
 * 1. Fail-closed: un dato inválido se RECHAZA, no se "arregla" adivinando.
 * 2. La autodetección de zona horaria NUNCA pisa un valor real ya guardado.
 *    `users` no tiene columna de "origen" (evitamos una migración solo por eso),
 *    así que la regla se deduce del propio valor: 'UTC'/vacío es el DEFAULT de la
 *    BD y significa "nadie ha elegido nada". Cualquier otra zona ya tiene dueño.
 *    Coste asumido: al viajar no se actualiza sola; se cambia a mano en Ajustes.
 * 3. Todo lo que entra aquí termina en el system prompt (nombre) o en cálculos de
 *    hora (zona): se sanea para que no arrastre saltos de línea ni control.
 */

/** Longitud máxima del nombre para AXIS. Más allá se rechaza (no se trunca). */
export const NAME_MAX = 80;
/** Longitud máxima de un identificador IANA razonable ("America/Argentina/Buenos_Aires" = 30). */
const TZ_MAX = 64;

// Área/Ciudad[/Subciudad] en IANA: letras, dígitos, _, - y +. Sin espacios ni "..".
const IANA_SHAPE = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9][A-Za-z0-9_+-]*){0,2}$/;

/**
 * Forma CANÓNICA de una zona IANA, o `null` si no es válida.
 *
 * Doble filtro: (1) forma sintáctica estricta y (2) que `Intl` la reconozca.
 * El paso (1) descarta offsets crudos ("+05:00") y abreviaturas ambiguas ("PST")
 * que `Intl` a veces acepta pero que NO siguen el horario de verano: el
 * "momento del día" saldría mal tras un cambio de hora.
 *
 * Se devuelve `resolvedOptions().timeZone` y NO lo que escribió el usuario:
 * `Intl` acepta cualquier capitalización ("america/bogota"). Guardarla tal cual
 * rompería la comparación `stored === detected` y reescribiría en cada visita.
 * (Nota: `Intl` puede mapear alias antiguos, p. ej. "Asia/Calcutta" ↔
 * "Asia/Kolkata", según la versión de ICU; es válido y estable en esa versión.)
 */
function canonicalTimezone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > TZ_MAX) return null;
  if (value === "UTC") return "UTC";
  if (!value.includes("/")) return null; // "PST", "EST", "constructor", "__proto__"…
  // DEFENSA EN PROFUNDIDAD, NO PROBADA POR TEST: en Node 22 (ICU actual) `Intl` ya
  // rechaza por sí solo todo lo que esta regex rechaza (se buscó a propósito con
  // 35 entradas adversariales y no hay ninguna que las separe; el mutation
  // testing de esta línea "sobrevive" por eso). Se mantiene porque `Intl` cambia
  // entre versiones de Node/ICU (el repo puede correr en Termux/ARM64 o en un VPS
  // distinto) y así la forma IANA queda garantizada sea cual sea el runtime.
  if (!IANA_SHAPE.test(value)) return null;
  try {
    const tz = new Intl.DateTimeFormat("es", { timeZone: value }).resolvedOptions().timeZone;
    return typeof tz === "string" && tz.length > 0 ? tz : null;
  } catch {
    return null;
  }
}

/** ¿Es un identificador de zona horaria IANA real? (acepta cualquier capitalización) */
export function isValidTimezone(value: unknown): value is string {
  return canonicalTimezone(value) !== null;
}

/** Zona válida en forma canónica (recortada) o `null`. Nunca lanza. */
export function normalizeTimezone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return canonicalTimezone(value.trim());
}

// idioma[-Región] con separador "-" (BCP-47). "es_CO" (guion bajo) NO es BCP-47.
const LOCALE_SHAPE = /^[A-Za-z]{2,3}(-[A-Za-z]{2}|-[0-9]{3})?$/;

/** Etiqueta de idioma canónica ("es-co" → "es-CO") o `null`. */
export function normalizeLocale(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!LOCALE_SHAPE.test(t)) return null;
  const [lang, region] = t.split("-");
  const canon = region ? `${lang.toLowerCase()}-${region.toUpperCase()}` : lang.toLowerCase();
  try {
    return Intl.getCanonicalLocales(canon).length === 1 ? canon : null;
  } catch {
    return null;
  }
}

/**
 * Nombre limpio para AXIS o `null`. Va al system prompt: se eliminan controles
 * y saltos de línea (evita fingir un turno nuevo o una instrucción) y se
 * colapsan espacios. Si excede `NAME_MAX` se rechaza en vez de truncar.
 */
export function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, "") // controles, salvo \t \n \r
    .replace(/\s+/g, " ") // \n \r \t y espacios múltiples → un espacio
    .trim();
  if (cleaned.length === 0 || cleaned.length > NAME_MAX) return null;
  return cleaned;
}

// ── Autodetección de la zona horaria ────────────────────────────────────────

export type TimezoneDecision =
  | { update: true; timezone: string }
  | { update: false; reason: string };

/**
 * ¿Debe la zona detectada por el navegador escribirse en la BD?
 * Solo cuando no hay ninguna zona real guardada.
 */
export function decideTimezoneUpdate(input: {
  stored: string | null | undefined;
  /** Viene del cuerpo de una petición (no confiable): por eso `unknown`, no `string`. */
  detected: unknown;
}): TimezoneDecision {
  const detected = normalizeTimezone(input.detected);
  if (!detected) return { update: false, reason: "zona detectada inválida o ausente" };

  const stored = typeof input.stored === "string" ? input.stored.trim() : "";
  const storedCanon = normalizeTimezone(stored);
  const storedIsReal = storedCanon !== null && storedCanon !== "UTC";

  if (storedIsReal) {
    return { update: false, reason: "ya hay una zona guardada; la autodetección no la pisa" };
  }
  if (detected === "UTC" && (stored === "UTC" || stored === "")) {
    // No aporta: escribir 'UTC' sobre 'UTC' es una escritura inútil por visita.
    return { update: false, reason: "la zona detectada es UTC, igual que el valor por defecto" };
  }
  return { update: true, timezone: detected };
}

// ── Parche de perfil ────────────────────────────────────────────────────────

export interface ProfileState {
  name: string | null;
  timezone: string | null;
  locale: string | null;
}

export interface ProfilePatchInput {
  name?: unknown;
  timezone?: unknown;
  locale?: unknown;
}

export type ProfilePatchResult =
  | { ok: true; next: ProfileState; changed: (keyof ProfileState)[] }
  | { ok: false; field: keyof ProfileState | "body"; message: string };

/**
 * Aplica un parche al perfil validando cada campo. Lista blanca EXPLÍCITA de
 * campos (`name`, `timezone`, `locale`): cualquier otra clave se ignora, así un
 * cuerpo con `role: "ADMIN"` o `__proto__` no puede colarse (mass-assignment).
 * No muta `cur`.
 */
export function applyProfilePatch(cur: ProfileState, patch: ProfilePatchInput): ProfilePatchResult {
  const next: ProfileState = { name: cur.name, timezone: cur.timezone, locale: cur.locale };
  const changed: (keyof ProfileState)[] = [];
  const has = (k: string) => Object.hasOwn(patch, k) && (patch as Record<string, unknown>)[k] !== undefined;

  if (has("name")) {
    const name = normalizeName(patch.name);
    if (!name) return { ok: false, field: "name", message: "El nombre no es válido." };
    next.name = name;
    changed.push("name");
  }
  if (has("timezone")) {
    const tz = normalizeTimezone(patch.timezone);
    if (!tz) return { ok: false, field: "timezone", message: "La zona horaria no es válida." };
    next.timezone = tz;
    changed.push("timezone");
  }
  if (has("locale")) {
    const locale = normalizeLocale(patch.locale);
    if (!locale) return { ok: false, field: "locale", message: "El idioma no es válido." };
    next.locale = locale;
    changed.push("locale");
  }

  if (changed.length === 0) return { ok: false, field: "body", message: "No hay nada que actualizar." };
  return { ok: true, next, changed };
}
