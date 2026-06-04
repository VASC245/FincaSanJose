# Estrategia de Índices — Finca Agropecuaria

## Principios generales

1. **Índices en columnas de filtro frecuente**: `species`, `status`, `is_pregnant`, `next_date`.
2. **Índices parciales**: cuando solo un subconjunto de filas es consultado (ej. solo animales preñados, solo vacunas con `next_date` futuro). Reducen el tamaño del índice y mejoran las lecturas.
3. **Índices compuestos**: cuando dos columnas se filtran juntas habitualmente (ej. `species + status`).
4. **La PK (uuid) ya tiene índice implícito**. Las FK también se indexan explícitamente porque PostgreSQL no lo hace automáticamente.
5. **No sobre-indexar**: cada índice adicional penaliza los `INSERT`/`UPDATE`/`DELETE`. Se incluyen solo los que tienen alta probabilidad de uso.

---

## Tabla: `animals`

| Índice | Columnas | Tipo | Justificación |
|---|---|---|---|
| `idx_animals_species` | `species` | B-tree | Filtrar animales por especie (cow/pig) es la consulta más frecuente del sistema. |
| `idx_animals_status` | `status` | B-tree | La vista principal de la finca filtra por `status = 'active'` constantemente. |
| `idx_animals_species_status` | `(species, status)` | B-tree compuesto | Combinación muy frecuente: "vacas activas", "cerdos activos". Evita dos scans separados. |
| `idx_animals_mother` | `mother_id` | B-tree | Recorrer el árbol genealógico (buscar crías de una madre) requiere buscar por FK. |
| PK implícito | `id` | B-tree | UUID PK, generado automáticamente. Usado en todos los JOINs. |
| UK implícito | `ear_tag` | B-tree | Búsqueda por número de arete es operación de alta frecuencia (escaneo diario). |

---

## Tabla: `cattle_details`

| Índice | Columnas | Tipo | Justificación |
|---|---|---|---|
| `idx_cattle_details_pregnant` | `is_pregnant` WHERE `is_pregnant = true` | B-tree parcial | El módulo de gestión reproductiva filtra constantemente las vacas preñadas. El índice parcial es mucho más pequeño que uno total. |
| `idx_cattle_expected_birth` | `expected_birth` WHERE `expected_birth IS NOT NULL` | B-tree parcial | Ordenar por fecha probable de parto es una consulta de dashboard. Solo aplica a registros con fecha establecida. |
| UK implícito | `animal_id` | B-tree | Relación 1:1 forzada por UNIQUE constraint. Lookup por animal_id muy frecuente en JOIN. |

---

## Tabla: `pig_details`

| Índice | Columnas | Tipo | Justificación |
|---|---|---|---|
| `idx_pig_details_pregnant` | `is_pregnant` WHERE `is_pregnant = true` | B-tree parcial | Misma lógica que cattle_details: filtrar cerdas preñadas activas. |
| `idx_pig_expected_birth` | `expected_birth` WHERE `expected_birth IS NOT NULL` | B-tree parcial | Listado de partos próximos porcinos ordenado por fecha. |
| UK implícito | `animal_id` | B-tree | UNIQUE constraint garantiza 1:1 y acelera JOIN. |

---

## Tabla: `litters`

| Índice | Columnas | Tipo | Justificación |
|---|---|---|---|
| `idx_litters_sow` | `sow_id` | B-tree | Buscar todas las camadas de una cerda específica (historial reproductivo). |
| `idx_litters_date` | `birth_date DESC` | B-tree | Listados cronológicos de camadas (más reciente primero). |

---

## Tabla: `piglet_assignments`

| Índice | Columnas | Tipo | Justificación |
|---|---|---|---|
| UK implícito | `(litter_id, piglet_id)` | B-tree | UNIQUE constraint evita duplicados y acelera la verificación de membresía. |
| Implícito en FK | `litter_id` | B-tree | JOIN entre litters y piglet_assignments (buscar todos los lechones de una camada). |
| Implícito en FK | `piglet_id` | B-tree | Verificar a qué camada pertenece un lechón. |

