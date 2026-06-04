-- ============================================================
-- 002_rls_policies.sql
-- Row Level Security para todas las tablas
-- ============================================================

-- ============================================================
-- Habilitar RLS en todas las tablas
-- ============================================================
ALTER TABLE animals                ENABLE ROW LEVEL SECURITY;
ALTER TABLE cattle_details         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pig_details            ENABLE ROW LEVEL SECURITY;
ALTER TABLE litters                ENABLE ROW LEVEL SECURITY;
ALTER TABLE calf_births            ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaccines               ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaccination_records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                  ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLÍTICAS PARA USUARIOS AUTENTICADOS (acceso completo)
-- ============================================================

-- animals
CREATE POLICY "authenticated_all_animals"
  ON animals FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- cattle_details
CREATE POLICY "authenticated_all_cattle_details"
  ON cattle_details FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- pig_details
CREATE POLICY "authenticated_all_pig_details"
  ON pig_details FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- litters
CREATE POLICY "authenticated_all_litters"
  ON litters FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- calf_births
CREATE POLICY "authenticated_all_calf_births"
  ON calf_births FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- vaccines
CREATE POLICY "authenticated_all_vaccines"
  ON vaccines FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- vaccination_records
CREATE POLICY "authenticated_all_vaccination_records"
  ON vaccination_records FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- inventory_categories
CREATE POLICY "authenticated_all_inventory_categories"
  ON inventory_categories FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- inventory_items
CREATE POLICY "authenticated_all_inventory_items"
  ON inventory_items FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- inventory_movements
CREATE POLICY "authenticated_all_inventory_movements"
  ON inventory_movements FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- tasks
CREATE POLICY "authenticated_all_tasks"
  ON tasks FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- POLÍTICAS PARA USUARIOS ANÓNIMOS (solo lectura en catálogos)
-- ============================================================

-- anon puede leer vacunas (catálogo público de referencia)
CREATE POLICY "anon_select_vaccines"
  ON vaccines FOR SELECT
  TO anon
  USING (true);

-- anon puede leer categorías de inventario (catálogo público de referencia)
CREATE POLICY "anon_select_inventory_categories"
  ON inventory_categories FOR SELECT
  TO anon
  USING (true);
