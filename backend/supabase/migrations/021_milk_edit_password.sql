-- ============================================================
-- 021_milk_edit_password.sql
-- Correcciones de leche protegidas con clave.
--
-- * La app ya no puede modificar ni borrar registros de leche
--   directamente (se quitan las políticas UPDATE/DELETE de anon).
-- * Las correcciones pasan por funciones que verifican la clave
--   en el servidor, exigen un motivo y guardan el antes/después
--   en milk_edit_log.
-- * La clave se guarda como hash bcrypt en app_secrets (sin acceso
--   desde la app). Tras 5 intentos fallidos se bloquea 15 minutos.
-- * La clave inicial NO está en este archivo (el repo es público):
--   se fija una sola vez desde el SQL Editor de Supabase con
--     INSERT INTO app_secrets (key, hash)
--     VALUES ('milk_edit_password', extensions.crypt('<clave>', extensions.gen_salt('bf')))
--     ON CONFLICT (key) DO UPDATE SET hash = EXCLUDED.hash, updated_at = NOW();
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ─── Secretos (solo accesibles desde funciones SECURITY DEFINER) ────────────
CREATE TABLE IF NOT EXISTS app_secrets (
  key         TEXT PRIMARY KEY,
  hash        TEXT NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_secrets FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS milk_password_attempts (
  id            BIGSERIAL PRIMARY KEY,
  attempted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE milk_password_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON milk_password_attempts FROM anon, authenticated;

-- ─── Historial de correcciones (solo lectura para la app) ───────────────────
CREATE TABLE IF NOT EXISTS milk_edit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source      TEXT NOT NULL CHECK (source IN ('milk_sessions', 'milk_records')),
  record_id   UUID NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('update', 'delete')),
  animal_id   UUID REFERENCES animals(id) ON DELETE SET NULL,
  old_date    DATE,
  old_liters  NUMERIC(8,2),
  old_notes   TEXT,
  new_date    DATE,
  new_liters  NUMERIC(8,2),
  new_notes   TEXT,
  reason      TEXT NOT NULL,
  edited_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS milk_edit_log_edited_at_idx ON milk_edit_log(edited_at DESC);

ALTER TABLE milk_edit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_milk_edit_log" ON milk_edit_log;
CREATE POLICY "anon_select_milk_edit_log" ON milk_edit_log FOR SELECT TO anon USING (true);
REVOKE INSERT, UPDATE, DELETE ON milk_edit_log FROM anon, authenticated;

-- ─── Leche: sin UPDATE/DELETE directos ──────────────────────────────────────
DROP POLICY IF EXISTS "anon_update_milk_records"  ON milk_records;
DROP POLICY IF EXISTS "anon_delete_milk_records"  ON milk_records;
DROP POLICY IF EXISTS "anon_update_milk_sessions" ON milk_sessions;
DROP POLICY IF EXISTS "anon_delete_milk_sessions" ON milk_sessions;

-- ─── Verificación de clave (interna) ────────────────────────────────────────
-- Devuelve NULL si la clave es correcta, o el mensaje de error.
CREATE OR REPLACE FUNCTION _milk_check_password(p_password TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash  TEXT;
  v_fails INT;
BEGIN
  SELECT COUNT(*) INTO v_fails
  FROM milk_password_attempts
  WHERE attempted_at > NOW() - INTERVAL '15 minutes';
  IF v_fails >= 5 THEN
    RETURN 'Demasiados intentos con clave incorrecta. Espera 15 minutos.';
  END IF;

  SELECT hash INTO v_hash FROM app_secrets WHERE key = 'milk_edit_password';
  IF v_hash IS NULL THEN
    RETURN 'La clave de corrección todavía no está configurada.';
  END IF;

  IF crypt(COALESCE(p_password, ''), v_hash) <> v_hash THEN
    INSERT INTO milk_password_attempts DEFAULT VALUES;
    RETURN 'Clave incorrecta.';
  END IF;

  DELETE FROM milk_password_attempts;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION _milk_check_password(TEXT) FROM PUBLIC, anon, authenticated;

-- ─── Corregir un registro ───────────────────────────────────────────────────
-- Devuelve {ok: true, row: {...}} o {ok: false, error: '...'}.
-- No usa RAISE para los errores esperados: así el intento fallido
-- queda guardado (un RAISE desharía el INSERT del contador).
CREATE OR REPLACE FUNCTION edit_milk_entry(
  p_source        TEXT,
  p_id            UUID,
  p_password      TEXT,
  p_reason        TEXT,
  p_recorded_date DATE,
  p_liters        NUMERIC,
  p_notes         TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_err    TEXT;
  v_reason TEXT := NULLIF(BTRIM(p_reason), '');
  v_notes  TEXT := NULLIF(BTRIM(p_notes), '');
  v_old    milk_records%ROWTYPE;
  v_sess   milk_sessions%ROWTYPE;
  v_rec    milk_records%ROWTYPE;
BEGIN
  IF p_source NOT IN ('milk_sessions', 'milk_records') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tipo de registro no válido.');
  END IF;
  IF v_reason IS NULL OR LENGTH(v_reason) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Escribe el motivo de la corrección.');
  END IF;
  IF p_recorded_date IS NULL OR p_liters IS NULL OR p_liters < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Revisa la fecha y los litros.');
  END IF;

  v_err := _milk_check_password(p_password);
  IF v_err IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_err);
  END IF;

  IF p_source = 'milk_sessions' THEN
    SELECT * INTO v_sess FROM milk_sessions WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'El registro ya no existe.');
    END IF;
    INSERT INTO milk_edit_log (source, record_id, action, old_date, old_liters, old_notes,
                               new_date, new_liters, new_notes, reason)
    VALUES ('milk_sessions', p_id, 'update', v_sess.recorded_date, v_sess.liters, v_sess.notes,
            p_recorded_date, p_liters, v_notes, v_reason);
    UPDATE milk_sessions
       SET recorded_date = p_recorded_date, liters = p_liters, notes = v_notes
     WHERE id = p_id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'row', to_jsonb(v_sess));
  END IF;

  SELECT * INTO v_old FROM milk_records WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El registro ya no existe.');
  END IF;
  INSERT INTO milk_edit_log (source, record_id, action, animal_id, old_date, old_liters, old_notes,
                             new_date, new_liters, new_notes, reason)
  VALUES ('milk_records', p_id, 'update', v_old.animal_id, v_old.recorded_date, v_old.liters, v_old.notes,
          p_recorded_date, p_liters, v_notes, v_reason);
  UPDATE milk_records
     SET recorded_date = p_recorded_date, liters = p_liters, notes = v_notes
   WHERE id = p_id
  RETURNING * INTO v_rec;
  RETURN jsonb_build_object('ok', true, 'row', to_jsonb(v_rec));
