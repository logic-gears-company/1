-- ============================================================================
-- 20260921000100_memory_last_used_touch.sql
--
-- Marcar `last_used_at` NO debe alterar `updated_at`.
--
-- PROBLEMA
--   `user_memories_touch` (migración 20260920000200) es un BEFORE UPDATE
--   incondicional: cualquier UPDATE fija `updated_at = now()`. Al empezar a marcar
--   `last_used_at` en cada respuesta del chat, `updated_at` cambiaría cada vez que
--   una memoria SE USA, no cuando se EDITA. Consecuencias:
--     · `context-format.ts` puntúa la frescura sobre `updated_at`: lo usado
--       parecería "editado hoy" y subiría de puntuación por el mero hecho de
--       usarse → bucle de retroalimentación (se usa, sube, se vuelve a usar…).
--     · se pierde la señal real "cuándo se editó por última vez" que necesita la
--       UI de "Tu memoria" (§10).
--
-- SOLUCIÓN
--   El trigger conserva `updated_at` cuando la ÚNICA columna que cambia es
--   `last_used_at`. Cualquier otro cambio sigue actualizándolo, exactamente igual
--   que antes.
--
-- Solo se sustituye la función de ESTA tabla (`axis_touch_memory_updated_at`).
-- `axis_touch_updated_at()` (compartida por tasks/events/user_settings) NO se toca.
--
-- IDEMPOTENTE: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS. Se puede
-- ejecutar varias veces sin efecto secundario.
-- ============================================================================

CREATE OR REPLACE FUNCTION axis_touch_memory_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Si solo cambió last_used_at, `updated_at` se queda como estaba.
  -- Se compara la fila entera ignorando last_used_at y updated_at: si TODO lo
  -- demás es igual, es un "marcado de uso" puro. IS NOT DISTINCT FROM trata NULL
  -- como valor comparable (a diferencia de =), imprescindible con columnas NULL.
  IF (NEW.last_used_at IS DISTINCT FROM OLD.last_used_at)
     AND (to_jsonb(NEW) - 'last_used_at' - 'updated_at')
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - 'last_used_at' - 'updated_at')
  THEN
    NEW.updated_at := OLD.updated_at;
    RETURN NEW;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_memories_touch ON user_memories;
CREATE TRIGGER user_memories_touch
  BEFORE UPDATE ON user_memories
  FOR EACH ROW EXECUTE FUNCTION axis_touch_memory_updated_at();
