2# Consultas SQL de Referencia — Finca Agropecuaria

Todas las consultas están escritas para PostgreSQL 15+ / Supabase.
Las variables de parámetro se indican con el prefijo `:param`.

---

## 1. Todos los animales activos con su detalle

Retorna todos los animales con `status = 'active'` e incluye, para cada uno,
sus datos de detalle según la especie (preñez, peso, conteo de partos/camadas).

```sql
SELECT
    a.id,
    a.ear_tag,
    a.name,
    a.species,
    a.sex,
    a.birth_date,
    -- Edad en meses redondeada
    EXTRACT(YEAR FROM AGE(a.birth_date)) * 12 +
        EXTRACT(MONTH FROM AGE(a.birth_date))   AS age_months,
    a.status,
    a.notes,
    -- Detalle bovino (NULL si no aplica)
    cd.is_pregnant         AS cow_pregnant,
    cd.expected_birth      AS cow_expected_birth,
    cd.birth_count         AS cow_birth_count,
    cd.weight_kg           AS cow_weight_kg,
    -- Detalle porcino (NULL si no aplica)
    pd.is_pregnant         AS pig_pregnant,
    pd.expected_birth      AS pig_expected_birth,
    pd.litter_count        AS pig_litter_count,
    pd.weight_kg           AS pig_weight_kg,
    -- Nombre de la madre (si está registrada)
    mother.ear_tag         AS mother_ear_tag,
    mother.name            AS mother_name
FROM animals a
LEFT JOIN cattle_details cd ON cd.animal_id = a.id
LEFT JOIN pig_details    pd ON pd.animal_id = a.id
LEFT JOIN animals mother   ON mother.id = a.mother_id
WHERE a.status = 'active'
ORDER BY a.species, a.ear_tag;
```

---

## 2. Vacas preñadas con fecha probable de parto

Lista todas las vacas activas actualmente preñadas, ordenadas por
fecha probable de parto (las más próximas primero).

```sql
SELECT
    a.id,
    a.ear_tag,
    a.name,
    cd.conception_date,
    cd.expected_birth,
    -- Días restantes para el parto
    cd.expected_birth - CURRENT_DATE               AS days_to_birth,
    cd.birth_count,
    cd.weight_kg
FROM animals a
INNER JOIN cattle_details cd ON cd.animal_id = a.id
WHERE a.species = 'cow'
  AND a.status  = 'active'
  AND cd.is_pregnant = true
ORDER BY cd.expected_birth ASC NULLS LAST;
```

---

## 3. Cerdas preñadas con fecha probable de parto

Lista todas las cerdas activas actualmente preñadas, ordenadas por
fecha probable de parto.

```sql
SELECT
    a.id,
    a.ear_tag,
    a.name,
    pd.service_date,
    pd.expected_birth,
    -- Días restantes para el parto
    pd.expected_birth - CURRENT_DATE               AS days_to_birth,
    pd.litter_count,
    pd.weight_kg
FROM animals a
INNER JOIN pig_details pd ON pd.animal_id = a.id
WHERE a.species = 'pig'
  AND a.status  = 'active'
  AND pd.is_pregnant = true
ORDER BY pd.expected_birth ASC NULLS LAST;
```

---

## 4. Historial de vacunas de un animal específico

Retorna todas las vacunaciones aplicadas a un animal dado, con la
información de la vacuna y la próxima fecha de refuerzo.

```sql
-- Sustituir :animal_id por el UUID del animal
SELECT
    vr.id,
    v.name                 AS vaccine_name,
    v.disease_target,
    v.manufacturer,
    vr.applied_date,
    vr.next_date,
    vr.applied_by,
    vr.batch_number,
    vr.notes,
    -- Estado del refuerzo
    CASE
        WHEN vr.next_date IS NULL            THEN 'sin_refuerzo'
        WHEN vr.next_date < CURRENT_DATE     THEN 'vencida'
        WHEN vr.next_date <= CURRENT_DATE + 30 THEN 'proxima'
        ELSE 'al_dia'
    END                                      AS refuerzo_status
FROM vaccination_records vr
INNER JOIN vaccines v ON v.id = vr.vaccine_id
WHERE vr.animal_id = :animal_id
ORDER BY vr.applied_date DESC;
```

---

## 5. Animales con vacunas vencidas o próximas a vencer (próximos 30 días)

Consulta de alerta sanitaria: animales cuyo refuerzo de vacuna ya venció
o vence en los próximos 30 días.

```sql
SELECT
    a.ear_tag,
    a.name,
    a.species,
    v.name                 AS vaccine_name,
    vr.applied_date,
    vr.next_date,
    vr.next_date - CURRENT_DATE AS days_until_due,
    CASE
        WHEN vr.next_date < CURRENT_DATE     THEN 'VENCIDA'
        WHEN vr.next_date <= CURRENT_DATE + 7 THEN 'URGENTE'
        ELSE 'PROXIMA'
    END                                      AS urgency
FROM vaccination_records vr
INNER JOIN animals  a ON a.id = vr.animal_id
INNER JOIN vaccines v ON v.id = vr.vaccine_id
WHERE a.status = 'active'
  AND vr.next_date IS NOT NULL
  AND vr.next_date <= CURRENT_DATE + 30
ORDER BY vr.next_date ASC;
```

