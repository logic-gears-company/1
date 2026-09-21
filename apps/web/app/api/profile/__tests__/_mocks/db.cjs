// Doble de Prisma: SOLO lo que usa profile-store. Interpreta `where` con la
// misma semántica que Prisma para los operadores usados (id, OR de igualdades).
const { S } = require("./state.cjs");
const matches = (row, where) => {
  for (const [k, v] of Object.entries(where)) {
    if (k === "OR") { if (!v.some((w) => matches(row, w))) return false; continue; }
    if (row[k] !== v) return false;
  }
  return true;
};
const pick = (row, select) => { if (!select) return { ...row }; const o = {}; for (const k of Object.keys(select)) o[k] = row[k]; return o; };
exports.prisma = { user: {
  findUnique: async ({ where, select }) => { const r = S.users.get(where.id); return r ? pick(r, select) : null; },
  update: async ({ where, data }) => { const r = S.users.get(where.id); if (!r) throw new Error("P2025"); S.updates.push({ op: "update", where, data }); Object.assign(r, data); return { ...r }; },
  updateMany: async ({ where, data }) => {
    if (S.beforeUpdateMany) S.beforeUpdateMany(); // ← aquí "otro" puede colarse
    let count = 0;
    for (const r of S.users.values()) if (matches(r, where)) { Object.assign(r, data); count++; }
    S.updates.push({ op: "updateMany", where, data, count });
    return { count };
  },
} };
