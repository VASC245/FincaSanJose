-- =============================================================================
-- FINCA AGROPECUARIA — Esquema de Base de Datos Completo
-- Sistema de gestión: Animales (bovinos/porcinos), Inventario, Tareas
-- Base: PostgreSQL 15+ / Supabase
-- =============================================================================

-- Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- SECCIÓN 1: MÓDULO DE ANIMALES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabla: animals
-- Tabla base unificada para todos los animales de la finca (vacas y cerdos).
-- Usa una sola tabla con discriminador `species` para facilitar consultas
-- cruzadas, historial de vacunas y tareas compartidas.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS animals (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT,
    ear_tag     TEXT        UNIQUE NOT NULL,
    species     TEXT        NOT NULL CHECK (species IN ('cow', 'pig')),
    sex         TEXT        NOT NULL CHECK (sex IN ('male', 'female')),
    birth_date  DATE,
    status      TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'sold', 'deceased')),
    mother_id   UUID        REFERENCES animals(id) ON DELETE SET NULL,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE animals IS 'Tabla base unificada para todos los animales de la finca (bovinos y porcinos).';
COMMENT ON COLUMN animals.id IS 'Identificador único del animal (UUID).';
COMMENT ON COLUMN animals.name IS 'Nombre o alias del animal (opcional).';
COMMENT ON COLUMN animals.ear_tag IS 'Número de arete o caravana. Único e irrepetible en toda la finca.';
COMMENT ON COLUMN animals.species IS 'Especie del animal: cow (bovino) o pig (porcino).';
COMMENT ON COLUMN animals.sex IS 'Sexo del animal: male (macho) o female (hembra).';
COMMENT ON COLUMN animals.birth_date IS 'Fecha de nacimiento del animal.';
COMMENT ON COLUMN animals.status IS 'Estado del animal: active (en finca), sold (vendido), deceased (fallecido).';
COMMENT ON COLUMN animals.mother_id IS 'Referencia auto-referencial a la madre del animal (nullable).';
COMMENT ON COLUMN animals.notes IS 'Observaciones generales del animal.';

-- -----------------------------------------------------------------------------
-- Tabla: cattle_details
-- Información específica de bovinos (extensión 1:1 de animals donde species=cow).
-- Separada para no contaminar la tabla base con columnas nulas para cerdos.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cattle_details (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    animal_id         UUID        NOT NULL UNIQUE REFERENCES animals(id) ON DELETE CASCADE,
    is_pregnant       BOOLEAN     NOT NULL DEFAULT false,
    conception_date   DATE,
    expected_birth    DATE,
    last_birth_date   DATE,
    birth_count       INTEGER     NOT NULL DEFAULT 0 CHECK (birth_count >= 0),
    weight_kg         NUMERIC(7,2) CHECK (weight_kg > 0)
);

COMMENT ON TABLE cattle_details IS 'Datos específicos de bovinos: preñez, partos, peso. Relación 1:1 con animals (species=cow).';
COMMENT ON COLUMN cattle_details.animal_id IS 'Referencia única al animal bovino en la tabla animals.';
COMMENT ON COLUMN cattle_details.is_pregnant IS 'Indica si la vaca está actualmente preñada.';
COMMENT ON COLUMN cattle_details.conception_date IS 'Fecha estimada de concepción.';
COMMENT ON COLUMN cattle_details.expected_birth IS 'Fecha probable de parto calculada (conception_date + ~283 días).';
COMMENT ON COLUMN cattle_details.last_birth_date IS 'Fecha del último parto registrado.';
COMMENT ON COLUMN cattle_details.birth_count IS 'Número total de partos acumulados.';
COMMENT ON COLUMN cattle_details.weight_kg IS 'Peso del animal en kilogramos.';

