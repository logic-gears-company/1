// Stub INERTE de zod: permite que schemas.ts se CARGUE. Cualquier intento de validar
// (safeParse) lanza, para que un test nunca pase "validando" con un zod falso.
const chain = () => new Proxy(function () {}, {
  get: (_t, k) => (k === "safeParse" || k === "parse" ? () => { throw new Error("zod stub: no se puede validar en este arnés"); } : chain()),
  apply: () => chain(),
});
module.exports = { z: chain(), default: chain() };
