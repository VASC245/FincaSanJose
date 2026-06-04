-- Ordeños: producción total del hato por día (sin desglose por vaca)
CREATE TABLE IF NOT EXISTS milk_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
  liters        NUMERIC(8,2) NOT NULL CHECK (liters >= 0),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS milk_sessions_date_idx ON milk_sessions(recorded_date DESC);

ALTER TABLE milk_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_milk_sessions" ON milk_sessions FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_milk_sessions" ON milk_sessions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_milk_sessions" ON milk_sessions FOR UPDATE TO anon USING (true);
CREATE POLICY "anon_delete_milk_sessions" ON milk_sessions FOR DELETE TO anon USING (true);
