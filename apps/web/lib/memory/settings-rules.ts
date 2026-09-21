/**
 * Reglas PURAS de los ajustes de privacidad (§9, §37). Espejo de los CHECK de
 * `user_settings`: la BD es la autoridad final, esto evita el error crudo.
 */
import type { ProactiveMode } from "./taxonomy";

export interface SettingsState {
  memoryEnabled: boolean;
  memoryLearningEnabled: boolean;
  proactiveEnabled: boolean;
  proactiveMode: ProactiveMode;
  maxProactivePerDay: number;
}

export interface SettingsPatch {
  memoryEnabled?: boolean;
  memoryLearningEnabled?: boolean;
  proactiveEnabled?: boolean;
  proactiveMode?: ProactiveMode;
  maxProactivePerDay?: number;
}

export function applySettingsPatch(cur: SettingsState, patch: SettingsPatch): SettingsState {
  const memoryEnabled = patch.memoryEnabled ?? cur.memoryEnabled;
  // CHECK: memory_enabled OR NOT memory_learning_enabled. Sin memoria no se aprende.
  const memoryLearningEnabled = memoryEnabled ? (patch.memoryLearningEnabled ?? cur.memoryLearningEnabled) : false;

  const proactiveMode = patch.proactiveMode ?? cur.proactiveMode;
  let proactiveEnabled = patch.proactiveEnabled ?? cur.proactiveEnabled;
  // "No quiero que AXIS me escriba primero" corta la iniciativa YA, y no se
  // puede reactivar con enabled=true mientras el modo siga en "disabled".
  if (proactiveMode === "disabled") proactiveEnabled = false;
  // Pasar de "disabled" a otro modo NO reactiva solo: exige enabled explícito.

  const maxProactivePerDay = Math.min(10, Math.max(0, patch.maxProactivePerDay ?? cur.maxProactivePerDay));
  return { memoryEnabled, memoryLearningEnabled, proactiveEnabled, proactiveMode, maxProactivePerDay };
}