---

## 6. Inventario con alerta de stock bajo

Lista los ítems cuyo stock actual está en o por debajo del mínimo configurado.

```sql
SELECT
    ic.name                AS category,
    ii.id,
    ii.name                AS item_name,
    ii.quantity            AS current_stock,
    ii.min_quantity        AS min_stock,
    ii.unit,
    -- Cuánto falta para alcanzar el mínimo
    GREATEST(ii.min_quantity - ii.quantity, 0)  AS deficit,
    -- Porcentaje del mínimo disponible
    CASE
        WHEN ii.min_quantity = 0 THEN NULL
        ELSE ROUND((ii.quantity / ii.min_quantity) * 100, 1)
    END                    AS stock_pct
FROM inventory_items ii
LEFT JOIN inventory_categories ic ON ic.id = ii.category_id
WHERE ii.quantity <= ii.min_quantity
ORDER BY stock_pct ASC NULLS FIRST, ii.name;
```

---

## 7. Tareas pendientes ordenadas por prioridad y fecha

Vista principal del módulo de tareas: muestra las tareas `pending` e
`in_progress`, ordenadas por urgencia (prioridad + fecha límite).

```sql
SELECT
    t.id,
    t.title,
    t.description,
    t.status,
    t.priority,
    t.due_date,
    t.category,
    -- Días hasta vencimiento (negativo = vencida)
    t.due_date - CURRENT_DATE                     AS days_until_due,
    -- Animal relacionado
    a.ear_tag                                      AS animal_ear_tag,
    a.name                                         AS animal_name,
    a.species                                      AS animal_species
FROM tasks t
LEFT JOIN animals a ON a.id = t.animal_id
WHERE t.status IN ('pending', 'in_progress')
ORDER BY
    -- 1. Tareas vencidas primero
    CASE WHEN t.due_date < CURRENT_DATE THEN 0 ELSE 1 END,
    -- 2. Prioridad: high > medium > low
    CASE t.priority
        WHEN 'high'   THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low'    THEN 3
    END,
    -- 3. Fecha límite más próxima
    t.due_date ASC NULLS LAST,
    t.created_at ASC;
```

---

## 8. Camadas de una cerda con número de crías registradas

Historial completo de camadas de una cerda específica, incluyendo
cuántos lechones individuales fueron registrados en el sistema.

```sql
-- Sustituir :sow_id por el UUID de la cerda
SELECT
    l.id,
    l.birth_date,
    l.total_born,
    l.born_alive,
    -- Lechones que tienen registro individual en el sistema
    COUNT(pa.piglet_id)                           AS registered_piglets,
    l.notes
FROM litters l
LEFT JOIN piglet_assignments pa ON pa.litter_id = l.id
WHERE l.sow_id = :sow_id
GROUP BY l.id, l.birth_date, l.total_born, l.born_alive, l.notes
ORDER BY l.birth_date DESC;
```

Para ver también la lista de lechones individuales:

```sql
SELECT
    l.birth_date          AS litter_date,
    a.ear_tag             AS piglet_ear_tag,
    a.name                AS piglet_name,
    a.sex,
    a.status
FROM litters l
INNER JOIN piglet_assignments pa ON pa.litter_id = l.id
INNER JOIN animals a             ON a.id = pa.piglet_id
WHERE l.sow_id = :sow_id
ORDER BY l.birth_date DESC, a.ear_tag;
```

---

## 9. Árbol genealógico de un animal (madre, abuela)

Usando una CTE recursiva para obtener la ascendencia materna
de un animal hasta 3 generaciones.

```sql
-- Sustituir :animal_id por el UUID del animal de origen
WITH RECURSIVE ancestry AS (
    -- Caso base: el animal de origen
    SELECT
        id,
        ear_tag,
        name,
        species,
        birth_date,
        mother_id,
        0     AS generation,
        'self' AS relation
    FROM animals
    WHERE id = :animal_id

    UNION ALL

    -- Paso recursivo: subir un nivel (la madre)
    SELECT
        a.id,
        a.ear_tag,
        a.name,
        a.species,
        a.birth_date,
        a.mother_id,
        anc.generation + 1,
        CASE anc.generation + 1
            WHEN 1 THEN 'madre'
            WHEN 2 THEN 'abuela'
            WHEN 3 THEN 'bisabuela'
            ELSE 'ancestro gen ' || (anc.generation + 1)
        END
    FROM animals a
    INNER JOIN ancestry anc ON anc.mother_id = a.id
    WHERE anc.generation < 3   -- limitar profundidad
)
SELECT
    generation,
    relation,
    ear_tag,
    name,
    species,
    birth_date
FROM ancestry
ORDER BY generation;
```

Para ver también las crías (árbol hacia abajo — una generación):

```sql
SELECT
    a.ear_tag,
    a.name,
    a.species,
    a.sex,
    a.birth_date,
    a.status
FROM animals a
WHERE a.mother_id = :animal_id
ORDER BY a.birth_date;
```

