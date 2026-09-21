# Seguridad: aislamiento por usuario y RLS

## Situación real
AXIS usa **NextAuth + Prisma**, no Supabase Auth. `User.id` es un cuid de texto y **no existe `auth.uid()`**
en las consultas de Prisma. Prisma se conecta con un rol que **se salta RLS** (dueño de las tablas o `BYPASSRLS`).

Consecuencia: las políticas RLS **no protegen** las consultas de Prisma. Hoy hay DOS capas distintas:

| Capa | Qué protege | Estado |
|---|---|---|
| **`userId` en cada `where` del código** (`lib/memory/store.ts`, rutas `/api/memory/*`) | Consultas de Prisma. **Control PRIMARIO.** | Implementado |
| **RLS activado sin políticas** (migración `…000200`) | Acceso directo por la Data API de Supabase (PostgREST) con `anon`/`authenticated` | Implementado: deniega todo |

## Reglas que el código cumple (y que hay que mantener)
1. `userId` sale **siempre** de `auth()` (sesión del servidor), **nunca** del cuerpo de la petición.
2. Toda función de `store.ts` recibe `userId` como 1.er argumento y lo incluye en el `where` de **cada**
   consulta, también `update`/`delete` (nunca `where: { id }` a secas → IDOR).
3. `updateMany`/`deleteMany` con `{ id, userId }` devuelven `count: 0` si no es del usuario → 404
   indistinguible de "no existe".
4. Los schemas de entrada son `.strict()`: no se puede enviar un `userId` ajeno.
5. Nada de `SUPABASE_SERVICE_ROLE_KEY` en el navegador.

## Decisión pendiente (no bloquea)
Para tener RLS **efectivo** también sobre Prisma habría que: (a) migrar a Supabase Auth, o (b) fijar por
petición `SET LOCAL app.user_id = '<id>'` dentro de una transacción y escribir políticas
`USING (user_id = current_setting('app.user_id', true))`, conectando Prisma con un rol **sin** `BYPASSRLS`.
Es un cambio de arquitectura de auth; no se hizo para no romper lo que funciona (prompt maestro §31).

## Comprobación recomendada antes de producción
```sql
-- ¿Con qué rol se conecta Prisma y se salta RLS?
SELECT current_user, rolbypassrls FROM pg_roles WHERE rolname = current_user;
-- ¿Todas las tablas de usuario tienen RLS activado?
SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;
```
