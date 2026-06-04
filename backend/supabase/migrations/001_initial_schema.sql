-- ============================================================
-- 001_initial_schema.sql
-- Esquema inicial para sistema de gestión de finca agropecuaria
-- ============================================================

-- Extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- FUNCIÓN REUTILIZABLE PARA updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABLA: animals
-- Animales del sistema (bovinos y porcinos)
-- ============================================================
CREATE TABLE IF NOT EXISTS animals (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT,
  ear_tag       TEXT        UNIQUE,
  species       TEXT        NOT NULL CHECK (species IN ('cattle', 'pig')),
  sex           TEXT        NOT NULL CHECK (sex IN ('male', 'female')),
  birth_date    DATE,
  status        TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'sold', 'deceased', 'culled')),
  mother_id     UUID        REFERENCES animals(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_animals_ear_tag  ON animals(ear_tag);
CREATE INDEX IF NOT EXISTS idx_animals_species  ON animals(species);
CREATE INDEX IF NOT EXISTS idx_animals_status   ON animals(status);
CREATE INDEX IF NOT EXISTS idx_animals_mother_id ON animals(mother_id);

CREATE TRIGGER set_updated_at_animals
  BEFORE UPDATE ON animals
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- TABLA: cattle_details
-- Detalles reproductivos específicos de bovinos
-- ============================================================
CREATE TABLE IF NOT EXISTS cattle_details (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id         UUID        NOT NULL UNIQUE REFERENCES animals(id) ON DELETE CASCADE,
  is_pregnant       BOOLEAN     NOT NULL DEFAULT FALSE,
  conception_date   DATE,
  expected_birth    DATE,
  last_birth_date   DATE,
  birth_count       INTEGER     NOT NULL DEFAULT 0 CHECK (birth_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_cattle_details_animal_id   ON cattle_details(animal_id);
CREATE INDEX IF NOT EXISTS idx_cattle_details_is_pregnant ON cattle_details(is_pregnant);

-- ============================================================
-- TABLA: pig_details
-- Detalles reproductivos específicos de porcinos
-- ============================================================
CREATE TABLE IF NOT EXISTS pig_details (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id       UUID        NOT NULL UNIQUE REFERENCES animals(id) ON DELETE CASCADE,
  is_pregnant     BOOLEAN     NOT NULL DEFAULT FALSE,
  service_date    DATE,
  expected_birth  DATE,
  litter_count    INTEGER     NOT NULL DEFAULT 0 CHECK (litter_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_pig_details_animal_id   ON pig_details(animal_id);
CREATE INDEX IF NOT EXISTS idx_pig_details_is_pregnant ON pig_details(is_pregnant);

-- ============================================================
-- TABLA: litters
-- Registro de partos de cerdas (camadas)
-- ============================================================
CREATE TABLE IF NOT EXISTS litters (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sow_id      UUID        NOT NULL REFERENCES animals(id) ON DELETE RESTRICT,
  birth_date  DATE        NOT NULL,
  total_born  INTEGER     NOT NULL DEFAULT 0 CHECK (total_born >= 0),
  born_alive  INTEGER     NOT NULL DEFAULT 0 CHECK (born_alive >= 0),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_litters_sow_id     ON litters(sow_id);
CREATE INDEX IF NOT EXISTS idx_litters_birth_date ON litters(birth_date);

-- ============================================================
-- TABLA: calf_births
-- Registro de partos de vacas (terneros)
-- ============================================================
CREATE TABLE IF NOT EXISTS calf_births (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cow_id      UUID        NOT NULL REFERENCES animals(id) ON DELETE RESTRICT,
  birth_date  DATE        NOT NULL,
  calf_id     UUID        REFERENCES animals(id) ON DELETE SET NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calf_births_cow_id     ON calf_births(cow_id);
CREATE INDEX IF NOT EXISTS idx_calf_births_calf_id    ON calf_births(calf_id);
CREATE INDEX IF NOT EXISTS idx_calf_births_birth_date ON calf_births(birth_date);

-- ============================================================
-- TABLA: vaccines
-- Catálogo de vacunas disponibles
-- ============================================================
CREATE TABLE IF NOT EXISTS vaccines (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  description     TEXT,
  manufacturer    TEXT,
  disease_target  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vaccines_name ON vaccines(name);

-- ============================================================
-- TABLA: vaccination_records
-- Historial de vacunaciones por animal
-- ============================================================
CREATE TABLE IF NOT EXISTS vaccination_records (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id   UUID        NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  vaccine_id  UUID        NOT NULL REFERENCES vaccines(id) ON DELETE RESTRICT,
  applied_date DATE       NOT NULL,
  next_date   DATE,
  applied_by  TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vaccination_records_animal_id    ON vaccination_records(animal_id);
CREATE INDEX IF NOT EXISTS idx_vaccination_records_vaccine_id   ON vaccination_records(vaccine_id);
CREATE INDEX IF NOT EXISTS idx_vaccination_records_applied_date ON vaccination_records(applied_date);
CREATE INDEX IF NOT EXISTS idx_vaccination_records_next_date    ON vaccination_records(next_date);

-- ============================================================
-- TABLA: inventory_categories
-- Categorías del inventario
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLA: inventory_items
-- Ítems del inventario
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id  UUID        REFERENCES inventory_categories(id) ON DELETE SET NULL,
  name         TEXT        NOT NULL,
  quantity     NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit         TEXT        NOT NULL DEFAULT 'unidad',
  min_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_category_id ON inventory_items(category_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_name        ON inventory_items(name);

CREATE TRIGGER set_updated_at_inventory_items
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- TABLA: inventory_movements
-- Movimientos de inventario (entradas y salidas)
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_movements (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id   UUID        NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  type      TEXT        NOT NULL CHECK (type IN ('in', 'out', 'adjustment')),
  quantity  NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  date      DATE        NOT NULL DEFAULT CURRENT_DATE,
  notes     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_item_id ON inventory_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_date    ON inventory_movements(date);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_type    ON inventory_movements(type);

-- ============================================================
-- TABLA: tasks
-- Tareas y actividades de la finca
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  description TEXT,
  status      TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  priority    TEXT        NOT NULL DEFAULT 'medium'
                          CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date    DATE,
  category    TEXT        CHECK (category IN ('health', 'feeding', 'maintenance', 'reproduction', 'administrative', 'other')),
  animal_id   UUID        REFERENCES animals(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority  ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date  ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_animal_id ON tasks(animal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_category  ON tasks(category);

CREATE TRIGGER set_updated_at_tasks
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
