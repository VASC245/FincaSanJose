-- ============================================================
-- 013_push_notifications.sql
-- Notificaciones push a teléfonos (PWA Web Push):
--  - push_subscriptions: suscripciones de cada teléfono/navegador
--  - push_log: registro de envíos (evita duplicados del cron)
--  - cron diario que invoca la Edge Function send-push
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint    TEXT        NOT NULL UNIQUE,
  p256dh      TEXT        NOT NULL,
  auth        TEXT        NOT NULL,
  device_name TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_log (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  kind        TEXT        NOT NULL DEFAULT 'daily',
  sent_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  message     TEXT,
  recipients  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un envío por tipo por día (el cron puede reintentar sin duplicar)
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_log_daily
  ON push_log (kind, sent_date);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_log           ENABLE ROW LEVEL SECURITY;

-- La app (sin auth todavía) registra y borra su propia suscripción
CREATE POLICY "anon_all_push_subscriptions"
  ON push_subscriptions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_push_subscriptions"
  ON push_subscriptions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- push_log solo lo escribe la Edge Function (service_role); lectura para la app
CREATE POLICY "anon_read_push_log"
  ON push_log FOR SELECT TO anon USING (true);
CREATE POLICY "authenticated_read_push_log"
  ON push_log FOR SELECT TO authenticated USING (true);

-- ── Cron: revisar y notificar todos los días a las 6:00 am Colombia (11:00 UTC) ──
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'send-push-daily',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://zkrhpgxljqwriftoziga.supabase.co/functions/v1/send-push',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{"kind": "daily"}'::jsonb
  );
  $$
);
