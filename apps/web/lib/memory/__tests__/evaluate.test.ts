import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateCandidate, shouldAttemptExtraction, type MemoryCandidate, type EvalSettings,
  MAX_TEMPORAL_TTL_MS, INFERRED_CONFIDENCE_CAP,
} from "../evaluate";

const NOW = new Date("2026-09-21T12:00:00.000Z");
const ON: EvalSettings = { memoryEnabled: true, memoryLearningEnabled: true };
const H = 3600_000, D = 24 * H;

const base = (o: Partial<MemoryCandidate> = {}): MemoryCandidate => ({
  category: "communication_style", key: "response_directness", value: "prefers_direct_answers",
  kind: "stated_state", origin: "explicit", confidence: 0.95, importance: 4, durability: "stable", ...o,
});
const persisted = (d: ReturnType<typeof evaluateCandidate>) => { assert.equal(d.action, "persist", JSON.stringify(d)); return (d as any).input; };
const discarded = (d: ReturnType<typeof evaluateCandidate>, why: string) => { assert.equal(d.action, "discard", JSON.stringify(d)); assert.equal((d as any).reason, why); };

describe("privacidad del usuario (§37) — lo primero que se evalúa", () => {
  test("memoria desactivada: NO se guarda NADA, ni lo explícito", () => {
    discarded(evaluateCandidate(base(), { memoryEnabled: false, memoryLearningEnabled: false }, NOW), "memory_disabled");
    discarded(evaluateCandidate(base({ userAskedToRemember: true }), { memoryEnabled: false, memoryLearningEnabled: false }, NOW), "memory_disabled");
  });
  test("aprendizaje apagado: se descarta lo que AXIS deduce", () => {
    discarded(evaluateCandidate(base({ origin: "inferred", kind: "inference", confidence: 0.9 }), { memoryEnabled: true, memoryLearningEnabled: false }, NOW), "learning_disabled");
  });
  test("aprendizaje apagado PERO el usuario dice 'acuérdate de esto': sí se guarda", () => {
    persisted(evaluateCandidate(base({ userAskedToRemember: true }), { memoryEnabled: true, memoryLearningEnabled: false }, NOW));
  });
  test("aprendizaje apagado y explícito sin petición de recordar: se descarta", () => {
    discarded(evaluateCandidate(base(), { memoryEnabled: true, memoryLearningEnabled: false }, NOW), "learning_disabled");
  });
  test("'no recuerdes esto' gana incluso a 'acuérdate' en el mismo candidato", () => {
    discarded(evaluateCandidate(base({ userAskedToForget: true, userAskedToRemember: true }), ON, NOW), "user_asked_to_forget");
  });
});

describe("no diagnosticar (§4)", () => {
  test("una inferencia que afirma una condición clínica se descarta", () => {
    discarded(evaluateCandidate(base({ category: "current_state", origin: "inferred", kind: "inference", value: "El usuario tiene ansiedad", confidence: 0.9, durability: "temporal" }), ON, NOW), "diagnosis");
  });
  test("un diagnóstico escondido en `reason` también se descarta", () => {
    discarded(evaluateCandidate(base({ origin: "inferred", kind: "inference", value: "pide pasos concretos", reason: "parece que sufre de depresión", confidence: 0.9 }), ON, NOW), "diagnosis");
  });
  test("el estado EXPRESADO sí se guarda (estrés por el examen)", () => {
    const i = persisted(evaluateCandidate(base({ category: "stress_context", key: "exam_stress", value: "Expresó estrés elevado por su examen de mañana", durability: "temporal", confidence: 0.88, importance: 3 }), ON, NOW));
    assert.equal(i.durability, "temporal"); assert.ok(i.expiresAt instanceof Date);
  });
  test("si el USUARIO lo dice de sí mismo, es su dato y se respeta", () => {
    persisted(evaluateCandidate(base({ category: "stable_context", key: "note", value: "Tengo TDAH, prefiero listas cortas", origin: "explicit", confidence: 1 }), ON, NOW));
  });
});

describe("categorías que AXIS no puede deducir (§4)", () => {
  for (const category of ["relationships", "identity", "important_dates"] as const) {
    test(`${category} inferida → descartada`, () => {
      discarded(evaluateCandidate(base({ category, origin: "inferred", kind: "inference", confidence: 0.9 }), ON, NOW), "sensitive_category_inferred");
    });
    test(`${category} dicha por el usuario → guardada`, () => {
      persisted(evaluateCandidate(base({ category, key: "x", value: "algo concreto" }), ON, NOW));
    });
  }
});