-- -----------------------------------------------------------------------------
-- Tabla: pig_details
-- Información específica de porcinos (extensión 1:1 de animals donde species=pig).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pig_details (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    animal_id       UUID        NOT NULL UNIQUE REFERENCES animals(id) ON DELETE CASCADE,
    is_pregnant     BOOLEAN     NOT NULL DEFAULT false,
    service_date    DATE,
    expected_birth  DATE,
    litter_count    INTEGER     NOT NULL DEFAULT 0 CHECK (litter_count >= 0),
    weight_kg       NUMERIC(7,2) CHECK (weight_kg > 0)
);

COMMENT ON TABLE pig_details IS 'Datos específicos de porcinos: servicio, preñez, camadas, peso. Relación 1:1 con animals (species=pig).';
COMMENT ON COLUMN pig_details.animal_id IS 'Referencia única al animal porcino en la tabla animals.';
COMMENT ON COLUMN pig_details.is_pregnant IS 'Indica si la cerda está actualmente preñada.';
COMMENT ON COLUMN pig_details.service_date IS 'Fecha del último servicio/monta registrado.';
COMMENT ON COLUMN pig_details.expected_birth IS 'Fecha probable de parto (service_date + ~114 días).';
COMMENT ON COLUMN pig_details.litter_count IS 'Número total de camadas acumuladas.';
COMMENT ON COLUMN pig_details.weight_kg IS 'Peso del animal en kilogramos.';

-- -----------------------------------------------------------------------------
-- Tabla: litters
-- Registra cada camada (parto grupal) de una cerda.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS litters (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    sow_id      UUID        NOT NULL REFERENCES animals(id) ON DELETE RESTRICT,
    birth_date  DATE        NOT NULL,
    total_born  INTEGER     CHECK (total_born >= 0),
    born_alive  INTEGER     CHECK (born_alive >= 0),
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT born_alive_lte_total CHECK (
        born_alive IS NULL OR total_born IS NULL OR born_alive <= total_born
    )
);

COMMENT ON TABLE litters IS 'Camadas de cerdas. Cada fila representa un evento de parto porcino.';
COMMENT ON COLUMN litters.sow_id IS 'Referencia a la cerda madre del parto (species=pig, sex=female).';
COMMENT ON COLUMN litters.birth_date IS 'Fecha en que ocurrió el parto de la camada.';
COMMENT ON COLUMN litters.total_born IS 'Total de lechones nacidos (vivos + muertos).';
COMMENT ON COLUMN litters.born_alive IS 'Número de lechones nacidos vivos.';

-- -----------------------------------------------------------------------------
-- Tabla: piglet_assignments
-- Tabla de unión entre camadas y los lechones individuales registrados.
-- Permite rastrear qué animal (lechón) pertenece a qué camada.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS piglet_assignments (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    litter_id   UUID    NOT NULL REFERENCES litters(id) ON DELETE CASCADE,
    piglet_id   UUID    NOT NULL REFERENCES animals(id) ON DELETE CASCADE,

    CONSTRAINT piglet_assignments_unique UNIQUE (litter_id, piglet_id)
);

COMMENT ON TABLE piglet_assignments IS 'Asignación de lechones individuales (animals) a su camada (litters).';
COMMENT ON COLUMN piglet_assignments.litter_id IS 'Camada a la que pertenece el lechón.';
COMMENT ON COLUMN piglet_assignments.piglet_id IS 'Animal lechón registrado individualmente.';

