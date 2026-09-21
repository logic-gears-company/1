// Arnés de topic-store.test.ts: sustituye Prisma (con semántica real de where) y `zod`.
// `store.ts` importa `./schemas` solo para `upsertMemory`; `suppressKey` y forget-topic no
// lo ejecutan, así que un stub inerte basta. El logger REAL se usa.
const Module = require("node:module"); const path = require("node:path");
const MAP = {
  "@ai-saas/database": path.join(__dirname, "topic-db.cjs"),
  "zod": path.join(__dirname, "topic-zod-stub.cjs"),
};
function install() {
  const prev = Module._resolveFilename; if (prev.__axisTopic) return;
  const w = function (req, ...rest) { if (MAP[req]) return MAP[req]; const o = prev.call(this, req, ...rest); install(); return o; };
  w.__axisTopic = true; Module._resolveFilename = w;
}
install();