> Nota: PostgreSQL no crea índices automáticamente en FK. Se recomienda crearlos explícitamente si el volumen lo justifica:
> ```sql
> CREATE INDEX IF NOT EXISTS idx_pa_litter  ON piglet_assignments(litter_id);
> CREATE INDEX IF NOT EXISTS idx_pa_piglet  ON piglet_assignments(piglet_id);
> ```

---

## Tabla: `calf_births`

| Índice | Columnas | Tipo | Justificación |
|---|---|---|---|
| `idx_calf_births_cow` | `cow_id` | B-tree | Historial de partos de una vaca específica. |
| `idx_calf_births_date` | `birth_date DESC` | B-tree | Listado cronológico de partos (más reciente primero). |

---

## Tabla: `vaccination_records`

| Índice | Columnas | Tipo | Justificación |
|---|---|---|---|
| `idx_vacc_animal` | `animal_id` | B-tree | Historial de vacunas de un animal (lookup por FK más frecuente). |
| `idx_vacc_next_date` | `next_date` WHERE `next_date IS NOT NULL` | B-tree parcial | Alerta de vacunas próximas o vencidas: `WHERE next_date <= CURRENT_DATE + 30`. Índice parcial excluye registros sin próxima dosis. |
| `idx_vacc_applied` | `applied_date DESC` | B-tree | Historial cronológico inverso de aplicaciones. |

---

## Tabla: `inventory_items`

| Índice | Columnas | Tipo | Justificación |
|---|---|---|---|
| `idx_inv_items_category` | `category_id` | B-tree | Filtrar ítems por categoría en la vista de inventario. |
| `idx_inv_low_stock` | `quantity` WHERE `quantity <= min_quantity` | B-tree parcial | Dashboard de alertas de stock bajo. Solo indexa los ítems que están en o bajo el mínimo. |

---

## Tabla: `inventory_movements`

| Índice | Columnas | Tipo | Justificación |
|---|---|---|---|
| `idx_inv_movements_item` | `item_id` | B-tree | Historial de movimientos de un ítem específico (obligatorio para recalcular stock). |
| `idx_inv_movements_date` | `date DESC` | B-tree | Listado cronológico de movimientos recientes. |

---

## Tabla: `tasks`

| Índice | Columnas | Tipo | Justificación |
|---|---|---|---|
| `idx_tasks_status` | `status` | B-tree | El módulo de tareas filtra principalmente por `status = 'pending'` o `'in_progress'`. |
| `idx_tasks_due_date` | `due_date` WHERE `due_date IS NOT NULL` | B-tree parcial | Ordenar tareas por fecha límite. Parcial excluye tareas sin fecha. |
| `idx_tasks_priority` | `priority` | B-tree | Filtrar tareas urgentes (`priority = 'high'`). |
| `idx_tasks_animal` | `animal_id` WHERE `animal_id IS NOT NULL` | B-tree parcial | Buscar todas las tareas asociadas a un animal. Parcial excluye tareas generales. |

---

## Resumen de índices por impacto estimado

| Prioridad | Índice | Impacto |
|---|---|---|
| Crítico | `idx_animals_species_status` | Toda consulta de la pantalla principal |
| Crítico | `idx_vacc_next_date` (parcial) | Alertas sanitarias del dashboard |
| Crítico | `idx_inv_low_stock` (parcial) | Alertas de inventario del dashboard |
| Alto | `idx_cattle_details_pregnant` (parcial) | Módulo reproductivo bovino |
| Alto | `idx_pig_details_pregnant` (parcial) | Módulo reproductivo porcino |
| Alto | `idx_tasks_status` | Vista principal de tareas |
| Alto | `idx_vacc_animal` | Historial de salud por animal |
| Medio | `idx_litters_sow` | Historial reproductivo porcino |
| Medio | `idx_calf_births_cow` | Historial reproductivo bovino |
| Medio | `idx_inv_movements_item` | Auditoría de inventario |
| Bajo | `idx_animals_mother` | Árbol genealógico (consulta ocasional) |
