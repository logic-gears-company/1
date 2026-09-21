// Doble de Prisma para forget-topic / suppressKey.
// IMPORTANTE: implementa la SEMÁNTICA REAL de `where` (equals, contains insensible,
// in, OR, AND, gt/lte, null). Un doble que ignorase filtros haría pasar tests de
// aislamiento sin probar nada. Se valida a sí mismo en topic-db.selftest.
/** @type {any} */
const S = { rows: new Map(), calls: [], failNext: false, uniqueViolations: 0 };

function seed(list) { S.rows.clear(); S.calls.length = 0; S.failNext = false; S.uniqueViolations = 0; for (const r of list) S.rows.set(r.id, { status: "active", expiresAt: null, updatedAt: new Date("2026-01-01T00:00:00Z"), ...r }); }
function reset() { seed([]); }

function matchField(v, cond) {
  if (cond === null || typeof cond !== "object" || cond instanceof Date) return v === cond || (cond instanceof Date && v instanceof Date && +v === +cond);
  if ("contains" in cond) {
    if (typeof v !== "string") return false;
    return cond.mode === "insensitive" ? v.toLowerCase().includes(String(cond.contains).toLowerCase()) : v.includes(cond.contains);
  }
  if ("in" in cond) return cond.in.includes(v);
  if ("gt" in cond) return v != null && v > cond.gt;
  if ("lte" in cond) return v != null && v <= cond.lte;
  if ("equals" in cond) return v === cond.equals;
  throw new Error("operador no soportado por el doble: " + JSON.stringify(cond));
}
function matches(row, where) {
  if (!where) return true;
  for (const [k, cond] of Object.entries(where)) {
    if (k === "AND") { if (!cond.every((w) => matches(row, w))) return false; }
    else if (k === "OR") { if (!cond.some((w) => matches(row, w))) return false; }
    else if (!matchField(row[k], cond)) return false;
  }
  return true;
}
const all = (where) => [...S.rows.values()].filter((r) => matches(r, where));
const boom = () => { if (S.failNext) { S.failNext = false; throw new Error("db caída"); } };

// PrismaPromise real es PEREZOSA: la consulta no se ejecuta hasta el `await`/`.then`
// (o hasta que $transaction la ejecuta EN ORDEN). Sin esto, `$transaction([a, b])`
// correría a y b a la vez y el doble daría resultados distintos a los de Prisma.
function lazy(fn) {
  let p; const run = () => (p ||= fn());
  return { then: (a, b) => run().then(a, b), catch: (b) => run().catch(b), finally: (f) => run().finally(f), __run: run };
}

let seq = 0;
const userMemory = {
  async count({ where }) { boom(); S.calls.push({ op: "count", where }); return all(where).length; },
  async findMany({ where, select, orderBy, take }) {
    boom(); S.calls.push({ op: "findMany", where, take });
    let rows = all(where);
    if (orderBy?.updatedAt === "desc") rows = rows.sort((a, b) => +b.updatedAt - +a.updatedAt);
    if (take) rows = rows.slice(0, take);
    return rows.map((r) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, r[k]])) : { ...r }));
  },
  deleteMany({ where }) {
    return lazy(async () => {
      boom(); S.calls.push({ op: "deleteMany", where });
      const hit = all(where); for (const r of hit) S.rows.delete(r.id); return { count: hit.length };
    });
  },
  create({ data }) {
    return lazy(async () => {
    boom(); S.calls.push({ op: "create", data });
    // Réplica de los índices únicos parciales de la migración.
    const clash = [...S.rows.values()].find((r) => r.userId === data.userId && r.category === data.category && r.key === data.key && r.status === data.status);
    if (clash) { S.uniqueViolations++; throw new Error("Unique constraint failed (user_id, category, key) WHERE status=" + data.status); }
    const row = { id: "n" + ++seq, updatedAt: new Date(), expiresAt: null, ...data }; S.rows.set(row.id, row); return row;
    });
  },
};
// $transaction([...]): ejecuta EN ORDEN y, si una falla, restaura el estado previo (todo o nada).
const prisma = {
  userMemory,
  async $transaction(ops) {
    const snapshot = new Map([...S.rows].map(([k, v]) => [k, { ...v }]));
    const out = [];
    try { for (const op of ops) out.push(await (op.__run ? op.__run() : op)); return out; }
    catch (e) { S.rows.clear(); for (const [k, v] of snapshot) S.rows.set(k, v); throw e; }
  },
};
module.exports = { prisma, Prisma: {}, S, seed, reset, matches };
