-- ============================================================================
-- 20260920000200_memory_tasks_events.sql
--
-- Memoria estructurada, preferencias, tareas y eventos de AXIS.
--
-- DECISIONES DE DISEÑO (referencias al prompt maestro entre corchetes)
--
--  · users.id es TEXT (cuid) en este repo, NO uuid → todas las FKs a users son
--    TEXT. Un uuid aquí no enlazaría con nada.
--  · [§36] La memoria NO es un JSONB gigante: una fila por memoria, con
--    columnas consultables, indexables, actualizables, borrables, expirables
--    y auditables una a una. JSONB solo para `metadata` flexible y no crítico.
--  · [§3/§4] Cuatro ejes ORTOGONALES en vez de una columna `type` que mezcle
--    cosas: kind (qué tipo de conocimiento), durability (cuánto dura),
--    source (de dónde salió), category (de qué trata).
--  · [§4] "AXIS no debe diagnosticar": `kind` NO admite 'diagnosis'. Es un
--    CHECK en la base de datos, no una convención de código: aunque un bug o
--    una inyección de prompt intentase guardarlo, la BD lo rechaza.
--  · Se reutilizan `conversations` y `messages` sin tocarlos [§31].
-- ============================================================================

-- ── Función común para mantener updated_at ──────────────────────────────────
-- El esquema de Prisma no trae triggers: updated_at lo rellena la app con
-- @updatedAt. Las tablas nuevas se escriben también con SQL crudo, así que
-- llevan DEFAULT now() y este trigger para que nunca queden desfasadas.
CREATE OR REPLACE FUNCTION axis_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. user_memories
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_memories (
  id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id      text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- EJE 4: ¿de qué trata? (categorías del §3). Texto libre validado por CHECK
  -- en lugar de ENUM: añadir una categoría es un ALTER de CHECK, no un
  -- ALTER TYPE (que no se puede revertir dentro de una transacción).
  category     text        NOT NULL,
  key          text        NOT NULL,           -- p.ej. 'response_directness'
  value        text        NOT NULL,           -- p.ej. 'prefers_direct_answers'

  -- EJE 1: ¿qué tipo de conocimiento es? [§4]
  --   stated_state      lo que el usuario dijo de su estado ("estoy estresado")
  --   observed_pattern  algo repetido en el tiempo ("pide 'más corto' a menudo")
  --   inference         conclusión que AXIS sacó (siempre revisable)
  -- 'diagnosis' NO EXISTE a propósito. Ver CHECK.
  kind         text        NOT NULL DEFAULT 'stated_state',

  -- EJE 2: ¿cuánto dura? [§3]
  --   permanent  no caduca (nombre, fecha de nacimiento)
  --   stable     cambia rara vez (estudios, gustos)
  --   temporal   caduca; EXIGE expires_at
  durability   text        NOT NULL DEFAULT 'stable',

  -- EJE 3: ¿de dónde salió? [§3]
  source       text        NOT NULL DEFAULT 'explicit_user_statement',

  confidence   real        NOT NULL DEFAULT 1.0,
  importance   smallint    NOT NULL DEFAULT 3,   -- 1 (trivial) .. 5 (crítico)
  visibility   text        NOT NULL DEFAULT 'private',

  -- Por qué se guardó (auditoría, §36) y de dónde vino (trazabilidad).
  reason       text,
  source_conversation_id text REFERENCES conversations(id) ON DELETE SET NULL,
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- "Olvidar" deja de usarse sin destruir el rastro hasta la purga; y permite
  -- que "No recuerdes esto" se respete: la fila 'suppressed' bloquea reaprender.
  status       text        NOT NULL DEFAULT 'active',

  expires_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,

  -- ── Restricciones ──────────────────────────────────────────────────────────
  CONSTRAINT user_memories_category_chk CHECK (category IN (
    -- Persistent Memory (§3)
    'identity','preferences','interests','communication_style','hobbies','music',
    'food','education','work','projects','goals','relationships','important_dates',
    'stable_context',
    -- Temporal Memory (§3)
    'current_day','current_state','stress_context','energy_context','active_tasks',
    'recent_events','upcoming_events','current_projects','unresolved_threads',
    -- Interaction Model (§3)
    'response_preferences','humor_preferences','explanation_preferences',
    'learning_preferences','behavioral_patterns'
  )),

  -- REGLA DE SEGURIDAD [§4]: imposible guardar un diagnóstico.
  CONSTRAINT user_memories_kind_chk CHECK (kind IN
    ('stated_state','observed_pattern','inference')),

  CONSTRAINT user_memories_durability_chk CHECK (durability IN
    ('permanent','stable','temporal')),

  CONSTRAINT user_memories_source_chk CHECK (source IN
    ('explicit_user_statement','user_edit','inferred','system')),

  CONSTRAINT user_memories_visibility_chk CHECK (visibility IN ('private','shared')),
  CONSTRAINT user_memories_status_chk CHECK (status IN ('active','suppressed')),
  CONSTRAINT user_memories_confidence_chk CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT user_memories_importance_chk CHECK (importance BETWEEN 1 AND 5),

  -- Lo temporal SIEMPRE caduca; lo permanente NUNCA. Sin esto, una memoria
  -- "temporal" sin fecha viviría para siempre (el bug que el §3 quiere evitar).
  CONSTRAINT user_memories_expiry_chk CHECK (
    (durability = 'temporal' AND expires_at IS NOT NULL) OR
    (durability = 'permanent' AND expires_at IS NULL) OR
    (durability = 'stable')
  ),

  -- Una inferencia NUNCA puede presentarse con la certeza de algo declarado:
  -- las inferencias quedan por debajo de 1.0 y no pueden venir de 'explicit'.
  CONSTRAINT user_memories_inference_chk CHECK (
    kind <> 'inference' OR (source IN ('inferred','system') AND confidence < 1)
  ),

  -- Acotar tamaños: memoria es texto corto, no un vertedero de conversaciones [§12].
  CONSTRAINT user_memories_key_len_chk   CHECK (char_length(key)   BETWEEN 1 AND 100),
  CONSTRAINT user_memories_value_len_chk CHECK (char_length(value) BETWEEN 1 AND 1000),
  CONSTRAINT user_memories_reason_len_chk CHECK (reason IS NULL OR char_length(reason) <= 500)
);

