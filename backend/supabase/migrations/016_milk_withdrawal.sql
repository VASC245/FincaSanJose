-- ============================================================
-- 016_milk_withdrawal.sql
-- Retiro de leche tras tratamientos/vacunas: días de retiro y
-- fecha hasta la cual NO se puede vender la leche del animal.
-- ============================================================

ALTER TABLE vaccination_records
  ADD COLUMN IF NOT EXISTS milk_withdrawal_days  INT,
  ADD COLUMN IF NOT EXISTS milk_withdrawal_until DATE;

CREATE INDEX IF NOT EXISTS idx_vaccination_milk_withdrawal
  ON vaccination_records(milk_withdrawal_until);