describe("confianza, importancia y trivialidad", () => {
  test("explícito: umbral 0.5", () => {
    discarded(evaluateCandidate(base({ confidence: 0.49 }), ON, NOW), "low_confidence");
    persisted(evaluateCandidate(base({ confidence: 0.5 }), ON, NOW));
  });
  test("inferido: umbral MÁS ALTO (0.75)", () => {
    const inf = (c: number) => base({ origin: "inferred", kind: "inference", confidence: c });
    discarded(evaluateCandidate(inf(0.74), ON, NOW), "low_confidence");
    persisted(evaluateCandidate(inf(0.75), ON, NOW));
  });
  test("confianza inferida con techo < 1 (nunca certeza)", () => {
    const i = persisted(evaluateCandidate(base({ origin: "inferred", kind: "inference", confidence: 1 }), ON, NOW));
    assert.ok(i.confidence <= INFERRED_CONFIDENCE_CAP && i.confidence < 1);
  });
  test("confianza basura (NaN/±Infinity/negativa) se trata como 0 y se descarta", () => {
    for (const c of [NaN, -3, -Infinity]) discarded(evaluateCandidate(base({ confidence: c }), ON, NOW), "low_confidence");
  });
  // FAIL-CLOSED: un valor no finito indica salida corrupta del modelo. Recortar
  // +Infinity a 1 convertiría basura en una memoria de MÁXIMA confianza; ante la
  // duda se descarta (mismo principio que el presupuesto de Cohere).
  test("+Infinity NO se convierte en confianza máxima: se descarta", () => {
    discarded(evaluateCandidate(base({ confidence: Infinity }), ON, NOW), "low_confidence");
  });
  // Error de escala típico: el modelo devuelve 95 (porcentaje) en vez de 0.95.
  // Recortar a 1 lo convertiría en certeza máxima → se descarta (fail-closed).
  test("fuera de [0,1] (1.2, 5, 95, 100) es salida corrupta: se descarta, NO se recorta", () => {
    for (const c of [1.2, 5, 95, 100]) {
      discarded(evaluateCandidate(base({ confidence: c }), ON, NOW), "low_confidence");
      discarded(evaluateCandidate(base({ confidence: c, origin: "inferred", kind: "inference" }), ON, NOW), "low_confidence");
    }
  });
  test("pero el ruido de redondeo de coma flotante (1.0000000001) sí se tolera", () => {
    assert.equal(persisted(evaluateCandidate(base({ confidence: 1.0000000001 }), ON, NOW)).confidence, 1);
  });
  test("importancia 1 se descarta; 2 pasa", () => {
    discarded(evaluateCandidate(base({ importance: 1 }), ON, NOW), "low_importance");
    persisted(evaluateCandidate(base({ importance: 2 }), ON, NOW));
  });
  test("importancia baja NO bloquea si el usuario pidió recordarlo", () => {
    persisted(evaluateCandidate(base({ importance: 1, userAskedToRemember: true }), ON, NOW));
  });
  test("valores triviales se descartan", () => {
    for (const v of ["ok", "  Sí ", "N/A", "-", "...", "null"]) discarded(evaluateCandidate(base({ value: v }), ON, NOW), "trivial_value");
  });
  test("importancia decimal se redondea y se acota a 1..5", () => {
    assert.equal(persisted(evaluateCandidate(base({ importance: 3.6 }), ON, NOW)).importance, 4);
    assert.equal(persisted(evaluateCandidate(base({ importance: 99 }), ON, NOW)).importance, 5);
  });
});

describe("procedencia: lo inferido NUNCA figura como declarado (CHECK de la BD)", () => {
  test("inferido → source=inferred y kind=inference", () => {
    const i = persisted(evaluateCandidate(base({ origin: "inferred", kind: "stated_state", confidence: 0.9 }), ON, NOW));
    assert.equal(i.source, "inferred"); assert.equal(i.kind, "inference");
  });
  test("observed_pattern inferido conserva su kind pero source=inferred", () => {
    const i = persisted(evaluateCandidate(base({ origin: "inferred", kind: "observed_pattern", confidence: 0.9 }), ON, NOW));
    assert.equal(i.kind, "observed_pattern"); assert.equal(i.source, "inferred");
  });
  test("explícito → source=explicit_user_statement", () => {
    assert.equal(persisted(evaluateCandidate(base(), ON, NOW)).source, "explicit_user_statement");
  });
});

