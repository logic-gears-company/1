/**
 * Perfil del usuario: E/S. Las reglas viven en profile-rules.ts (puras). [§7, §15]
 *
 * `userId` SIEMPRE llega de la sesión del servidor (auth()), nunca del cuerpo.
 * Se reutiliza la tabla `users` (no existe `profiles`, ver README §2).
 */
import { prisma } from "@ai-saas/database";
import {
  applyProfilePatch,
  decideTimezoneUpdate,
  type ProfilePatchInput,
  type ProfileState,
  type TimezoneDecision,
} from "./profile-rules";

const SELECT = { name: true, timezone: true, locale: true } as const;

export async function getProfile(userId: string): Promise<ProfileState | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: SELECT });
  return u ? { name: u.name, timezone: u.timezone, locale: u.locale } : null;
}

export type PatchProfileOutcome =
  | { ok: true; profile: ProfileState }
  | { ok: false; status: 400 | 404; field: string; message: string };

/** Edición explícita del usuario (Ajustes). Pisa lo que hubiera: es decisión suya. */
export async function patchProfile(userId: string, patch: ProfilePatchInput): Promise<PatchProfileOutcome> {
  const cur = await getProfile(userId);
  if (!cur) return { ok: false, status: 404, field: "body", message: "Not found" };

  const r = applyProfilePatch(cur, patch);
  if (!r.ok) return { ok: false, status: 400, field: r.field, message: r.message };

  // Solo se escribe lo que cambió (lista blanca fija: name/timezone/locale).
  const data: Partial<ProfileState> = {};
  for (const k of r.changed) data[k] = r.next[k];
  await prisma.user.update({ where: { id: userId }, data });
  return { ok: true, profile: r.next };
}

/**
 * Autodetección desde el navegador. NUNCA pisa una zona real ya guardada.
 *
 * La condición de guarda vive TAMBIÉN en el `where` del UPDATE: entre el SELECT
 * y el UPDATE otra petición (o el propio usuario en Ajustes) pudo guardar una
 * zona, y no debemos machacarla. `updateMany` con `count` nos dice si ganamos.
 */
export async function autoDetectTimezone(
  userId: string,
  detected: unknown
): Promise<TimezoneDecision & { written: boolean }> {
  const cur = await getProfile(userId);
  if (!cur) return { update: false, reason: "usuario no encontrado", written: false };

  const d = decideTimezoneUpdate({ stored: cur.timezone, detected });
  if (!d.update) return { ...d, written: false };

  const res = await prisma.user.updateMany({
    where: {
      id: userId,
      // Solo si sigue "sin elegir": el DEFAULT de la BD ('UTC') o vacío.
      OR: [{ timezone: null }, { timezone: "UTC" }, { timezone: "" }],
    },
    data: { timezone: d.timezone },
  });
  return { ...d, written: res.count > 0 };
}
