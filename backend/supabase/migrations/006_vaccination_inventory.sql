-- ============================================================
-- 006_vaccination_inventory.sql
-- Vincula registros de vacunación con ítems del inventario
-- ============================================================

-- Hacer vaccine_id nullable (ya no es obligatorio)
ALTER TABLE vaccination_records
  ALTER COLUMN vaccine_id DROP NOT NULL;

-- Añadir referencia al ítem de inventario usado
ALTER TABLE vaccination_records
  ADD COLUMN IF NOT EXISTS inventory_item_id UUID
    REFERENCES inventory_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vaccination_inventory_item
  ON vaccination_records(inventory_item_id);
