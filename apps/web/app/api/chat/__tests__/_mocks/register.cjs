// Arnés de prueba para /api/chat: intercepta require() y sustituye BD/SDK/red por dobles.
// tsx compila los imports de route.ts a require(), por eso se intercepta aquí.
//
// PRIORIDAD sobre el alias de tsx: si apps/web/tsconfig.json existe (caso real), tsx resuelve
// "@/..." por su cuenta y cargaría módulos REALES (memory/*, prisma…). Para que los dobles
// ganen siempre, este envoltorio se re-instala tras cada resolución de tsx.
//
// Uso (desde apps/web):
//   node --require ./app/api/chat/__tests__/_mocks/register.cjs --import <tsx>/dist/loader.mjs \
//        --test app/api/chat/__tests__/route.test.ts
const Module = require("node:module");
const path = require("node:path");
const here = __dirname;
const web = path.resolve(here, "../../../../..");
const MAP = {
  "@/lib/auth": "auth.cjs", "next/server": "next-server.cjs", "ai": "ai.cjs",
  "@ai-sdk/openai": "empty.cjs", "@ai-sdk/anthropic": "empty.cjs",
  "@ai-saas/database": "db.cjs", "@/lib/ai/provider-router": "router.cjs", "zod": "zod.cjs",
  "@/lib/memory/context": "ctx.cjs", "@/lib/memory/learn": "learn.cjs", "@/lib/memory/usage-store": "usage.cjs",
};
const POLICY = path.join(web, "lib/ai/chat-policy.ts");

function mockPathFor(request) {
  if (MAP[request]) return path.join(here, MAP[request]);
  if (request === "@/lib/ai/chat-policy") return POLICY;
  return null;
}

let installing = false;
function install() {
  if (installing) return;
  const prev = Module._resolveFilename;
  if (prev.__axisMock) return;
  const wrapped = function (request, ...rest) {
    const m = mockPathFor(request);
    if (m) return m;
    const out = prev.call(this, request, ...rest);
    // tsx puede reemplazar Module._resolveFilename mientras resuelve: recuperamos la prioridad.
    install();
    return out;
  };
  wrapped.__axisMock = true;
  Module._resolveFilename = wrapped;
}
install();
