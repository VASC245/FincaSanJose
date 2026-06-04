# Diagrama Entidad-Relación — Finca Agropecuaria

## Diagrama Mermaid

```mermaid
erDiagram

    animals {
        uuid id PK
        text name
        text ear_tag UK
        text species
        text sex
        date birth_date
        text status
        uuid mother_id FK
        text notes
        timestamptz created_at
        timestamptz updated_at
    }

    cattle_details {
        uuid id PK
        uuid animal_id FK
        boolean is_pregnant
        date conception_date
        date expected_birth
        date last_birth_date
        int birth_count
        numeric weight_kg
    }

    pig_details {
        uuid id PK
        uuid animal_id FK
        boolean is_pregnant
        date service_date
        date expected_birth
        int litter_count
        numeric weight_kg
    }

    litters {
        uuid id PK
        uuid sow_id FK
        date birth_date
        int total_born
        int born_alive
        text notes
        timestamptz created_at
    }

    piglet_assignments {
        uuid id PK
        uuid litter_id FK
        uuid piglet_id FK
    }

    calf_births {
        uuid id PK
        uuid cow_id FK
        date birth_date
        uuid calf_id FK
        text notes
        timestamptz created_at
    }

    vaccines {
        uuid id PK
        text name
        text description
        text manufacturer
        text disease_target
        text species_target
        timestamptz created_at
    }

    vaccination_records {
        uuid id PK
        uuid animal_id FK
        uuid vaccine_id FK
        date applied_date
        date next_date
        text applied_by
        text batch_number
        text notes
        timestamptz created_at
    }

    inventory_categories {
        uuid id PK
        text name UK
        text description
        timestamptz created_at
    }

    inventory_items {
        uuid id PK
        uuid category_id FK
        text name
        numeric quantity
        text unit
        numeric min_quantity
        text description
        timestamptz created_at
        timestamptz updated_at
    }

    inventory_movements {
        uuid id PK
        uuid item_id FK
        text type
        numeric quantity
        date date
        text reference
        text notes
        timestamptz created_at
    }

    tasks {
        uuid id PK
        text title
        text description
        text status
        text priority
        date due_date
        text category
        uuid animal_id FK
        timestamptz created_at
        timestamptz updated_at
    }

    %% =========================================================
    %% Relaciones
    %% =========================================================

    %% Auto-referencial: jerarquía madre-cría
    animals ||--o{ animals : "mother_id (madre de)"

    %% Extensiones 1:1 por especie
    animals ||--o| cattle_details : "tiene detalle bovino"
    animals ||--o| pig_details    : "tiene detalle porcino"

    %% Partos bovinos
    animals ||--o{ calf_births : "cow_id (vaca en parto)"
    animals |o--o{ calf_births : "calf_id (ternero nacido)"

    %% Camadas porcinas
    animals ||--o{ litters : "sow_id (cerda en parto)"
    litters ||--o{ piglet_assignments : "tiene asignaciones"
    animals ||--o{ piglet_assignments : "piglet_id (lechón)"

    %% Vacunación
    animals ||--o{ vaccination_records : "tiene historial de vacunas"
    vaccines ||--o{ vaccination_records : "es aplicada en"

    %% Inventario
    inventory_categories ||--o{ inventory_items : "clasifica"
    inventory_items      ||--o{ inventory_movements : "registra movimientos"

    %% Tareas
    animals |o--o{ tasks : "animal_id (tarea relacionada)"
```

---

## Descripción de Relaciones

### Módulo de Animales

| Relación | Cardinalidad | Descripción |
|---|---|---|
| `animals` → `animals` (mother_id) | Muchos a uno (auto-ref.) | Un animal puede tener una madre registrada; una madre puede tener muchas crías. |
| `animals` → `cattle_details` | Uno a uno opcional | Solo animales con `species='cow'` tienen registro en `cattle_details`. |
| `animals` → `pig_details` | Uno a uno opcional | Solo animales con `species='pig'` tienen registro en `pig_details`. |
| `animals` → `calf_births` (cow_id) | Uno a muchos | Una vaca puede tener múltiples registros de parto. |
| `animals` → `calf_births` (calf_id) | Uno a uno opcional | Un ternero puede estar vinculado a exactamente un evento de parto. |
| `animals` → `litters` (sow_id) | Uno a muchos | Una cerda puede tener múltiples camadas registradas. |
| `litters` → `piglet_assignments` | Uno a muchos | Una camada puede tener múltiples lechones asignados. |
| `animals` → `piglet_assignments` (piglet_id) | Uno a uno | Un lechón pertenece a exactamente una camada. |

### Módulo de Vacunas

| Relación | Cardinalidad | Descripción |
|---|---|---|
| `animals` → `vaccination_records` | Uno a muchos | Un animal puede tener múltiples aplicaciones de vacunas. |
| `vaccines` → `vaccination_records` | Uno a muchos | Una vacuna puede ser aplicada múltiples veces a distintos animales. |

### Módulo de Inventario

| Relación | Cardinalidad | Descripción |
|---|---|---|
| `inventory_categories` → `inventory_items` | Uno a muchos | Una categoría agrupa múltiples ítems. |
| `inventory_items` → `inventory_movements` | Uno a muchos | Cada ítem tiene un historial completo de movimientos (entradas/salidas). |

### Módulo de Tareas

| Relación | Cardinalidad | Descripción |
|---|---|---|
| `animals` → `tasks` | Uno a muchos opcional | Una tarea puede estar vinculada a un animal específico, o ser general. |

---

## Diagrama Simplificado (visión de módulos)

```
┌─────────────────────────────────────────────────────────────┐
│                    MÓDULO ANIMALES                           │
│                                                             │
│   animals ──┬──► cattle_details  (1:1, solo vacas)          │
│    (base)   ├──► pig_details     (1:1, solo cerdos)         │
│             ├──► calf_births     (1:N partos bovinos)       │
│             ├──► litters         (1:N camadas porcinas)     │
│             │         └──► piglet_assignments (N:M crías)  │
│             └──► animals         (auto-ref. madre-cría)     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    MÓDULO VACUNAS                            │
│                                                             │
│   animals ──────► vaccination_records ◄──── vaccines        │
│                       (historial)          (catálogo)       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   MÓDULO INVENTARIO                          │
│                                                             │
│   inventory_categories ──► inventory_items                  │
│                                  └──► inventory_movements   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    MÓDULO TAREAS                             │
│                                                             │
│   tasks ────────────────────────► animals (opcional)        │
└─────────────────────────────────────────────────────────────┘
```
