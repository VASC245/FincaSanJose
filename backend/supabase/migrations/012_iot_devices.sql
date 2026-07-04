-- ============================================================
-- 012_iot_devices.sql
-- Infraestructura IoT: collares de vacas y cámaras de cerdos
-- Los dispositivos NO usan el rol anon: envían datos a la Edge
-- Function iot-ingest con un api_key propio por dispositivo.
-- ============================================================

-- ── Registro de dispositivos ─────────────────────────────────
CREATE TABLE IF NOT EXISTS iot_devices (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  device_type   TEXT        NOT NULL CHECK (device_type IN ('collar', 'camera', 'gateway', 'other')),
  name          TEXT        NOT NULL,
  -- Collar asignado a un animal; cámara asignada a una zona
  animal_id     UUID        REFERENCES animals(id) ON DELETE SET NULL,
  location      TEXT,                              -- ej: 'porqueriza 1', 'potrero norte'
  api_key_hash  TEXT        NOT NULL,              -- sha256 del api key (nunca guardar en claro)
  battery_pct   NUMERIC,
  last_seen_at  TIMESTAMPTZ,
  active        BOOLEAN     NOT NULL DEFAULT TRUE,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Lecturas de sensores (collares) ──────────────────────────
-- Tabla append-only de series de tiempo. Un registro por lectura.
CREATE TABLE IF NOT EXISTS sensor_readings (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id     UUID        NOT NULL REFERENCES iot_devices(id) ON DELETE CASCADE,
  animal_id     UUID        REFERENCES animals(id) ON DELETE SET NULL,
  recorded_at   TIMESTAMPTZ NOT NULL,
  reading_type  TEXT        NOT NULL CHECK (reading_type IN (
                  'activity',       -- índice de actividad (detección de celo)
                  'rumination',     -- minutos de rumia
                  'temperature',    -- °C
                  'gps',            -- ubicación
                  'rest',           -- minutos de descanso
                  'battery'
                )),
  value         NUMERIC,                            -- valor escalar
  lat           NUMERIC,                            -- solo para gps
  lng           NUMERIC,
  payload       JSONB       NOT NULL DEFAULT '{}',  -- datos crudos del fabricante
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sensor_readings_animal_time
  ON sensor_readings (animal_id, reading_type, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_device_time
  ON sensor_readings (device_id, recorded_at DESC);

-- ── Eventos de cámaras (monitoreo de cerdos) ─────────────────
CREATE TABLE IF NOT EXISTS camera_events (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id     UUID        NOT NULL REFERENCES iot_devices(id) ON DELETE CASCADE,
  event_type    TEXT        NOT NULL CHECK (event_type IN (
                  'motion',           -- movimiento detectado
                  'intrusion',        -- persona/vehículo fuera de horario
                  'animal_down',      -- animal echado demasiado tiempo
                  'farrowing',        -- posible parto en curso
                  'feeding_anomaly',  -- no se acercan al comedero
                  'offline',          -- cámara perdió conexión
                  'other'
                )),
  severity      TEXT        NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  occurred_at   TIMESTAMPTZ NOT NULL,
  clip_url      TEXT,                               -- video/imagen en Supabase Storage
  reviewed      BOOLEAN     NOT NULL DEFAULT FALSE,
  notes         TEXT,
  payload       JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_camera_events_time
  ON camera_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_camera_events_unreviewed
  ON camera_events (reviewed) WHERE reviewed = FALSE;

-- ── Alertas generadas (celo, fiebre, intrusión, batería) ─────
CREATE TABLE IF NOT EXISTS iot_alerts (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  source        TEXT        NOT NULL CHECK (source IN ('collar', 'camera', 'system')),
  device_id     UUID        REFERENCES iot_devices(id) ON DELETE SET NULL,
  animal_id     UUID        REFERENCES animals(id) ON DELETE SET NULL,
  alert_type    TEXT        NOT NULL,               -- ej: 'heat_detected', 'fever', 'low_battery', 'intrusion'
  severity      TEXT        NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  message       TEXT        NOT NULL,
  acknowledged  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iot_alerts_open
  ON iot_alerts (created_at DESC) WHERE acknowledged = FALSE;

-- ── RLS ──────────────────────────────────────────────────────
-- La app (frontend) puede LEER todo y gestionar dispositivos/alertas.
-- La ESCRITURA de lecturas y eventos solo ocurre vía Edge Function
-- (service_role), que valida el api_key del dispositivo.
ALTER TABLE iot_devices     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE camera_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE iot_alerts      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_iot_devices"     ON iot_devices     FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_sensor_readings" ON sensor_readings FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_camera_events"  ON camera_events   FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_update_camera_events" ON camera_events  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_iot_alerts"      ON iot_alerts      FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- Mientras la app siga sin login (rol anon), espejo de lectura:
CREATE POLICY "anon_read_iot_devices"     ON iot_devices     FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_sensor_readings" ON sensor_readings FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_camera_events"   ON camera_events   FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_iot_alerts"      ON iot_alerts      FOR SELECT TO anon USING (true);
CREATE POLICY "anon_ack_iot_alerts"       ON iot_alerts      FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_review_camera_events" ON camera_events   FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ── Vista útil: último estado por animal con collar ──────────
CREATE OR REPLACE VIEW animal_latest_readings AS
SELECT DISTINCT ON (sr.animal_id, sr.reading_type)
  sr.animal_id,
  a.ear_tag,
  a.name,
  sr.reading_type,
  sr.value,
  sr.recorded_at
FROM sensor_readings sr
JOIN animals a ON a.id = sr.animal_id
ORDER BY sr.animal_id, sr.reading_type, sr.recorded_at DESC;
