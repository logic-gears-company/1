// Arnés: solo sustituye Prisma. El logger REAL se usa (así se prueba que no filtra secretos).
const Module = require("node:module"); const path = require("node:path");
const MAP = { "@ai-saas/database": path.join(__dirname, "usage-db.cjs") };
function install() {
  const prev = Module._resolveFilename; if (prev.__axisUsage) return;
  const w = function (req, ...rest) { if (MAP[req]) return MAP[req]; const o = prev.call(this, req, ...rest); install(); return o; };
  w.__axisUsage = true; Module._resolveFilename = w;
}
install();
