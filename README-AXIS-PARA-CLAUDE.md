# ⚠️ ESTADO VIGENTE — leer ANTES que el resto (añadido en la sesión 4)

Este archivo lo redactó un Claude en la sesión 1 y **algunos puntos ya están resueltos o eran falsos**. Están marcados con ✅/~~tachado~~ más abajo.
La fuente de verdad del estado actual es **`AXIS-HANDOFF.md` (sección 0-ter)**. Resumen de una línea por cosa:

| Ítem | Estado real en ESTE zip |
|---|---|
| §6.1 `systemPrompt`/modelo del cliente | ✅ sesión 3 |
| §6.2 `take: 50` (mensajes antiguos) | ✅ sesión 3 |
| §6.5 zona horaria + `/api/profile` | ✅ sesión 4 |
| §6.8 `last_used_at` en lote | ✅ sesión 4 (**exige** migración `20260921000100`, sin ejecutar) |
| Script `test` en `apps/web` | ✅ sesión 4 |
| `package-lock.json` desactualizado | ❌ **era falso**; `@ai-sdk/groq` está en el lockfile |
| §6.3 rate limiting | ⏳ **SIGUE PENDIENTE** (siguiente tarea; requiere migración nueva + poda) |
| §11.1 prompt de personalidad de AXIS | ⏳ **SIGUE PENDIENTE** (`SERVER_BASE_SYSTEM_PROMPT` es un marcador de 2 líneas; necesita casos de evaluación) |
| §6.7/§6.9 `suppressKey`, `forget-topic` con `dryRun` | ⏳ pendiente (bloquean la UI de "Tu memoria") |
| Migraciones contra Postgres real, `prisma validate/generate`, `tsc` completo | 🔴 **NUNCA ejecutados** (ninguna sesión tuvo red/BD/`node_modules`) |

Tests: **268** (`cd apps/web && bash scripts/test.sh`). El "144/144" del §8 es de la sesión 1 y está obsoleto.

---

# AXIS — README para la siguiente sesión de Claude

> **Léelo entero antes de tocar nada.** Está escrito para que puedas continuar sin haber visto las
> sesiones anteriores. Todo lo marcado ✅ se ejecutó de verdad; todo lo marcado ❌ **no** se ha podido
> verificar (el entorno de las sesiones anteriores no tenía red, ni Postgres, ni `node_modules` del repo).
> No des nada por probado si aquí figura como no verificado.

---

## 0. TL;DR

- **Producto:** AXIS, una IA conversacional "humana" (`Be Human.`), personal y productiva. **No** es Complexity
  (sistema aparte, posterior: no implementarlo ni sus agentes/multi-modelo/catálogo de herramientas).
- **Repo:** monorepo Turborepo (`npm` workspaces). Frontend en `apps/web` (Next.js **15.5.18**, React 19).
  Auth = **NextAuth v5 (beta) + Prisma 5.22**, **no** Supabase Auth. BD = PostgreSQL de Supabase (Free Plan).
- **Hecho:** capa de memoria estructurada (BD + lógica pura + API), extractor de memorias, contexto inyectado en
  `/api/chat`, ajustes de privacidad, embeddings con Cohere (presupuesto atómico), logger con redacción de secretos.
  **144 tests pasan.**
- **No hecho (lo grande):** **toda la UI nueva** ("Tu memoria", ajustes, historial de conversaciones, saludo,
  modos), el **prompt de personalidad** de AXIS, **tools estructuradas**, **recuperación semántica**,
  **motor proactivo**, capa de proveedores con fallback, archivos/Storage, rate limiting.
- **Regla de oro (prompt maestro §31):** `/api/chat` y `apps/web/hooks/use-chat.ts` funcionan. **No los
  reescribas**: modifica solo lo mínimo, tras leerlos.
- **Cómo trabajar:** el usuario habla español y pidió **rapidez y economía de tokens** (una sesión previa gastó
  muchísimo en pocas cosas). Lee solo lo necesario, agrupa comandos, no imprimas archivos enormes.

---

## 1. Qué es AXIS (filosofía y tono)

Lema: *«Be Human.»* / *«IA hecha por humanos para humanos.»* / *«AXIS habla contigo.»*

Debe sentirse como **un buen amigo (un "pana") que sabe muchísimo y además puede ayudarte a hacer cosas**:
tranquilo, curioso, natural, sincero, ocasionalmente bromista, capaz de ponerse serio, de escuchar y de discrepar.

**Lo que AXIS NO debe ser:**
- Un chatbot genérico ni una app terapéutica. **No convertir todo en psicología.**
- Excesivamente cariñoso. Prohibido el "Estoy aquí para ti ❤️" constante.
- Un sistema que **diagnostica** (nunca "el usuario tiene ansiedad"; sí "expresó estrés por su examen").

**Su diferencial:** intenta **entender a la persona antes de responder** y se adapta *aprendiendo por
interacción* (no con formularios): si el usuario pide "más corto" repetidamente, AXIS infiere
`response_directness = concise` con confianza alta. Toda inferencia debe ser **visible, editable y eliminable**.

Capacidades objetivo (generalista competente): texto, corrección, resumen, traducción, estudio, investigación,
análisis de documentos/imágenes/datos, generación de imágenes, voz (si hay proveedor), programación,
cálculos, búsqueda web, tareas, comparación de opciones, creación de contenido.

**Modos (§22):** Normal · Rápido · Pensamiento · Búsqueda avanzada · Internet · Crear imagen · Estudia y aprende · Ayuda.
Un único mapa `modo → {capacidad, proveedor/modelo, parámetros}`; no dupliques lógica.

