// Estado compartido de los dobles del perfil. Simula la tabla `users` en memoria.
/** @type {any} */
const S = { session: null, users: new Map(), updates: [], beforeUpdateMany: null };
const reset = () => {
  S.session = { user: { id: "u1" } };
  S.users = new Map([
    ["u1", { id: "u1", name: "Ana", timezone: "UTC", locale: "es", role: "USER", email: "ana@x.com" }],
    ["u2", { id: "u2", name: "Beto", timezone: "Asia/Tokyo", locale: "ja", role: "USER", email: "beto@x.com" }],
  ]);
  S.updates = [];
  S.beforeUpdateMany = null; // gancho para simular una carrera entre el SELECT y el UPDATE
};
module.exports = { S, reset };
