// Doble de Prisma para usage-store: simula la tabla user_memories en memoria,
// con la misma semántica de `where` (userId + id IN) que usa el código real.
/** @type {any} */
const S = { rows: new Map(), calls: [], failNext: false };
const reset = () => {
  S.rows = new Map([
    ["m1", { id: "m1", userId: "u1", lastUsedAt: null, updatedAt: new Date("2026-01-01T00:00:00Z") }],
    ["m2", { id: "m2", userId: "u1", lastUsedAt: null, updatedAt: new Date("2026-01-01T00:00:00Z") }],
    ["x9", { id: "x9", userId: "u2", lastUsedAt: null, updatedAt: new Date("2026-01-01T00:00:00Z") }],
  ]);
  S.calls = []; S.failNext = false;
};
reset();
exports.S = S; exports.reset = reset;
exports.prisma = { userMemory: { updateMany: async (a) => {
  S.calls.push(a);
  if (S.failNext) throw new Error("db caída (postgres://user:pass@host)");
  let count = 0;
  for (const r of S.rows.values()) {
    if (r.userId === a.where.userId && a.where.id.in.includes(r.id)) { Object.assign(r, a.data); count++; }
  }
  return { count };
} } };
