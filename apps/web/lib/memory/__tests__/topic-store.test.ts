import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { S, seed } from "./_mocks/topic-db.cjs";
import { previewTopic, forgetTopic, topicWhere, PREVIEW_LIMIT } from "../forget-topic";
import { suppressKey } from "../store";

const mem = (id: string, userId: string, value: string, extra: Record<string, unknown> = {}) => ({
  id, userId, category: "interests", key: "k_" + id, value, ...extra,
});
const ids = () => [...S.rows.keys()].sort();

describe("previewTopic (dryRun) — solo lectura", () => {
  beforeEach(() => seed([
    mem("a1", "A", "Me gusta la biología marina"),
    mem("a2", "A", "Estudio BIOLOGÍA en la uni"),
    mem("a3", "A", "Toco la guitarra"),
    mem("b1", "B", "Biología es mi trabajo"),
  ]));

  test("devuelve las coincidencias (insensible a mayúsculas) y el total", async () => {
    const r = await previewTopic("A", "biología");
    assert.equal(r.total, 2);
    assert.deepEqual(r.matches.map((m) => m.id).sort(), ["a1", "a2"]);
  });

  test("NO modifica nada: ni borra ni escribe", async () => {
    const before = ids();
    await previewTopic("A", "biología");
    assert.deepEqual(ids(), before);
    assert.ok(S.calls.every((c: any) => c.op === "count" || c.op === "findMany"), "solo lecturas");
  });

  test("AISLAMIENTO: A no ve las memorias de B aunque coincidan", async () => {
    const r = await previewTopic("A", "biología");
    assert.ok(!r.matches.some((m) => m.id === "b1"));
    const rb = await previewTopic("B", "biología");
    assert.deepEqual(rb.matches.map((m) => m.id), ["b1"]);
  });

  test("el where lleva userId y solo memorias activas", async () => {
    await previewTopic("A", "biología");
    const w: any = S.calls[0].where;
    assert.equal(w.userId, "A");
    assert.equal(w.status, "active");
  });

  test("no devuelve el userId ni campos internos", async () => {
    const r = await previewTopic("A", "biología");
    for (const m of r.matches) assert.deepEqual(Object.keys(m).sort(), ["category", "id", "value"]);
  });

  test("tema de 1 letra o vacío => sin resultados y SIN tocar la BD", async () => {
    for (const t of ["", " ", "a", "  x "]) {
      S.calls.length = 0;
      assert.deepEqual(await previewTopic("A", t), { total: 0, matches: [] });
      assert.equal(S.calls.length, 0);
    }
  });

  test("los comodines SQL se tratan como texto literal, no como patrón", async () => {
    for (const t of ["%%", "__", "%a", "_i"]) assert.equal((await previewTopic("A", t)).total, 0, t);
  });

  test("la lista se acota a PREVIEW_LIMIT pero `total` es el real", async () => {
    seed(Array.from({ length: PREVIEW_LIMIT + 7 }, (_, i) => mem("m" + i, "A", "tema común " + i)));
    const r = await previewTopic("A", "tema común");
    assert.equal(r.matches.length, PREVIEW_LIMIT);
    assert.equal(r.total, PREVIEW_LIMIT + 7);
  });
});

