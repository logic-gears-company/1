# AXIS — Estado del trabajo y traspaso

> Si abres esto sin contexto: aquí está qué hay hecho, qué NO está verificado
> y qué falta. Léelo antes de tocar nada.

## 0-quater. ACTUALIZACIÓN (5ª sesión: persona + olvido) — leer primero

> Encima de la entrega de la sesión 4. `bash scripts/test.sh` (desde `apps/web`): **336 tests, todos en verde**
> (253 puros + 24 chat + 18 profile + 8 last_used + 24 forget-topic + 9 learn). Al empezar eran 268 (+68, sin regresiones).

### Hecho y VERIFICADO ejecutando (sin red ni BD)
- ✅ **Prompt de personalidad de AXIS** (README §11.1) — `lib/ai/persona.ts` (puro, 8 bloques con id). `SERVER_BASE_SYSTEM_PROMPT`
  pasó de un marcador de 2 líneas a la persona completa (~750 tokens); el contrato de `chat-policy.ts` NO cambió.
  21 tests de PROPIEDADES (no "a ojo"): sin diagnóstico, sin recitar memoria, lo inferido = suposición, no promete internet,
  Complexity sin presión, no nombra proveedores, tope de tamaño. **Mutation: 10/10 detectadas.**
- ✅ **`forget-topic` con vista previa** (§6.9): `previewTopic` (solo lectura, tope 50, `total` real) y `forgetTopic(userId, topic, ids?)`
  que borra EXACTAMENTE los `ids` confirmados intersectados con lo que aún coincide; `ids: []` borra 0 (no "todo").
  Ruta `POST /api/memory/forget-topic` acepta `{topic, dryRun?, ids?}` (`.strict()`; `dryRun`+`ids` se rechazan).
  Vista previa y borrado comparten `topicWhere` (una sola definición de "coincide").
- ✅ **`suppressKey(userId, category, key)`** (§6.7) en `store.ts`: idempotente, atómica, no conserva el valor. **Mutation forget/suppress: 12/12.**
- ✅ **"No recuerdes esto" cableado al chat**: `decideSuppression` (pura, `evaluate.ts`) + `learn.ts` la ejecuta ANTES de evaluar.
  Reglas: solo con `memoryEnabled` (invariante 10); NO depende de `memoryLearningEnabled` (es una orden del usuario); contradictorio
  (olvida+recuerda) no se adivina; clave se revalida. Un fallo al suprimir no aborta los demás candidatos. **Mutation: 8/8.**
- ✅ `route.ts`: `learnFromMessage` envuelto en `Promise.resolve().then().catch()` (mismo patrón que `touchMemoriesUsed`).
  6 tests nuevos de `onFinish`; **se comprobó que el `void f()` a secas anterior SÍ fallaba** con ellos.
- ✅ `scripts/test.sh` incluye las fases nuevas (`topic-store`, `learn`), con sus arneses `_mocks/topic-*.cjs`, `_mocks/learn-*.cjs`.
  El doble de Prisma de forget-topic implementa la semántica REAL de `where` (contains insensible, in, OR, AND) y `$transaction`
  atómica/secuencial; un doble que ignorase filtros haría pasar tests de aislamiento sin probar nada.
- ✅ `tsc --strict` sin stubs: `persona.ts`, `chat-policy.ts`, `evaluate.ts`, `taxonomy.ts`.

### ⚠ LÍMITES HONESTOS (no los des por resueltos)
- 🔴 **"No recuerdes esto" NO es infalible.** El extractor solo corre en el turno 0 y cada 3.º (cadencia por coste) y NUNCA con
  `memoryLearningEnabled=false`. Una orden en un turno intermedio, o con el aprendizaje apagado, NO llega a suprimir nada.
  Sin palabras clave (§20) la solución completa son las tools `memory_remember`/`memory_forget` (Fase 6). Hay un test que documenta este límite.
- ⚠ El equivalente "el userId del body no se usa" es un mutante EQUIVALENTE: pasa porque el schema Zod NO declara `userId` (zod lo descarta).
  La defensa real es no declararlo jamás en ese schema.
