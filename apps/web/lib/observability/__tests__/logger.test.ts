import { test } from "node:test";
import assert from "node:assert/strict";
import { redact, redactString, createLogger } from "../logger";

test("redacta por NOMBRE de campo", () => {
  const out = redact({ apiKey: "abc", password: "hunter2", Authorization: "x", SUPABASE_SERVICE_ROLE_KEY: "y", ok: 1 }) as Record<string, unknown>;
  assert.equal(out.apiKey, "[REDACTED]");
  assert.equal(out.password, "[REDACTED]");
  assert.equal(out.Authorization, "[REDACTED]");
  assert.equal(out.SUPABASE_SERVICE_ROLE_KEY, "[REDACTED]");
  assert.equal(out.ok, 1);
});

test("redacta por VALOR aunque el campo se llame inocentemente", () => {
  const out = redact({
    foo: "sk-abcdefghijklmnopqrstuvwx",
    bar: "gsk_abcdefghijklmnopqrstuvwx",
    baz: "Bearer abcdefghijklmnop",
    url: "postgresql://admin:supersecret@db.host:5432/x",
    jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk",
  }) as Record<string, string>;
  for (const [k, v] of Object.entries(out)) {
    assert.ok(!v.includes("supersecret") && !v.includes("abcdefghijklmnop") && !v.includes("eyJzdWIi"), `${k} filtró: ${v}`);
    assert.ok(v.includes("[REDACTED]"), `${k} no fue redactado: ${v}`);
  }
});

test("el CONTENIDO del usuario nunca se registra, solo su longitud", () => {
  const out = redact({ content: "mi secreto personal", message: "hola", value: "x".repeat(50), text: "t" }) as Record<string, string>;
  assert.equal(out.content, "[19 chars]");
  assert.equal(out.message, "[4 chars]");
  assert.equal(out.value, "[50 chars]");
  assert.ok(!JSON.stringify(out).includes("secreto"));
});

test("no muta la entrada y tolera ciclos", () => {
  const a: Record<string, unknown> = { password: "p", n: 1 };
  a.self = a;
  const out = redact(a) as Record<string, unknown>;
  assert.equal(a.password, "p", "mutó la entrada original");
  assert.equal(out.self, "[Circular]");
});

test("Error: solo nombre y mensaje (sin stack) y con el mensaje redactado", () => {
  const out = redact(new Error("falló con sk-abcdefghijklmnopqrstuvwx")) as { message: string; stack?: string };
  assert.ok(!out.message.includes("sk-abcdefghij"));
  assert.equal(out.stack, undefined);
});

test("limita strings y arrays enormes", () => {
  assert.ok(redactString("a".repeat(5000)).length < 600);
  const arr = redact({ xs: Array.from({ length: 100 }, (_, i) => i) }) as { xs: unknown[] };
  assert.equal(arr.xs.length, 21); // 20 + marcador
});

test("el logger jamás lanza aunque el objeto no sea serializable", () => {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (l: string) => lines.push(l);
  try {
    const log = createLogger("test");
    const evil = { toJSON() { throw new Error("boom"); } };
    assert.doesNotThrow(() => log.info("evento", { evil }));
    assert.doesNotThrow(() => log.info("evento", { big: 10n }));
  } finally { console.log = orig; }
  assert.ok(lines.length >= 1);
});

test("child() añade campos fijos y también los redacta", () => {
  const lines: string[] = [];
  const orig = console.log; console.log = (l: string) => lines.push(l);
  try {
    createLogger("s", { requestId: "r1" }).child({ token: "zzz" }).info("e", { a: 1 });
  } finally { console.log = orig; }
  const j = JSON.parse(lines[0]);
  assert.equal(j.requestId, "r1"); assert.equal(j.token, "[REDACTED]"); assert.equal(j.a, 1);
});
