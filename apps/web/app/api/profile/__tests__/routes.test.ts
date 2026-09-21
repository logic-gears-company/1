import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { S, reset } from "./_mocks/state.cjs";
import { GET, PATCH } from "../route";
import { POST as POST_TZ } from "../timezone/route";

const req = (body: unknown) => ({ json: async () => (body === "__THROW__" ? Promise.reject(new Error("x")) : body) }) as any;
const res = async (p: Promise<any>) => (await p) as { body: any; status: number };
const user = (id: string) => S.users.get(id)!;

describe("/api/profile — autenticación y aislamiento", () => {
  beforeEach(() => reset());

  test("sin sesión: GET/PATCH/POST timezone => 401 y NO tocan la BD", async () => {
    S.session = null as any;
    assert.equal((await res(GET())).status, 401);
    assert.equal((await res(PATCH(req({ name: "X" })))).status, 401);
    assert.equal((await res(POST_TZ(req({ timezone: "America/Bogota" })))).status, 401);
    assert.equal(S.updates.length, 0);
  });

  test("GET devuelve SOLO name/timezone/locale (nunca id, email ni role)", async () => {
    const r = await res(GET());
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body.profile).sort(), ["locale", "name", "timezone"]);
  });

  test("el usuario u1 solo puede tocar SU fila: u2 queda intacto", async () => {
    const before = { ...user("u2") };
    await PATCH(req({ name: "Hackeado", timezone: "Europe/Madrid", locale: "en" }));
    assert.deepEqual(user("u2"), before);
    assert.equal(user("u1").name, "Hackeado");
  });

  test("un userId en el cuerpo se IGNORA (la identidad sale de la sesión)", async () => {
    await PATCH(req({ name: "Ana2", userId: "u2", id: "u2" }));
    assert.equal(user("u2").name, "Beto");
    assert.equal(user("u1").name, "Ana2");
  });

  test("sesión de un usuario que ya no existe => 404, no crea nada", async () => {
    S.session = { user: { id: "fantasma" } };
    assert.equal((await res(PATCH(req({ name: "X" })))).status, 404);
    assert.equal(S.users.has("fantasma"), false);
  });
});

describe("PATCH /api/profile — validación y mass-assignment", () => {
  beforeEach(() => reset());

  test("edición válida: 200 y persiste", async () => {
    const r = await res(PATCH(req({ name: "Ana María", timezone: "America/Bogota", locale: "es-co" })));
    assert.equal(r.status, 200);
    assert.deepEqual(user("u1"), { ...user("u1"), name: "Ana María", timezone: "America/Bogota", locale: "es-CO" });
  });

  test("mass-assignment: role/email/passwordHash en el cuerpo NO llegan a la BD", async () => {
    await PATCH(req({ name: "Ok", role: "ADMIN", email: "evil@x.com", passwordHash: "x", tokensUsed: 0 }));
    const u = user("u1");
    assert.equal(u.role, "USER");
    assert.equal(u.email, "ana@x.com");
    assert.equal(Object.hasOwn(u, "passwordHash"), false);
    for (const up of S.updates) assert.deepEqual(Object.keys(up.data).sort(), ["name"]);
  });

  test("zona inválida => 400 con el campo culpable, y NO se escribe nada", async () => {
    const r = await res(PATCH(req({ name: "Nuevo", timezone: "Marte/Olympus" })));
    assert.equal(r.status, 400);
    assert.equal(r.body.field, "timezone");
    assert.equal(user("u1").name, "Ana", "atómico: un campo malo no deja pasar los buenos");
    assert.equal(S.updates.length, 0);
  });

  test("cuerpos que no son objeto => 400", async () => {
    for (const b of [null, "texto", 42, [], "__THROW__"]) {
      reset();
      assert.equal((await res(PATCH(req(b)))).status, 400, JSON.stringify(b));
    }
  });

  test("parche vacío => 400", async () => {
    assert.equal((await res(PATCH(req({})))).status, 400);
  });

  test("solo se escriben las columnas que cambiaron (no toca el resto)", async () => {
    await PATCH(req({ locale: "en" }));
    assert.deepEqual(Object.keys(S.updates[0].data), ["locale"]);
  });
});

describe("POST /api/profile/timezone — autodetección", () => {
  beforeEach(() => reset());

  test("usuario en 'UTC' por defecto + navegador detecta zona => se guarda", async () => {
    const r = await res(POST_TZ(req({ timezone: "America/Bogota" })));
    assert.equal(r.status, 200);
    assert.equal(r.body.updated, true);
    assert.equal(user("u1").timezone, "America/Bogota");
  });

  test("zona ya real (u2 en Tokyo) => NO se pisa", async () => {
    S.session = { user: { id: "u2" } };
    const r = await res(POST_TZ(req({ timezone: "Europe/Madrid" })));
    assert.equal(r.body.updated, false);
    assert.equal(user("u2").timezone, "Asia/Tokyo");
    assert.equal(S.updates.length, 0, "ni siquiera intenta escribir");
  });

  test("es idempotente: la segunda llamada no escribe", async () => {
    await POST_TZ(req({ timezone: "America/Bogota" }));
    const n = S.updates.length;
    const r2 = await res(POST_TZ(req({ timezone: "America/Bogota" })));
    assert.equal(r2.body.updated, false);
    assert.equal(S.updates.length, n);
  });

  test("CARRERA: entre el SELECT y el UPDATE el usuario elige zona a mano => la autodetección pierde", async () => {
    // u1 está en 'UTC' al leer; justo antes del UPDATE el usuario guarda Lima en Ajustes.
    S.beforeUpdateMany = () => { user("u1").timezone = "America/Lima"; };
    const r = await res(POST_TZ(req({ timezone: "Europe/Madrid" })));
    assert.equal(r.body.updated, false, "el where del UPDATE evita machacar la elección");
    assert.equal(user("u1").timezone, "America/Lima");
  });

  test("basura en el cuerpo => 200 con updated:false y NO escribe (nunca 500)", async () => {
    for (const b of [null, {}, { timezone: 5 }, { timezone: "Marte/Olympus" }, { timezone: "../../etc" }, "__THROW__"]) {
      reset();
      const r = await res(POST_TZ(req(b)));
      assert.equal(r.status, 200, JSON.stringify(b));
      assert.equal(r.body.updated, false, JSON.stringify(b));
      assert.equal(user("u1").timezone, "UTC");
    }
  });

  test("IDOR: un userId en el cuerpo se IGNORA; no se puede escribir la zona de otro usuario", async () => {
    // u1 (en 'UTC') intenta fijar la zona de u2 mandando su id. u2 ya tiene zona real,
    // pero probamos también contra un u3 recién creado en 'UTC' (el caso peligroso:
    // la guarda "sin elegir" SÍ permitiría escribirlo si la identidad viniera del cuerpo).
    S.users.set("u3", { id: "u3", name: "Carla", timezone: "UTC", locale: "es", role: "USER", email: "c@x.com" });
    await POST_TZ(req({ timezone: "America/Bogota", userId: "u3", id: "u3" }));
    assert.equal(user("u3").timezone, "UTC", "u3 NO debe cambiar");
    assert.equal(user("u1").timezone, "America/Bogota", "se aplicó al usuario de la SESIÓN");
  });

  test("solo escribe la columna timezone", async () => {
    await POST_TZ(req({ timezone: "America/Bogota" }));
    assert.deepEqual(Object.keys(S.updates[0].data), ["timezone"]);
  });
});