-- Una memoria "activa" por (usuario, categoría, clave): actualizar = UPDATE,
-- no acumular duplicados. Las suprimidas no cuentan, para poder coexistir.
CREATE UNIQUE INDEX IF NOT EXISTS user_memories_active_uq
  ON user_memories (user_id, category, key)
  WHERE status = 'active';

-- "No recuerdes esto": una sola supresión por (usuario, categoría, clave).
CREATE UNIQUE INDEX IF NOT EXISTS user_memories_suppressed_uq
  ON user_memories (user_id, category, key)
  WHERE status = 'suppressed';

-- Consulta principal del Context Builder: memorias activas de un usuario,
-- las más importantes primero.
CREATE INDEX IF NOT EXISTS user_memories_user_importance_idx
  ON user_memories (user_id, importance DESC, updated_at DESC)
  WHERE status = 'active';

-- Barrido de caducidad: solo las que TIENEN fecha, así el índice es minúsculo.
CREATE INDEX IF NOT EXISTS user_memories_expires_idx
  ON user_memories (expires_at)
  WHERE expires_at IS NOT NULL;

-- "Olvida todo lo relacionado con X" [§37]: búsqueda por texto sobre clave+valor.
-- pg_trgm ya está habilitado en la migración inicial.
CREATE INDEX IF NOT EXISTS user_memories_text_trgm_idx
  ON user_memories USING gin ((key || ' ' || value) gin_trgm_ops);

DROP TRIGGER IF EXISTS user_memories_touch ON user_memories;
CREATE TRIGGER user_memories_touch
  BEFORE UPDATE ON user_memories
  FOR EACH ROW EXECUTE FUNCTION axis_touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- 2. memory_embeddings   (memoria semántica, §13)
