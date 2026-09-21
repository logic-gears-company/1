import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  selectIdsToTouch,
  LAST_USED_DEBOUNCE_MS,
  MAX_IDS_PER_TOUCH,
  type TouchCandidate,
} from "../usage-rules";

const NOW = new Date("2026-09-21T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const H = 3_600_000;

describe("selectIdsToTouch — qué memorias se marcan como usadas (§6.8)", () => {
  test("una memoria nunca usada (lastUsedAt null) se marca", () => {
    const r = selectIdsToTouch([{ id: "a", lastUsedAt: null }], NOW);
    assert.deepEqual(r, ["a"]);
  });

  test("usada hace MÁS que el umbral => se marca", () => {
    const r = selectIdsToTouch([{ id: "a", lastUsedAt: ago(LAST_USED_DEBOUNCE_MS + 1) }], NOW);
    assert.deepEqual(r, ["a"]);
  });

  test("usada hace MENOS que el umbral => NO se vuelve a escribir (debounce: ahorra escrituras)", () => {
    const r = selectIdsToTouch([{ id: "a", lastUsedAt: ago(LAST_USED_DEBOUNCE_MS - 1) }], NOW);
    assert.deepEqual(r, []);
  });

  test("justo en el umbral exacto => se marca (límite inclusivo, sin ambigüedad)", () => {
    const r = selectIdsToTouch([{ id: "a", lastUsedAt: ago(LAST_USED_DEBOUNCE_MS) }], NOW);
    assert.deepEqual(r, ["a"]);
  });

  test("mezcla: solo devuelve las que toca, conservando el orden", () => {
    const c: TouchCandidate[] = [
      { id: "fresca", lastUsedAt: ago(1 * H) },
      { id: "nunca", lastUsedAt: null },
      { id: "vieja", lastUsedAt: ago(48 * H) },
    ];
    assert.deepEqual(selectIdsToTouch(c, NOW), ["nunca", "vieja"]);
  });

  test("ids duplicados se colapsan (un UPDATE por fila, no dos)", () => {
    const r = selectIdsToTouch(
      [{ id: "a", lastUsedAt: null }, { id: "a", lastUsedAt: null }, { id: "b", lastUsedAt: null }],
      NOW
    );
    assert.deepEqual(r, ["a", "b"]);
  });

  test("lista vacía => vacía (y no lanza)", () => {
    assert.deepEqual(selectIdsToTouch([], NOW), []);
  });

  test("tope de ids por operación: nunca devuelve más de MAX_IDS_PER_TOUCH", () => {
    const many = Array.from({ length: MAX_IDS_PER_TOUCH + 50 }, (_, i) => ({ id: `m${i}`, lastUsedAt: null }));
    const r = selectIdsToTouch(many, NOW);
    assert.equal(r.length, MAX_IDS_PER_TOUCH);
    assert.deepEqual(r.slice(0, 3), ["m0", "m1", "m2"], "conserva las primeras (las de mayor puntuación)");
  });

  test("ids vacíos, no-string o solo espacios se descartan (no van a un IN (...))", () => {
    const bad = [
      { id: "", lastUsedAt: null },
      { id: "   ", lastUsedAt: null },
      { id: 5 as unknown as string, lastUsedAt: null },
      { id: null as unknown as string, lastUsedAt: null },
      { id: "ok", lastUsedAt: null },
    ];
    assert.deepEqual(selectIdsToTouch(bad, NOW), ["ok"]);
  });

  test("lastUsedAt en el FUTURO (reloj desfasado) => se trata como reciente, no se marca", () => {
    const r = selectIdsToTouch([{ id: "a", lastUsedAt: new Date(NOW.getTime() + 5 * H) }], NOW);
    assert.deepEqual(r, [], "un timestamp futuro no debe forzar una escritura en cada petición");
  });

  test("lastUsedAt inválido (Invalid Date) => se marca (autorreparación)", () => {
    const r = selectIdsToTouch([{ id: "a", lastUsedAt: new Date("no-fecha") }], NOW);
    assert.deepEqual(r, ["a"]);
  });

  test("no muta la entrada", () => {
    const c = Object.freeze([Object.freeze({ id: "a", lastUsedAt: null })]);
    assert.doesNotThrow(() => selectIdsToTouch(c as unknown as TouchCandidate[], NOW));
  });

  test("el umbral es de horas, no de segundos (si fuera corto no ahorraría nada)", () => {
    assert.ok(LAST_USED_DEBOUNCE_MS >= 1 * H, "debounce demasiado corto");
    assert.ok(LAST_USED_DEBOUNCE_MS <= 24 * H, "debounce demasiado largo: last_used_at perdería utilidad");
  });
});
