-- ============================================================
-- 020_bcs_records.sql
-- Condición corporal (BCS) escala 1-5, registrada en momentos
-- clave: secado, parto, servicio, destete.
-- ============================================================

CREATE TABLE IF NOT EXISTS bcs_records (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id     UUID        NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  recorded_date DATE        NOT NULL,
  score         NUMERIC(2,1) NOT NULL CHECK (score >= 1 AND score <= 5),
  moment        TEXT        CHECK (moment IN ('secado', 'parto', 'servicio', 'destete', 'otro')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bcs_records_animal_id ON bcs_records(animal_id);
CREATE INDEX IF NOT EXISTS idx_bcs_records_date      ON bcs_records(recorded_date);

ALTER TABLE bcs_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_bcs_records"
  ON bcs_records FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_bcs_records"
  ON bcs_records FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_bcs_records"
  ON bcs_records FOR UPDATE TO anon USING (true);

CREATE POLICY "anon_delete_bcs_records"
  ON bcs_records FOR DELETE TO anon USING (true);

CREATE POLICY "authenticated_all_bcs_records"
  ON bcs_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
