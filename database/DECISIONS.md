# Decisiones de Diseño — Base de Datos Finca Agropecuaria

## 1. Tabla `animals` unificada en lugar de tablas separadas

### Alternativa descartada
Crear dos tablas independientes: `cows` y `pigs`, cada una con sus propios campos base.

### Decisión adoptada
Una sola tabla `animals` con un discriminador `species CHECK IN ('cow', 'pig')`.

### Justificación

**Operaciones cruzadas**: El sistema comparte operaciones entre ambas especies. Las vacunas (`vaccination_records`), las tareas (`tasks`) y el árbol genealógico (`mother_id`) aplican a cualquier animal sin distinción. Con tablas separadas, cada una de estas tablas secundarias necesitaría doble FK o una solución de "polymorphic association" frágil y difícil de mantener.

**Unicidad del arete**: El número de arete (`ear_tag`) es único por finca independientemente de la especie. La constraint `UNIQUE` solo es posible si ambas especies comparten la misma tabla.

**Simplicidad de consultas globales**: Listar todos los animales activos, buscar por arete o generar el panel principal no requiere `UNION` entre tablas.

**Escalabilidad de especies**: Si en el futuro se agregan cabras, aves u otras especies, el cambio es mínimo (nuevo valor en el `CHECK`).

**Separación de detalles mediante extensión**: Los campos específicos de cada especie se manejan en tablas separadas (`cattle_details`, `pig_details`), lo que mantiene la tabla base limpia sin columnas nulas.

---

## 2. Tablas `cattle_details` y `pig_details` separadas (extensión 1:1)

### Patrón utilizado
*Table Inheritance / Single-Table per Type Extension* — cada subclase tiene su propia tabla de extensión con relación 1:1.

### Alternativa descartada
- **Option A**: Columnas opcionales en `animals` directamente (`conception_date`, `service_date`, `litter_count`, etc.). Genera docenas de columnas siempre nulas para la otra especie.
- **Option B**: Tabla única `animal_details` con todas las columnas de ambas especies. Mismo problema de columnas nulas más confusión semántica.

### Justificación

**Integridad semántica**: `cattle_details.birth_count` no tiene ningún sentido para un cerdo. `pig_details.litter_count` no aplica a bovinos. Separar las extensiones elimina esta ambigüedad del modelo.

**Queries limpias**: Cuando se consultan vacas preñadas, el JOIN con `cattle_details` es directo y semánticamente claro. No hay que añadir `AND species = 'cow'` en la tabla de detalles.

**Evolución independiente**: Los campos específicos de bovinos (ej. días en ordeño, producción de leche) pueden añadirse a `cattle_details` sin afectar `pig_details` ni `animals`.

**Validación por trigger**: Un trigger (`trg_cattle_details_species_check`) verifica que solo se pueda insertar en `cattle_details` si el animal referenciado tiene `species = 'cow'`, y viceversa para cerdos.

---

## 3. Jerarquía animal: `mother_id` auto-referencial

### Decisión
Campo `mother_id UUID REFERENCES animals(id) ON DELETE SET NULL` en la propia tabla `animals`.

### Alternativa descartada
Tabla separada `animal_relationships` con `parent_id`, `child_id` y `relationship_type`.

### Justificación

**Suficiencia del caso de uso**: La finca solo necesita rastrear la relación madre-cría (una generación hacia arriba). No se modelan padres, hermanos ni relaciones más complejas.

**Queries simples**: Un árbol de dos o tres generaciones se resuelve con auto-JOINs o CTEs recursivas sin necesidad de una tabla intermedia.

**`ON DELETE SET NULL`**: Si la madre es vendida o muere y se elimina del sistema, la cría no se elimina; simplemente pierde la referencia materna. Esto preserva el historial productivo de los animales hijos.

**Limitación consciente**: No se modela el padre. En ganadería, el padre suele ser externo (toro de servicio, padrillo prestado) y no está registrado en el sistema propio. Si en el futuro se requiere, basta añadir `father_id` con la misma estrategia.

---

## 4. Relación `litters` → `piglet_assignments` → `animals`

### Problema a resolver
Una camada de cerdos es un evento grupal (varios lechones nacen al mismo tiempo), pero cada lechón puede ser registrado individualmente como un animal con su propio arete, historial de vacunas y seguimiento.

### Decisión
- `litters`: registra el evento de parto con estadísticas agregadas (`total_born`, `born_alive`).
- `piglet_assignments`: tabla de unión que vincula lechones individuales (`animals`) a su camada.
- Los lechones viven en `animals` con `species='pig'` y `mother_id` apuntando a la cerda.

### Alternativa descartada
Agregar una FK directa `litter_id` en la tabla `animals`. Esto crea acoplamiento: `animals` tendría una columna relevante solo para lechones, nula para todos los demás animales.

### Justificación

**Independencia del registro individual**: Un lechón puede ser registrado en el sistema antes de que se asocie formalmente a una camada, o puede no ser registrado individualmente si no tiene arete (camadas numerosas).

