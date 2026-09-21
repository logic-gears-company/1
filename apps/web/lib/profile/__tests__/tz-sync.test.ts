import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { syncTimezoneOnce, detectBrowserTimezone, TZ_SYNC_KEY } from "../tz-sync";

const memStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), _m: m };
};
const okFetch = () => { const calls: any[] = []; return { calls, fn: async (u: string, i: any) => { calls.push({ u, i }); return { ok: true }; } }; };

describe("syncTimezoneOnce (§7)", () => {
  test("primera vez: envía la zona detectada por POST y marca el candado", async () => {
    const st = memStorage(); const f = okFetch();
    const r = await syncTimezoneOnce({ detect: () => "America/Bogota", storage: st, fetchFn: f.fn });
    assert.equal(r, "sent");
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].u, "/api/profile/timezone");
    assert.equal(f.calls[0].i.method, "POST");
    assert.deepEqual(JSON.parse(f.calls[0].i.body), { timezone: "America/Bogota" });
    assert.equal(st._m.get(TZ_SYNC_KEY), "America/Bogota");
  });

  test("segunda vez con la misma zona: NO hace petición", async () => {
    const st = memStorage(); const f = okFetch();
    await syncTimezoneOnce({ detect: () => "America/Bogota", storage: st, fetchFn: f.fn });
    const r = await syncTimezoneOnce({ detect: () => "America/Bogota", storage: st, fetchFn: f.fn });
    assert.equal(r, "skipped-already");
    assert.equal(f.calls.length, 1);
  });

  test("si el huso cambia en la misma pestaña (viaje) => vuelve a enviar", async () => {
    const st = memStorage(); const f = okFetch();
    await syncTimezoneOnce({ detect: () => "America/Bogota", storage: st, fetchFn: f.fn });
    const r = await syncTimezoneOnce({ detect: () => "Europe/Madrid", storage: st, fetchFn: f.fn });
    assert.equal(r, "sent");
    assert.equal(f.calls.length, 2);
  });

  test("navegador sin zona => no envía nada", async () => {
    const f = okFetch();
    assert.equal(await syncTimezoneOnce({ detect: () => null, storage: memStorage(), fetchFn: f.fn }), "skipped-no-tz");
    assert.equal(f.calls.length, 0);
  });

  test("respuesta NO ok => 'failed' y NO marca el candado (se reintenta en la próxima carga)", async () => {
    const st = memStorage();
    const r = await syncTimezoneOnce({ detect: () => "America/Bogota", storage: st, fetchFn: async () => ({ ok: false }) });
    assert.equal(r, "failed");
    assert.equal(st._m.has(TZ_SYNC_KEY), false);
  });

  test("fetch que lanza (offline) => 'failed', NUNCA propaga la excepción", async () => {
    const r = await syncTimezoneOnce({ detect: () => "America/Bogota", storage: memStorage(), fetchFn: async () => { throw new Error("offline"); } });
    assert.equal(r, "failed");
  });

  test("sessionStorage que lanza al leer (modo privado) => igualmente envía, sin romper", async () => {
    const f = okFetch();
    const broken = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("SecurityError"); } };
    assert.equal(await syncTimezoneOnce({ detect: () => "America/Bogota", storage: broken, fetchFn: f.fn }), "sent");
    assert.equal(f.calls.length, 1);
  });

  test("sin storage (null) => envía", async () => {
    const f = okFetch();
    assert.equal(await syncTimezoneOnce({ detect: () => "America/Bogota", storage: null, fetchFn: f.fn }), "sent");
  });

  test("detectBrowserTimezone nunca lanza y devuelve string|null", () => {
    const tz = detectBrowserTimezone();
    assert.ok(tz === null || typeof tz === "string");
  });

  test("un detect INYECTADO que lanza => se trata como 'sin zona', no propaga", async () => {
    const f = okFetch();
    const r = await syncTimezoneOnce({ detect: () => { throw new Error("Intl roto"); }, storage: memStorage(), fetchFn: f.fn });
    assert.equal(r, "skipped-no-tz");
    assert.equal(f.calls.length, 0);
  });
});
