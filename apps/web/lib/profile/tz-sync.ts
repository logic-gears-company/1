/**
 * Lógica del cliente para sincronizar la zona horaria (§7). Sin React: se prueba
 * con dobles de `storage`/`fetch`. Pensado para llamarse UNA vez por sesión de pestaña.
 */

export const TZ_SYNC_KEY = "axis:tz-synced";

/** Zona horaria del navegador (IANA) o null si no se puede leer. Nunca lanza. */
export function detectBrowserTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === "string" && tz.length > 0 ? tz : null;
  } catch {
    return null;
  }
}

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean }>;

/**
 * Envía la zona detectada al servidor, como mucho una vez por pestaña con ese
 * valor. Devuelve qué pasó (útil para tests). NUNCA lanza: es un extra, jamás
 * debe romper la UI. El candado se marca SOLO si el servidor respondió OK, así un
 * fallo de red se reintenta en la siguiente carga.
 *
 * `sessionStorage` puede no existir o lanzar (modo privado, cookies bloqueadas):
 * en ese caso se intenta igualmente (una petición barata e idempotente).
 */
export async function syncTimezoneOnce(deps: {
  detect?: () => string | null;
  storage?: StorageLike | null;
  fetchFn?: FetchLike;
}): Promise<"sent" | "skipped-already" | "skipped-no-tz" | "failed"> {
  const detect = deps.detect ?? detectBrowserTimezone;
  let tz: string | null = null;
  try { tz = detect(); } catch { tz = null; } // un detector que lanza = "sin zona"
  if (!tz) return "skipped-no-tz";

  let storage: StorageLike | null = null;
  try { storage = deps.storage ?? null; } catch { storage = null; }

  try {
    // El candado incluye la zona: si el usuario viaja y cambia el huso en la misma pestaña, se reenvía.
    if (storage?.getItem(TZ_SYNC_KEY) === tz) return "skipped-already";
  } catch { /* storage roto: seguimos sin candado */ }

  try {
    const doFetch = deps.fetchFn ?? (fetch as unknown as FetchLike);
    const res = await doFetch("/api/profile/timezone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: tz }),
    });
    if (!res.ok) return "failed";
    try { storage?.setItem(TZ_SYNC_KEY, tz); } catch { /* sin candado: se reintentará, no pasa nada */ }
    return "sent";
  } catch {
    return "failed";
  }
}
