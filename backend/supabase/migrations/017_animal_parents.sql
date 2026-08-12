-- ============================================================
-- 017_animal_parents.sql
-- Genealogía: padre y madre de cada animal. mother_id ya existía;
-- se agrega father_id (si el padre está registrado) y campos de
-- texto para padres no registrados (ej. toro de la pajuela).
-- ============================================================

ALTER TABLE animals
  ADD COLUMN IF NOT EXISTS father_id   UUID REFERENCES animals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mother_name TEXT,
  ADD COLUMN IF NOT EXISTS father_name TEXT;

CREATE INDEX IF NOT EXISTS idx_animals_mother_id ON animals(mother_id);
CREATE INDEX IF NOT EXISTS idx_animals_father_id ON animals(father_id);
