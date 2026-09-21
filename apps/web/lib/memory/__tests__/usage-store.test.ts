import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { S, reset } from "./_mocks/usage-db.cjs";
import { touchMemoriesUsed } from "../usage-store";

const NOW = new Date("2026-09-21T12:00:00.000Z");
const H = 3_600_000;

describe("touchMemoriesUsed — E/S de last_used_at (§6.8)", () => {
  beforeEach(() => reset());

  test("marca las memorias nunca usadas con la hora dada", async () => {
    const n = await touchMemoriesUsed("u1", [{ id: "m1", lastUsedAt: null }, { id: "m2", lastUsedAt: null }], NOW);
    assert.equal(n, 2);
    assert.deepEqual(S.rows.get("m1")!.lastUsedAt, NOW);
    assert.deepEqual(S.rows.get("m2")!.lastUsedAt, NOW);
  });

  test("UN solo updateMany por respuesta (no uno por fila)", async () => {
    await touchMemoriesUsed("u1", [{ id: "m1", lastUsedAt: null }, { id: "m2", lastUsedAt: null }], NOW);
    assert.equal(S.calls.length, 1);
    assert.deepEqual(S.calls[0].where.id.in, ["m1", "m2"]);
  });

  test("solo escribe last_used_at: NO toca updated_at ni ninguna otra columna", async () => {
    await touchMemoriesUsed("u1", [{ id: "m1", lastUsedAt: null }], NOW);
    assert.deepEqual(Object.keys(S.calls[0].data), ["lastUsedAt"]);
    assert.deepEqual(S.rows.get("m1")!.updatedAt, new Date("2026-01-01T00:00:00Z"));
  });

  test("ANTI-IDOR: el where SIEMPRE lleva userId; un id ajeno no se actualiza", async () => {
    // u1 intenta marcar x9, que es de u2.
    const n = await touchMemoriesUsed("u1", [{ id: "x9", lastUsedAt: null }, { id: "m1", lastUsedAt: null }], NOW);
    assert.equal(S.calls[0].where.userId, "u1");
    assert.equal(S.rows.get("x9")!.lastUsedAt, null, "la memoria de OTRO usuario no se toca");
    assert.equal(n, 1, "solo cuenta la propia");
  });

  test("debounce: usada hace 1 h => NO escribe y ni siquiera llama a la BD", async () => {
    const n = await touchMemoriesUsed("u1", [{ id: "m1", lastUsedAt: new Date(NOW.getTime() - 1 * H) }], NOW);
    assert.equal(n, 0);
    assert.equal(S.calls.length, 0);
  });

  test("entrada vacía / undefined / userId vacío => 0 y sin llamar a la BD", async () => {
    assert.equal(await touchMemoriesUsed("u1", [], NOW), 0);
    assert.equal(await touchMemoriesUsed("u1", undefined, NOW), 0);
    assert.equal(await touchMemoriesUsed("", [{ id: "m1", lastUsedAt: null }], NOW), 0);
    assert.equal(S.calls.length, 0);
  });

  test("NUNCA lanza si la BD falla: devuelve 0 (el chat no se entera)", async () => {
    S.failNext = true;
    await assert.doesNotReject(() => touchMemoriesUsed("u1", [{ id: "m1", lastUsedAt: null }], NOW));
    S.failNext = true;
    assert.equal(await touchMemoriesUsed("u1", [{ id: "m1", lastUsedAt: null }], NOW), 0);
  });

  test("el error de BD se registra SIN filtrar la cadena de conexión (logger real)", async () => {
    const lines: string[] = [];
    const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
    console.log = console.warn = console.error = console.info = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
    try { S.failNext = true; await touchMemoriesUsed("u1", [{ id: "m1", lastUsedAt: null }], NOW); }
    finally { Object.assign(console, orig); }
    const out = lines.join("\n");
    assert.ok(out.includes("memory.touch_failed"), "se registró el fallo");
    assert.ok(!out.includes("user:pass"), "no debe filtrar credenciales de la URL de conexión");
  });
});