**Estadísticas de camada vs. animales registrados**: `litters.born_alive` puede ser 10, pero solo 6 lechones tienen arete y registro individual. Las dos realidades coexisten sin contradicción.

**Flexibilidad**: `piglet_assignments` permite, en un escenario futuro, mover un lechón de camada (adopción), simplemente actualizando la fila en la tabla de unión.

---

## 5. Inventario: `inventory_movements` en lugar de actualizar `quantity` directamente

### Decisión
El stock real se construye a partir del historial de movimientos (`SUM(in) - SUM(out)`). El campo `quantity` en `inventory_items` es un **caché** mantenido automáticamente por trigger.

### Alternativa descartada
Actualizar `quantity` directamente con `UPDATE inventory_items SET quantity = quantity - X` cada vez que hay un consumo.

### Justificación

**Auditabilidad completa**: Cada entrada/salida queda registrada con fecha, referencia y notas. Es posible saber exactamente cuándo se usaron los últimos 50 kg de alimento balanceado.

**Corrección de errores**: Si se registra un movimiento incorrecto, se puede anular (eliminar la fila) y el trigger recalcula el stock automáticamente. Con el modelo de edición directa, el error queda oculto.

**Reportes históricos**: Se pueden generar gráficos de consumo mensual, inventario promedio, rotación de productos, etc., simplemente consultando `inventory_movements`.

**Integridad ante concurrencia**: Múltiples usuarios pueden registrar movimientos simultáneamente sin condiciones de carrera. Cada `INSERT` es atómico; el trigger acumula correctamente.

**Caché de `quantity`**: Para evitar recalcular el stock en cada consulta del dashboard (que sería costoso con miles de movimientos), el trigger mantiene `inventory_items.quantity` actualizado en tiempo real. Esto combina lo mejor de ambos enfoques.

---

## 6. Soft delete: `status` en lugar de borrar registros

### Decisión
Los animales no se eliminan físicamente de la base de datos. En su lugar, se actualiza `status` a `'sold'` (vendido) o `'deceased'` (fallecido). La eliminación física (`DELETE`) queda reservada para errores de captura de datos.

### Alternativa descartada
Añadir una columna `deleted_at TIMESTAMPTZ` (patrón de soft delete clásico).

### Justificación

**Semántica del dominio**: En ganadería, la distinción entre "vendido", "muerto" y "activo" es información valiosa por sí misma. Un animal vendido tiene implicaciones fiscales y de trazabilidad; uno fallecido tiene implicaciones sanitarias. La columna `status` captura esta semántica, mientras que `deleted_at` solo indica "fue eliminado" sin explicar por qué.

**Historial reproductivo y sanitario**: Los registros de vacunación (`vaccination_records`), partos (`calf_births`) y camadas (`litters`) apuntan a animales. Si el animal se borrara físicamente, toda esa historia se perdería o quedaría con FKs rotas.

**Árbol genealógico**: Las crías mantienen `mother_id` apuntando a la madre aunque esta sea vendida. Si la madre se borrara, el árbol genealógico queda incompleto.

**Consultas simples**: `WHERE status = 'active'` es más claro y eficiente que `WHERE deleted_at IS NULL`. Los índices parciales sobre `status` son muy efectivos.

**`ON DELETE SET NULL` para referencias opcionales**: Las tablas `tasks.animal_id` y `animals.mother_id` usan `ON DELETE SET NULL`. Esto significa que si un registro se borrara accidentalmente (dato incorrecto), la referencia se limpia sin eliminar la tarea o la cría.

---

## 7. UUIDs como PKs en lugar de SERIAL/BIGINT

### Decisión
Todas las PKs usan `UUID DEFAULT gen_random_uuid()`.

### Justificación

**Supabase/PostgREST**: El ecosistema Supabase trabaja nativamente con UUIDs. Las APIs generadas automáticamente por PostgREST y las políticas de RLS están optimizadas para UUIDs.

**Distribución**: Los IDs no son predecibles ni secuenciales, lo que dificulta la enumeración de recursos por parte de actores maliciosos.

**Generación en cliente**: El frontend puede generar el UUID del nuevo registro antes de enviarlo al servidor, lo que simplifica las inserciones optimistas (optimistic UI).

**Sin colisiones en merges**: Si en el futuro se consolidan datos de múltiples fincas en una sola base, los UUIDs garantizan unicidad global.

---

## 8. Row Level Security (RLS) habilitado desde el inicio

### Decisión
RLS está activado en todas las tablas con una política permisiva para usuarios autenticados como punto de partida.

### Justificación

**Seguridad por defecto en Supabase**: El SDK de Supabase expone las tablas directamente al cliente. Sin RLS, cualquier usuario autenticado podría acceder a todos los datos.

**Evolución gradual**: La política actual (`authenticated users full access`) es un punto de partida seguro. A medida que el sistema crezca (múltiples fincas, roles de peón vs. administrador), las políticas pueden refinarse sin cambiar el esquema.

**Principio de mínimo privilegio**: Es más fácil abrir permisos que cerrarlos después de un incidente.