- ⚠ `suppressKey`/`forgetTopic`/`previewTopic` se probaron contra un DOBLE de Prisma, **no contra Postgres**. En particular no se comprobó
  que `mode: "insensitive"` + el índice GIN trigram se comporten igual que el doble, ni el CHECK/índice único parcial real
  (el doble solo réplica el único parcial por `(user, category, key, status)`).
- ⚠ La persona NO se evaluó con un modelo real: los tests verifican que el TEXTO contiene las reglas, no que el modelo las obedezca.
  Falta un conjunto de prompts de evaluación contra el modelo real (README §11.1 lo pide).
- ⚠ Sin UI todavía: `dryRun`/`ids` de forget-topic están en la API pero ninguna pantalla los usa.
- ❌ **Sigue SIN verificar** (imposible sin red/Postgres): las 4 migraciones contra Postgres real (revisadas a mano, sin errores a la vista,
  pero NO ejecutadas), `prisma validate/generate`, `tsc` del repo completo con dependencias reales, Cohere real, el flujo `/api/chat`
  extremo a extremo, y cualquier `.tsx` renderizado en navegador.

### Sigue pendiente (en este orden)
1. **Fase 0 en tu máquina** (obligatoria): `npm ci && npm run db:generate && npx prisma validate && npm run type-check`, migraciones
   en BD de prueba (pgvector ≥ 0.7) DOS veces, y `bash scripts/test.sh`.
2. Rate limiting (§6.3). 3. UI de "Tu memoria" + ajustes (Fase 3; ya hay API completa con dryRun/suppress). 4. Historial de conversaciones (Fase 2).
5. Decisiones abiertas al usuario: (a) unificar UI a español; (b) ocultar el "modo agente" heredado.

## 0-ter. ACTUALIZACIÓN (4ª sesión: Fase 1, más ítems) — leer primero

> 📦 **Este `1-main.zip` es la entrega COMPLETA e integrada** (base + sesiones 2, 3 y 4). Ya NO hay que aplicar zips
> de cambios encima: se descomprime y se trabaja. Los archivos "cambiados por sesión" que se listan abajo son solo historia.

### Correcciones al README (comprobadas contra ESTE zip, no asumidas)
- ✅ **`package-lock.json` NO está desactualizado** para `@ai-sdk/groq`: está resuelto en **3.0.66** (con `integrity`), anidado en
  `apps/web/node_modules/@ai-sdk/groq` (npm lo colocó ahí por un conflicto de versión de `provider-utils`). El README (§3.3, §0-bis)
  lo daba por desactualizado; ya no aplica. Ninguna dependencia declarada en `apps/web` ni en la raíz falta en el lockfile.
  Un `npm ci` debería bastar (no probado: sin red).
- ✅ **Script `test` añadido** a `apps/web/package.json` (`"test": "bash scripts/test.sh"`), pendiente desde la sesión 3. `turbo test`
  (raíz) ya existía y ahora lo ejecuta. Ojo: la tarea `test` de `turbo.json` tiene `dependsOn: ["^build"]` (compila antes).
  `tsx ^4.19.1` está declarado en la raíz (lockfile: 4.21.0), que es donde `test.sh` lo busca (`../../node_modules`).
- ✅ **`.env.example`**: se documenta `EMBEDDINGS_PROVIDER` (opcional, defecto `cohere`; era la única variable nueva de las sesiones sin documentar).
  ⚠ Otras variables que el CÓDIGO DEL BASE lee y `.env.example` NO documenta (preexistentes, no tocadas): `API_URL`,
  `CODE_EXECUTOR_URL`, `INTERNAL_API_SECRET`, `TAVILY_API_KEY`. (`AUTH_SECRET` está cubierta: es alias de `NEXTAUTH_SECRET`.)
  `INTERNAL_API_SECRET` se lee en `lib/verification.ts`: si tu flujo de verificación de email la necesita, defínela.
- ✅ Coherencia estructural **`schema.prisma` ↔ SQL**: revisadas las 7 tablas nuevas, **0 discrepancias** de columnas (script ad-hoc, no incluido).
  Es coherencia de NOMBRES de columna; **no** valida tipos, defaults ni CHECK (eso exige `prisma validate` + una BD real).


