-- ============================================================
-- 018_weight_records.sql
-- Registro de pesos por animal para calcular ganancia diaria
-- de peso (ADG) en cerdos de engorde.
-- ============================================================

CREATE TABLE IF NOT EXISTS weight_records (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id     UUID        NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  recorded_date DATE        NOT NULL,
  weight_kg     NUMERIC(6,2) NOT NULL CHECK (weight_kg > 0),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weight_records_animal_id ON weight_records(animal_id);
CREATE INDEX IF NOT EXISTS idx_weight_records_date      ON weight_records(recorded_date);

ALTER TABLE weight_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_weight_records"
  ON weight_records FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_weight_records"
  ON weight_records FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_weight_records"
  ON weight_records FOR UPDATE TO anon USING (true);

CREATE POLICY "anon_delete_weight_records"
  ON weight_records FOR DELETE TO anon USING (true);

CREATE POLICY "authenticated_all_weight_records"
  ON weight_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
