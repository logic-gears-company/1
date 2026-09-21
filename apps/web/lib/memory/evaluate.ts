/**
 * Política de evaluación de memorias candidatas. [§4]
 *
 *   message → candidate → importance → confidence → sensitivity → duration
 *           → persist / discard
 *
 * FUNCIONES PURAS: sin red, sin BD, sin reloj implícito (`now` se inyecta).
 * Todo lo que decide QUÉ merece guardarse está aquí y se prueba en aislamiento.
 * El modelo propone candidatos; ESTA política —determinista y auditable— decide.
 * Así una alucinación o una inyección de prompt del modelo no puede escribir
 * nada que la política rechace.
 */

import {
  KEY_RE,
  MEMORY_LIMITS,
  type MemoryCategory,
  type MemoryDurability,
  type MemoryKind,
  type MemorySource,
  TEMPORAL_CATEGORIES,
  looksLikeDiagnosis,
} from "./taxonomy";
import type { MemoryInput } from "./schemas";

/** Lo que el modelo propone. Aún NO es una memoria. */
export interface MemoryCandidate {
  category: MemoryCategory;
  key: string;
  value: string;
  kind: MemoryKind;
  /** ¿Lo dijo el usuario tal cual, o AXIS lo deduce? */
  origin: "explicit" | "inferred";
  confidence: number; // 0..1, declarada por el modelo
  importance: number; // 1..5
  durability: MemoryDurability;
  /** ISO 8601; obligatorio si durability = "temporal". */
  expiresAt?: string;
  reason?: string;
  /** ¿El usuario pidió expresamente que se recuerde? ("acuérdate de que…") */
  userAskedToRemember?: boolean;
  /** ¿El usuario pidió expresamente que NO se recuerde? */
  userAskedToForget?: boolean;
}

export interface EvalSettings {
  memoryEnabled: boolean;
  memoryLearningEnabled: boolean;
}

export type Decision =
  | { action: "persist"; input: MemoryInput }
  | { action: "discard"; reason: DiscardReason };

export type DiscardReason =
  | "memory_disabled"
  | "learning_disabled"
  | "user_asked_to_forget"
  | "sensitive_category_inferred"
  | "diagnosis"
  | "low_confidence"
  | "low_importance"
  | "trivial_value"
  | "invalid_expiry"
  | "expired_already"
  | "invalid_key"
  | "value_too_long";

// ── Umbrales ────────────────────────────────────────────────────────────────
// Constantes con nombre y comentario: son la "política" y se ajustan aquí, no
// dispersas por el código.