**Contexto de arranque:** `1-main.zip` es el repo base LIMPIO (sin las sesiones 2 y 3). Se aplicaron en orden
(base → s2 → s3) y la batería heredada dio **166 puros + 12 de integración en verde** antes de tocar nada.
Esta entrega es SOLO los archivos cambiados **encima de base+s2+s3** (30 archivos).

### Hecho en esta sesión (Fase 1 del README §8)

**1. Zona horaria y perfil (§6.5)** — ✅ cerrado
- `lib/profile/profile-rules.ts` (puro): `normalizeTimezone` (canonicaliza con `Intl.resolvedOptions`: Intl acepta
  `america/bogota`; guardarlo así rompía la comparación y reescribía en cada visita), `normalizeLocale`,
  `normalizeName` (va al system prompt: quita saltos de línea/control), `decideTimezoneUpdate`, `applyProfilePatch`
  (lista blanca `name|timezone|locale`: mass-assignment imposible).
- `lib/profile/profile-store.ts` + `GET|PATCH /api/profile` + `POST /api/profile/timezone`.
- Cliente: `lib/profile/tz-sync.ts` + `<TimezoneSync />` (sin UI), enganchado en `(dashboard)/layout.tsx` (+2 líneas).
- **Decisión de diseño:** SIN columna `timezone_source` (evita migración). `'UTC'`/vacío = "sin elegir" (es el DEFAULT
  de la BD); cualquier otra zona ya tiene dueño y la autodetección NO la pisa. La guarda también va en el `where`
  del `UPDATE` (cubre la carrera SELECT→UPDATE). **Coste asumido:** al viajar la zona no se actualiza sola; se cambia a mano.

**2. `last_used_at` (§6.8)** — ✅ cerrado a nivel de código; ⚠ migración SIN ejecutar
- `lib/memory/usage-rules.ts` (puro): `selectIdsToTouch` con **debounce de 6 h** (un chat activo no reescribe las
  mismas ~10 filas en cada mensaje) y tope de 100 ids.
- `lib/memory/usage-store.ts`: UN `updateMany` con `userId` en el `where`; nunca lanza.
- `context.ts` devuelve el campo ADITIVO `memoryUsage` (`memoryIds` no cambia). `context-format.ts` NO se tocó.
- `/api/chat/route.ts`: **+1 import y +4 líneas** (envueltas en `Promise.resolve().then().catch()`; un `void f()` a secas
  deja un `unhandledRejection`, que en Node ≥15 mata el proceso). Streaming, `X-Conversation-ID`, `onFinish` y `learnFromMessage` intactos.
- 🔴 **MIGRACIÓN NUEVA OBLIGATORIA: `20260921000100_memory_last_used_touch`.** El trigger original `user_memories_touch`
  era incondicional: marcar `last_used_at` habría movido `updated_at`, y `context-format` puntúa la frescura sobre
  `updated_at` → bucle de retroalimentación (lo usado sube, se vuelve a usar…) + pérdida de "cuándo se editó".
  El trigger nuevo conserva `updated_at` si la ÚNICA columna que cambia es `last_used_at`. **Aplícala ANTES de desplegar esto.**

### Verificado ejecutando (sin red ni BD)
- ✅ **268 tests** (224 puros + 18 `/api/chat` + 18 `/api/profile` + 8 `usage-store`). `bash scripts/test.sh` desde `apps/web`.
  Al empezar la sesión eran 178 (166+12): **+90 nuevos, sin regresiones**.
- ✅ **Mutation testing**: perfil 8 mutaciones puras + 8 de E/S; `last_used_at` 7 + 5 + 4 sobre `route.ts`.
  Hallazgos reales que corrigió: (a) un test decía probar IDOR y no lo hacía (ahora sí, y se comprobó que falla si se rompe);
  (b) `tz-sync` propagaba la excepción de un `detect()` que lanza (rompía la UI); (c) `decideTimezoneUpdate` tipaba
  `detected: string` cuando recibe datos no confiables (`unknown`); (d) `void touch()` sin envoltura.