-- -----------------------------------------------------------------------------
-- Tabla: calf_births
-- Registra los partos individuales de vacas y vincula con el ternero nacido.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calf_births (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    cow_id      UUID        NOT NULL REFERENCES animals(id) ON DELETE RESTRICT,
    birth_date  DATE        NOT NULL,
    calf_id     UUID        REFERENCES animals(id) ON DELETE SET NULL,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE calf_births IS 'Registro de partos bovinos. Cada fila es un evento de parto de una vaca.';
COMMENT ON COLUMN calf_births.cow_id IS 'Referencia a la vaca madre (species=cow, sex=female).';
COMMENT ON COLUMN calf_births.birth_date IS 'Fecha en que ocurrió el parto.';
COMMENT ON COLUMN calf_births.calf_id IS 'Referencia al ternero nacido si fue registrado individualmente (nullable).';

-- =============================================================================
-- SECCIÓN 2: MÓDULO DE VACUNAS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabla: vaccines
-- Catálogo maestro de vacunas disponibles en la finca.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vaccines (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT        NOT NULL,
    description     TEXT,
    manufacturer    TEXT,
    disease_target  TEXT,
    species_target  TEXT        NOT NULL CHECK (species_target IN ('cow', 'pig', 'both')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vaccines IS 'Catálogo de vacunas utilizadas en la finca.';
COMMENT ON COLUMN vaccines.name IS 'Nombre comercial o genérico de la vacuna.';
COMMENT ON COLUMN vaccines.disease_target IS 'Enfermedad o patógeno contra el que protege.';
COMMENT ON COLUMN vaccines.species_target IS 'Especie a la que aplica: cow, pig o both (ambas).';
COMMENT ON COLUMN vaccines.manufacturer IS 'Laboratorio o fabricante del biológico.';

-- -----------------------------------------------------------------------------
-- Tabla: vaccination_records
-- Registro histórico de aplicaciones de vacunas por animal.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vaccination_records (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    animal_id       UUID        NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    vaccine_id      UUID        NOT NULL REFERENCES vaccines(id) ON DELETE RESTRICT,
    applied_date    DATE        NOT NULL,
    next_date       DATE,
    applied_by      TEXT,
    batch_number    TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT next_date_after_applied CHECK (
        next_date IS NULL OR next_date > applied_date
    )
);

COMMENT ON TABLE vaccination_records IS 'Historial de vacunaciones aplicadas a cada animal.';
COMMENT ON COLUMN vaccination_records.animal_id IS 'Animal al que se aplicó la vacuna.';
COMMENT ON COLUMN vaccination_records.vaccine_id IS 'Vacuna aplicada (referencia al catálogo).';
COMMENT ON COLUMN vaccination_records.applied_date IS 'Fecha en que se aplicó la vacuna.';
COMMENT ON COLUMN vaccination_records.next_date IS 'Fecha programada para la próxima dosis o refuerzo.';
COMMENT ON COLUMN vaccination_records.applied_by IS 'Nombre del veterinario o persona que aplicó la vacuna.';
COMMENT ON COLUMN vaccination_records.batch_number IS 'Número de lote del biológico aplicado.';

-- =============================================================================
-- SECCIÓN 3: MÓDULO DE INVENTARIO
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabla: inventory_categories
-- Categorías para organizar los ítems de inventario.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_categories (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE inventory_categories IS 'Categorías para clasificar los ítems del inventario (medicamentos, alimentos, herramientas, etc.).';
COMMENT ON COLUMN inventory_categories.name IS 'Nombre único de la categoría.';

-- -----------------------------------------------------------------------------
-- Tabla: inventory_items
-- Ítems del inventario. La cantidad disponible se calcula desde los movimientos.
-- El campo quantity se mantiene como caché y se actualiza mediante triggers.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_items (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id     UUID        REFERENCES inventory_categories(id) ON DELETE SET NULL,
    name            TEXT        NOT NULL,
    quantity        NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    unit            TEXT        NOT NULL,
    min_quantity    NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE inventory_items IS 'Ítems del inventario de la finca.';
COMMENT ON COLUMN inventory_items.category_id IS 'Categoría del ítem (nullable si la categoría es eliminada).';
COMMENT ON COLUMN inventory_items.quantity IS 'Stock actual calculado a partir de movimientos (in - out). Mantenido como caché.';
COMMENT ON COLUMN inventory_items.unit IS 'Unidad de medida (kg, litros, unidades, dosis, etc.).';
COMMENT ON COLUMN inventory_items.min_quantity IS 'Cantidad mínima de alerta. Si quantity <= min_quantity, el ítem está en stock bajo.';

-- -----------------------------------------------------------------------------
-- Tabla: inventory_movements
-- Registro de entradas y salidas del inventario.
-- El historial completo permite auditar y recalcular el stock en cualquier momento.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_movements (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id     UUID        NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    type        TEXT        NOT NULL CHECK (type IN ('in', 'out')),
    quantity    NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
    date        DATE        NOT NULL,
    reference   TEXT,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE inventory_movements IS 'Movimientos de inventario (entradas y salidas). Fuente de verdad del stock.';
COMMENT ON COLUMN inventory_movements.item_id IS 'Ítem de inventario afectado por el movimiento.';
COMMENT ON COLUMN inventory_movements.type IS 'Tipo de movimiento: in (entrada/compra) o out (salida/uso).';
COMMENT ON COLUMN inventory_movements.quantity IS 'Cantidad del movimiento. Siempre positiva; el tipo determina el sentido.';
COMMENT ON COLUMN inventory_movements.date IS 'Fecha en que ocurrió el movimiento.';
COMMENT ON COLUMN inventory_movements.reference IS 'Referencia externa: número de factura, orden, etc.';

-- =============================================================================
-- SECCIÓN 4: MÓDULO DE TAREAS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabla: tasks
-- Gestión de tareas y actividades de la finca.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT        NOT NULL,
    description TEXT,
    status      TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'in_progress', 'completed')),
    priority    TEXT        NOT NULL DEFAULT 'medium'
                            CHECK (priority IN ('high', 'medium', 'low')),
    due_date    DATE,
    category    TEXT        CHECK (category IN ('health', 'feeding', 'maintenance', 'reproduction', 'other')),
    animal_id   UUID        REFERENCES animals(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tasks IS 'Tareas y actividades de gestión de la finca.';
COMMENT ON COLUMN tasks.title IS 'Título breve y descriptivo de la tarea.';
COMMENT ON COLUMN tasks.status IS 'Estado: pending (pendiente), in_progress (en curso), completed (completada).';
COMMENT ON COLUMN tasks.priority IS 'Prioridad: high (alta), medium (media), low (baja).';
COMMENT ON COLUMN tasks.due_date IS 'Fecha límite o programada para completar la tarea.';
COMMENT ON COLUMN tasks.category IS 'Categoría funcional de la tarea (salud, alimentación, mantenimiento, etc.).';
COMMENT ON COLUMN tasks.animal_id IS 'Animal relacionado con la tarea (opcional).';

-- =============================================================================
-- SECCIÓN 5: TRIGGERS Y FUNCIONES AUXILIARES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Función: update_updated_at()
-- Actualiza automáticamente updated_at en cualquier tabla que la use.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_updated_at() IS 'Trigger function: actualiza updated_at al momento de cada UPDATE.';

-- Trigger en animals
CREATE TRIGGER trg_animals_updated_at
    BEFORE UPDATE ON animals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger en inventory_items
CREATE TRIGGER trg_inventory_items_updated_at
    BEFORE UPDATE ON inventory_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger en tasks
CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -----------------------------------------------------------------------------
-- Función: update_inventory_quantity()
-- Actualiza el stock caché en inventory_items tras cada movimiento.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_inventory_quantity()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.type = 'in' THEN
            UPDATE inventory_items SET quantity = quantity + NEW.quantity, updated_at = NOW()
            WHERE id = NEW.item_id;
        ELSIF NEW.type = 'out' THEN
            UPDATE inventory_items SET quantity = quantity - NEW.quantity, updated_at = NOW()
            WHERE id = NEW.item_id;
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.type = 'in' THEN
            UPDATE inventory_items SET quantity = quantity - OLD.quantity, updated_at = NOW()
            WHERE id = OLD.item_id;
        ELSIF OLD.type = 'out' THEN
            UPDATE inventory_items SET quantity = quantity + OLD.quantity, updated_at = NOW()
            WHERE id = OLD.item_id;
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Revertir el efecto anterior y aplicar el nuevo
        IF OLD.type = 'in' THEN
            UPDATE inventory_items SET quantity = quantity - OLD.quantity WHERE id = OLD.item_id;
        ELSE
            UPDATE inventory_items SET quantity = quantity + OLD.quantity WHERE id = OLD.item_id;
        END IF;

        IF NEW.type = 'in' THEN
            UPDATE inventory_items SET quantity = quantity + NEW.quantity, updated_at = NOW()
            WHERE id = NEW.item_id;
        ELSE
            UPDATE inventory_items SET quantity = quantity - NEW.quantity, updated_at = NOW()
            WHERE id = NEW.item_id;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_inventory_quantity() IS 'Mantiene sincronizado el stock caché (inventory_items.quantity) con los movimientos registrados.';

CREATE TRIGGER trg_inventory_movements_sync
    AFTER INSERT OR UPDATE OR DELETE ON inventory_movements
    FOR EACH ROW EXECUTE FUNCTION update_inventory_quantity();

-- -----------------------------------------------------------------------------
-- Función: validate_animal_species_for_details()
-- Verifica que cattle_details solo aplique a vacas y pig_details solo a cerdos.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_cattle_species()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT species FROM animals WHERE id = NEW.animal_id) != 'cow' THEN
        RAISE EXCEPTION 'cattle_details solo puede asociarse a animales con species = cow';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cattle_details_species_check
    BEFORE INSERT OR UPDATE ON cattle_details
    FOR EACH ROW EXECUTE FUNCTION validate_cattle_species();

CREATE OR REPLACE FUNCTION validate_pig_species()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT species FROM animals WHERE id = NEW.animal_id) != 'pig' THEN
        RAISE EXCEPTION 'pig_details solo puede asociarse a animales con species = pig';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pig_details_species_check
    BEFORE INSERT OR UPDATE ON pig_details
    FOR EACH ROW EXECUTE FUNCTION validate_pig_species();

-- -----------------------------------------------------------------------------
-- Función: validate_litter_sow()
-- Verifica que la madre de una camada sea una cerda hembra activa.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_litter_sow()
RETURNS TRIGGER AS $$
DECLARE
    v_species TEXT;
    v_sex TEXT;
BEGIN
    SELECT species, sex INTO v_species, v_sex FROM animals WHERE id = NEW.sow_id;
    IF v_species != 'pig' OR v_sex != 'female' THEN
        RAISE EXCEPTION 'El sow_id debe referenciar una cerda (species=pig, sex=female)';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_litter_sow_check
    BEFORE INSERT OR UPDATE ON litters
    FOR EACH ROW EXECUTE FUNCTION validate_litter_sow();

-- -----------------------------------------------------------------------------
-- Función: validate_calf_birth_cow()
-- Verifica que la madre en calf_births sea una vaca hembra.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_calf_birth_cow()
RETURNS TRIGGER AS $$
DECLARE
    v_species TEXT;
    v_sex TEXT;
BEGIN
    SELECT species, sex INTO v_species, v_sex FROM animals WHERE id = NEW.cow_id;
    IF v_species != 'cow' OR v_sex != 'female' THEN
        RAISE EXCEPTION 'El cow_id debe referenciar una vaca (species=cow, sex=female)';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calf_birth_cow_check
    BEFORE INSERT OR UPDATE ON calf_births
    FOR EACH ROW EXECUTE FUNCTION validate_calf_birth_cow();

-- -----------------------------------------------------------------------------
-- Función: increment_birth_count_cattle()
-- Incrementa birth_count en cattle_details cuando se registra un parto bovino.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_birth_count_cattle()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE cattle_details
    SET birth_count = birth_count + 1,
        last_birth_date = NEW.birth_date,
        is_pregnant = false,
        conception_date = NULL,
        expected_birth = NULL
    WHERE animal_id = NEW.cow_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calf_birth_increment
    AFTER INSERT ON calf_births
    FOR EACH ROW EXECUTE FUNCTION increment_birth_count_cattle();

-- -----------------------------------------------------------------------------
-- Función: increment_litter_count_pig()
-- Incrementa litter_count en pig_details cuando se registra una camada.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_litter_count_pig()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE pig_details
    SET litter_count = litter_count + 1,
        is_pregnant = false,
        service_date = NULL,
        expected_birth = NULL
    WHERE animal_id = NEW.sow_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_litter_increment
    AFTER INSERT ON litters
    FOR EACH ROW EXECUTE FUNCTION increment_litter_count_pig();

-- =============================================================================
-- SECCIÓN 6: ÍNDICES
-- =============================================================================

-- animals
CREATE INDEX IF NOT EXISTS idx_animals_species  ON animals(species);
CREATE INDEX IF NOT EXISTS idx_animals_status   ON animals(status);
CREATE INDEX IF NOT EXISTS idx_animals_mother   ON animals(mother_id);
CREATE INDEX IF NOT EXISTS idx_animals_species_status ON animals(species, status);

-- cattle_details
CREATE INDEX IF NOT EXISTS idx_cattle_details_pregnant ON cattle_details(is_pregnant) WHERE is_pregnant = true;
CREATE INDEX IF NOT EXISTS idx_cattle_expected_birth   ON cattle_details(expected_birth) WHERE expected_birth IS NOT NULL;

-- pig_details
CREATE INDEX IF NOT EXISTS idx_pig_details_pregnant  ON pig_details(is_pregnant) WHERE is_pregnant = true;
CREATE INDEX IF NOT EXISTS idx_pig_expected_birth     ON pig_details(expected_birth) WHERE expected_birth IS NOT NULL;

-- litters
CREATE INDEX IF NOT EXISTS idx_litters_sow      ON litters(sow_id);
CREATE INDEX IF NOT EXISTS idx_litters_date     ON litters(birth_date DESC);

-- calf_births
CREATE INDEX IF NOT EXISTS idx_calf_births_cow  ON calf_births(cow_id);
CREATE INDEX IF NOT EXISTS idx_calf_births_date ON calf_births(birth_date DESC);

-- vaccination_records
CREATE INDEX IF NOT EXISTS idx_vacc_animal      ON vaccination_records(animal_id);
CREATE INDEX IF NOT EXISTS idx_vacc_next_date   ON vaccination_records(next_date) WHERE next_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vacc_applied     ON vaccination_records(applied_date DESC);

-- inventory
CREATE INDEX IF NOT EXISTS idx_inv_items_category  ON inventory_items(category_id);
CREATE INDEX IF NOT EXISTS idx_inv_movements_item  ON inventory_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_movements_date  ON inventory_movements(date DESC);
CREATE INDEX IF NOT EXISTS idx_inv_low_stock       ON inventory_items(quantity) WHERE quantity <= min_quantity;

-- tasks
CREATE INDEX IF NOT EXISTS idx_tasks_status     ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date   ON tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_animal     ON tasks(animal_id) WHERE animal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_priority   ON tasks(priority);

-- =============================================================================
-- SECCIÓN 7: ROW LEVEL SECURITY (preparado para Supabase)
-- =============================================================================
-- Activar RLS en todas las tablas. Las políticas se definen según roles de usuario.
ALTER TABLE animals                ENABLE ROW LEVEL SECURITY;
ALTER TABLE cattle_details         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pig_details            ENABLE ROW LEVEL SECURITY;
ALTER TABLE litters                ENABLE ROW LEVEL SECURITY;
ALTER TABLE piglet_assignments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE calf_births            ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaccines               ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaccination_records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                  ENABLE ROW LEVEL SECURITY;

-- Política permisiva para usuarios autenticados (ajustar según roles en producción)
DO $$
DECLARE
    tbl TEXT;
    tbls TEXT[] := ARRAY[
        'animals','cattle_details','pig_details','litters','piglet_assignments',
        'calf_births','vaccines','vaccination_records','inventory_categories',
        'inventory_items','inventory_movements','tasks'
    ];
BEGIN
    FOREACH tbl IN ARRAY tbls LOOP
        EXECUTE format(
            'CREATE POLICY "Authenticated users full access" ON %I
             FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl
        );
    END LOOP;
END $$;