/** Confianza mínima para guardar algo que el usuario dijo explícitamente. */
export const MIN_CONFIDENCE_EXPLICIT = 0.5;
/** Para una INFERENCIA se exige más: un error inferido contamina el contexto. */
export const MIN_CONFIDENCE_INFERRED = 0.75;
/** Por debajo de esta importancia no merece ocupar espacio (§12). */
export const MIN_IMPORTANCE = 2;
/** Techo de confianza de lo inferido: nunca se presenta como certeza. */
export const INFERRED_CONFIDENCE_CAP = 0.95;
/** TTL máximo de un estado temporal: pasado esto ya no es "estado de hoy". */
export const MAX_TEMPORAL_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** TTL por defecto por categoría temporal cuando el modelo no da fecha. */
export const DEFAULT_TTL_MS: Partial<Record<MemoryCategory, number>> = {
  current_day: 24 * 60 * 60 * 1000,
  current_state: 24 * 60 * 60 * 1000,
  stress_context: 24 * 60 * 60 * 1000,
  energy_context: 24 * 60 * 60 * 1000,
  recent_events: 3 * 24 * 60 * 60 * 1000,
  active_tasks: 7 * 24 * 60 * 60 * 1000,
  upcoming_events: 7 * 24 * 60 * 60 * 1000,
  current_projects: 14 * 24 * 60 * 60 * 1000,
  unresolved_threads: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Categorías SENSIBLES: solo se guardan si el usuario las dijo él mismo. AXIS
 * NO puede deducirlas de patrones (§4: "no conviertas inferencias psicológicas
 * en diagnósticos"). Un estado pasajero ("estrés hoy") sí puede inferirse a
 * partir de lo que el usuario expresa, por eso stress/energy/current_state
 * NO están aquí: son estados expresados, no rasgos.
 */
const EXPLICIT_ONLY_CATEGORIES: ReadonlySet<MemoryCategory> = new Set<MemoryCategory>([
  "relationships",
  "identity",
  "important_dates",
]);

/** Valores tan vacíos que no aportan nada ("sí", "ok", "n/a"). */
const TRIVIAL_VALUES = new Set(["", "si", "sí", "no", "ok", "vale", "n/a", "na", "none", "null", "undefined", "?", "-", "..."]);

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Margen para el error de redondeo de coma flotante (1.0000000001 no es basura). */
const CONFIDENCE_EPSILON = 1e-6;

/**
 * Normaliza la confianza declarada por el modelo. FAIL-CLOSED: cualquier valor
 * fuera de [0,1] (más una pequeña tolerancia de redondeo) es una SEÑAL de salida
 * corrupta —típicamente el modelo devolvió un porcentaje "95" en vez de "0.95"—
 * y se trata como 0 (→ descarte), NO se recorta a 1. Recortar convertiría un
 * error de escala en una memoria de MÁXIMA confianza.
 */
function sanitizeConfidence(c: number): number {
  if (!Number.isFinite(c)) return 0;
  if (c < -CONFIDENCE_EPSILON || c > 1 + CONFIDENCE_EPSILON) return 0;
  return Math.min(1, Math.max(0, c));
}

/**
 * Resuelve la procedencia (`kind` + `source`) a partir de lo que el modelo dijo.
 *
 * El modelo etiqueta `origin` y `kind` por separado y puede contradecirse. Las
 * reglas de la BD son estrictas (CHECK `inference_chk`, y "un patrón observado
 * no es una declaración explícita"), así que aquí se RESUELVE la contradicción
 * en lugar de propagarla:
 *
 *   · origin=explicit  → el usuario lo dijo. Es `stated_state` SIEMPRE: si el
 *     modelo escribió `inference`/`observed_pattern`, se equivocó de etiqueta.
 *   · origin=inferred  → lo dedujo AXIS. Nunca `stated_state`: se promueve a
 *     `inference`. `observed_pattern` se conserva (es un tipo válido de lo deducido).
 *
 * Así `explicit_user_statement` solo acompaña a `stated_state`, y `inferred`
 * solo a `inference`/`observed_pattern`. Ver user_memories_inference_chk.
 */
function resolveProvenance(
  origin: MemoryCandidate["origin"],
  kind: MemoryKind
): { kind: MemoryKind; source: MemorySource } {
  if (origin === "explicit") return { kind: "stated_state", source: "explicit_user_statement" };
  return { kind: kind === "stated_state" ? "inference" : kind, source: "inferred" };
}

/**
 * Decide el destino de UN candidato. Orden de las comprobaciones (importa: las
 * más baratas y las de privacidad primero, así un ajuste desactivado corta
 * antes de gastar nada más):
 *   1. ajustes de privacidad del usuario           [§37]
 *   2. el usuario pidió NO recordar                [§37]
 *   3. diagnóstico                                 [§4]
 *   4. categoría sensible inferida                 [§4]
 *   5. confianza / importancia / trivialidad       [§4, §12]
 *   6. duración y caducidad coherentes             [§3]
 */
export function evaluateCandidate(
  c: MemoryCandidate,
  settings: EvalSettings,
  now: Date = new Date()
): Decision {
  // 1. Privacidad: el interruptor maestro y el de aprendizaje.
  if (!settings.memoryEnabled) return { action: "discard", reason: "memory_disabled" };

  // "Recuérdalo" es una petición EXPLÍCITA del usuario: se guarda aunque el
  // aprendizaje automático esté apagado (él lo está pidiendo). En cambio lo
  // que AXIS deduce por su cuenta exige learning habilitado.
  const explicitAsk = c.origin === "explicit" && c.userAskedToRemember === true;
  if (!settings.memoryLearningEnabled && !explicitAsk) {
    return { action: "discard", reason: "learning_disabled" };
  }

  // 2. "No recuerdes esto" gana a todo lo demás.
  if (c.userAskedToForget) return { action: "discard", reason: "user_asked_to_forget" };

  // 2b. Forma del dato. Son los CHECK de longitud/formato de la BD: se comprueban
  //     aquí para que un candidato mal formado se DESCARTE con motivo, en lugar de
  //     llegar a la capa siguiente y perderse como un "invalid" genérico.
  if (c.key.length < 1 || c.key.length > MEMORY_LIMITS.keyMax || !KEY_RE.test(c.key)) {
    return { action: "discard", reason: "invalid_key" };
  }
  if (c.value.trim().length > MEMORY_LIMITS.valueMax) {
    return { action: "discard", reason: "value_too_long" };
  }

  // 3. Diagnósticos: nunca, salvo que el propio usuario los diga de sí mismo.
  if (c.origin === "inferred" && (looksLikeDiagnosis(c.value) || (c.reason && looksLikeDiagnosis(c.reason)))) {
    return { action: "discard", reason: "diagnosis" };
  }

  // 4. Categorías que AXIS no puede deducir por su cuenta.
  if (c.origin === "inferred" && EXPLICIT_ONLY_CATEGORIES.has(c.category)) {
    return { action: "discard", reason: "sensitive_category_inferred" };
  }

  // 5. Confianza / importancia / trivialidad.
  const conf = sanitizeConfidence(c.confidence);
  const minConf = c.origin === "inferred" ? MIN_CONFIDENCE_INFERRED : MIN_CONFIDENCE_EXPLICIT;
  if (conf < minConf) return { action: "discard", reason: "low_confidence" };

  // Si el usuario pidió expresamente recordarlo, la importancia no lo bloquea.
  if (!explicitAsk && c.importance < MIN_IMPORTANCE) return { action: "discard", reason: "low_importance" };

  if (TRIVIAL_VALUES.has(normalize(c.value))) return { action: "discard", reason: "trivial_value" };

  // 6. Duración. Se normaliza para que el resultado SIEMPRE cumpla los CHECK de la BD.
  const isTemporalCategory = TEMPORAL_CATEGORIES.includes(c.category);
  let durability: MemoryDurability = c.durability;
  // Una categoría temporal (estado de hoy, estrés...) nunca puede ser permanente.
  if (isTemporalCategory && durability !== "temporal") durability = "temporal";

  let expiresAt: Date | undefined;
  if (durability === "temporal") {
    if (c.expiresAt) {
      const parsed = new Date(c.expiresAt);
      if (Number.isNaN(parsed.getTime())) return { action: "discard", reason: "invalid_expiry" };
      expiresAt = parsed;
    } else {
      const ttl = DEFAULT_TTL_MS[c.category] ?? 24 * 60 * 60 * 1000;
      expiresAt = new Date(now.getTime() + ttl);
    }
    if (expiresAt.getTime() <= now.getTime()) return { action: "discard", reason: "expired_already" };
    // Tope: un "estado temporal" no puede vivir para siempre disfrazado.
    const cap = now.getTime() + MAX_TEMPORAL_TTL_MS;
    if (expiresAt.getTime() > cap) expiresAt = new Date(cap);
  } else if (durability === "permanent") {
    expiresAt = undefined; // CHECK: permanente ⇒ sin caducidad
  }

  // Procedencia. Lo inferido NUNCA figura como declarado y su confianza tiene techo.
  const inferred = c.origin === "inferred";
  const { kind, source } = resolveProvenance(c.origin, c.kind);
  const finalConfidence = inferred || kind !== "stated_state" ? Math.min(conf, INFERRED_CONFIDENCE_CAP) : conf;

  const input: MemoryInput = {
    category: c.category,
    key: c.key,
    value: c.value.trim(),
    kind,
    durability,
    source,
    confidence: finalConfidence,
    importance: Math.min(5, Math.max(1, Math.round(c.importance))),
    reason: c.reason?.trim().slice(0, MEMORY_LIMITS.reasonMax) || undefined,
    expiresAt,
  };
  return { action: "persist", input };
}

// ── ¿Merece la pena siquiera llamar al modelo extractor? ────────────────────

/**
 * Filtro de COSTE (no de significado) que evita gastar una llamada de LLM en
 * mensajes que no pueden contener nada memorable. [§12, §29, §38]
 *
 * NO usa palabras clave sobre el contenido ("prefiero", "me gusta"…): eso lo
 * decide el modelo. Solo mira propiedades estructurales del mensaje.
 */
export function shouldAttemptExtraction(
  message: string,
  ctx: { memoryEnabled: boolean; memoryLearningEnabled: boolean; turnsSinceLastExtraction: number }
): boolean {
  if (!ctx.memoryEnabled || !ctx.memoryLearningEnabled) return false;

  const text = message.trim();
  if (text.length < 15) return false; // "ok", "gracias", "sí, dale"
  if (text.length > 6000) return false; // pegados (código, documentos): no es "hablar de uno"

  // Un bloque de código o muy poco texto natural no habla del usuario.
  const fenced = (text.match(/```/g) ?? []).length >= 2;
  if (fenced) return false;

  // Cadencia: no extraer en cada turno. La primera vez sí, luego cada 3.
  return ctx.turnsSinceLastExtraction === 0 || ctx.turnsSinceLastExtraction >= 3;
}

// ── "No recuerdes esto" desde el chat (README §6.7) ────────────────────────

/**
 * ¿Debe suprimirse (categoría, clave) porque el usuario pidió NO recordarlo?
 *
 * PURA. Reglas:
 *  · Solo con la memoria ACTIVADA (invariante 10: memoria apagada ⇒ no se escribe
 *    nada, tampoco filas `suppressed`). Con la memoria apagada no hay nada que
 *    suprimir: al reactivarla, el usuario puede repetirlo.
 *  · NO depende de `memoryLearningEnabled`: pedir "no recuerdes esto" es una orden
 *    del usuario, y debe cumplirse aunque el aprendizaje automático esté apagado.
 *  · Categoría y clave ya llegan validadas en FORMA por `coerceCandidate`; aquí se
 *    vuelve a comprobar la clave (defensa en profundidad: el modelo no es de fiar).
 *  · El alcance es la propia memoria del usuario (userId de sesión): un prompt
 *    malicioso solo podría suprimir SUS claves, y es reversible desde la UI.
 */
export function decideSuppression(
  c: MemoryCandidate,
  settings: EvalSettings
): { suppress: true; category: MemoryCategory; key: string } | { suppress: false } {
  if (!settings.memoryEnabled) return { suppress: false };
  if (c.userAskedToForget !== true) return { suppress: false };
  if (c.userAskedToRemember === true) return { suppress: false }; // contradictorio: no adivinar
  if (c.key.length < 1 || c.key.length > MEMORY_LIMITS.keyMax || !KEY_RE.test(c.key)) return { suppress: false };
  return { suppress: true, category: c.category, key: c.key };
}