- ✅ `tsc --strict` **sin stubs** de: `profile-rules.ts`, `tz-sync.ts`, `usage-rules.ts` y sus tests.
  `tsc` con stubs mínimos de Prisma/Next/React: **0 errores en mis archivos** (store, rutas, `.tsx`, `usage-store`).

### ⚠ NO verificado / límites honestos (no los des por resueltos)
- 🔴 **La migración `20260921000100` NO se ejecutó** (no hay Postgres). Es PL/pgSQL revisado a mano, no probado.
  Compara la fila entera con `to_jsonb(NEW) - 'last_used_at' - 'updated_at'`; **riesgo de rendimiento no medido**
  (serializa la fila en cada UPDATE de `user_memories`; despreciable a esta escala, pero es una suposición).
  Pruébala en BD de prueba: (1) `UPDATE ... SET last_used_at = now()` NO debe cambiar `updated_at`; (2) `UPDATE ... SET value = 'x'` SÍ.
- ⚠ **El doble de `streamText` de la integración nunca invocaba `onFinish`**: hasta esta sesión los 12 tests de `/api/chat`
  pasaban sin ejercer `onFinish`. Ahora hay 6 que sí lo ejercen (invocando `S.streamArgs.onFinish`), pero **la ruta contra el SDK real
  y Prisma real sigue sin probarse** (los dobles prueban la lógica del handler, no las librerías).
- ⚠ `IANA_SHAPE` (`profile-rules.ts`) es defensa en profundidad **sin test que la cubra**: en Node 22 `Intl` ya rechaza
  todo lo que ella rechaza (35 entradas adversariales, ninguna las separa). Se mantiene por si `Intl` cambia (Termux/ARM64, otro VPS). Documentado en el código.
- ⚠ El test "un userId en el BODY no se usa" pasa porque el `schema` Zod de `route.ts` NO declara `userId`, no porque el
  handler lo compare. La defensa real es **no declararlo jamás** en ese schema.
- ⚠ `learnFromMessage` se sigue invocando con `void` a secas en `route.ts` (mismo riesgo latente de `unhandledRejection` que
  se corrigió para `touchMemoriesUsed`). Hoy es seguro porque `learn.ts` captura todo internamente. **No lo toqué** (línea ajena).
- ⚠ Los `.tsx` solo se validaron contra un stub de React. No se ha renderizado nada en un navegador.
- ⚠ `test.sh`: `usage-store.test.ts` necesita su propio arnés (`--require usage-register.cjs`) y está en su propia fase.
  Si añades tests con Prisma falso a `lib/memory/__tests__/`, acuérdate de excluirlos del grupo de puros.
- ⚠ Sigue SIN verificar todo lo de README §3.3 (migraciones 1-3 contra Postgres, `prisma validate/generate`, `tsc` del repo
  completo con dependencias reales, Cohere real, flujo `/api/chat` extremo a extremo).

### Aún pendiente de la Fase 1 (en este orden)
1. **Rate limiting** (§6.3) en `/api/chat` y `/api/memory/*`. Reutilizar el patrón atómico de `embeddings/budget-store.ts`
   (`INSERT … ON CONFLICT DO UPDATE … WHERE calls_used + n <= cap RETURNING`). Requiere migración nueva (tabla de contadores) y **poda**.
2. **Prompt de personalidad** (§11.1): `SERVER_BASE_SYSTEM_PROMPT` sigue siendo un marcador de 2 líneas. Necesita casos de evaluación.
3. `forget-topic` con `dryRun` y `suppressKey` (§6.7, §6.9) — son de la Fase 3 pero bloquean la UI de "Tu memoria".
4. Decisiones que el README pide confirmar al usuario y **NO se han tocado**: (a) unificar la UI a español; (b) ocultar el "modo agente" heredado.

## 0-bis. ACTUALIZACIÓN (3ª sesión: Fase 1 parcial) — leer primero

**Hecho y VERIFICADO ejecutando (sin red ni BD):**
- ✅ `lib/ai/chat-policy.ts` (puro): `resolveChatTarget` (lista blanca modelo/proveedor, `Object.hasOwn`),
  `resolveSystemPrompt()` (siempre el del servidor, **sin parámetros**), `historyWindow` (N más recientes, cronológico).
