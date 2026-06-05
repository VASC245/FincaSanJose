CREATE TABLE IF NOT EXISTS insemination_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  animal_id UUID NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  insemination_date DATE NOT NULL,
  semen_source TEXT,
  expected_birth DATE,
  heat_check_date DATE,
  pregnancy_confirmed BOOLEAN DEFAULT NULL,
  pregnancy_confirmed_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE insemination_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_insemination_records" ON insemination_records FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_insemination_records" ON insemination_records FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_insemination_records" ON insemination_records FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_insemination_records" ON insemination_records FOR DELETE TO anon USING (true);
CREATE POLICY "authenticated_all_insemination_records" ON insemination_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
