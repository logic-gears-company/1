// Arnés: sustituye auth/next/prisma por dobles. Mismo mecanismo que /api/chat.
const Module = require("node:module");
const path = require("node:path");
const here = __dirname;
const MAP = { "@/lib/auth": "auth.cjs", "next/server": "next-server.cjs", "@ai-saas/database": "db.cjs" };
let installing = false;
function install() {
  const prev = Module._resolveFilename;
  if (prev.__axisMock) return;
  const wrapped = function (request, ...rest) {
    if (MAP[request]) return path.join(here, MAP[request]);
    const out = prev.call(this, request, ...rest);
    install(); // tsx puede reemplazar _resolveFilename: recuperamos la prioridad
    return out;
  };
  wrapped.__axisMock = true;
  Module._resolveFilename = wrapped;
}
install();
