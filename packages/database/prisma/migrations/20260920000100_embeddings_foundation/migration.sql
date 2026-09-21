-- ============================================================================
-- 20260920000100_embeddings_foundation.sql
--
-- Fija la dimensión de los embeddings a halfvec(1024) (Cohere embed-v4.0 con
-- output_dimension=1024) y crea el contador del presupuesto mensual de la API.
--
-- DECISIÓN (verificada en docs oficiales de Cohere y Supabase):
--   · embed-v4.0 admite output_dimension ∈ {256, 512, 1024, 1536}.
--   · halfvec(1024) = 2*1024+8 = 2.056 B/fila; vector(1536) = 6.152 B/fila.
--     Con 500 MB de Free Plan, la diferencia es ~3x de espacio.
--   · HNSW sobre halfvec está soportado desde pgvector 0.7.
--
-- SEGURIDAD DE ESTA MIGRACIÓN
--   Cambia el tipo de una columna existente. Si contuviera embeddings de
--   1536 dims se PERDERÍAN (no son convertibles a 1024 sin re-embeber). Por eso
--   ABORTA si encuentra alguno, en vez de borrarlos en silencio. En tu repo
--   ninguna ruta funcional escribe ahí hoy, así que debería pasar limpia.
-- ============================================================================

-- ── 0. pgvector debe ser >= 0.7.0 para halfvec + HNSW sobre halfvec ─────────
DO $$
DECLARE
  v     text;
  parts text[];
BEGIN
  SELECT extversion INTO v FROM pg_extension WHERE extname = 'vector';
  IF v IS NULL THEN
    RAISE EXCEPTION 'La extensión pgvector no está instalada. Ejecuta: CREATE EXTENSION vector;';
  END IF;

  -- Se extraen SOLO los tres primeros números (major.minor.patch). Así una
  -- versión con sufijo ("0.8.0-rc1") no rompe el cast a int[].
  parts := regexp_match(v, '^(\d+)\.(\d+)(?:\.(\d+))?');
  IF parts IS NULL THEN
    RAISE EXCEPTION 'No se pudo interpretar la versión de pgvector: "%". Verifica manualmente que sea >= 0.7.0.', v;
  END IF;

  -- Comparación NUMÉRICA por componentes (0.10.0 > 0.7.0; una comparación de
  -- texto diría lo contrario). El patch ausente cuenta como 0.
  IF ARRAY[parts[1]::int, parts[2]::int, COALESCE(parts[3], '0')::int] < ARRAY[0,7,0] THEN
    RAISE EXCEPTION 'pgvector % es demasiado antigua; halfvec requiere >= 0.7.0. Actualiza el proyecto de Supabase.', v;
  END IF;
END $$;

-- ── 1. chunks.embedding: vector(1536) -> halfvec(1024) ──────────────────────
DO $$
DECLARE
  n bigint;
  cur text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO cur
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
   WHERE c.relname = 'chunks' AND a.attname = 'embedding' AND NOT a.attisdropped;

  IF cur IS NULL THEN
    RAISE EXCEPTION 'No existe chunks.embedding. ¿Se aplicó la migración inicial de Prisma?';
  END IF;

  IF cur = 'halfvec(1024)' THEN
    RAISE NOTICE 'chunks.embedding ya es halfvec(1024); nada que hacer.';
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM chunks WHERE embedding IS NOT NULL' INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION
      'ABORTADO: chunks tiene % embeddings de tipo %. Cambiar la dimensión los destruiría. '
      'Re-embébelos con Cohere tras vaciar la columna: UPDATE chunks SET embedding = NULL;', n, cur;
  END IF;

  -- Sin datos: cambio seguro. USING NULL porque no hay nada que convertir.
  EXECUTE 'ALTER TABLE chunks ALTER COLUMN embedding TYPE halfvec(1024) USING NULL';
  RAISE NOTICE 'chunks.embedding: % -> halfvec(1024)', cur;
END $$;

-- Índice HNSW por coseno (el operador que usaremos en las consultas).
-- IF NOT EXISTS: la migración es re-ejecutable.
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx
  ON chunks USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ── 2. Presupuesto mensual de llamadas a APIs externas ──────────────────────
-- Una fila por (recurso, mes). `tryReserve` en budget-store.ts la incrementa
-- con un único INSERT ... ON CONFLICT DO UPDATE ... WHERE (atómico).
CREATE TABLE IF NOT EXISTS api_call_budget (
  resource    text        NOT NULL,
  period      text        NOT NULL,            -- 'YYYY-MM' en UTC
  calls_used  integer     NOT NULL DEFAULT 0 CHECK (calls_used >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resource, period),
  CONSTRAINT api_call_budget_period_fmt CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

COMMENT ON TABLE api_call_budget IS
  'Contador atómico de llamadas mensuales a APIs externas con cuota gratuita (Cohere: 1000/mes). Garantiza "nunca facturar".';

-- Sin datos de usuario aquí: es un contador global del servidor. Se bloquea el
-- acceso desde el cliente; solo el servidor (rol con BYPASSRLS / service) escribe.
ALTER TABLE api_call_budget ENABLE ROW LEVEL SECURITY;
-- Sin políticas => ningún rol sujeto a RLS (anon/authenticated) puede leer ni escribir.
