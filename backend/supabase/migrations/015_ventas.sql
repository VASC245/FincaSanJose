-- ============================================================
-- 015_ventas.sql
-- Ventas e ingresos de la finca (leche, animales, otros)
-- ============================================================

CREATE TABLE IF NOT EXISTS ventas (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha       DATE        NOT NULL,
  tipo        TEXT        NOT NULL CHECK (tipo IN ('leche', 'animal', 'otro')),
  descripcion TEXT        NOT NULL,
  monto       NUMERIC(14,2) NOT NULL CHECK (monto >= 0),
  cantidad    NUMERIC(12,2),
  unidad      TEXT,
  comprador   TEXT,
  animal_id   UUID        REFERENCES animals(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ventas_fecha     ON ventas(fecha);
CREATE INDEX IF NOT EXISTS idx_ventas_tipo      ON ventas(tipo);
CREATE INDEX IF NOT EXISTS idx_ventas_animal_id ON ventas(animal_id);

-- RLS — mismo esquema que gastos (app pública sin auth, pendiente endurecer)
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_ventas"
  ON ventas FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_ventas"
  ON ventas FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_ventas"
  ON ventas FOR UPDATE TO anon USING (true);

CREATE POLICY "anon_delete_ventas"
  ON ventas FOR DELETE TO anon USING (true);

CREATE POLICY "authenticated_all_ventas"
  ON ventas FOR ALL TO authenticated USING (true) WITH CHECK (true);
