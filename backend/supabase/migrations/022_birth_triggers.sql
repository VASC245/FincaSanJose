-- ============================================================
-- 022_birth_triggers.sql
-- Partos y camadas: contadores correctos.
--
-- * Registrar un parto VIEJO (ej. "la 7 parió en marzo") ya no
--   borra la preñez actual ni mueve el último parto hacia atrás.
-- * Si el animal no tenía fila de detalle, se crea (antes el
--   UPDATE no tocaba nada y el contador se perdía).
-- * Borrar un parto o una camada ahora resta del contador.
-- ============================================================

-- ─── Bovinos ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_cow_birth_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO cattle_details (animal_id, birth_count, last_birth_date)
  VALUES (NEW.cow_id, 1, NEW.birth_date)
  ON CONFLICT (animal_id) DO UPDATE
     SET birth_count     = cattle_details.birth_count + 1,
         last_birth_date = GREATEST(COALESCE(cattle_details.last_birth_date, NEW.birth_date), NEW.birth_date),
         -- Solo cierra la preñez si este parto es de esa preñez (no anterior a la concepción)
         is_pregnant     = CASE WHEN cattle_details.conception_date IS NULL
                                  OR NEW.birth_date >= cattle_details.conception_date
                                THEN FALSE ELSE cattle_details.is_pregnant END,
         conception_date = CASE WHEN cattle_details.conception_date IS NULL
                                  OR NEW.birth_date >= cattle_details.conception_date
                                THEN NULL ELSE cattle_details.conception_date END,
         expected_birth  = CASE WHEN cattle_details.conception_date IS NULL
                                  OR NEW.birth_date >= cattle_details.conception_date
                                THEN NULL ELSE cattle_details.expected_birth END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION undo_cow_birth_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE cattle_details
     SET birth_count     = GREATEST(birth_count - 1, 0),
         -- Solo se recalcula si se borró justo el último parto
         last_birth_date = CASE WHEN last_birth_date = OLD.birth_date
                                THEN (SELECT MAX(birth_date) FROM calf_births WHERE cow_id = OLD.cow_id)
                                ELSE last_birth_date END
   WHERE animal_id = OLD.cow_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_undo_cow_birth_count ON calf_births;
CREATE TRIGGER trg_undo_cow_birth_count
  AFTER DELETE ON calf_births
  FOR EACH ROW EXECUTE FUNCTION undo_cow_birth_count();

-- ─── Porcinos ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_pig_litter_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO pig_details (animal_id, litter_count)
  VALUES (NEW.sow_id, 1)
  ON CONFLICT (animal_id) DO UPDATE
     SET litter_count   = pig_details.litter_count + 1,
         is_pregnant    = CASE WHEN pig_details.service_date IS NULL
                                 OR NEW.birth_date >= pig_details.service_date
                               THEN FALSE ELSE pig_details.is_pregnant END,
         service_date   = CASE WHEN pig_details.service_date IS NULL
                                 OR NEW.birth_date >= pig_details.service_date
                               THEN NULL ELSE pig_details.service_date END,
         expected_birth = CASE WHEN pig_details.service_date IS NULL
                                 OR NEW.birth_date >= pig_details.service_date
                               THEN NULL ELSE pig_details.expected_birth END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION undo_pig_litter_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE pig_details
     SET litter_count = GREATEST(litter_count - 1, 0)
   WHERE animal_id = OLD.sow_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_undo_pig_litter_count ON litters;
CREATE TRIGGER trg_undo_pig_litter_count
  AFTER DELETE ON litters
  FOR EACH ROW EXECUTE FUNCTION undo_pig_litter_count();