describe("duración y caducidad — el resultado SIEMPRE cumple los CHECK de la BD", () => {
  test("categoría temporal declarada 'stable' se fuerza a temporal", () => {
    const i = persisted(evaluateCandidate(base({ category: "current_state", key: "mood", value: "cansado hoy", durability: "stable" }), ON, NOW));
    assert.equal(i.durability, "temporal"); assert.ok(i.expiresAt);
  });
  test("temporal sin fecha → TTL por defecto de su categoría", () => {
    const i = persisted(evaluateCandidate(base({ category: "current_projects", key: "bio", value: "proyecto de biología", durability: "temporal" }), ON, NOW));
    assert.equal(i.expiresAt.getTime(), NOW.getTime() + 14 * D);
  });
  test("estrés sin fecha → caduca en 24 h", () => {
    const i = persisted(evaluateCandidate(base({ category: "stress_context", key: "s", value: "estresado por examen", durability: "temporal", confidence: 0.9 }), ON, NOW));
    assert.equal(i.expiresAt.getTime(), NOW.getTime() + D);
  });
  test("caducidad propuesta por el modelo se respeta si es razonable", () => {
    const exp = new Date(NOW.getTime() + 2 * D).toISOString();
    assert.equal(persisted(evaluateCandidate(base({ category: "upcoming_events", key: "exam", value: "examen de biología", durability: "temporal", expiresAt: exp }), ON, NOW)).expiresAt.toISOString(), exp);
  });
  test("caducidad absurda (años) se acota a MAX_TEMPORAL_TTL", () => {
    const far = new Date(NOW.getTime() + 999 * D).toISOString();
    const i = persisted(evaluateCandidate(base({ category: "current_state", key: "s", value: "algo", durability: "temporal", expiresAt: far }), ON, NOW));
    assert.equal(i.expiresAt.getTime(), NOW.getTime() + MAX_TEMPORAL_TTL_MS);
  });
  test("fecha inválida → descartada", () => {
    discarded(evaluateCandidate(base({ category: "current_state", key: "s", value: "algo", durability: "temporal", expiresAt: "no-es-fecha" }), ON, NOW), "invalid_expiry");
  });
  test("fecha ya pasada → descartada", () => {
    discarded(evaluateCandidate(base({ category: "current_state", key: "s", value: "algo", durability: "temporal", expiresAt: new Date(NOW.getTime() - H).toISOString() }), ON, NOW), "expired_already");
  });
  test("permanente NUNCA lleva caducidad aunque el modelo la mande", () => {
    const i = persisted(evaluateCandidate(base({ category: "identity", key: "name", value: "Marcos", durability: "permanent", expiresAt: new Date(NOW.getTime() + D).toISOString() }), ON, NOW));
    assert.equal(i.expiresAt, undefined);
  });
  test("stable no toca la caducidad", () => {
    assert.equal(persisted(evaluateCandidate(base(), ON, NOW)).expiresAt, undefined);
  });
});

describe("shouldAttemptExtraction — filtro de COSTE, no de significado", () => {
  const ctx = (o = {}) => ({ memoryEnabled: true, memoryLearningEnabled: true, turnsSinceLastExtraction: 0, ...o });
  test("respeta los ajustes de privacidad antes que nada", () => {
    assert.equal(shouldAttemptExtraction("Estoy haciendo un proyecto de biología", ctx({ memoryEnabled: false })), false);
    assert.equal(shouldAttemptExtraction("Estoy haciendo un proyecto de biología", ctx({ memoryLearningEnabled: false })), false);
  });
  test("mensajes cortos no gastan una llamada", () => {
    for (const m of ["ok", "gracias", "sí, dale", "jaja vale"]) assert.equal(shouldAttemptExtraction(m, ctx()), false);
  });
  test("pegados de código o documentos enormes no se analizan", () => {
    assert.equal(shouldAttemptExtraction("mira:\n```js\nconst a = 1;\n```\n¿qué hace esto exactamente?", ctx()), false);
    assert.equal(shouldAttemptExtraction("x ".repeat(4000), ctx()), false);
  });
  test("cadencia: primera vez sí, luego cada 3 turnos", () => {
    const m = "Estoy haciendo un proyecto de biología sobre células";
    assert.equal(shouldAttemptExtraction(m, ctx({ turnsSinceLastExtraction: 0 })), true);
    assert.equal(shouldAttemptExtraction(m, ctx({ turnsSinceLastExtraction: 1 })), false);
    assert.equal(shouldAttemptExtraction(m, ctx({ turnsSinceLastExtraction: 2 })), false);
    assert.equal(shouldAttemptExtraction(m, ctx({ turnsSinceLastExtraction: 3 })), true);
  });
  test("NO decide por palabras clave: un mensaje sin 'prefiero/me gusta' también pasa", () => {
    assert.equal(shouldAttemptExtraction("Mañana tengo examen de anatomía y no he empezado", ctx()), true);
  });
});