**Complexity (§19):** solo dejar una interfaz futura. Si AXIS detecta una tarea claramente multi-paso puede
*sugerir* Complexity de forma funcional y sin presionar ("Esto ya es un trabajo grande. Complexity puede
encargarse del proceso completo si quieres."). Nunca "compra Complexity".

---

## 2. Realidad técnica del repo (⚠ difiere del prompt maestro)

| Tema | Prompt maestro asume | Realidad del repo |
|---|---|---|
| Auth | Supabase Auth + RLS con `auth.uid()` | **NextAuth v5 beta + PrismaAdapter**, sesión JWT, `User.id` = **cuid de texto** |
| Tabla de perfil | `profiles` | Se **reutiliza `users`** (`name`, `image`, `timezone`, `locale`). No hay `profiles` |
| Acceso a BD | PostgREST/RLS | **Prisma** con un rol que **se salta RLS** |
| Aislamiento por usuario | RLS | **`userId` en cada `where` del código** (control primario). Ver `docs/SEGURIDAD-RLS.md` |
| Conversaciones | `conversations`, `messages`, `message_parts`, `attachments`, `conversation_metadata` | Existen `conversations` y `messages` (con `attachments Json?`, `metadata Json?`). **No** se crearon `message_parts`/`attachments`/`conversation_metadata` |
| Proveedores IA | groq/openrouter/cerebras/huggingface/cloudflare | `lib/ai/provider-router.ts`: groq, openrouter (con rotación de claves), openai, anthropic. **Sin fallback/health/circuit breaker** |

Otros datos del stack (de `package.json`/lockfile):
- `ai` **6.0.177**, `@ai-sdk/react` 3.x, `@ai-sdk/groq`, `@ai-sdk/openai`, `@ai-sdk/anthropic`. **Zod 3.25.**
- Tailwind **3.4**, shadcn/ui + Radix, `framer-motion`, `sonner` y `sileo` (toasts), `lucide-react`, `geist`,
  `react-markdown` + `remark-gfm` + `react-syntax-highlighter`, `zustand`, `swr`.
- Dependencias visuales pesadas ya presentes en la raíz (`three`, `@react-three/fiber`, `thinking-orbs`,
  `liquid-gooey`) y componentes `ui/silk.tsx`, `ui/aurora-background.tsx`. **No añadas más peso visual.**
- Chat por defecto: proveedor `groq`, modelo `openai/gpt-oss-120b`.
- Hay restos del **boilerplate "AI SaaS"** (Stripe, teams, API keys, admin, `apps/api` FastAPI, `axis-chat-ui/`
  duplicado, `agents/`). **No los toques** salvo necesidad clara. Existe un "modo agente" en la UI del chat
  (`agent-mode-panel.tsx`, `/api/agents/run`, `simulateAgent`): es herencia del boilerplate; **no lo extiendas**
  (choca con "no construir Complexity") y **pregunta al usuario** si debe ocultarse.
- El entorno del usuario puede ser **Termux/Android ARM64** (ver comentarios en `.env.example` y
  `schema.prisma` sobre `binaryTargets`) y despliegue en **VPS de ~4 GB**. Ahorra RAM/CPU.

**Restricciones de infraestructura (diseñar con ellas, no a pesar de ellas):**
- Supabase **Free**: 500 MB de BD, 1 GB de Storage (50 MB/archivo), 5 GB de egress.
- Cohere embeddings (trial): **1.000 llamadas/MES** en total. Tope propio: **900** (`EMBEDDINGS_MONTHLY_CALL_CAP`).
  Regla del usuario: **nunca facturar automáticamente, sin fallback de pago.**
- Sin logs infinitos en Postgres, sin prompts internos gigantes guardados, sin imágenes en Postgres.

---

## 3. Estado actual

### 3.1 Cómo se aplicaron las sesiones anteriores
Hay dos entregas encima de `1-main.zip` (el repo base):
1. `axis-solo-cambios.zip` (sesión 1): migraciones, embeddings, logger, núcleo de memoria.
2. `axis-cambios-sesion2.zip` (sesión 2): correcciones, extractor, contexto, integración en chat, API, docs.

**Primer paso:** comprueba que ambas están aplicadas (existen `apps/web/lib/memory/extract.ts`,
`apps/web/lib/memory/context.ts`, `apps/web/app/api/memory/route.ts`, `docs/SEGURIDAD-RLS.md`). Si no,
pídele al usuario el zip o reconstruye desde este README.

### 3.2 ✅ Hecho y verificado con ejecución real
- **144 tests** con `node:test` + `tsx` (sin instalar el repo). Puros, sin red ni BD:
  `logger` (8), `evaluate` (50), `context-format` (38), `extract` (39), `settings-rules` (9).
- **Fuzz de 200.000 candidatos** aleatorios contra una réplica literal de los CHECK de la BD: **0 violaciones**
  (tras corregir un bug real: `kind=inference` + `origin=explicit` producía una fila que la BD rechaza).
- **Mutation testing manual** del extractor: se rompieron a propósito 4 defensas (anti-inyección del delimitador,
  límite de candidatos, aceptar `confidence` como string, propagar errores del modelo) y **cada mutación fue detectada**.
- `tsc` sobre **mi código** (con stubs mínimos de dependencias externas): sin errores de lógica.

### 3.3 ❌ NO verificado (hazlo tú primero — ver §8, Fase 0)
- Ninguna **migración** se ejecutó contra Postgres real.
- `prisma validate` / `prisma generate` **no se han corrido** sobre el schema modificado.
- `tsc` del **repo completo con dependencias reales**.
- El **flujo `/api/chat` de extremo a extremo** con contexto + aprendizaje.
- Las rutas `/api/memory/*` y `/api/settings/memory` **nunca se llamaron** (solo pasaron `tsc` con stubs).
- `lib/embeddings/*` con la API real de Cohere.
- ❌ **FALSO en este zip (comprobado en la sesión 4):** `@ai-sdk/groq` SÍ está resuelto en el lockfile (3.0.66, con `integrity`, anidado en `apps/web/node_modules/`); no hay nada que "arreglar", un `npm ci` debería bastar (sin red: no probado). Afirmación original, conservada: ~~`package-lock.json` **desactualizado** (`@ai-sdk/groq` está en `package.json` pero no en el lockfile → `npm install`).~~

---

## 4. Invariantes que NO se pueden romper

Cada una está protegida por tests y/o CHECKs; si tu cambio las viola, **para y replantea**.

1. **Nada de diagnósticos.** `MEMORY_KINDS = stated_state | observed_pattern | inference`. **No existe `diagnosis`**,
   ni en el CHECK de la BD ni en Zod (doble capa). `looksLikeDiagnosis()` es una red para el caso obvio.
2. **El modelo PROPONE, la política DECIDE.** El LLM nunca escribe en la BD directamente:
   `extractCandidates → evaluateCandidate (pura) → upsertMemory (Zod + CHECK)`.
3. **Categorías "solo explícitas":** `relationships`, `identity`, `important_dates` no se pueden **inferir**.
4. **Confianza fuera de [0,1] se descarta, no se recorta** (fail-closed: un `95` en vez de `0.95` no debe ser certeza).
5. **Una inferencia nunca figura como declarada** (`inference` ⇒ `source ∈ {inferred, system}` y `confidence < 1`).
   `resolveProvenance()` resuelve las etiquetas contradictorias del modelo.
6. **Lo temporal SIEMPRE caduca; lo permanente NUNCA** (CHECK `user_memories_expiry_chk`). TTL máximo de un estado temporal: 14 días.
7. **`userId` sale SIEMPRE de `auth()` (sesión del servidor), jamás del cuerpo de la petición.** Toda función de
   `store.ts` recibe `userId` como 1.er argumento y lo mete en el `where` de **cada** consulta (también update/delete → anti-IDOR).
   `updateMany/deleteMany` con `{id,userId}` → `count:0` = 404 indistinguible de "no existe". Schemas de entrada `.strict()`.
8. **El texto de memorias entra al prompt como DATOS**, saneado y delimitado (`<axis_context>`), para evitar
   inyección de prompt **persistente**. Nunca lo concatenes crudo al system prompt.
9. **"No recuerdes esto" gana a todo.** Fila `status='suppressed'` bloquea el reaprendizaje. `forgetAll` borra también las suprimidas.
10. **Ajustes de privacidad:** `memory_enabled=false` ⇒ no se lee ni escribe memoria (ni se consulta la tabla);
    apagar la memoria apaga el aprendizaje (CHECK de BD). `proactive_mode='disabled'` corta la iniciativa **de inmediato**
    y no se puede saltar con `proactiveEnabled=true`. Proactividad **desactivada por defecto**.
11. **El contenido del usuario NUNCA se loguea.** El logger sustituye `content|message|text|value|prompt|body|input|output|reason` por su longitud
    y redacta secretos por nombre y por valor. No añadas logs con texto de usuario.
12. **Cohere nunca se llama por accidente.** Todo pasa por `lib/embeddings/index.ts` (presupuesto atómico en
    Postgres, fail-closed, circuit breaker). Tests y dev **no** deben gastar cuota.
13. **Ni `SUPABASE_SERVICE_ROLE_KEY` ni ninguna API key al navegador.**
14. **Fallo de memoria ≠ fallo de chat.** `loadUserContext` y `learnFromMessage` **nunca lanzan**; el chat responde siempre.

---

## 5. Mapa de archivos y contratos

### 5.1 Base de datos (`packages/database/prisma/`)
- `migrations/20260913040018_init` — boilerplate original (`users`, `conversations`, `messages`, `files`, `chunks`, `notifications`, `usage_logs`…). Crea `vector`, `pg_trgm`, `pgcrypto`.
- `migrations/20260920000100_embeddings_foundation` — `chunks.embedding` → **`halfvec(1024)`** + HNSW coseno; tabla `api_call_budget`.
  **Aborta a propósito** si `chunks` ya tiene embeddings de 1536 dims. Exige **pgvector ≥ 0.7.0**.
- `migrations/20260920000200_memory_tasks_events` — `user_memories`, `memory_embeddings`, `user_settings`, `tasks`,
  `task_conversation_links`, `events`, función/triggers `axis_touch_updated_at`, RLS activado **sin políticas** (deniega a anon/authenticated).
- `schema.prisma` — modelos `UserMemory`, `MemoryEmbedding` (⚠ `Unsupported("halfvec(1024)")` requerido ⇒ **se escribe/consulta con SQL crudo**, no con `create` de Prisma), `UserSettings`, `Task`, `TaskConversationLink`, `Event`, `ApiCallBudget`.
  Los CHECK, índices parciales, GIN trigram y HNSW **no** son expresables en Prisma: la **fuente de verdad es el SQL**.

`user_memories` (una fila por memoria, **no** un JSONB gigante): `id, user_id, category, key, value, kind, durability, source,
confidence(real 0..1), importance(1..5), visibility, reason, source_conversation_id, metadata jsonb, status(active|suppressed),
expires_at, created_at, updated_at, last_used_at`. Índice único parcial `(user_id,category,key) WHERE status='active'`.

### 5.2 `apps/web/lib/memory/`
| Archivo | Rol | Puro/E-S |
|---|---|---|
| `taxonomy.ts` | Enums, tipos, `looksLikeDiagnosis`, `MemoryView`. **Sin dependencias.** Grupos `PERSISTENT_/TEMPORAL_/INTERACTION_CATEGORIES` (para pintar la UI) | puro |
| `schemas.ts` | Zod: `memoryInputSchema`, `memoryEditSchema` (`.strict()`), `userSettingsPatchSchema` (`.strict()`) | puro |
| `evaluate.ts` | `evaluateCandidate` (política), `shouldAttemptExtraction` (filtro de **coste**, no de significado), `resolveProvenance` | puro |
| `extract.ts` | Prompt del extractor, `parseCandidates`, `coerceCandidate`, `extractCandidates(message, callModel)` (**modelo inyectado**) | puro salvo `callModel` |
| `context-format.ts` | `buildContextBlock` con presupuesto de tokens, priorización por puntuación, sanitización anti-inyección, `includedMemoryIds` | puro |
| `context.ts` | `loadUserContext(userId)`: ajustes → (tz ∥ memorias ∥ tareas ∥ eventos) en paralelo, **timeout 1,2 s**, nunca lanza | E/S |
| `learn.ts` | `learnFromMessage(...)`: cadencia + extractor + política + `upsertMemory`; se llama **sin await** | E/S |
| `store.ts` | CRUD por usuario: `listMemories, getMemory, upsertMemory, editMemory, deleteMemory, suppressMemory, forgetAll, purgeExpired` | E/S |
| `forget-topic.ts` | "Olvida todo sobre X" (subcadena insensible sobre key+value, mínimo 2 caracteres) | E/S |
| `settings-rules.ts` | `applySettingsPatch` (invariantes de ajustes) | puro |
| `settings-store.ts` | `getSettings`, `patchSettings` (upsert) | E/S |

Otros: `lib/observability/logger.ts` (`createLogger(scope)`); `lib/embeddings/{index,types,budget,budget-store,circuit-breaker,release-policy,providers/cohere}.ts`
(API pública: `embedTexts`, `embedQuery`, `getEmbeddingStatus`; errores tipados `EmbeddingError` con `code`).

### 5.3 Integración en `/api/chat` (lo único que se modificó)
Flujo actual, con **+~20 líneas** sobre el original:
1. `auth()` → valida body con Zod → busca/crea conversación → guarda mensaje USER → arma `history`.
2. **NUEVO:** `const userCtx = await loadUserContext(session.user.id, { userName })`.
3. `streamText({ system: [systemPrompt ?? conv.systemPrompt, userCtx.text, UI_CAPABILITIES_PROMPT] … })`.
4. `onFinish`: guarda mensaje ASSISTANT + tokens; **NUEVO:** `void learnFromMessage({...})` (usa el mismo `llm` con `generateText`, `temperature:0`).
5. Respuesta `toUIMessageStreamResponse` con cabecera **`X-Conversation-ID`** (el cliente la usa; **no la quites**).

### 5.4 API (todas exigen sesión; `userId` de `auth()`)
| Método y ruta | Body / query | Respuesta |
|---|---|---|
| `GET /api/memory` | — | `{ memories: MemoryView[] }` (vivas, no caducadas, por importancia) |
| `PATCH /api/memory/[id]` | `{ value?, importance?, expiresAt? }` (`.strict()`, ≥1 campo) | `{ memory }` · 404. Pasa a `source=user_edit`, `kind=stated_state`, `confidence=1` |
| `DELETE /api/memory/[id]` | `?suppress=1` opcional | `{ ok:true }` · 404. Con `suppress=1` = "no recuerdes esto" |
| `POST /api/memory/forget-all` | — | `{ deleted:n }` |
| `POST /api/memory/forget-topic` | `{ topic }` (2–80 car.) | `{ deleted:n }` |
| `GET /api/settings/memory` | — | `{ settings: { memoryEnabled, memoryLearningEnabled, proactiveEnabled, proactiveMode, maxProactivePerDay } }` |
| `PATCH /api/settings/memory` | subconjunto de lo anterior (`.strict()`) | `{ settings }` |

`MemoryView` = `{ id, category, key, value, kind, durability, source, confidence, importance, reason, expiresAt, createdAt, updatedAt }` (nunca `userId`).

> Las columnas `quiet_hours_start/end` existen en `user_settings` pero **ni la API ni `settings-rules` las manejan todavía**.

### 5.5 Cómo ejecutar los tests
```bash
# desde apps/web (con `npm install` hecho, tsx está en la raíz):
node --import tsx --test lib/observability/__tests__/*.test.ts lib/memory/__tests__/*.test.ts
```
✅ **RESUELTO (sesión 4):** `apps/web/package.json` ya tiene `"test": "bash scripts/test.sh"` (`turbo test` de la raíz lo ejecuta). **Usa `bash scripts/test.sh`**: cubre además las fases de integración con arnés. Texto original, conservado: ~~Hoy **no hay script `test`** en `apps/web/package.json` (aunque `turbo.json` tiene la tarea `test`): añádelo (`"test": "node --import tsx --test lib/**/__tests__/*.test.ts"`). Convención de los tests: funciones puras,~~
`now` inyectado, sin red. Si tsx no se resuelve, usa la ruta absoluta a `tsx/dist/loader.mjs`.
`now` inyectado, sin red. Si tsx no se resuelve, usa la ruta absoluta a `tsx/dist/loader.mjs`.

---

## 6. Deuda y problemas conocidos (ordenados por gravedad)

### 🔴 Seguridad / corrección
1. **`/api/chat` acepta `systemPrompt`, `model` y `provider` desde el cliente.** Un usuario puede sobreescribir el
   system prompt (vector de abuso/inyección) y elegir cualquier modelo de OpenAI/Anthropic con **tus claves de servidor**
   (coste). `use-chat.ts` solo envía `{conversationId, message}`, así que la UI no lo usa, pero **la API sí lo permite**.
   → Ignorar `systemPrompt` del cliente; derivar modelo/proveedor del **modo** en el servidor con lista blanca.
2. **Bug de historial:** `include: { messages: { orderBy: { createdAt: "asc" }, take: 50 } }` toma los **50 mensajes MÁS
   ANTIGUOS**. En conversaciones largas el modelo pierde el contexto reciente. → `orderBy desc, take N` y revertir
   (y acotar por tokens). Es un cambio mínimo y justificado bajo §31.
3. **Sin rate limiting** en `/api/chat` ni en `/api/memory/*`. (`REDIS_URL` está en `.env.example` pero no se usa; el patrón atómico de `api_call_budget` es reutilizable.)
4. Botón **"Delete account"** de `settings/page.tsx` es un stub sin acción. No lo conectes sin un flujo de confirmación real.

### 🟠 Funcionalidad rota o incompleta de lo ya hecho
5. ✅ **RESUELTO (sesión 4)** ~~**La zona horaria es "UTC" para todos.**~~ Ver `lib/profile/*`, `/api/profile`, `<TimezoneSync/>`. Texto original: `users.timezone` tiene `DEFAULT 'UTC'` y nada la captura del navegador ⇒ el
   "momento del día" (§7) sale mal. → Capturar `Intl.DateTimeFormat().resolvedOptions().timeZone` en el cliente y guardarla
   (endpoint de perfil). Fallback IP aproximada solo si falta, **nunca** ubicación precisa.
6. **"Acuérdate de X" puede ignorarse:** `shouldAttemptExtraction` solo extrae en el turno 0 y cada 3.er turno, y **antes** de
   llamar al modelo. Una petición explícita en el turno 2 se pierde. Fuera de bandas de keywords (prohibidas por §20), la
   solución correcta son **tools `memory_remember` / `memory_forget`** que decide el modelo (no sujetas a cadencia).
7. **"No recuerdes esto" en chat no crea supresión:** el extractor marca `userAskedToForget` y `evaluateCandidate`
   descarta ese candidato, pero **no escribe una fila `suppressed`** ni borra la memoria existente. Falta
   `suppressKey(userId, category, key)` (hoy `suppressMemory` es por `id`).
8. ✅ **RESUELTO (sesión 4)** ~~**`last_used_at` nunca se actualiza**~~ Ver `lib/memory/usage-{rules,store}.ts` + migración `20260921000100`. Texto original: **`last_used_at` nunca se actualiza**, aunque `context.ts` ya devuelve `memoryIds` (ids realmente incluidos). Actualizar en
   segundo plano y en lote (`updateMany`), sin bloquear.
9. **`forget-topic` borra sin vista previa.** Añadir `dryRun` (devolver cuántas/cuáles) y confirmación en la UI.
10. **Cadencia aproximada** en `learn.ts` (módulo 3 sobre el nº de mensajes USER). Suficiente; si se afina, hacerlo con datos, no a ojo.
11. **`learn.ts` reutiliza el modelo del chat** para extraer (gasta cuota del usuario/clave). Valorar un modelo pequeño dedicado vía la futura capa de proveedores.
12. **Falso positivo conocido (a propósito):** "Mi hermana tiene ansiedad" se bloquea como diagnóstico.
13. `ChatMessage` en `use-chat.ts` se reduce a texto (`textFromParts`): **las partes de herramientas se ignoran**. Para mostrar
    tools en la UI habrá que ampliar el hook con cuidado (ver §11.2).
14. **Deriva de Prisma probable:** `db:migrate` = `prisma migrate dev`, que puede proponer **borrar** índices/CHECK que Prisma no representa.
    Verifícalo con `prisma migrate diff`. **Nunca aceptes un borrado de esos índices; en producción usa solo `prisma migrate deploy`.**
15. **No inspeccionado** por las sesiones anteriores (léelo antes de tocarlo): `components/chat/plus-menu.tsx` (528 líneas),
    `chat-input.tsx` (adjuntos/`Attachment`), `message.tsx`, `dashboard/header.tsx`, `globals.css`/tokens, `app/(dashboard)/files`,
    `docker-compose.yml`, `apps/api`. Que existan adjuntos en el input **no** significa que lleguen al servidor: hoy `/api/chat` solo recibe texto.

---

## 7. Lo que falta (inventario por sistema)

| Sistema (prompt §) | Estado |
|---|---|
| Auth, perfil, nombre inicial de AXIS (§15) | Auth ✅ (existente). **Editar nombre/zona/idioma: ❌** |
| Conversaciones: lista, cargar, renombrar, fijar, archivar, borrar, buscar, paginar (§11) | ❌ (no hay endpoints ni UI; `/chat` no recibe `conversationId`) |
| Streaming (§30.4) | ✅ existente, **no tocar** |
| Memoria estructurada + inferida + expirable (§3–4, 36–37) | ✅ núcleo · ❌ patrones diarios (§6) · ❌ tools remember/forget |
| Estado emocional/contextual como contexto, no diagnóstico (§5) | ✅ reglas de guardado · ❌ **instrucciones de comportamiento** (van en el prompt de personalidad) |
| **Prompt de personalidad adaptativa de AXIS (§2, §5)** | ❌ **No existe.** Hoy solo hay `UI_CAPABILITIES_PROMPT` (calculadora) |
| Context Builder (§17) | ✅ memorias/tareas/eventos/hora · ❌ conversación relevante · ❌ semántica |
| Recuperación semántica `memory_embeddings` (§13, §16) | ❌ (tabla e infra Cohere listas) |
| Recuperación de conversaciones pasadas ("¿te acuerdas del proyecto?") (§16) | ❌ |
| Capa de proveedores + router + fallback + health + límites (§21, §28) | ❌ (solo `provider-router.ts` básico) |
| Modos (§22) | ❌ |
| Tools estructuradas (§20) | ❌ |
| Tareas y eventos (§26) | ✅ tablas · ❌ endpoints, ❌ tools, ❌ UI |
| Archivos + abstracción de Storage (§12) | ❌ (existen `File`/`Chunk` del boilerplate y env `S3_*`) |
| Proactividad (§8–9, §25) | ❌ (ajustes en BD ✅; motor ❌; tabla de mensajes enviados ❌) |
| Sugerir Complexity (§19) | ❌ |
| Rate limiting / abuso (§14) | ❌ |
| Observabilidad (§27) | Logger ✅ · métricas por petición/proveedor/herramienta ❌ (`usage_logs` existe; no se comprobó su uso) |
| UI nueva (§23–24) | ❌ **todo** (ver §10) |
| Migraciones reproducibles (§33) | ✅ para lo hecho; **sin ejecutar** |

---

## 8. Roadmap recomendado (en orden; criterios de aceptación)

> Prioridad del prompt maestro (§30): Auth → Perfil → Conversaciones → Streaming → Memoria → Contexto → Proveedores →
> Tools → Archivos → Proactividad → Preferencias → Ajustes → Seguridad → Observabilidad. Lo de abajo respeta eso,
> adelantando la validación y el endurecimiento porque hoy hay riesgo real.

### Fase 0 — Validar lo heredado (obligatoria, ≤ 1 hora)
```bash
npm install
npm run db:generate
npx prisma validate --schema packages/database/prisma/schema.prisma
npm run type-check                 # aquí saldrán los errores reales, si los hay
# BD DE PRUEBA (no producción). Necesita pgvector >= 0.7 (p.ej. imagen pgvector/pgvector:pg16):
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
```
- Aceptación: type-check limpio; migraciones aplicadas de cero **y** una segunda vez (deben ser re-ejecutables); tests 144/144.
- Prueba las migraciones **también contra una BD con datos** (con `chunks.embedding` de 1536 → debe abortar con mensaje claro).
- Añade el script `test`. Comprueba `prisma migrate diff` (deriva, ver §6.14).
- Prueba a mano las rutas `/api/memory/*` con dos usuarios distintos: **el usuario B no debe poder ver/editar/borrar memorias de A** (esperado: 404).

### Fase 1 — Endurecer y completar `/api/chat` (cambios mínimos) — **estado tras la sesión 4: 1 ✅ · 2 ✅ · 3 ⏳ · 4 ✅ · 5 ✅ · 6 ⏳**
1. Ignorar `systemPrompt` del cliente; lista blanca de modelo/proveedor derivada del modo (§6.1).
2. Arreglar el `take: 50` (§6.2).
3. **Prompt de personalidad** de AXIS (ver §11.1) inyectado **en el servidor**.
4. Captura de zona horaria (§6.5) + endpoint de perfil (`PATCH /api/profile`: `name`, `timezone`, `locale`).
5. `last_used_at` en lote (§6.8).
6. Rate limiting básico (por usuario) en `/api/chat` y `/api/memory/*`.
- Aceptación: streaming y `X-Conversation-ID` intactos (prueba con el `use-chat.ts` actual sin modificarlo); test que demuestre que `systemPrompt` del body se ignora.

### Fase 2 — Conversaciones (API + UI de historial)
- API: `GET /api/conversations` (paginación por cursor `updatedAt`, filtro archivadas/fijadas, búsqueda por título),
  `GET /api/conversations/[id]/messages` (paginado), `PATCH` (título/pin/archivo), `DELETE`. Todo con `userId` en el `where`.
- Título automático (hoy es `message.slice(0,50)`): generarlo en segundo plano tras el primer intercambio.
- UI: ver §10.3. **Cuidado con `use-chat.ts`** (§11.2).
- Aceptación: recargar la página conserva y muestra el historial; cambiar de conversación no mezcla mensajes.

### Fase 3 — UI de "Tu memoria" y ajustes (§10 del prompt maestro; spec en §10.4–10.5)
- Reutiliza la API existente. Añade `dryRun` a `forget-topic` y `suppressKey` (§6.7, §6.9).
- Aceptación: el usuario puede **ver, editar, eliminar, "no volver a recordar"**, ver la **confianza %**, y **"Olvidar todo"** con confirmación.

### Fase 4 — Estado vacío, modos y pulido del chat (§10.1–10.2, §10.6)

### Fase 5 — Capa de proveedores (`lib/ai/`) con resiliencia (§11.3)

### Fase 6 — Tools estructuradas (§11.4), empezando por: `memory_remember`, `memory_forget`, `memory_search`, `get_time`, `calculator`, `tasks`.

### Fase 7 — Recuperación semántica y de conversaciones (§11.5)

### Fase 8 — Archivos y abstracción de Storage (§11.7)

### Fase 9 — Motor proactivo (§11.6). **El último y el más delicado.**

### Fase 10 — Observabilidad, límites, documentación final y README de operación.

---

## 9. Reglas de trabajo para ti

1. **Lee antes de escribir.** Para `/api/chat` y `use-chat.ts`: inspecciona, entiende, reutiliza, modifica lo mínimo (§31).
2. **Verifica ejecutando, no afirmando.** Si no puedes ejecutar algo, dilo. Distingue siempre "probado" de "razonado".
   El error más caro de las sesiones previas fue creer que "los tests pasan" implicaba "esto cumple la BD": no lo implicaba (el fuzz encontró un bug).
3. **TDD para lógica pura:** test que falla → arreglo → verde. Para defensas de seguridad, haz **mutation testing manual** (rómpela y confirma que un test lo detecta).
4. **Separa lógica pura (con `now` inyectado) de E/S.** Es lo que permitió probarlo todo sin BD. Sigue el patrón (`evaluate.ts` ↔ `learn.ts`).
5. **Migraciones:** siempre en `packages/database/prisma/migrations/<timestamp>_<nombre>/migration.sql`, idempotentes (`IF NOT EXISTS`), con RLS activado en tablas de usuario. Actualiza también `schema.prisma`. Nada de cambios manuales irreproducibles.
6. **Consultas:** todo `where` lleva `userId` de la sesión. Los índices se justifican con una consulta real (no indexes indiscriminados). Piensa en el límite de 500 MB.
7. **No inventes APIs del AI SDK.** Es la v6 (`ai@6`): comprueba nombres reales (`tool`, `inputSchema`, `stopWhen`/`stepCountIs`, `toUIMessageStreamResponse`…) en los tipos instalados en `node_modules/ai` antes de usarlos.
8. **Economía de tokens:** no vuelques archivos completos si solo necesitas 20 líneas (`sed -n`, `grep -n`); agrupa comandos; no re-leas lo que ya está en este README; respuestas finales cortas y honestas.
9. **Idioma:** conversa y comenta el código en **español** (así está hecho el repo).
10. **No añadas dependencias sin motivo** (VPS de 4 GB, Termux). Ya se prefirió `fetch` directo al SDK de Cohere por eso.
11. **Sin secretos en el código ni en logs.** Variables nuevas van a `.env.example` (sin valores).
12. Al terminar cada fase: actualiza `AXIS-HANDOFF.md` (qué hay, qué se verificó de verdad, qué no) y entrega **solo los archivos cambiados** en un zip.

---

## 10. Especificación de UI

### 10.0 Principios (§23 del prompt maestro)
- **Premium, minimalista, rápida, elegante, humana, moderna.** Inspiración (no copia): Apple, OpenAI, Nothing, Cursor.
  AXIS debe tener **identidad propia**.
- **Evitar:** exceso de tarjetas, exceso de gradientes, aspecto "startup genérica", UI sobrecargada, animaciones que dañen
  rendimiento, "AI slop" (sparkles por todas partes, degradados morado-azul, emojis decorativos, bordes brillantes, glassmorphism gratuito).
- **Lenguaje visual ya presente (mantenlo y afínalo):** monocromo (`bg-foreground text-background` en el logo), radios generosos
  (`rounded-xl`/`rounded-[1.15rem]`), microetiquetas en mayúsculas con `tracking` amplio (`text-[9px] uppercase tracking-[.22em]`),
  tokens `sidebar-*`, `muted`, `border`, fuente Geist, sidebar de 248 px. Usa los **tokens de Tailwind/`globals.css`** (claro y oscuro), no colores sueltos.
- **Rendimiento:** nada de librerías nuevas de animación; `framer-motion` solo para transiciones cortas; respeta
  `prefers-reduced-motion`; listas virtualizadas o paginadas; **skeletons** en vez de spinners; actualizaciones **optimistas** con rollback.
- **Accesibilidad:** foco visible, navegación por teclado, `aria-live` para el streaming y los toasts, contraste AA, tamaños táctiles ≥ 40 px.
- **Responsive real:** hoy el `Sidebar` es `hidden md:flex` y `SidebarContent` se exporta para reutilizarlo en un `Sheet` móvil (`ui/sheet.tsx`): comprueba que `dashboard/header.tsx` lo abre en móvil y prueba en ~380 px.
- **Idioma de la UI:** hoy hay mezcla (ES/EN: "Settings", "Sign out", "AXIS is ready"). El usuario habla español y AXIS "habla contigo":
  **unifica a español** (confírmalo con el usuario) centralizando los textos en un archivo (`lib/i18n/es.ts`) para poder usar `users.locale` más adelante.
- **Tono del microcopy:** natural y breve. Sin "¡Genial!", sin exceso de exclamaciones, sin condescendencia. Errores honestos y accionables.

### 10.1 Estado vacío del chat (§24)
- Saludo con el **nombre del usuario** y variación: "Hola, Marcos." · "Bienvenido." · "¿Qué tienes en mente?" · "¿Qué quieres construir hoy?" · "Soy todo oídos." · "¿Qué vamos a descubrir hoy?"
- **No repetir siempre el mismo.** Combina con la **franja del día** (madrugada/mañana/tarde/noche; `dayPartOf` ya existe en `context-format.ts`).
- Implementación: banco de saludos en un módulo con **selección determinista por semilla** (p.ej. día + userId) para evitar *hydration mismatch*; nada de `Math.random()` en el render del servidor.
- Debajo: el input (protagonista). **Como mucho 3–4 sugerencias** discretas (texto, no tarjetas gigantes), opcionales y contextuales (p.ej. "Retomar el proyecto de biología" si hay una memoria `current_projects`/`unresolved_threads`).
- Sin ilustraciones pesadas; un detalle sutil de marca basta.

### 10.2 Chat
- Mensajes: markdown + código con copiar; **acciones por mensaje**: copiar, regenerar, editar (usuario), parar (mientras hay streaming), 👍/👎 opcional.
- Indicador de estado sobrio (existe `axis-status.tsx`; conserva `isReasoning`). "Pensando…" solo si el modelo emite razonamiento.
- **Selector de modo** (§22) en el input/`plus-menu`: Normal · Rápido · Pensamiento · Búsqueda avanzada · Internet · Crear imagen · Estudia y aprende · Ayuda. Muestra el modo activo con un chip discreto; el modo viaja al servidor **como enum** (nunca modelo/proveedor libres).
- **Transparencia de memoria (sin caja negra):** tras terminar la respuesta, si se aprendió algo, un toast discreto y no intrusivo:
  "Recordaré que prefieres respuestas directas · **Ver** · **Deshacer**". Como el aprendizaje ocurre en segundo plano, el cliente debe consultar
  `GET /api/memory?since=<ts>` (parámetro por añadir) al terminar el stream. Si el usuario dice "no recuerdes esto", **no** mostrar nada guardado.
- Tareas/eventos detectados: chip "Añadir a mis pendientes" (confirmación explícita; no crear tareas en silencio).
- Mensajes proactivos: ver §10.7.

### 10.3 Historial de conversaciones (sidebar)
- Lista bajo el bloque de marca, agrupada: **Fijadas · Hoy · Ayer · Últimos 7 días · Anteriores**. Búsqueda (⌘/Ctrl-K opcional).
- Cada fila: título (una línea, `truncate`), menú "⋯" (renombrar, fijar, archivar, eliminar con confirmación). Estado activo claro.
- Botón "Nueva conversación" (equivale a `clear()` del hook: reinicia `serverConversationId`).
- **Paginación por cursor** y carga diferida; skeletons. Ruta sugerida: `/chat/[conversationId]` que pase `conversationId` a `<ChatInterface>` (hoy `/chat` no lo hace).
- Al abrir una conversación existente, hay que **precargar sus mensajes** en el hook (ver §11.2).

### 10.4 Página "Tu memoria" (`/memory`) — §10 del prompt maestro
> Ojo: el ítem "Memory" del sidebar hoy apunta a **`/files`** (icono `FileText`). Renómbralo a "Archivos" y crea "Tu memoria" → `/memory` (icono distinto).

Estructura (una columna centrada, `max-w-3xl`, aire, sin tarjetas apiladas: usa **filas y separadores**):
1. **Encabezado:** "Tu memoria" + una línea de explicación honesta ("Esto es lo que AXIS recuerda de ti. Todo es editable y borrable.") + interruptores: **Recordar** (`memoryEnabled`), **Aprender de cómo hablamos** (`memoryLearningEnabled`, deshabilitado si la memoria está apagada), y enlace a ajustes de proactividad.
2. **Sobre mí** — categorías persistentes (`PERSISTENT_CATEGORIES`): nombre, intereses, música, estudios, trabajo, proyectos, comida, aficiones…
3. **Cómo prefiero que AXIS me responda** — `INTERACTION_CATEGORIES`: directo/detallado, ejemplos, humor, formato.
4. **Lo que AXIS ha aprendido** — memorias `source='inferred'` (`kind` `inference`/`observed_pattern`). Muestra la **confianza como %** ("Prefieres respuestas directas · 94 %") y una etiqueta sutil de procedencia: *"Lo dijiste tú" / "Patrón observado" / "Inferido"*. Las inferencias deben leerse **como suposiciones**, no como hechos.
5. **Contexto actual** — `TEMPORAL_CATEGORIES`: proyectos, tareas, eventos, estados temporales, con **"caduca mañana / en 3 días"** (`expiresAt`).
6. **Acciones por elemento:** **Editar** (inline; al editar pasa a "lo dijiste tú"), **Eliminar**, **No volver a recordar** (`DELETE ?suppress=1`, con texto que explique la diferencia entre ambas).
7. **Zona de olvido:** campo "Olvida todo lo relacionado con…" → **vista previa** ("Se borrarán 4 recuerdos") → confirmar. Botón **"Olvidar todo"** con confirmación reforzada (escribir "OLVIDAR"). Muestra cuántos se borraron.
8. **Estados:** vacío ("Aún no sé nada de ti. Hablemos."), cargando (skeleton), error con reintento, memoria apagada (banner explicativo, lista en solo lectura o vacía).

Mapeo de datos: usa `MemoryView` + `PERSISTENT_/TEMPORAL_/INTERACTION_CATEGORIES` de `lib/memory/taxonomy.ts`; nombres legibles de categoría en un diccionario ES. **Nunca** muestres `userId`. `key` es un identificador: muéstralo humanizado (`response_directness` → "Directo al grano" no es automático: usa el `value` como texto principal).

### 10.5 Ajustes (`/settings`)
Hoy es una página de servidor de solo lectura (`Name`, `Email`, `Role`, `Timezone`). Conviértela en secciones:
- **Perfil:** nombre para AXIS (editable; es el nombre inicial del registro), avatar, **zona horaria** (autodetectada + selector), idioma.
- **Privacidad y memoria:** los mismos interruptores que en `/memory` (una sola fuente: `/api/settings/memory`).
- **Proactividad (§9):** modo (`high · moderate · low · only_when_relevant · disabled`), **horas de silencio** (requiere ampliar API/`settings-rules`), máximo de mensajes al día (0–10). Si eliges `disabled` la iniciativa se detiene **ya**.
  Texto claro: "AXIS solo te escribe primero si lo activas."
- **Cuenta:** cerrar sesión; **eliminar cuenta** con flujo real (confirmación + verificación), no el botón actual.
- Guardado **optimista** con toast breve; errores revierten el control.

### 10.6 Tareas y eventos (mínimo viable)
Vista simple `/tasks`: pendientes ordenados por vencimiento, marcar hecha, crear, prioridad (1–3), vínculo a la conversación de origen. Sin calendario complejo en esta fase.

### 10.7 Proactividad en la UI
- Un mensaje proactivo aparece como un mensaje **ASSISTANT** en una conversación (nueva o existente) con `metadata.proactive = true`, y genera una fila en `notifications` (el modelo ya existe: `title, body, type, link, isRead`).
- Campana/punto discreto en el header; en la conversación, una etiqueta sutil "AXIS te escribió". El usuario debe poder **silenciar desde ahí mismo** ("No quiero que me escribas primero").
- **Nunca** ventanas modales ni sonidos por defecto.

### 10.8 Estados que toda pantalla debe cubrir
Cargando (skeleton) · vacío (con texto humano) · error (con reintento) · sin permiso/sesión caducada (redirige a `/login`) · offline/lento.

---

## 11. Diseño de los sistemas pendientes

### 11.1 Prompt de personalidad de AXIS (crítico; hoy no existe)
Un `lib/ai/persona.ts` **en servidor** que devuelva el system prompt base y **no** se pueda sobrescribir desde el cliente. Debe cubrir:
- Identidad y tono (sección 1 de este README), en español natural, sin muletillas empáticas, sin sermonear.
- **Adaptación** a `response_preferences`/`humor_preferences`/`explanation_preferences` que ya llegan en el bloque `<axis_context>` (sección "Cómo prefiere que le respondas"): longitud, directo vs. detallado, ejemplos, listas vs. conversación.
- **Comportamiento según contexto emocional** (§5): si hay estrés/cansancio expresado hoy → menos complejidad, priorizar, pasos concretos, sin bromas fuera de lugar, sin sobrecargar. Si está relajado → conversación libre, humor, exploración.
- **Nunca diagnosticar**; no psicologizar; ante crisis real, responder con cuidado y sugerir apoyo humano sin dramatizar.
- Las memorias **inferidas** se tratan como suposiciones; las declaradas, como hechos. **No recitar** lo que sabe del usuario ("según mi memoria…") salvo que venga a cuento.
- Usar la hora local solo si aporta; no saludar por la mañana a las 19:00.
- Cuándo sugerir Complexity (§19), sin presionar.
- Mantener `UI_CAPABILITIES_PROMPT` (bloque ```` ```calc ````) intacto.
Pruébalo con casos de evaluación reales (conjunto pequeño de prompts + criterios), no solo "a ojo".

### 11.2 Sobre `use-chat.ts` (frágil; léelo)
- Mantén: el `transport` con `prepareSendMessagesRequest` (solo envía `{conversationId, message}`), el `fetch` que captura **`X-Conversation-ID`**,
  y el **comentario sobre `id`**: `useChat` de `@ai-sdk/react` comprueba `"id" in options`; si pasas `id: undefined` recrea el `Chat` en cada render y **los mensajes no llegan a la UI**. Incluye la clave `id` **solo** cuando hay valor.
- Para cargar historial: usa `setMessages` con los mensajes previos mapeados a `UIMessage` (parts `text`) al montar con un `conversationId`; no cambies el protocolo de envío.
- Para mostrar herramientas en el futuro: hoy `textFromParts` descarta todo salvo `type:"text"`. Amplíalo **de forma aditiva** (devolver partes de tool en un campo nuevo) sin alterar `messages[].content`.

### 11.3 Capa de proveedores (§21, §28)
```
lib/ai/
  types.ts        // Capability = "text" | "vision" | "image" | "audio" | "embedding"; Task; Mode
  capabilities.ts // registro: qué proveedor/modelo ofrece qué capacidad y límites
  router.ts       // generate({ capability, task, ... }) → elige proveedor sin que el llamador lo sepa
  fallback.ts     // A → B → C, sin bucles infinitos
  health.ts       // estado por proveedor (ventana de errores/latencia)
  limits.ts       // cuotas/rate limits por proveedor y por clave
  providers/{groq,openrouter,cerebras,huggingface,cloudflare,...}.ts
```
- Reutiliza el **patrón** de `embeddings/circuit-breaker.ts` (hoy acoplado a `EmbeddingError`: generalízalo antes de reutilizarlo) y la rotación de claves de `provider-router.ts`.
- Timeouts, **reintentos con backoff exponencial y jitter** (solo en errores reintentables: 429/5xx/red; nunca en 4xx de validación), circuit breaker por proveedor, **máximo de intentos** fijo.
- El modo (§22) determina capacidad/proveedor mediante **un único mapa**. Las claves solo en servidor.

### 11.4 Tools estructuradas (§20)
**Prohibido** decidir la herramienta con `prompt.includes("calendar")`. Tool calling real: el modelo decide.
Cada tool: **schema Zod**, descripción para el modelo, validación, **permisos** (¿qué puede tocar este usuario?), manejo de errores, **timeout**, observabilidad (logger, sin contenido de usuario) y **resultado estructurado**.
Catálogo objetivo: `memory` (remember/forget/search), `time`, `context`, `websearch`, `calculator` (ya hay `lib/safe-math.ts` — reutilízalo, sin `eval`), `weather`, `calendar`, `tasks`, `files`, `vision`, `image`, `audio`, `code`.
- Empieza por: **`memory_remember`, `memory_forget`, `memory_search`, `get_time`, `calculator`, `tasks`**.
- `memory_remember`/`memory_forget` resuelven §6.6 y §6.7 y deben pasar por `evaluateCandidate`/`upsertMemory`/supresión (no por atajos).
- Herramientas que **modifican datos** del usuario (tareas, memoria) deben ser **explícitas y reversibles**, y el UI debe reflejarlo.
- Cuidado con `onFinish({ text })`: con tool calling en varios pasos, el texto persistido debe ser el correcto (revisa qué entrega tu versión del SDK).

### 11.5 Recuperación semántica y de conversaciones (§13, §16, §17)
**Restricción dura:** 900 llamadas/mes de Cohere para **todo** el producto ⇒ **no se puede embeber cada mensaje ni cada consulta.**
- **Indexado:** solo memorias que lo merecen (importancia alta / úsalo con un umbral). **Por lotes** (hasta 96 textos por llamada) mediante un vaciado periódico o diferido; usa `content_hash` para no re-embeber lo que no cambió. Al borrar/suprimir una memoria, su embedding cae por `ON DELETE CASCADE`.
- **Consulta:** que sea la **tool `memory_search`** (decide el modelo; cuesta 1 llamada) y **degrade** a búsqueda por texto (`pg_trgm` ya indexado sobre `key||' '||value`) cuando `getEmbeddingStatus().budget.exhausted` o el circuito esté abierto. Nunca fallar el chat por esto.
- SQL de referencia (**no probado**; ajusta el paso del vector, p. ej. `'[…]'::halfvec`):
  ```sql
  SELECT m.id, 1 - (e.embedding <=> $1::halfvec) AS similarity
    FROM memory_embeddings e JOIN user_memories m ON m.id = e.memory_id
   WHERE e.user_id = $2 AND m.status = 'active'
     AND (m.expires_at IS NULL OR m.expires_at > now())
   ORDER BY e.embedding <=> $1::halfvec LIMIT 8;
  ```
  Con pocas filas por usuario el planificador puede preferir un escaneo exacto sobre el HNSW: es correcto. Si el filtro por `user_id` con HNSW devolviera menos filas de las pedidas, valora `hnsw.iterative_scan` (pgvector ≥ 0.8) o consulta exacta.
- **Conversaciones pasadas** ("¿te acuerdas del proyecto de biología?"): sin embeddings de mensajes (demasiado caro). Orden: (1) memorias con `source_conversation_id`, (2) títulos de conversaciones, (3) búsqueda de texto en `messages`. Para (3) crea un índice **pequeño** (un `tsvector` con configuración `spanish` mediante índice de expresión suele ocupar menos que un GIN trigram sobre todo el texto): **vigila los 500 MB**.
- Integra el resultado en `buildContextBlock` vía el campo `relevance` de `ContextMemory` (ya soportado en `scoreMemory`).

### 11.6 Motor proactivo (§8, §9, §25)
```
lib/proactive/
  engine.ts     // shouldInitiate(userId, now) → { send:false, reason } | { send:true, intent }
  policy.ts     // PURA: decide con datos ya cargados (como evaluate.ts)
  scheduler.ts  // quién y cuándo se evalúa
  context.ts    // reúne datos: hora local, última interacción, tareas, eventos, patrones, ajustes
  generator.ts  // redacta el mensaje (LLM) SOLO si policy dijo que sí
  delivery.ts   // crea conversación/mensaje ASSISTANT + notification
```
- **Principio:** si no aporta valor → **`DO NOT MESSAGE`**. Nada de mensajes "porque sí".
- **`policy` (pura, con tests exhaustivos)** debe considerar: `proactiveEnabled` y `proactiveMode` (`disabled` corta siempre), **quiet hours** (en zona del usuario), **máximo por día**, **cooldown**, **umbral de relevancia**, **última interacción reciente** (no escribir si acaba de hablar), respuesta a mensajes proactivos anteriores (si ignora varios, **reducir** frecuencia), hora local coherente (§7: "¿cómo dormiste?" solo por la mañana, "¿ya comiste?" en horario de comida, "¿sigues despierto?" de madrugada **y solo si el patrón aprendido lo respalda**), tareas/eventos próximos, proyectos activos.
- **Falta una tabla** para cooldown/límite diario y aprendizaje de ignorados: p. ej. `proactive_messages(id, user_id, created_at, kind, reason, conversation_id, delivered_at, read_at, responded_at, dismissed_at)` con índice `(user_id, created_at DESC)`. **Poda** (retención corta) por el límite de 500 MB.
- **Patrones diarios (§6)** (sueño, estudio, actividad, comidas): con `frequency`, `confidence`, `last_updated`, **revisables**; nunca reglas absolutas. Decisión abierta: `user_memories` (categoría `behavioral_patterns`/`current_day` + `metadata`) o tabla propia `daily_patterns`. Prefiere reutilizar `user_memories` si basta.
- **Scheduler:** despliegue en Docker/VPS ⇒ un `POST /api/cron/proactive` protegido con secreto (cabecera) invocado por cron del sistema (o el mecanismo del hosting). Debe ser **idempotente** y procesar por lotes. Sin colas nuevas si no hacen falta.
- **Ajustes:** ampliar `settings-rules`/API/`userSettingsPatchSchema` para `quietHoursStart/End`.
- **Generación:** el mensaje debe sonar humano y **contextual** (p. ej. "¿Qué tal va el proyecto de ayer?"), no genérico; respetar el tono y las preferencias aprendidas.

### 11.7 Archivos y Storage (§12)
- Abstracción `lib/storage/` (`put/get/delete/signedUrl`) con un proveedor Supabase Storage **y** uno S3-compatible (env `S3_*` ya existe) para migrar archivos grandes sin cambiar la app.
- Límite **50 MB/archivo** (plan Free); metadatos en `files`, binarios **nunca** en Postgres; contabilizar `users.storage_used`.
- Adjuntos del chat: extiende `/api/chat` de forma **aditiva** (campo opcional `attachments: [{fileId}]`), sin romper el protocolo actual.
- Visión (`vision`): pasa imágenes al modelo por referencia firmada/URL temporal; nunca guardes base64 grandes en la BD.

### 11.8 Observabilidad y límites (§14, §27)
- Logger estructurado por evento: request, proveedor, latencia, tool call, error, fallback, operación de memoria, error de BD. **Nunca** claves/tokens/contraseñas ni contenido del usuario.
- `usage_logs` ya existe en el schema (no se verificó si algo lo escribe): úsalo con **retención** acotada.
- Rate limiting: por usuario y por IP; respuestas 429 con `Retry-After`. Protección de tamaño (ya hay `max(32_000)` en el mensaje).

---

## 12. Checklist de "terminado" para cada entrega

- [ ] `npm run type-check` limpio; tests pasan; **nuevos tests** para lógica nueva.
- [ ] Migración nueva reproducible, idempotente, con RLS y `schema.prisma` sincronizado; aplicada en BD de prueba **dos veces**.
- [ ] Ninguna ruta usa `userId` del cliente; prueba con **dos usuarios** que no hay fuga (esperado 404).
- [ ] `/api/chat` sigue haciendo streaming y devolviendo `X-Conversation-ID`; `use-chat.ts` sin regresiones (probado a mano).
- [ ] Sin secretos ni contenido de usuario en logs; `.env.example` actualizado.
- [ ] La UI cubre estados cargando/vacío/error, funciona en 380 px, es accesible por teclado y respeta `prefers-reduced-motion`.
- [ ] `AXIS-HANDOFF.md` actualizado, distinguiendo **probado** de **no probado**.
- [ ] Entrega en zip **solo con archivos cambiados**.

---

## 13. Anexo: resumen del prompt maestro (por si no lo tienes)

Requisitos que rigen todo (el texto original llegaba **truncado en §38**; si necesitas los apartados posteriores, pídeselos al usuario):
memoria estructurada y visible (§3, §10, §36–37) · memoria inferida con la cadena *mensaje → candidato → importancia → confianza → sensibilidad → duración → guardar/descartar* (§4) ·
estado emocional como contexto, no diagnóstico (§5) · patrones del día (§6) · hora/zona (§7: zona del usuario/dispositivo > cuenta > aproximada > IP solo como último recurso y nunca localización precisa) ·
AXIS escribe primero solo si el usuario lo permite (§8–9, §25) · Supabase/Postgres eficiente y **sin basura** (§11–12, §29) · pgvector con criterio (§13) · seguridad y RLS (§14) ·
Context Builder, nunca todo el historial (§16–17) · productividad general sin ser Complexity (§18–19) · tools estructuradas (§20) · proveedores abstractos con fallback (§21, §28) · modos (§22) ·
UX premium (§23–24) · tareas y eventos (§26) · observabilidad (§27) · no sobreingenierizar (§30) · **mantener `/api/chat` y `use-chat.ts`** (§31) ·
migraciones reproducibles (§33) · índices justificados (§34) · relaciones y constraints (§35) · rendimiento: **no bloquear la primera respuesta** esperando memoria/embeddings/preferencias (§38).

**No construir:** Complexity, sus agentes, misiones, sistema multi-modelo ni su catálogo de herramientas.
