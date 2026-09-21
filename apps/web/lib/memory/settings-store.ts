/** Ajustes de privacidad (§37): E/S. Las reglas viven en settings-rules.ts (puras). */
import { prisma } from "@ai-saas/database";
import type { UserSettingsPatch } from "./schemas";
import { applySettingsPatch, type SettingsState } from "./settings-rules";
import type { ProactiveMode } from "./taxonomy";

const DEFAULTS: SettingsState = {
  memoryEnabled: true,
  memoryLearningEnabled: true,
  proactiveEnabled: false, // AXIS NO escribe primero salvo que se active (§9)
  proactiveMode: "only_when_relevant",
  maxProactivePerDay: 2,
};

export async function getSettings(userId: string): Promise<SettingsState> {
  const r = await prisma.userSettings.findUnique({ where: { userId } });
  if (!r) return DEFAULTS;
  return {
    memoryEnabled: r.memoryEnabled,
    memoryLearningEnabled: r.memoryLearningEnabled,
    proactiveEnabled: r.proactiveEnabled,
    proactiveMode: r.proactiveMode as ProactiveMode,
    maxProactivePerDay: r.maxProactivePerDay,
  };
}

export async function patchSettings(userId: string, patch: UserSettingsPatch): Promise<SettingsState> {
  const next = applySettingsPatch(await getSettings(userId), patch);
  await prisma.userSettings.upsert({ where: { userId }, create: { userId, ...next }, update: next });
  return next;
}
