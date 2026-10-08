-- ============================================================
-- 023_animal_rfid.sql
-- Número del chip RFID (arete electrónico) de cada animal, para
-- abrir su ficha al leerlo con un lector. Se guarda solo con
-- dígitos y letras, sin espacios (ej. 982000123456789).
-- ============================================================

ALTER TABLE animals
  ADD COLUMN IF NOT EXISTS rfid_tag TEXT;

-- Un mismo chip no puede estar en dos animales
CREATE UNIQUE INDEX IF NOT EXISTS idx_animals_rfid_tag
  ON animals(rfid_tag)
  WHERE rfid_tag IS NOT NULL;