-- ════════════════════════════════════════════════════════════════════════════
-- Solo se embeben las memorias que lo merecen (importance >= umbral), NO todas
-- [§13]. Con 1.000 llamadas/mes de Cohere, indexar cada memoria sería
-- imposible; el orquestador acumula y embebe por lotes de 96.
CREATE TABLE IF NOT EXISTS memory_embeddings (
  memory_id        text        PRIMARY KEY REFERENCES user_memories(id) ON DELETE CASCADE,
  user_id          text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  embedding        halfvec(1024) NOT NULL,
  -- Con qué modelo se generó. Si algún día se cambia de proveedor, permite
  -- detectar y re-embeber los vectores viejos sin adivinar.
  model            text        NOT NULL,
  -- Hash del texto embebido: si la memoria no cambió, NO se vuelve a embeber
  -- (ahorra llamadas de una cuota de 1.000/mes).
  content_hash     text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- user_id se duplica a propósito aquí (ya está en user_memories): permite
-- filtrar por usuario DENTRO del índice vectorial sin un JOIN.
CREATE INDEX IF NOT EXISTS memory_embeddings_user_idx ON memory_embeddings (user_id);

CREATE INDEX IF NOT EXISTS memory_embeddings_hnsw_idx
  ON memory_embeddings USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. user_settings   (§37: memory_enabled, memory_learning_enabled, proactive_enabled)
-- ════════════════════════════════════════════════════════════════════════════
-- Una fila por usuario. Es la ÚNICA fuente de verdad de los interruptores de
-- privacidad: el código debe leerlos antes de guardar, aprender o escribir
-- primero. Los valores por defecto son los MÁS conservadores donde importa.
CREATE TABLE IF NOT EXISTS user_settings (
  user_id                  text        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  memory_enabled           boolean     NOT NULL DEFAULT true,
  -- Aprender por inferencia es opt-out explícito y separado de "recordar".
  memory_learning_enabled  boolean     NOT NULL DEFAULT true,
  -- AXIS NO escribe primero por defecto [§9]: hay que activarlo.
  proactive_enabled        boolean     NOT NULL DEFAULT false,
  proactive_mode           text        NOT NULL DEFAULT 'only_when_relevant',
  quiet_hours_start        time,
  quiet_hours_end          time,
  max_proactive_per_day    smallint    NOT NULL DEFAULT 2,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_settings_proactive_mode_chk CHECK (proactive_mode IN
    ('high','moderate','low','only_when_relevant','disabled')),
  CONSTRAINT user_settings_max_proactive_chk CHECK (max_proactive_per_day BETWEEN 0 AND 10),
  -- Si desactiva la memoria por completo, no puede quedar "aprendiendo".
  CONSTRAINT user_settings_learning_needs_memory_chk CHECK (
    memory_enabled OR NOT memory_learning_enabled
  )
);

DROP TRIGGER IF EXISTS user_settings_touch ON user_settings;
CREATE TRIGGER user_settings_touch
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION axis_touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- 4. tasks + task_conversation_links   (§26)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tasks (
  id            text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id       text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         text        NOT NULL,
  description   text,
  status        text        NOT NULL DEFAULT 'open',
  priority      smallint    NOT NULL DEFAULT 2,     -- 1 baja .. 3 alta
  due_at        timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tasks_status_chk   CHECK (status IN ('open','in_progress','done','cancelled')),
  CONSTRAINT tasks_priority_chk CHECK (priority BETWEEN 1 AND 3),
  CONSTRAINT tasks_title_len_chk CHECK (char_length(title) BETWEEN 1 AND 300),
  CONSTRAINT tasks_desc_len_chk  CHECK (description IS NULL OR char_length(description) <= 4000),
  -- completed_at coherente con el estado: ni "hecha" sin fecha ni fecha sin "hecha".
  CONSTRAINT tasks_completed_chk CHECK ((status = 'done') = (completed_at IS NOT NULL))
);

-- Lista de pendientes del usuario, ordenada por vencimiento. Solo las abiertas:
-- el 90 % de las filas acabará 'done' y no debe engordar el índice.
CREATE INDEX IF NOT EXISTS tasks_user_open_due_idx
  ON tasks (user_id, due_at NULLS LAST)
  WHERE status IN ('open','in_progress');

DROP TRIGGER IF EXISTS tasks_touch ON tasks;
CREATE TRIGGER tasks_touch
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION axis_touch_updated_at();

CREATE TABLE IF NOT EXISTS task_conversation_links (
  task_id          text        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  conversation_id  text        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, conversation_id)
);
-- El PK cubre task→conversaciones. Falta conversación→tareas:
CREATE INDEX IF NOT EXISTS task_conversation_links_conv_idx
  ON task_conversation_links (conversation_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. events   (§26)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS events (
  id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id      text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  description  text,
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz,
  all_day      boolean     NOT NULL DEFAULT false,
  source_conversation_id text REFERENCES conversations(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT events_title_len_chk CHECK (char_length(title) BETWEEN 1 AND 300),
  CONSTRAINT events_range_chk     CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS events_user_starts_idx ON events (user_id, starts_at);

DROP TRIGGER IF EXISTS events_touch ON events;
CREATE TRIGGER events_touch
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION axis_touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Seguridad
-- ════════════════════════════════════════════════════════════════════════════
-- RLS activado en TODAS las tablas de usuario como RED DE SEGURIDAD [§14].
--
-- IMPORTANTE — límite honesto de esto: Prisma se conecta con un rol que tiene
-- BYPASSRLS (o es dueño de las tablas), así que estas políticas NO se ejecutan
-- para las consultas de Prisma. Protegen contra el acceso directo por la Data
-- API de Supabase (PostgREST) con los roles anon/authenticated. El aislamiento
-- por usuario en el código de la app (WHERE user_id = <sesión>) es el control
-- PRIMARIO hoy. Ver docs/SEGURIDAD-RLS.md para la decisión pendiente.
--
-- Sin políticas => anon/authenticated no pueden hacer nada. Deniega por defecto.
ALTER TABLE user_memories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_embeddings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_conversation_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE events                  ENABLE ROW LEVEL SECURITY;