- ✅ `/api/chat` endurecido con cambio **mínimo** (+15 líneas; streaming, `X-Conversation-ID`, `onFinish`, `learnFromMessage` intactos):
  - §6.1 **cerrado**: se ignora el `systemPrompt` del body **y** el ya persistido en la conversación (filas antiguas potencialmente
    envenenadas); ya **no se persiste** el del cliente; proveedores de pago (`openai`/`anthropic`) pedidos por el cliente caen al defecto.
  - §6.2 **cerrado**: `orderBy desc` + `take 50` + inversión a cronológico (antes: los 50 más ANTIGUOS).
- ✅ **166 tests puros** (144 previos + 22 nuevos) y **12 de integración sobre el `route.ts` REAL** (con dobles de BD/SDK).
  Correr todo: `bash scripts/test.sh` (desde `apps/web`).
- ✅ **Mutation testing**: 8 mutaciones sobre `chat-policy.ts`, **8 detectadas**.
- ✅ **Control negativo** de la integración: contra el `route.ts` ORIGINAL fallan 8/12 (los de §6.1/§6.2); con el nuevo pasan 12/12.
  Probado con y sin `tsconfig`+alias `@/` (el caso real del repo).
- ✅ `tsc --strict` de `chat-policy.ts` y su test: limpio, **sin stubs**.

**Limitaciones que debes conocer (no las des por resueltas):**
- ⚠ La lista blanca contiene **solo** `groq` + `openai/gpt-oss-120b` (el único par que aparece hardcodeado en el propio `route.ts`).
  **No pude ver `provider-router.ts`** (el zip solo trae archivos cambiados), así que no inventé más modelos. Si la UI o tu flujo usan
  otro modelo/proveedor, **caerá al defecto en silencio**: amplía `CHAT_ALLOWLIST` en `lib/ai/chat-policy.ts`.
- ⚠ `resolveSystemPrompt()` devuelve un prompt base **mínimo** (marcador). **NO es el prompt de personalidad de §11.1**, que sigue pendiente
  y necesita casos de evaluación. Hasta entonces AXIS responde con un tono genérico.
- ⚠ La integración de `/api/chat` usa **dobles** de Prisma/`ai`/zod. Prueba la lógica del handler, **no** Prisma, el SDK real ni Postgres.
  `tsc` de `route.ts` solo con stubs (los únicos 5 errores `TS7031` ya existían en el original: artefacto del stub `any`).
- ⚠ El script `test` de `apps/web/package.json` **no se añadió** (no pude ver ese archivo y pisarlo podía borrar dependencias).
  Usa `scripts/test.sh`, o añade `"test": "bash scripts/test.sh"`.
- ⚠ Aún sin hacer de la Fase 1: captura de zona horaria (§6.5), `last_used_at` (§6.8), rate limiting (§6.3), prompt de personalidad (§11.1).
- ⚠ Sigue **sin verificar** lo de §3.3 del README (migraciones, `prisma validate/generate`, `tsc` del repo completo, Cohere real).
- ℹ Los tests se ejecutan con `node --import <ruta-absoluta-a>/tsx/dist/loader.mjs`; el `--import tsx` a secas falla si tsx no resuelve desde `apps/web`.

## 0. ACTUALIZACIÓN (2ª sesión) — leer primero

**Hecho en esta sesión:**
- ✅ **Bug real corregido** en `evaluate.ts` (hallado con fuzz de 200k candidatos contra los CHECK de la BD):
  `kind=inference`+`origin=explicit` producía una combinación que la BD rechaza. Ahora `resolveProvenance()`
  la resuelve; además valida longitud de `value`/`reason` y formato de `key`. **0 violaciones** tras el arreglo.
- ✅ `lib/memory/extract.ts` — extractor (modelo inyectado, parseo defensivo, anti-inyección, límite de candidatos).
- ✅ `lib/memory/context.ts` — carga de contexto desde BD: paralela, con timeout de 1,2 s, **nunca lanza**, respeta `memory_enabled`.
- ✅ `lib/memory/learn.ts` — aprendizaje en segundo plano (sin `await`).
- ✅ **Integración mínima en `/api/chat`** (+~20 líneas; el flujo de streaming, `conversationId` y `use-chat.ts` intactos).
- ✅ API: `GET /api/memory`, `PATCH|DELETE /api/memory/[id]` (`?suppress=1` = "no recuerdes esto"),
  `POST /api/memory/forget-all`, `POST /api/memory/forget-topic`, `GET|PATCH /api/settings/memory`.
