-- ============================================================
-- 007_pig_stages_heat.sql
-- Etapas productivas para cerdos + registros de celo en hembras
-- ============================================================

-- Etapa productiva en la tabla animals (solo aplica a porcinos)
ALTER TABLE animals
  ADD COLUMN IF NOT EXISTS stage TEXT
    CHECK (stage IN ('lactancia','destete','iniciacion','crecimiento','engorde','reproduccion'));

-- ============================================================
-- TABLA: heat_records
-- Registros de celo de hembras porcinas
-- ============================================================
CREATE TABLE IF NOT EXISTS heat_records (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id     UUID        NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  observed_date DATE        NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_heat_records_animal ON heat_records(animal_id);
CREATE INDEX IF NOT EXISTS idx_heat_records_date   ON heat_records(observed_date);

-- RLS
ALTER TABLE heat_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_heat_records"
  ON heat_records FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_heat_records"
  ON heat_records FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_heat_records"
  ON heat_records FOR UPDATE TO anon USING (true);
CREATE POLICY "anon_delete_heat_records"
  ON heat_records FOR DELETE TO anon USING (true);
