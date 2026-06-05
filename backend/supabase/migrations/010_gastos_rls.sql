-- ============================================================
-- 010_gastos_rls.sql
-- RLS para la tabla gastos (creada fuera de las migraciones)
-- ============================================================

-- Habilitar RLS (idempotente si ya estaba)
ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;

-- Políticas para rol anon (acceso completo — app pública sin auth)
CREATE POLICY "anon_select_gastos"
  ON gastos FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_gastos"
  ON gastos FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_gastos"
  ON gastos FOR UPDATE TO anon USING (true);

CREATE POLICY "anon_delete_gastos"
  ON gastos FOR DELETE TO anon USING (true);

-- Políticas para rol authenticated (acceso completo)
CREATE POLICY "authenticated_all_gastos"
  ON gastos FOR ALL TO authenticated USING (true) WITH CHECK (true);