- ✅ `settings-rules.ts` (reglas puras, 9 tests) y `docs/SEGURIDAD-RLS.md`.
- ✅ `context-format.ts`: nuevo `includedMemoryIds` (ids realmente incluidos).
- **144/144 tests** (`node --import <tsx>/dist/loader.mjs --test lib/**/__tests__/*.test.ts`).
- Mi código pasa `tsc` con stubs mínimos de dependencias externas (sin errores de lógica).

**Sigue SIN verificar (entorno sin red/Postgres):** migraciones contra BD real, `prisma validate/generate`,
`tsc` del repo completo con dependencias reales, y el flujo `/api/chat` de extremo a extremo.
Revisión estática de las migraciones: `RETURN` en `DO` solo sale de su bloque; no hay índice previo que bloquee el `ALTER TYPE`.

**Falta:** UI de "Tu memoria" (§10) y de ajustes; recuperación semántica (`memory_embeddings`);
tools estructuradas (§20); motor proactivo (§8/§25, el último). (`package-lock.json`: ver corrección en 0-ter, SÍ incluye `@ai-sdk/groq`.)

**Falsos positivos conocidos:** "Mi hermana tiene ansiedad" se bloquea como diagnóstico (conservador, a propósito).

## 1. Origen

Este paquete junta dos cosas:

1. **Trabajo de una sesión anterior** (`mini-ayudadita.zip`): 2 migraciones SQL y la
   capa de embeddings con Cohere. Estaban como archivos sueltos sin ruta.
2. **Trabajo de esta sesión**: ubicación de lo anterior en el repo, modelos Prisma,
   logger, y el núcleo de la memoria de AXIS (`lib/memory/`).

El repo base es `1-main__5_.zip`. **`/api/chat` y `hooks/use-chat.ts` NO se han tocado**
(prompt maestro §31).

## 2. Qué hay (y dónde)

| Ruta | Qué es | Origen |
|---|---|---|
| `packages/database/prisma/migrations/20260920000100_embeddings_foundation/` | `halfvec(1024)` + tabla `api_call_budget` | sesión anterior |
| `packages/database/prisma/migrations/20260920000200_memory_tasks_events/` | `user_memories`, `memory_embeddings`, `user_settings`, `tasks`, `events` | sesión anterior |
| `packages/database/prisma/schema.prisma` | **modificado**: `Chunk.embedding` → `halfvec(1024)` + 7 modelos nuevos | esta sesión |
| `apps/web/lib/embeddings/` | Cohere + presupuesto atómico mensual + circuit breaker | sesión anterior (movido) |
| `apps/web/lib/observability/logger.ts` | Logger JSON con redacción de secretos | esta sesión |
| `apps/web/lib/memory/taxonomy.ts` | Enums/tipos puros, **sin dependencias** | esta sesión |
| `apps/web/lib/memory/schemas.ts` | Schemas Zod (espejo de los CHECK de la BD) | esta sesión |
| `apps/web/lib/memory/store.ts` | CRUD de memorias con aislamiento por `userId` | esta sesión |
| `apps/web/lib/memory/evaluate.ts` | Política pura: qué candidato se guarda y cuál se descarta | esta sesión |
| `apps/web/lib/memory/context-format.ts` | Ensamblado del contexto con presupuesto de tokens | esta sesión |
| `apps/web/lib/**/__tests__/` | 84 tests | esta sesión |

## 3. Qué SÍ está verificado

Con `node --test` + `tsx` (sin instalar nada del repo):

- `logger.test.ts` — **8/8**
- `evaluate.test.ts` — **43/43**
- `context-format.test.ts` — **33/33**

Y comprobaciones estructurales (scripts ad-hoc, no incluidos): que cada columna de los
modelos Prisma nuevos existe 1:1 en el SQL, y que toda relación Prisma tiene su inversa.