END;
$$;

-- ─── Borrar un registro (también con clave y motivo) ────────────────────────
CREATE OR REPLACE FUNCTION delete_milk_entry(
  p_source   TEXT,
  p_id       UUID,
  p_password TEXT,
  p_reason   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_err    TEXT;
  v_reason TEXT := NULLIF(BTRIM(p_reason), '');
  v_sess   milk_sessions%ROWTYPE;
  v_rec    milk_records%ROWTYPE;
BEGIN
  IF p_source NOT IN ('milk_sessions', 'milk_records') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tipo de registro no válido.');
  END IF;
  IF v_reason IS NULL OR LENGTH(v_reason) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Escribe el motivo para borrar.');
  END IF;

  v_err := _milk_check_password(p_password);
  IF v_err IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_err);
  END IF;

  IF p_source = 'milk_sessions' THEN
    DELETE FROM milk_sessions WHERE id = p_id RETURNING * INTO v_sess;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'El registro ya no existe.');
    END IF;
    INSERT INTO milk_edit_log (source, record_id, action, old_date, old_liters, old_notes, reason)
    VALUES ('milk_sessions', p_id, 'delete', v_sess.recorded_date, v_sess.liters, v_sess.notes, v_reason);
  ELSE
    DELETE FROM milk_records WHERE id = p_id RETURNING * INTO v_rec;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'El registro ya no existe.');
    END IF;
    INSERT INTO milk_edit_log (source, record_id, action, animal_id, old_date, old_liters, old_notes, reason)
    VALUES ('milk_records', p_id, 'delete', v_rec.animal_id, v_rec.recorded_date, v_rec.liters, v_rec.notes, v_reason);
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─── Cambiar la clave (exige la clave actual) ───────────────────────────────
CREATE OR REPLACE FUNCTION change_milk_password(p_current TEXT, p_new TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_err TEXT;
BEGIN
  IF p_new IS NULL OR LENGTH(p_new) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La clave nueva debe tener al menos 4 caracteres.');
  END IF;

  v_err := _milk_check_password(p_current);
  IF v_err IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_err);
  END IF;

  UPDATE app_secrets
     SET hash = crypt(p_new, gen_salt('bf')), updated_at = NOW()
   WHERE key = 'milk_edit_password';
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION edit_milk_entry(TEXT, UUID, TEXT, TEXT, DATE, NUMERIC, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_milk_entry(TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION change_milk_password(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION edit_milk_entry(TEXT, UUID, TEXT, TEXT, DATE, NUMERIC, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_milk_entry(TEXT, UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION change_milk_password(TEXT, TEXT) TO anon, authenticated;
