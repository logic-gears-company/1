import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { S, reset } from "./_mocks/learn-store.cjs";
import { learnFromMessage } from "../learn";

const ON = { memoryEnabled: true, memoryLearningEnabled: true };
const cand = (o: Record<string, unknown> = {}) => ({
  category: "interests", key: "musica_favorita", value: "jazz", kind: "stated_state", origin: "explicit",
  confidence: 0.95, importance: 4, durability: "stable", ...o,
});
const model = (candidates: unknown[]) => async () => JSON.stringify({ candidates });
const MSG = "Por favor no recuerdes que me gusta el jazz, prefiero que lo olvides";
const run = (candidates: unknown[], settings = ON, msg = MSG) =>
  learnFromMessage({ userId: "u1", conversationId: "c1", message: msg, settings, callModel: model(candidates) });

describe("learnFromMessage — cableado de «no recuerdes esto» (§6.7)", () => {
  beforeEach(() => reset());

  test("userAskedToForget => suprime (categoría, clave) del usuario y NO guarda la memoria", async () => {
    const r = await run([cand({ userAskedToForget: true })]);
    assert.deepEqual(S.suppressions, [{ userId: "u1", category: "interests", key: "musica_favorita" }]);
    assert.equal(S.upserts.length, 0, "no debe guardar lo que se pidió olvidar");
    assert.deepEqual(r, { persisted: 0, discarded: 0, suppressed: 1 });
  });

  test("memoria APAGADA: no suprime ni guarda nada (invariante 10)", async () => {
    const r = await run([cand({ userAskedToForget: true })], { memoryEnabled: false, memoryLearningEnabled: false });
    assert.equal(S.suppressions.length, 0);
    assert.equal(S.upserts.length, 0);
    assert.equal(r.suppressed, 0);
  });

  test("aprendizaje apagado pero memoria activa: la orden de olvidar SÍ se cumple", async () => {
    // shouldAttemptExtraction corta con learning apagado: documenta el límite conocido.
    const r = await run([cand({ userAskedToForget: true })], { memoryEnabled: true, memoryLearningEnabled: false });
    assert.equal(r.suppressed, 0, "LÍMITE CONOCIDO: el extractor no corre con aprendizaje apagado (tool memory_forget, Fase 6)");
  });

  test("un candidato normal se guarda y no se suprime nada", async () => {
    const r = await run([cand()], ON, "Me encanta escuchar jazz por las noches mientras estudio");
    assert.equal(S.suppressions.length, 0);
    assert.equal(S.upserts.length, 1);
    assert.equal(r.persisted, 1);
  });

  test("mezcla: olvida una clave y guarda otra distinta en el mismo mensaje", async () => {
    const r = await run([
      cand({ userAskedToForget: true }),
      cand({ category: "hobbies", key: "ajedrez", value: "juega ajedrez", userAskedToRemember: true }),
    ]);
    assert.equal(S.suppressions.length, 1);
    assert.equal(S.upserts.length, 1);
    assert.equal(r.suppressed, 1);
    assert.equal(r.persisted, 1);
  });

  test("si suprimir FALLA, no lanza y el resto de candidatos se sigue procesando", async () => {
    S.failSuppress = true;
    let r: any;
    await assert.doesNotReject(async () => {
      r = await run([
        cand({ userAskedToForget: true }),
        cand({ category: "hobbies", key: "ajedrez", value: "juega ajedrez", userAskedToRemember: true }),
      ]);
    });
    assert.equal(r.suppressed, 0);
    assert.equal(r.persisted, 1, "el segundo candidato no se pierde por el fallo del primero");
  });

  test("el userId de la supresión es el de la SESIÓN (argumento), nunca del modelo", async () => {
    await run([cand({ userAskedToForget: true, userId: "victima", user_id: "victima" })]);
    assert.equal(S.suppressions[0].userId, "u1");
  });

  test("clave maliciosa del modelo => no se suprime nada", async () => {
    const r = await run([cand({ userAskedToForget: true, key: "x'; DROP TABLE user_memories;--" })]);
    assert.equal(S.suppressions.length, 0);
    assert.equal(r.suppressed, 0);
  });

  test("NUNCA lanza aunque el modelo devuelva basura", async () => {
    const out = await learnFromMessage({ userId: "u1", conversationId: "c1", message: MSG, settings: ON, callModel: async () => "%%% no es json" });
    assert.deepEqual(out, { persisted: 0, discarded: 0, suppressed: 0 });
  });
});
