-- ============================================================
-- 014_evening_push_cron.sql
-- Segundo envío diario de notificaciones: cierre del día a las
-- 6:00 pm Colombia (23:00 UTC) — leche sin registrar, gastos
-- sin registrar y tareas de hoy sin completar.
-- ============================================================

SELECT cron.schedule(
  'send-push-evening',
  '0 23 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://zkrhpgxljqwriftoziga.supabase.co/functions/v1/send-push',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{"kind": "evening"}'::jsonb
  );
  $$
);
