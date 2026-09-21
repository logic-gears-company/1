// Doble de ./store para learn.ts: registra llamadas. learn/evaluate/extract son REALES.
/** @type {any} */
const S = { upserts: [], suppressions: [], failSuppress: false, msgCount: 1 };
const reset = () => { S.upserts.length = 0; S.suppressions.length = 0; S.failSuppress = false; S.msgCount = 1; };
module.exports = {
  S, reset,
  async upsertMemory(userId, raw) { S.upserts.push({ userId, raw }); return { ok: true, memory: {}, created: true }; },
  async suppressKey(userId, category, key) {
    if (S.failSuppress) throw new Error("db caída");
    S.suppressions.push({ userId, category, key }); return true;
  },
};
