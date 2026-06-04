-- ============================================================
-- 005_anon_read_policies.sql
-- Permite lectura y escritura pública (anon) en todas las
-- tablas para desarrollo/demo. En producción se restringe.
-- ============================================================

CREATE POLICY "anon_read_animals"
  ON animals FOR SELECT TO anon USING (true);

CREATE POLICY "anon_write_animals"
  ON animals FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_animals"
  ON animals FOR UPDATE TO anon USING (true);

CREATE POLICY "anon_delete_animals"
  ON animals FOR DELETE TO anon USING (true);

-- cattle_details
CREATE POLICY "anon_all_cattle_details"
  ON cattle_details FOR ALL TO anon USING (true) WITH CHECK (true);

-- pig_details
CREATE POLICY "anon_all_pig_details"
  ON pig_details FOR ALL TO anon USING (true) WITH CHECK (true);

-- litters
CREATE POLICY "anon_all_litters"
  ON litters FOR ALL TO anon USING (true) WITH CHECK (true);

-- calf_births
CREATE POLICY "anon_all_calf_births"
  ON calf_births FOR ALL TO anon USING (true) WITH CHECK (true);

-- vaccination_records
CREATE POLICY "anon_all_vaccination_records"
  ON vaccination_records FOR ALL TO anon USING (true) WITH CHECK (true);

-- vaccines (ya tiene SELECT anon, agregamos escritura)
CREATE POLICY "anon_write_vaccines"
  ON vaccines FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_vaccines"
  ON vaccines FOR UPDATE TO anon USING (true);

-- inventory_categories (ya tiene SELECT anon)
CREATE POLICY "anon_write_inventory_categories"
  ON inventory_categories FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_inventory_categories"
  ON inventory_categories FOR UPDATE TO anon USING (true);

-- inventory_items
CREATE POLICY "anon_all_inventory_items"
  ON inventory_items FOR ALL TO anon USING (true) WITH CHECK (true);

-- inventory_movements
CREATE POLICY "anon_all_inventory_movements"
  ON inventory_movements FOR ALL TO anon USING (true) WITH CHECK (true);

-- tasks
CREATE POLICY "anon_all_tasks"
  ON tasks FOR ALL TO anon USING (true) WITH CHECK (true);