// ── Regresiones halladas por fuzz contra los CHECK de la BD ─────────────────
// El modelo extractor puede etiquetar mal `kind` respecto a `origin`. La política
// debe RESOLVER la contradicción, no dejar que la capa siguiente (Zod / CHECK)
// rechace en silencio una memoria legítima.
describe("coherencia kind/origin: el resultado nunca contradice a la BD", () => {
  test("origin=explicit con kind=inference: el usuario lo dijo, NO es una inferencia", () => {
    const i = persisted(evaluateCandidate(base({ origin: "explicit", kind: "inference" }), ON, NOW));
    assert.equal(i.kind, "stated_state");
    assert.equal(i.source, "explicit_user_statement");
  });
  test("origin=explicit con kind=observed_pattern: la etiqueta del modelo es incoherente; manda 'explicit'", () => {
    // Si el usuario lo dijo tal cual, no puede ser un "patrón observado" (eso es
    // algo que AXIS deduce por repetición). Se resuelve hacia stated_state y NUNCA
    // se produce la combinación prohibida (observed_pattern + explicit_user_statement).
    const i = persisted(evaluateCandidate(base({ origin: "explicit", kind: "observed_pattern" }), ON, NOW));
    assert.equal(i.kind, "stated_state");
    assert.equal(i.source, "explicit_user_statement");
  });
  test("origin=inferred con kind=observed_pattern se conserva como patrón (no se degrada a stated_state)", () => {
    const i = persisted(evaluateCandidate(base({ origin: "inferred", kind: "observed_pattern", confidence: 0.9 }), ON, NOW));
    assert.equal(i.kind, "observed_pattern");
    assert.equal(i.source, "inferred");
  });
});

describe("longitudes: evaluateCandidate cumple los CHECK de longitud de la BD", () => {
  test("value > 1000 caracteres se descarta (no llega a la BD)", () => {
    discarded(evaluateCandidate(base({ value: "x".repeat(1001) }), ON, NOW), "value_too_long");
  });
  test("value de exactamente 1000 caracteres pasa", () => {
    persisted(evaluateCandidate(base({ value: "x".repeat(1000) }), ON, NOW));
  });
  test("reason > 500 caracteres se recorta, no se descarta la memoria", () => {
    const i = persisted(evaluateCandidate(base({ reason: "r".repeat(900) }), ON, NOW));
    assert.ok(i.reason.length <= 500);
  });
  test("key inválida (no snake_case) se descarta", () => {
    discarded(evaluateCandidate(base({ key: "Response Directness" }), ON, NOW), "invalid_key");
    discarded(evaluateCandidate(base({ key: "" }), ON, NOW), "invalid_key");
    discarded(evaluateCandidate(base({ key: "k".repeat(101) }), ON, NOW), "invalid_key");
  });
});

import { decideSuppression } from "../evaluate";

describe("decideSuppression — «no recuerdes esto» desde el chat (§6.7)", () => {
  const ask = (o: Partial<MemoryCandidate> = {}) => base({ userAskedToForget: true, ...o });

  test("pedido explícito + memoria activada => suprime (categoría, clave)", () => {
    assert.deepEqual(decideSuppression(ask(), ON), { suppress: true, category: "communication_style", key: "response_directness" });
  });
  test("sin userAskedToForget => NO suprime", () => {
    assert.deepEqual(decideSuppression(base(), ON), { suppress: false });
    assert.deepEqual(decideSuppression(base({ userAskedToForget: false }), ON), { suppress: false });
  });
  test("INVARIANTE 10: memoria APAGADA => no escribe nada, ni supresiones", () => {
    assert.deepEqual(decideSuppression(ask(), { memoryEnabled: false, memoryLearningEnabled: false }), { suppress: false });
  });
  test("aprendizaje APAGADO pero memoria activa => SÍ suprime (es una orden del usuario)", () => {
    assert.equal(decideSuppression(ask(), { memoryEnabled: true, memoryLearningEnabled: false }).suppress, true);
  });
  test("contradictorio (olvida + recuerda a la vez) => no adivina, no suprime", () => {
    assert.deepEqual(decideSuppression(ask({ userAskedToRemember: true }), ON), { suppress: false });
  });
  test("defensa en profundidad: clave inválida => no suprime", () => {
    for (const key of ["", "Mayúsculas", "con espacio", "1empieza", "x'; DROP TABLE--", "a".repeat(101), "../etc"]) {
      assert.deepEqual(decideSuppression(ask({ key }), ON), { suppress: false }, JSON.stringify(key));
    }
  });
  test("es PURA: misma entrada => misma salida, y no muta el candidato", () => {
    const c = ask(); const snap = JSON.stringify(c);
    assert.deepEqual(decideSuppression(c, ON), decideSuppression(c, ON));
    assert.equal(JSON.stringify(c), snap);
  });
  test("coherente con evaluateCandidate: lo que se suprime, evaluateCandidate lo descarta (nunca se guarda a la vez)", () => {
    const c = ask();
    assert.equal(decideSuppression(c, ON).suppress, true);
    assert.deepEqual(evaluateCandidate(c, ON, NOW), { action: "discard", reason: "user_asked_to_forget" });
  });
});