---

## 10. Estadísticas del dashboard (una sola consulta)

Retorna en una sola pasada todos los contadores y alertas clave
que necesita la pantalla principal de la aplicación.

```sql
SELECT
    -- === ANIMALES ===
    COUNT(*) FILTER (WHERE a.status = 'active')                          AS total_active_animals,
    COUNT(*) FILTER (WHERE a.status = 'active' AND a.species = 'cow')    AS total_active_cows,
    COUNT(*) FILTER (WHERE a.status = 'active' AND a.species = 'pig')    AS total_active_pigs,

    -- === REPRODUCTIVO: BOVINOS ===
    COUNT(*) FILTER (
        WHERE a.status = 'active'
          AND a.species = 'cow'
          AND cd.is_pregnant = true
    )                                                                     AS pregnant_cows,
    COUNT(*) FILTER (
        WHERE a.status = 'active'
          AND a.species = 'cow'
          AND cd.is_pregnant = true
          AND cd.expected_birth <= CURRENT_DATE + 30
    )                                                                     AS cows_birth_next_30_days,

    -- === REPRODUCTIVO: PORCINOS ===
    COUNT(*) FILTER (
        WHERE a.status = 'active'
          AND a.species = 'pig'
          AND pd.is_pregnant = true
    )                                                                     AS pregnant_sows,
    COUNT(*) FILTER (
        WHERE a.status = 'active'
          AND a.species = 'pig'
          AND pd.is_pregnant = true
          AND pd.expected_birth <= CURRENT_DATE + 30
    )                                                                     AS sows_birth_next_30_days,

    -- === SANIDAD ===
    (
        SELECT COUNT(DISTINCT vr2.animal_id)
        FROM vaccination_records vr2
        INNER JOIN animals a2 ON a2.id = vr2.animal_id
        WHERE a2.status = 'active'
          AND vr2.next_date IS NOT NULL
          AND vr2.next_date < CURRENT_DATE
    )                                                                     AS animals_overdue_vaccines,
    (
        SELECT COUNT(DISTINCT vr3.animal_id)
        FROM vaccination_records vr3
        INNER JOIN animals a3 ON a3.id = vr3.animal_id
        WHERE a3.status = 'active'
          AND vr3.next_date IS NOT NULL
          AND vr3.next_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
    )                                                                     AS animals_vaccines_next_30_days,

    -- === INVENTARIO ===
    (
        SELECT COUNT(*)
        FROM inventory_items ii
        WHERE ii.quantity <= ii.min_quantity
    )                                                                     AS low_stock_items,

    -- === TAREAS ===
    (
        SELECT COUNT(*)
        FROM tasks t
        WHERE t.status IN ('pending', 'in_progress')
    )                                                                     AS open_tasks,
    (
        SELECT COUNT(*)
        FROM tasks t
        WHERE t.status IN ('pending', 'in_progress')
          AND t.due_date < CURRENT_DATE
    )                                                                     AS overdue_tasks,
    (
        SELECT COUNT(*)
        FROM tasks t
        WHERE t.status IN ('pending', 'in_progress')
          AND t.priority = 'high'
    )                                                                     AS high_priority_tasks

FROM animals a
LEFT JOIN cattle_details cd ON cd.animal_id = a.id
LEFT JOIN pig_details    pd ON pd.animal_id = a.id;
```

---

## Consultas auxiliares de utilidad

### Stock actual de un ítem calculado desde movimientos (verificación del caché)

```sql
SELECT
    ii.name,
    ii.quantity                                    AS cached_quantity,
    SUM(CASE WHEN im.type = 'in'  THEN im.quantity ELSE 0 END) -
    SUM(CASE WHEN im.type = 'out' THEN im.quantity ELSE 0 END) AS calculated_quantity
FROM inventory_items ii
LEFT JOIN inventory_movements im ON im.item_id = ii.id
WHERE ii.id = :item_id
GROUP BY ii.id, ii.name, ii.quantity;
```

### Partos registrados en los últimos 12 meses (bovinos y porcinos)

```sql
-- Bovinos
SELECT 'bovino' AS type, cow_id AS parent_id, birth_date FROM calf_births
WHERE birth_date >= CURRENT_DATE - INTERVAL '12 months'

UNION ALL

-- Porcinos
SELECT 'porcino' AS type, sow_id AS parent_id, birth_date FROM litters
WHERE birth_date >= CURRENT_DATE - INTERVAL '12 months'

ORDER BY birth_date DESC;
```

### Animales sin detalle de especie registrado (integridad de datos)

```sql
-- Vacas sin cattle_details
SELECT a.id, a.ear_tag, a.species, 'falta cattle_details' AS issue
FROM animals a
LEFT JOIN cattle_details cd ON cd.animal_id = a.id
WHERE a.species = 'cow' AND cd.id IS NULL

UNION ALL

-- Cerdos sin pig_details
SELECT a.id, a.ear_tag, a.species, 'falta pig_details' AS issue
FROM animals a
LEFT JOIN pig_details pd ON pd.animal_id = a.id
WHERE a.species = 'pig' AND pd.id IS NULL;
```