## 4. Qué NO está verificado (importante)

El entorno donde se hizo no tenía Postgres, `node_modules` ni red. Por tanto:

- ❌ **Ninguna migración se ha ejecutado contra una base de datos real.**
- ❌ **`store.ts` y `schemas.ts` no se han compilado ni ejecutado** (importan Prisma y Zod).
  `taxonomy.ts` sí se ejercita indirectamente vía `evaluate.ts`.
- ❌ **El repo completo no ha pasado por `tsc`.**
- ❌ **`prisma validate` / `prisma generate` no se han corrido** sobre el schema modificado.
- ❌ Ni `lib/embeddings/*` ni el `context-format` con datos reales de BD.

## 5. Primeros pasos en tu máquina (en este orden)

```bash
npm install
npm run db:generate                       # genera el cliente Prisma
npx prisma validate --schema packages/database/prisma/schema.prisma
npm run type-check                        # tsc --noEmit  ← aquí saldrán los errores reales, si los hay
```

Luego las migraciones **sobre una base de datos de prueba primero, no sobre producción**:

```bash
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
```

Y las pruebas (desde `apps/web`):

```bash
node --import tsx --test lib/observability/__tests__/logger.test.ts \
                         lib/memory/__tests__/evaluate.test.ts \
                         lib/memory/__tests__/context-format.test.ts
```

### Aviso sobre la migración 1
`20260920000100_embeddings_foundation` **aborta a propósito** si `chunks` ya tiene
embeddings de 1536 dimensiones (cambiar a 1024 los destruiría). Si aborta, lee su mensaje:
te dice cómo vaciarlos y re-embeberlos. También exige **pgvector >= 0.7.0**.

## 6. Decisiones de diseño que conviene conocer

- **El aislamiento por usuario vive en el código, no en RLS.** El repo usa NextAuth + Prisma
  (`User.id` es un cuid de texto), no Supabase Auth. Prisma se conecta con un rol que se salta
  RLS, así que las políticas de la BD no protegen esas consultas. Por eso **toda función de
  `store.ts` lleva `userId` en cada `where`** (también en update/delete, para evitar IDOR).
- **`docs/SEGURIDAD-RLS.md` no existe**, pero la migración 2 lo referencia. Está pendiente.
- **`kind` no admite `'diagnosis'`**, ni en el CHECK de la BD ni en Zod (doble capa, §4).
- **Confianza fuera de [0,1] se descarta, no se recorta** (fail-closed): un `95` en vez de
  `0.95` del modelo se convertiría en certeza máxima si se recortara a 1.
- **El texto de memorias se inyecta al prompt como DATOS**, saneado y delimitado, para
  evitar inyección de prompt *persistente* (una memoria maliciosa se reinyectaría en cada chat).
- **`forgetAll` también borra las filas `suppressed`** ("no recuerdes esto"): "olvidar todo"
  vuelve a cero.
- **Free tier de Cohere:** tope propio de 900 llamadas/mes (de 1.000). Fail-closed: si no se
  puede leer el contador, no se llama.

## 7. Lo que falta (orden sugerido, §30 del prompt maestro)

1. **Extractor de candidatos** con llamada estructurada al modelo, en segundo plano
   (nunca bloquea el primer token, §38).
2. **Recuperación semántica** (`memory_embeddings`) y su integración con `context-format`.
3. **Integración mínima en `/api/chat`**: cargar contexto antes de `streamText`, extraer
   memorias en `onFinish`/después. Sin reemplazar el flujo actual.
4. **Tools estructuradas** (§20): schema Zod + permisos + timeout, sin keywords.
5. **API de "Tu memoria"** (§10): listar, editar, borrar, suprimir, "olvidar todo".
6. **`user_settings`**: endpoints y UI para `memory_enabled`, `memory_learning_enabled`,
   `proactive_enabled`.
7. **`docs/SEGURIDAD-RLS.md`**.
8. Motor proactivo (§8, §25) — el último; el más delicado para no hacer spam.

## 8. Fuera de alcance (a propósito)

Complexity, multi-agente, y proveedores de IA extra. El prompt maestro lo excluye en esta fase.
