import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applySettingsPatch, type SettingsState } from "../settings-rules";

const cur: SettingsState = { memoryEnabled: true, memoryLearningEnabled: true, proactiveEnabled: true, proactiveMode: "moderate", maxProactivePerDay: 2 };

describe("ajustes de privacidad (§9, §37)", () => {
  test("apagar la memoria apaga TAMBIÉN el aprendizaje (CHECK de la BD)", () => {
    const n = applySettingsPatch(cur, { memoryEnabled: false });
    assert.equal(n.memoryEnabled, false);
    assert.equal(n.memoryLearningEnabled, false);
  });
  test("con la memoria apagada, encender el aprendizaje NO tiene efecto", () => {
    const off = applySettingsPatch(cur, { memoryEnabled: false });
    assert.equal(applySettingsPatch(off, { memoryLearningEnabled: true }).memoryLearningEnabled, false);
  });
  test("encender memoria y aprendizaje en el mismo parche funciona", () => {
    const off = applySettingsPatch(cur, { memoryEnabled: false });
    const on = applySettingsPatch(off, { memoryEnabled: true, memoryLearningEnabled: true });
    assert.equal(on.memoryLearningEnabled, true);
  });
  test("reencender la memoria NO reactiva el aprendizaje que se apagó solo", () => {
    const off = applySettingsPatch(cur, { memoryEnabled: false });
    assert.equal(applySettingsPatch(off, { memoryEnabled: true }).memoryLearningEnabled, false);
  });
  test("modo 'disabled' detiene la iniciativa inmediatamente", () => {
    assert.equal(applySettingsPatch(cur, { proactiveMode: "disabled" }).proactiveEnabled, false);
  });
  test("no se puede saltar 'disabled' mandando proactiveEnabled=true", () => {
    const n = applySettingsPatch(cur, { proactiveMode: "disabled", proactiveEnabled: true });
    assert.equal(n.proactiveEnabled, false);
    const m = applySettingsPatch(n, { proactiveEnabled: true });
    assert.equal(m.proactiveEnabled, false, "con el modo aún en disabled, sigue apagado");
  });
  test("salir de 'disabled' NO reactiva solo: exige proactiveEnabled explícito", () => {
    const off = applySettingsPatch(cur, { proactiveMode: "disabled" });
    assert.equal(applySettingsPatch(off, { proactiveMode: "low" }).proactiveEnabled, false);
    assert.equal(applySettingsPatch(off, { proactiveMode: "low", proactiveEnabled: true }).proactiveEnabled, true);
  });
  test("maxProactivePerDay se acota a 0..10", () => {
    assert.equal(applySettingsPatch(cur, { maxProactivePerDay: 99 }).maxProactivePerDay, 10);
    assert.equal(applySettingsPatch(cur, { maxProactivePerDay: -5 }).maxProactivePerDay, 0);
  });
  test("no muta el estado de entrada", () => {
    const frozen = Object.freeze({ ...cur });
    applySettingsPatch(frozen, { memoryEnabled: false });
    assert.equal(frozen.memoryEnabled, true);
  });
});
