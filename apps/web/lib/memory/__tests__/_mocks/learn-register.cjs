const Module = require("node:module"); const path = require("node:path");
const web = path.resolve(__dirname, "../../../..");
function mock(req, parent) {
  if (req === "@ai-saas/database") return path.join(__dirname, "learn-db.cjs");
  // Solo el ./store que importa learn.ts (mismo directorio lib/memory).
  if ((req === "./store") && parent && parent.filename && parent.filename.endsWith(path.join("lib", "memory", "learn.ts"))) return path.join(__dirname, "learn-store.cjs");
  return null;
}
function install() {
  const prev = Module._resolveFilename; if (prev.__axisLearn) return;
  const w = function (req, parent, ...rest) { const m = mock(req, parent); if (m) return m; const o = prev.call(this, req, parent, ...rest); install(); return o; };
  w.__axisLearn = true; Module._resolveFilename = w;
}
install();
