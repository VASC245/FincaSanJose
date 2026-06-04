-- Registros de producción de leche
CREATE TABLE IF NOT EXISTS milk_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id     UUID NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
  liters        NUMERIC(8,2) NOT NULL CHECK (liters >= 0),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS milk_records_animal_id_idx ON milk_records(animal_id);
CREATE INDEX IF NOT EXISTS milk_records_date_idx ON milk_records(recorded_date DESC);

-- RLS
ALTER TABLE milk_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_milk_records" ON milk_records FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_milk_records" ON milk_records FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_milk_records" ON milk_records FOR UPDATE TO anon USING (true);
CREATE POLICY "anon_delete_milk_records" ON milk_records FOR DELETE TO anon USING (true);
