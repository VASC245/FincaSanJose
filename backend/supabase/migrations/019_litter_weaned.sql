-- ============================================================
-- 019_litter_weaned.sql
-- Lechones destetados por camada: se registra al destete y
-- alimenta el KPI destetados/cerda/año (estilo PigCHAMP).
-- ============================================================

ALTER TABLE litters
  ADD COLUMN IF NOT EXISTS weaned_count INT CHECK (weaned_count >= 0);
