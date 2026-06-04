-- ============================================================
-- 004_functions.sql
-- Funciones PostgreSQL y triggers de lógica de negocio
-- ============================================================

-- ============================================================
-- 1. FUNCIÓN: get_dashboard_stats()
-- Retorna un JSON con estadísticas globales del sistema
-- Uso: SELECT get_dashboard_stats();
-- ============================================================
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_cattle     INTEGER;
  v_total_pigs       INTEGER;
  v_pregnant_cows    INTEGER;
  v_pregnant_sows    INTEGER;
  v_pending_tasks    INTEGER;
  v_low_stock_items  INTEGER;
BEGIN
  -- Total bovinos activos
  SELECT COUNT(*) INTO v_total_cattle
    FROM animals
   WHERE species = 'cattle' AND status = 'active';

  -- Total porcinos activos
  SELECT COUNT(*) INTO v_total_pigs
    FROM animals
   WHERE species = 'pig' AND status = 'active';

  -- Vacas preñadas
  SELECT COUNT(*) INTO v_pregnant_cows
    FROM cattle_details cd
    JOIN animals a ON a.id = cd.animal_id
   WHERE cd.is_pregnant = TRUE AND a.status = 'active';

  -- Cerdas preñadas
  SELECT COUNT(*) INTO v_pregnant_sows
    FROM pig_details pd
    JOIN animals a ON a.id = pd.animal_id
   WHERE pd.is_pregnant = TRUE AND a.sex = 'female' AND a.status = 'active';

  -- Tareas pendientes o en progreso
  SELECT COUNT(*) INTO v_pending_tasks
    FROM tasks
   WHERE status IN ('pending', 'in_progress');

  -- Ítems con stock por debajo del mínimo
  SELECT COUNT(*) INTO v_low_stock_items
    FROM inventory_items
   WHERE quantity <= min_quantity AND min_quantity > 0;

  RETURN jsonb_build_object(
    'total_cattle',    v_total_cattle,
    'total_pigs',      v_total_pigs,
    'pregnant_cows',   v_pregnant_cows,
    'pregnant_sows',   v_pregnant_sows,
    'pending_tasks',   v_pending_tasks,
    'low_stock_items', v_low_stock_items
  );
END;
$$;

-- ============================================================
-- 2. TRIGGER FUNCTION: update_inventory_quantity()
-- Actualiza inventory_items.quantity al insertar un movimiento
-- ============================================================
CREATE OR REPLACE FUNCTION update_inventory_quantity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.type = 'in' THEN
    -- Entrada: suma la cantidad
    UPDATE inventory_items
       SET quantity = quantity + NEW.quantity
     WHERE id = NEW.item_id;

  ELSIF NEW.type = 'out' THEN
    -- Salida: valida que haya stock suficiente y resta
    IF (SELECT quantity FROM inventory_items WHERE id = NEW.item_id) < NEW.quantity THEN
      RAISE EXCEPTION 'Stock insuficiente para el ítem %. Disponible: %, Solicitado: %',
        NEW.item_id,
        (SELECT quantity FROM inventory_items WHERE id = NEW.item_id),
        NEW.quantity;
    END IF;
    UPDATE inventory_items
       SET quantity = quantity - NEW.quantity
     WHERE id = NEW.item_id;

  ELSIF NEW.type = 'adjustment' THEN
    -- Ajuste: establece la cantidad directamente
    UPDATE inventory_items
       SET quantity = NEW.quantity
     WHERE id = NEW.item_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger que dispara la función al insertar un movimiento
CREATE TRIGGER trg_update_inventory_quantity
  AFTER INSERT ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION update_inventory_quantity();

-- ============================================================
-- 3. TRIGGER FUNCTION: update_pig_litter_count()
-- Incrementa pig_details.litter_count al registrar una camada
-- También actualiza last_birth_date implícito en pig_details
-- ============================================================
CREATE OR REPLACE FUNCTION update_pig_litter_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE pig_details
     SET litter_count  = litter_count + 1,
         is_pregnant   = FALSE,
         service_date  = NULL,
         expected_birth = NULL
   WHERE animal_id = NEW.sow_id;

  RETURN NEW;