describe("forgetTopic — borrado", () => {
  beforeEach(() => seed([
    mem("a1", "A", "Me gusta la biología marina"),
    mem("a2", "A", "Estudio biología"),
    mem("a3", "A", "Toco la guitarra"),
    mem("b1", "B", "Biología es mi trabajo"),
    mem("a4", "A", "biología antigua", { status: "suppressed" }),
  ]));

  test("sin ids: borra todas las activas del usuario que coinciden", async () => {
    assert.equal(await forgetTopic("A", "biología"), 2);
    assert.deepEqual(ids(), ["a3", "a4", "b1"]);
  });

  test("AISLAMIENTO: nunca borra memorias de otro usuario", async () => {
    await forgetTopic("A", "biología");
    assert.ok(S.rows.has("b1"), "la memoria de B sobrevive");
  });

  test("no toca las filas 'suppressed' (son las reglas de no-recordar)", async () => {
    await forgetTopic("A", "biología");
    assert.ok(S.rows.has("a4"));
  });

  test("con ids: borra SOLO esos", async () => {
    assert.equal(await forgetTopic("A", "biología", ["a1"]), 1);
    assert.deepEqual(ids(), ["a2", "a3", "a4", "b1"]);
  });

  test("ANTI-IDOR: con ids ajenos (de B) no borra nada de B", async () => {
    assert.equal(await forgetTopic("A", "biología", ["b1"]), 0);
    assert.ok(S.rows.has("b1"));
  });

  test("ids que YA NO coinciden con el tema no se borran (intersección)", async () => {
    // a3 (guitarra) no coincide con «biología»: aunque venga en ids, se conserva.
    assert.equal(await forgetTopic("A", "biología", ["a1", "a3"]), 1);
    assert.ok(S.rows.has("a3"));
  });

  test("ids VACÍO => borra 0 (NO 'todo lo que coincida')", async () => {
    assert.equal(await forgetTopic("A", "biología", []), 0);
    assert.equal(ids().length, 5);
    assert.equal(S.calls.length, 0, "ni siquiera consulta");
  });

  test("tema inválido => 0 y no toca la BD", async () => {
    for (const t of ["", "a", "  "]) assert.equal(await forgetTopic("A", t), 0);
    assert.equal(S.calls.length, 0);
    assert.equal(ids().length, 5);
  });

  test("vista previa y borrado usan la MISMA condición (topicWhere)", async () => {
    const before = (await previewTopic("A", "biología")).matches.map((m) => m.id).sort();
    await forgetTopic("A", "biología");
    const after = ids();
    for (const id of before) assert.ok(!after.includes(id), id + " debía borrarse");
    assert.deepEqual(topicWhere("A", "x"), topicWhere("A", "x"));
  });

  test("la clave también coincide con espacios convertidos en '_'", async () => {
    seed([{ id: "k1", userId: "A", category: "interests", key: "libro_favorito", value: "Dune" }]);
    assert.equal(await forgetTopic("A", "libro favorito"), 1);
  });
});

describe("suppressKey — «no recuerdes esto» desde el chat", () => {
  beforeEach(() => seed([
    { id: "a1", userId: "A", category: "interests", key: "musica_favorita", value: "jazz", status: "active" },
    { id: "b1", userId: "B", category: "interests", key: "musica_favorita", value: "rock", status: "active" },
  ]));

  test("borra la memoria viva y deja UNA fila suprimida sin el valor", async () => {
    assert.equal(await suppressKey("A", "interests", "musica_favorita"), true);
    const mine = [...S.rows.values()].filter((r: any) => r.userId === "A");
    assert.equal(mine.length, 1);
    assert.equal(mine[0].status, "suppressed");
    assert.notEqual(mine[0].value, "jazz", "NO conserva el dato que se pidió olvidar");
  });

  test("AISLAMIENTO: no toca la misma (categoría, clave) de otro usuario", async () => {
    await suppressKey("A", "interests", "musica_favorita");
    const b: any = S.rows.get("b1");
    assert.equal(b.status, "active");
    assert.equal(b.value, "rock");
  });

  test("si no había memoria viva: crea igualmente la supresión y devuelve false", async () => {
    assert.equal(await suppressKey("A", "hobbies", "ajedrez"), false);
    const s: any = [...S.rows.values()].find((r: any) => r.key === "ajedrez");
    assert.equal(s.status, "suppressed");
    assert.equal(s.userId, "A");
  });

  test("IDEMPOTENTE: llamarla dos veces no viola el índice único", async () => {
    await suppressKey("A", "interests", "musica_favorita");
    await assert.doesNotReject(() => suppressKey("A", "interests", "musica_favorita"));
    const mine = [...S.rows.values()].filter((r: any) => r.userId === "A" && r.key === "musica_favorita");
    assert.equal(mine.length, 1);
    assert.equal(S.uniqueViolations, 0);
  });

  test("ATÓMICA: si el create falla, la memoria viva NO se pierde", async () => {
    // Fuerza el fallo en el 3.er paso (create) para verificar el rollback.
    const orig = (S as any);
    let n = 0;
    const db = require("./_mocks/topic-db.cjs");
    const realCreate = db.prisma.userMemory.create;
    db.prisma.userMemory.create = () => ({ __run: async () => { n++; throw new Error("fallo forzado"); }, then: (a: any, b: any) => Promise.reject(new Error("x")).then(a, b) });
    try {
      await assert.rejects(() => suppressKey("A", "interests", "musica_favorita"), /fallo forzado/);
    } finally { db.prisma.userMemory.create = realCreate; }
    assert.equal(n, 1);
    const a: any = S.rows.get("a1");
    assert.ok(a, "la memoria viva sigue ahí tras el rollback");
    assert.equal(a.value, "jazz");
    void orig;
  });

  test("el where de borrado lleva SIEMPRE userId", async () => {
    await suppressKey("A", "interests", "musica_favorita");
    for (const c of S.calls.filter((c: any) => c.op === "deleteMany")) assert.equal((c as any).where.userId, "A");
  });
});
