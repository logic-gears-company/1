/**
 * Schemas Zod de la memoria de AXIS. [§3, §4, §36]
 *
 * ESPEJO EN CÓDIGO de los CHECK de la migración 20260920000200_memory_tasks_events.
 * La BD es la autoridad final; esto falla ANTES con un error legible en vez de
 * una violación cruda de Postgres.
 *
 * Los enums/tipos/utilidades puras viven en `taxonomy.ts` (sin dependencias) y se
 * re-exportan aquí para que el resto del código tenga UN solo punto de entrada.
 *
 * INVARIANTE DE SEGURIDAD [§4]: el diagnóstico se bloquea en DOS capas —aquí
 * (`superRefine`) y en el CHECK de la BD—. Si una capa se eliminara por error,
 * la otra sigue protegiendo.
 */

import { z } from "zod";
import {
  KEY_RE,
  MEMORY_CATEGORIES,
  MEMORY_DURABILITIES,
  MEMORY_KINDS,
  MEMORY_LIMITS,
  MEMORY_SOURCES,
  PROACTIVE_MODES,
  looksLikeDiagnosis,
} from "./taxonomy";

export * from "./taxonomy";

// ── Schema de creación ──────────────────────────────────────────────────────

const baseMemory = z.object({
  category: z.enum(MEMORY_CATEGORIES),
  key: z
    .string()
    .min(1)
    .max(MEMORY_LIMITS.keyMax)
    .regex(KEY_RE, "La clave debe ser snake_case en minúsculas (a-z, 0-9, _)."),
  value: z.string().trim().min(1).max(MEMORY_LIMITS.valueMax),
  kind: z.enum(MEMORY_KINDS).default("stated_state"),
  durability: z.enum(MEMORY_DURABILITIES).default("stable"),
  source: z.enum(MEMORY_SOURCES).default("explicit_user_statement"),
  confidence: z.number().min(0).max(1).default(1),
  importance: z.number().int().min(1).max(5).default(3),
  reason: z.string().trim().max(MEMORY_LIMITS.reasonMax).optional(),
  sourceConversationId: z.string().min(1).optional(),
  expiresAt: z.coerce.date().optional(),
});

/**
 * Reglas cruzadas idénticas a los CHECK de la BD. Se aplican con superRefine
 * (y no con `.refine`) para poder reportar VARIOS problemas a la vez y con la
 * ruta del campo culpable.
 */
export const memoryInputSchema = baseMemory.superRefine((m, ctx) => {
  // Lo temporal SIEMPRE caduca; lo permanente NUNCA. [user_memories_expiry_chk]
  if (m.durability === "temporal" && !m.expiresAt) {
    ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Una memoria temporal exige fecha de caducidad." });
  }
  if (m.durability === "permanent" && m.expiresAt) {
    ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Una memoria permanente no puede caducar." });
  }

  // Una inferencia nunca se presenta con la certeza de algo declarado.
  // [user_memories_inference_chk]
  if (m.kind === "inference") {
    if (m.source === "explicit_user_statement" || m.source === "user_edit") {
      ctx.addIssue({ code: "custom", path: ["source"], message: "Una inferencia no puede figurar como declarada por el usuario." });
    }
    if (m.confidence >= 1) {
      ctx.addIssue({ code: "custom", path: ["confidence"], message: "Una inferencia debe tener confianza < 1." });
    }
  }

  // Un patrón observado por AXIS no es una declaración explícita.
  if (m.kind === "observed_pattern" && m.source === "explicit_user_statement") {
    ctx.addIssue({ code: "custom", path: ["source"], message: "Un patrón observado no puede figurar como declaración explícita." });
  }

  // §4: nada de diagnósticos. Se aplica sobre value Y reason (un diagnóstico
  // colado en la "razón" también acabaría en el contexto del modelo).
  // Excepción: el propio usuario puede escribir lo que quiera sobre sí mismo
  // (source explicit/user_edit): es SU dato y no una conclusión de AXIS.
  const authoredByAxis = m.source === "inferred" || m.source === "system";
  if (authoredByAxis && (looksLikeDiagnosis(m.value) || (m.reason && looksLikeDiagnosis(m.reason)))) {
    ctx.addIssue({
      code: "custom",
      path: ["value"],
      message:
        "AXIS no guarda diagnósticos. Guarda el estado expresado (p.ej. «expresó estrés por su examen»), no una condición.",
    });
  }
});

export type MemoryInput = z.infer<typeof memoryInputSchema>;

// ── Schema de edición por el usuario ("Tu memoria", §10) ────────────────────
// El usuario solo puede cambiar el CONTENIDO. No puede reescribir la
// procedencia (kind/source/confidence): esos los fija el servidor. Al editar,
// el servidor marca source="user_edit", confidence=1 y kind="stated_state":
// lo que el usuario corrige a mano es, por definición, lo que él dice.
export const memoryEditSchema = z
  .object({
    value: z.string().trim().min(1).max(MEMORY_LIMITS.valueMax).optional(),
    importance: z.number().int().min(1).max(5).optional(),
    expiresAt: z.coerce.date().nullable().optional(),
  })
  .strict() // rechaza campos desconocidos (p.ej. intentar mandar `userId` o `kind`)
  .refine((e) => e.value !== undefined || e.importance !== undefined || e.expiresAt !== undefined, {
    message: "No hay nada que actualizar.",
  });
export type MemoryEdit = z.infer<typeof memoryEditSchema>;

// ── Ajustes de privacidad (§37) ─────────────────────────────────────────────

export const userSettingsPatchSchema = z
  .object({
    memoryEnabled: z.boolean().optional(),
    memoryLearningEnabled: z.boolean().optional(),
    proactiveEnabled: z.boolean().optional(),
    proactiveMode: z.enum(PROACTIVE_MODES).optional(),
    maxProactivePerDay: z.number().int().min(0).max(10).optional(),
  })
  .strict()
  .refine((s) => Object.keys(s).length > 0, { message: "No hay nada que actualizar." });
export type UserSettingsPatch = z.infer<typeof userSettingsPatchSchema>;
