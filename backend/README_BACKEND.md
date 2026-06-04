# Backend — Sistema de Gestión de Finca Agropecuaria

Backend construido sobre **Supabase** (PostgreSQL + PostgREST + Edge Functions).

---

## Estructura del proyecto

```
backend/
├── supabase/
│   ├── config.toml                          # Configuración del proyecto Supabase local
│   ├── migrations/
│   │   ├── 001_initial_schema.sql           # Tablas, índices y trigger de updated_at
│   │   ├── 002_rls_policies.sql             # Row Level Security
│   │   ├── 003_seed_data.sql                # Datos de semilla (vacunas, categorías, animales, tareas)
│   │   └── 004_functions.sql                # Funciones PostgreSQL y triggers de negocio
│   └── functions/
│       └── send-alerts/
│           └── index.ts                     # Edge Function para alertas
└── README_BACKEND.md
```

---

## 1. Instalar Supabase CLI

```bash
# macOS (Homebrew)
brew install supabase/tap/supabase

# Linux / Windows (npm global)
npm install -g supabase

# Verificar instalación
supabase --version
```

---

## 2. Inicializar proyecto local

```bash
# Desde la raíz del repositorio (un nivel arriba de /backend)
cd /ruta/a/tu/proyecto

# Inicializar Supabase (crea carpeta supabase/ si no existe)
supabase init

# Reemplaza el config.toml generado con el de este repositorio:
cp backend/supabase/config.toml supabase/config.toml

# Copia las migraciones:
cp -r backend/supabase/migrations/ supabase/migrations/

# Copia las Edge Functions:
cp -r backend/supabase/functions/ supabase/functions/
```

---

## 3. Arrancar Supabase localmente

Requiere **Docker** corriendo en tu máquina.

```bash
supabase start
```

Al terminar verás algo como:

```
API URL: http://127.0.0.1:54321
GraphQL URL: http://127.0.0.1:54321/graphql/v1
DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL: http://127.0.0.1:54323
Inbucket URL: http://127.0.0.1:54324
anon key: eyJ...
service_role key: eyJ...
```

---

## 4. Ejecutar migraciones

```bash
# Aplica todas las migraciones en orden
supabase db push

# O bien, aplica manualmente con psql:
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -f supabase/migrations/001_initial_schema.sql \
  -f supabase/migrations/002_rls_policies.sql \
  -f supabase/migrations/003_seed_data.sql \
  -f supabase/migrations/004_functions.sql
```

---

## 5. Conectar con el frontend (variables de entorno)

Crea un archivo `.env` en la raíz del proyecto **frontend** (Vue 3):

```env
# .env (frontend)

# URL de la API de Supabase (local o producción)
VITE_SUPABASE_URL=http://127.0.0.1:54321

# Clave anon (segura para el cliente)
VITE_SUPABASE_ANON_KEY=eyJ...    # la que muestra `supabase start`
```

En el frontend, inicializa el cliente así:

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseKey)
```

Para **producción**, crea un proyecto en [supabase.com](https://supabase.com) y sustituye las variables con las credenciales del proyecto real.

---

## 6. Desplegar Edge Functions

```bash
# Servir localmente para pruebas
supabase functions serve send-alerts --env-file .env.local

# Desplegar a producción
supabase functions deploy send-alerts
```

La función acepta un parámetro opcional `days` (default 7):

```
GET https://<project>.supabase.co/functions/v1/send-alerts?days=14
Authorization: Bearer <anon_key>
```

---

## 7. Comandos útiles de la CLI

| Comando | Descripción |
|---|---|
| `supabase start` | Arranca el stack local (Docker) |
| `supabase stop` | Detiene el stack local |
| `supabase status` | Muestra URLs y claves del proyecto local |
| `supabase db push` | Aplica migraciones pendientes |
| `supabase db reset` | Reinicia la BD local y re-aplica todas las migraciones |
| `supabase db diff` | Muestra diferencias entre schema local y remoto |
| `supabase migration new <nombre>` | Crea un nuevo archivo de migración |
| `supabase functions serve <nombre>` | Sirve una Edge Function localmente |
| `supabase functions deploy <nombre>` | Despliega una Edge Function a producción |
| `supabase login` | Autenticarse en la plataforma Supabase |
| `supabase link --project-ref <id>` | Vincula el proyecto local al remoto |

---

## 8. Funciones SQL disponibles

| Función | Descripción |
|---|---|
| `get_dashboard_stats()` | Retorna JSON con totales de animales, preñadas, tareas pendientes y stock bajo |
| `get_upcoming_births(days_ahead)` | Lista animales con parto en los próximos N días |
| `get_low_stock_items()` | Lista ítems de inventario bajo el stock mínimo |

### Ejemplo de uso desde el frontend:

```typescript
// Dashboard stats
const { data } = await supabase.rpc('get_dashboard_stats')
console.log(data) // { total_cattle: 3, total_pigs: 2, pregnant_cows: 2, ... }

// Próximos partos en los próximos 14 días
const { data: births } = await supabase.rpc('get_upcoming_births', { days_ahead: 14 })
```

---

## 9. Migraciones en producción

```bash
# 1. Vincular al proyecto remoto
supabase link --project-ref <tu-project-ref>

# 2. Aplicar todas las migraciones
supabase db push

# 3. Verificar estado
supabase migration list
```

---

## Notas de seguridad

- Nunca expongas la `service_role key` en el frontend. Úsala solo en el servidor o en Edge Functions.
- Las políticas de RLS actuales son permisivas para usuarios autenticados. Cuando tengas múltiples usuarios, considera agregar filtros por `auth.uid()`.
- El archivo `.env` nunca debe subirse al repositorio. Agrégalo a `.gitignore`.
