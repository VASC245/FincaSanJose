# Sistema de Gestión de Finca — Documento de Requerimientos

## Stack Tecnológico
- **Frontend:** Vue 3 + TypeScript + Tailwind CSS
- **Backend/BaaS:** Supabase (PostgreSQL + Auth + Realtime + Storage)
- **Estado global:** Pinia
- **Router:** Vue Router 4

---

## 1. Módulo de Tareas

### Descripción
Control y seguimiento de tareas diarias de la finca.

### Funcionalidades
- Crear, editar, eliminar tareas
- Asignar prioridad (alta, media, baja)
- Estado: pendiente, en progreso, completada
- Fecha límite de entrega
- Asociar tarea a un animal (opcional)
- Categorías: sanidad, alimentación, mantenimiento, reproducción, otro
- Filtros por estado, prioridad y categoría

---

## 2. Módulo de Inventario

### Descripción
Control de insumos y materiales de la finca.

### Funcionalidades
- Categorías de inventario (medicamentos, alimentos, herramientas, equipos, etc.)
- Registro de ítems con nombre, cantidad, unidad, stock mínimo
- Movimientos: entradas y salidas con fecha y nota
- Alertas de stock mínimo
- Historial de movimientos por ítem

---

## 3. Módulo de Vacas (Ganado Bovino)

### Sub-módulos

#### 3.1 Registro de Vacas
- Nombre
- Número de arete
- Sexo (hembra / macho)
- Fecha de nacimiento
- Estado en la finca (activa, vendida, muerta)
- Madre (referencia a otra vaca, si aplica)

#### 3.2 Terneros
- Mismos campos que vaca
- Referencia a la madre
- Peso al nacer (opcional)

#### 3.3 Seguimiento de Preñez
- Marcar vaca como preñada
- Fecha de concepción estimada
- Fecha probable de parto
- Historial de partos

#### 3.4 Registro de Vacunas
- Asignar vacuna a cualquier animal bovino
- Fecha de aplicación
- Próxima fecha de aplicación
- Notas

---

## 4. Módulo de Cerdos (Ganado Porcino)

### Sub-módulos

#### 4.1 Registro de Cerdos
- Nombre
- Número de arete
- Sexo (hembra / macho)
- Fecha de nacimiento
- Estado: activo, vendido, muerto
- Madre (referencia, si aplica)

#### 4.2 Registro de Partos (Camadas)
- Cerda madre (referencia)
- Fecha del parto
- Número de crías nacidas
- Número de crías vivas
- Notas del parto

#### 4.3 Crías (Lechones)
- Registro individual de cada cría con nombre, arete, sexo
- Fecha de nacimiento
- Referencia a la camada y a la madre

#### 4.4 Seguimiento de Preñez
- Marcar cerda como preñada
- Fecha de servicio/monta
- Fecha probable de parto
- Historial de preñeces

#### 4.5 Registro de Vacunas
- Misma funcionalidad que en bovinos

---

## 5. Dashboard / Panel Principal

- Resumen total de animales por especie
- Vacas preñadas activas
- Cerdas preñadas activas
- Tareas pendientes del día
- Alertas de stock bajo
- Próximos partos esperados

---

## Tablas Supabase (PostgreSQL)

### `animals`
```sql
id          uuid PK
name        text
ear_tag     text UNIQUE
species     text CHECK ('cow', 'pig')
sex         text CHECK ('male', 'female')
birth_date  date
status      text CHECK ('active', 'sold', 'deceased')
mother_id   uuid FK → animals(id) nullable
notes       text
created_at  timestamptz DEFAULT now()
updated_at  timestamptz DEFAULT now()
```

### `cattle_details`
Información específica de bovinos.
```sql
id              uuid PK
animal_id       uuid FK → animals(id) UNIQUE
is_pregnant     boolean DEFAULT false
conception_date date nullable
expected_birth  date nullable
last_birth_date date nullable
birth_count     int DEFAULT 0
```

### `pig_details`
Información específica de porcinos.
```sql
id              uuid PK
animal_id       uuid FK → animals(id) UNIQUE
is_pregnant     boolean DEFAULT false
service_date    date nullable
expected_birth  date nullable
litter_count    int DEFAULT 0
```

### `litters` (camadas de cerdos)
```sql
id                  uuid PK
sow_id              uuid FK → animals(id)
birth_date          date
total_born          int
born_alive          int
notes               text
created_at          timestamptz DEFAULT now()
```

### `calf_births` (partos de vacas)
```sql
id          uuid PK
cow_id      uuid FK → animals(id)
birth_date  date
calf_id     uuid FK → animals(id) nullable
notes       text
created_at  timestamptz DEFAULT now()
```

### `vaccines`
```sql
id              uuid PK
name            text NOT NULL
description     text
manufacturer    text
disease_target  text
created_at      timestamptz DEFAULT now()
```

### `vaccination_records`
```sql
id              uuid PK
animal_id       uuid FK → animals(id)
vaccine_id      uuid FK → vaccines(id)
applied_date    date NOT NULL
next_date       date nullable
applied_by      text
notes           text
created_at      timestamptz DEFAULT now()
```

### `inventory_categories`
```sql
id          uuid PK
name        text NOT NULL
description text
created_at  timestamptz DEFAULT now()
```

### `inventory_items`
```sql
id              uuid PK
category_id     uuid FK → inventory_categories(id)
name            text NOT NULL
quantity        numeric DEFAULT 0
unit            text
min_quantity    numeric DEFAULT 0
description     text
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

### `inventory_movements`
```sql
id          uuid PK
item_id     uuid FK → inventory_items(id)
type        text CHECK ('in', 'out')
quantity    numeric NOT NULL
date        date NOT NULL
notes       text
created_at  timestamptz DEFAULT now()
```

### `tasks`
```sql
id              uuid PK
title           text NOT NULL
description     text
status          text CHECK ('pending', 'in_progress', 'completed')
priority        text CHECK ('high', 'medium', 'low')
due_date        date
category        text CHECK ('health', 'feeding', 'maintenance', 'reproduction', 'other')
animal_id       uuid FK → animals(id) nullable
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

---

## Relaciones Clave
- `animals.mother_id` → `animals.id` (auto-referencial para terneros y crías)
- `cattle_details.animal_id` → `animals.id` (1:1)
- `pig_details.animal_id` → `animals.id` (1:1)
- `litters.sow_id` → `animals.id` (N:1)
- `calf_births.cow_id` → `animals.id` (N:1)
- `calf_births.calf_id` → `animals.id` (1:1 opcional)
- `vaccination_records.animal_id` → `animals.id` (N:1)
- `vaccination_records.vaccine_id` → `vaccines.id` (N:1)
- `inventory_movements.item_id` → `inventory_items.id` (N:1)
- `tasks.animal_id` → `animals.id` nullable (N:1)

---

## Estructura de Proyecto Vue Sugerida
```
src/
  components/
    animals/
    inventory/
    tasks/
    shared/
  views/
    Dashboard.vue
    cattle/
    pigs/
    inventory/
    tasks/
  stores/
    animals.ts
    inventory.ts
    tasks.ts
  composables/
  services/      ← llamadas a Supabase
  types/
  router/
```
