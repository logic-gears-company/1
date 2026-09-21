/**
 * Taxonomía de la memoria de AXIS: constantes, tipos y utilidades PURAS. [§3, §4]
 *
 * Sin dependencias (ni siquiera `zod`). Vive aparte de `schemas.ts` para que la
 * lógica de decisión (`evaluate.ts`) y sus pruebas no arrastren una librería de
 * validación, y para que estos enums sean la ÚNICA fuente de verdad: `schemas.ts`
 * los reutiliza con `z.enum(...)`.
 *
 * INVARIANTE [§4 "AXIS no debe diagnosticar"]: `MEMORY_KINDS` NO contiene
 * "diagnosis". La BD lo refuerza con un CHECK (migración 20260920000200).
 */

// ── Ejes ortogonales ────────────────────────────────────────────────────────

export const MEMORY_CATEGORIES = [
  // Persistent Memory (§3)
  "identity",
  "preferences",
  "interests",
  "communication_style",
  "hobbies",
  "music",
  "food",
  "education",
  "work",
  "projects",
  "goals",
  "relationships",
  "important_dates",
  "stable_context",
  // Temporal Memory (§3)
  "current_day",
  "current_state",
  "stress_context",
  "energy_context",
  "active_tasks",
  "recent_events",
  "upcoming_events",
  "current_projects",
  "unresolved_threads",
  // Interaction Model (§3)
  "response_preferences",
  "humor_preferences",
  "explanation_preferences",
  "learning_preferences",
  "behavioral_patterns",
] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

/** Grupos del §3, para pintar "Tu memoria" y decidir el TTL por defecto. */
export const PERSISTENT_CATEGORIES: readonly MemoryCategory[] = MEMORY_CATEGORIES.slice(0, 14);
export const TEMPORAL_CATEGORIES: readonly MemoryCategory[] = MEMORY_CATEGORIES.slice(14, 23);
export const INTERACTION_CATEGORIES: readonly MemoryCategory[] = MEMORY_CATEGORIES.slice(23);

/** stated_state | observed_pattern | inference. NO existe "diagnosis". */
export const MEMORY_KINDS = ["stated_state", "observed_pattern", "inference"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const MEMORY_DURABILITIES = ["permanent", "stable", "temporal"] as const;
export type MemoryDurability = (typeof MEMORY_DURABILITIES)[number];

export const MEMORY_SOURCES = ["explicit_user_statement", "user_edit", "inferred", "system"] as const;
export type MemorySource = (typeof MEMORY_SOURCES)[number];

export const MEMORY_STATUSES = ["active", "suppressed"] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

// ── Límites (espejo de los CHECK de longitud) ───────────────────────────────

export const MEMORY_LIMITS = {
  keyMax: 100,
  valueMax: 1000,
  reasonMax: 500,
} as const;

/**
 * Las claves son identificadores estables, no prosa: minúsculas, dígitos y
 * guion bajo. Así "response_directness" y "Response Directness" no se
 * convierten en dos memorias distintas por una mayúscula (el índice único
 * es por (user, category, key) y es sensible a mayúsculas).
 */
export const KEY_RE = /^[a-z][a-z0-9_]*$/;

// ── Patrones de diagnóstico (defensa en profundidad, §4) ────────────────────
// No es un clasificador clínico: es una red para el caso obvio. Bloquea que un
// VALUE guardado afirme una condición clínica sobre el usuario. "Estoy
// estresado por el examen" pasa (estado expresado); "tiene ansiedad" no.
const CLINICAL_TERMS =
  "ansiedad|depresi[oó]n|depresivo|bipolar|tdah|adhd|autis(?:mo|ta)|toc\\b|ocd|esquizofreni|psic[oó]tic|trastorno|s[ií]ndrome|anorexi|bulimi|ptsd|estr[eé]s post ?traum[aá]tico|anxiety|depression|disorder|borderline|narcisis";

const DIAGNOSIS_RE = new RegExp(
  // Verbo/cópula que atribuye una condición al usuario + (hasta 40 car.) + término
  // clínico. Cubre español ("tiene/sufre/padece/es/está/parece/presenta/
  // diagnosticado con") e inglés ("has/suffers from/is/diagnosed with").
  `\\b(?:tiene|tienes|sufre|sufres|padece|padeces|presenta|presentas|es|eres|est[aá]|estás|parece|pareces|diagnosticad[oa]|has|have|suffers? from|diagnosed with|is|are|seems)\\b[^.]{0,40}\\b(?:${CLINICAL_TERMS})`,
  "i"
);

/** true si el texto afirma un diagnóstico clínico sobre el usuario. */
export function looksLikeDiagnosis(text: string): boolean {
  return DIAGNOSIS_RE.test(text);
}

// ── Ajustes de privacidad (§37) ─────────────────────────────────────────────

export const PROACTIVE_MODES = ["high", "moderate", "low", "only_when_relevant", "disabled"] as const;
export type ProactiveMode = (typeof PROACTIVE_MODES)[number];

/** Forma pública de una memoria hacia el cliente. Nunca incluye `userId`. */
export interface MemoryView {
  id: string;
  category: MemoryCategory;
  key: string;
  value: string;
  kind: MemoryKind;
  durability: MemoryDurability;
  source: MemorySource;
  confidence: number;
  importance: number;
  reason: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}