END;
$$;

-- Trigger que dispara la función al insertar una camada
CREATE TRIGGER trg_update_pig_litter_count
  AFTER INSERT ON litters
  FOR EACH ROW EXECUTE FUNCTION update_pig_litter_count();

-- ============================================================
-- 4. TRIGGER FUNCTION: update_cow_birth_count()
-- Incrementa cattle_details.birth_count al registrar un parto
-- También marca la vaca como no preñada y actualiza last_birth_date
-- ============================================================
CREATE OR REPLACE FUNCTION update_cow_birth_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE cattle_details
     SET birth_count      = birth_count + 1,
         last_birth_date  = NEW.birth_date,
         is_pregnant      = FALSE,
         conception_date  = NULL,
         expected_birth   = NULL
   WHERE animal_id = NEW.cow_id;

  RETURN NEW;
END;
$$;

-- Trigger que dispara la función al insertar un parto bovino
CREATE TRIGGER trg_update_cow_birth_count
  AFTER INSERT ON calf_births
  FOR EACH ROW EXECUTE FUNCTION update_cow_birth_count();

-- ============================================================
-- 5. FUNCIÓN AUXILIAR: get_upcoming_births(days_ahead INTEGER)
-- Retorna animales con parto esperado en los próximos N días
-- Uso: SELECT * FROM get_upcoming_births(7);
-- ============================================================
CREATE OR REPLACE FUNCTION get_upcoming_births(days_ahead INTEGER DEFAULT 7)
RETURNS TABLE (
  animal_id     UUID,
  animal_name   TEXT,
  ear_tag       TEXT,
  species       TEXT,
  expected_birth DATE,
  days_remaining INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Bovinos próximos a parir
  RETURN QUERY
    SELECT
      a.id              AS animal_id,
      a.name            AS animal_name,
      a.ear_tag         AS ear_tag,
      a.species         AS species,
      cd.expected_birth AS expected_birth,
      (cd.expected_birth - CURRENT_DATE)::INTEGER AS days_remaining
    FROM cattle_details cd
    JOIN animals a ON a.id = cd.animal_id
   WHERE cd.is_pregnant = TRUE
     AND cd.expected_birth IS NOT NULL
     AND cd.expected_birth <= (CURRENT_DATE + days_ahead)
     AND a.status = 'active'

  UNION ALL

  -- Porcinos próximos a parir
  SELECT
    a.id              AS animal_id,
    a.name            AS animal_name,
    a.ear_tag         AS ear_tag,
    a.species         AS species,
    pd.expected_birth AS expected_birth,
    (pd.expected_birth - CURRENT_DATE)::INTEGER AS days_remaining
  FROM pig_details pd
  JOIN animals a ON a.id = pd.animal_id
  WHERE pd.is_pregnant = TRUE
    AND pd.expected_birth IS NOT NULL
    AND pd.expected_birth <= (CURRENT_DATE + days_ahead)
    AND a.status = 'active'

  ORDER BY days_remaining ASC;
END;
$$;

-- ============================================================
-- 6. FUNCIÓN AUXILIAR: get_low_stock_items()
-- Retorna ítems de inventario con stock bajo
-- Uso: SELECT * FROM get_low_stock_items();
-- ============================================================
CREATE OR REPLACE FUNCTION get_low_stock_items()
RETURNS TABLE (
  item_id      UUID,
  item_name    TEXT,
  category     TEXT,
  quantity     NUMERIC,
  min_quantity NUMERIC,
  unit         TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    SELECT
      ii.id                  AS item_id,
      ii.name                AS item_name,
      ic.name                AS category,
      ii.quantity            AS quantity,
      ii.min_quantity        AS min_quantity,
      ii.unit                AS unit
    FROM inventory_items ii
    LEFT JOIN inventory_categories ic ON ic.id = ii.category_id
   WHERE ii.quantity <= ii.min_quantity
     AND ii.min_quantity > 0
   ORDER BY (ii.min_quantity - ii.quantity) DESC;
END;
$$;
