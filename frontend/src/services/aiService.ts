import { supabase } from '@/lib/supabase'
import { createMovement } from './inventoryService'
import { createVaccinationRecord, createBatchVaccinationRecords } from './vaccinationService'
import { localToday, localDateOffset, addDaysToDate } from '@/lib/dates'

// ─── Anthropic API via fetch (no SDK — avoids Node.js compatibility issues) ──

const API_URL = 'https://api.anthropic.com/v1/messages'

interface TextBlock  { type: 'text'; text: string }
interface ToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
interface ToolResultBlock { type: 'tool_result'; tool_use_id: string; content: string }
type ContentBlock = TextBlock | ToolUseBlock

interface ApiMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[] | ToolResultBlock[]
}

interface ApiResponse {
  stop_reason: 'end_turn' | 'tool_use'
  content: ContentBlock[]
}

const today = localToday

function buildSystemPrompt(): string {
  return `Eres el asistente inteligente de la Finca San José, una finca agropecuaria en Colombia.
Respondes siempre en español, de forma directa y concisa. Tienes acceso completo a todos los datos de la finca y puedes consultar o registrar cualquier información.

HOY: ${today()}

═══ DATOS DISPONIBLES ═══

ANIMALES (tabla: animals)
- Especies: cattle (bovinos), pig (porcinos)
- Estados: active, sold, deceased, culled
- Etapas bovinos: calf, heifer, cow, bull, steer
- Etapas porcinos: piglet, gilt, sow, boar, fattening

BOVINOS (tabla: cattle_details)
- Preñez: is_pregnant, conception_date, expected_birth, last_birth_date, birth_count
- Partos: tabla calf_births (cow_id, calf_id, birth_date)

PORCINOS (tabla: pig_details)
- Preñez: is_pregnant, service_date, expected_birth, litter_count
- Camadas: tabla litters (sow_id, birth_date, total_born, born_alive)
- Celos: tabla heat_records (animal_id, observed_date) — ciclo 21 días

VACUNAS / MEDICAMENTOS
- vaccination_records: aplicaciones por animal
- vaccines: catálogo de vacunas
- inventory_items: los productos se buscan aquí por nombre

INVENTARIO
- inventory_categories: categorías de productos
- inventory_items: nombre, cantidad, unidad, stock_mínimo
- inventory_movements: entradas (in) y salidas (out) — trigger actualiza stock automáticamente

PRODUCCIÓN DE LECHE
- milk_sessions: producción total del hato por ordeño
- milk_records: producción por vaca individual

TAREAS (tabla: tasks)
- Estados: pending, in_progress, completed
- Prioridades: low, medium, high
- Categorías: health, feeding, maintenance, reproduction, other

GASTOS (tabla: gastos)
- Campos: fecha, monto (COP), descripcion, categoria, foto_url
- Categorías: alimentacion, veterinaria, mantenimiento, equipos, combustible, personal, otro

═══ REGLAS ═══
- Si no se especifica fecha → usa hoy (${today()})
- Para acciones, ejecútalas directamente y confirma lo hecho
- Si necesitas más datos para responder bien, usa la herramienta adecuada
- Sé conciso — una o dos oraciones por respuesta si es posible
- Los montos son en pesos colombianos (COP)`
}

async function callClaude(messages: ApiMessage[]): Promise<ApiResponse> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY as string,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: buildSystemPrompt(),
      tools,
      messages
    })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export const TOOL_LABELS: Record<string, string> = {
  // Consultas
  get_farm_summary:         'Consultando estado de la finca...',
  get_animals:              'Buscando animales...',
  get_animal_detail:        'Cargando detalle del animal...',
  get_litters:              'Consultando camadas...',
  get_calf_births:          'Consultando partos bovinos...',
  get_inventory:            'Revisando inventario...',
  get_inventory_movements:  'Revisando movimientos de inventario...',
  get_all_tasks:            'Consultando tareas...',
  get_pending_tasks:        'Revisando tareas pendientes...',
  get_recent_expenses:      'Consultando gastos...',
  get_expense_stats:        'Calculando estadísticas de gastos...',
  get_milk_production:      'Consultando producción de leche...',
  get_heat_records:         'Consultando registros de celo...',
  get_vaccination_history:  'Consultando historial de vacunas...',
  // Acciones
  register_animal:          'Registrando animal...',
  update_animal_status:     'Actualizando estado del animal...',
  register_cattle_birth:    'Registrando parto bovino...',
  register_litter:          'Registrando camada porcina...',
  apply_batch_vaccination:  'Aplicando vacunación al lote...',
  apply_single_vaccination: 'Registrando vacunación...',
  add_inventory_stock:      'Agregando stock al inventario...',
  register_milk_session:    'Registrando producción de leche...',
  register_milk_record:     'Registrando leche por vaca...',
  register_heat:            'Registrando celo...',
  update_pregnancy:         'Actualizando estado de preñez...',
  create_expense:           'Registrando gasto...',
  create_task:              'Creando tarea...',
  update_task:              'Actualizando tarea...',
  complete_task:            'Completando tarea...',
}

interface Tool {
  name: string
  description: string
  input_schema: { type: 'object'; properties: Record<string, unknown>; required: string[] }
}

const tools: Tool[] = [
  // ── Consultas generales ────────────────────────────────────────────────────
  {
    name: 'get_farm_summary',
    description: 'Resumen general de la finca: animales activos por especie, preñeces actuales, tareas pendientes, productos con stock bajo o agotado, gastos del mes en curso y producción de leche de los últimos 7 días.',
    input_schema: { type: 'object' as const, properties: {}, required: [] }
  },
  {
    name: 'get_animals',
    description: 'Lista animales registrados. Puede filtrar por especie y/o estado. Por defecto muestra solo los activos. Úsalo para buscar animales específicos o hacer conteos.',
    input_schema: {
      type: 'object' as const,
      properties: {
        species: { type: 'string', enum: ['cattle', 'pig'], description: 'cattle=bovinos, pig=porcinos. Omitir para ambas especies.' },
        status: { type: 'string', enum: ['active', 'sold', 'deceased', 'culled'], description: 'Estado del animal. Por defecto "active".' }
      },
      required: []
    }
  },
  {
    name: 'get_animal_detail',
    description: 'Detalle completo de un animal: datos básicos, estado de preñez, últimas vacunaciones. Usa el arete (ear_tag) o nombre del animal.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ear_tag: { type: 'string', description: 'Arete (ej: "001") o nombre del animal (ej: "Lola"). Se busca por coincidencia parcial.' }
      },
      required: ['ear_tag']
    }
  },
  // ── Consultas porcinos ─────────────────────────────────────────────────────
  {
    name: 'get_litters',
    description: 'Historial de camadas porcinas registradas: fecha de parto, total nacidos, nacidos vivos, y la cerda madre.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sow_ear_tag: { type: 'string', description: 'Filtrar por cerda específica (opcional)' }
      },
      required: []
    }
  },
  {
    name: 'get_heat_records',
    description: 'Registros de celo de cerdas. Útil para planificar inseminaciones (próximo celo = +21 días).',
    input_schema: {
      type: 'object' as const,
      properties: {
        animal_ear_tag: { type: 'string', description: 'Filtrar por cerda específica (opcional)' },
        days: { type: 'number', description: 'Días hacia atrás (default 60)' }
      },
      required: []
    }
  },
  // ── Consultas bovinos ──────────────────────────────────────────────────────
  {
    name: 'get_calf_births',
    description: 'Historial de partos bovinos: qué vaca parió, qué ternero nació, en qué fecha.',
    input_schema: {
      type: 'object' as const,
      properties: {
        cow_ear_tag: { type: 'string', description: 'Filtrar por vaca específica (opcional)' },
        days: { type: 'number', description: 'Días hacia atrás (default 365)' }
      },
      required: []
    }
  },
  // ── Consultas inventario ───────────────────────────────────────────────────
  {
    name: 'get_inventory',
    description: 'Inventario completo: todos los productos con stock actual, unidad, stock mínimo y categoría.',
    input_schema: { type: 'object' as const, properties: {}, required: [] }
  },
  {
    name: 'get_inventory_movements',
    description: 'Historial de entradas y salidas de un producto del inventario.',
    input_schema: {
      type: 'object' as const,
      properties: {
        item_name: { type: 'string', description: 'Nombre del producto (búsqueda parcial)' },
        days: { type: 'number', description: 'Días hacia atrás (default 30)' }
      },
      required: ['item_name']
    }
  },
  // ── Consultas tareas ───────────────────────────────────────────────────────
  {
    name: 'get_pending_tasks',
    description: 'Tareas pendientes o en progreso, ordenadas por fecha límite.',
    input_schema: { type: 'object' as const, properties: {}, required: [] }
  },
  {
    name: 'get_all_tasks',
    description: 'Todas las tareas incluyendo completadas. Permite filtrar por estado y/o categoría.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'Filtrar por estado (opcional)' },
        category: { type: 'string', enum: ['health', 'feeding', 'maintenance', 'reproduction', 'other'], description: 'Filtrar por categoría (opcional)' },
        limit: { type: 'number', description: 'Máximo de resultados (default 50)' }
      },
      required: []
    }
  },
  // ── Consultas gastos ───────────────────────────────────────────────────────
  {
    name: 'get_recent_expenses',
    description: 'Gastos recientes de la finca con fecha, monto, descripción y categoría.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days: { type: 'number', description: 'Días hacia atrás (default 30)' }
      },
      required: []
    }
  },
  {
    name: 'get_expense_stats',
    description: 'Estadísticas de gastos agrupadas por categoría: total por categoría, gasto total del período, número de registros.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days: { type: 'number', description: 'Días hacia atrás (default 30)' },
        year_month: { type: 'string', description: 'Mes específico en formato YYYY-MM (opcional, ej: "2026-05")' }
      },
      required: []
    }
  },
  // ── Consultas leche ────────────────────────────────────────────────────────
  {
    name: 'get_milk_production',
    description: 'Producción de leche: sesiones totales del hato y/o registros por vaca individual.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days: { type: 'number', description: 'Días hacia atrás (default 30)' },
        animal_ear_tag: { type: 'string', description: 'Filtrar por vaca específica (opcional)' }
      },
      required: []
    }
  },
  // ── Consultas vacunas ──────────────────────────────────────────────────────
  {
    name: 'get_vaccination_history',
    description: 'Historial completo de vacunaciones de un animal específico.',
    input_schema: {
      type: 'object' as const,
      properties: {
        animal_ear_tag: { type: 'string', description: 'Arete o nombre del animal' }
      },
      required: ['animal_ear_tag']
    }
  },
  // ── Acciones: animales ─────────────────────────────────────────────────────
  {
    name: 'register_animal',
    description: 'Registra un nuevo animal en la finca (vaca, cerdo, ternero, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Nombre del animal (opcional)' },
        ear_tag: { type: 'string', description: 'Arete o identificador único' },
        species: { type: 'string', enum: ['cattle', 'pig'], description: 'cattle=bovino, pig=porcino' },
        sex: { type: 'string', enum: ['male', 'female'], description: 'Sexo' },
        birth_date: { type: 'string', description: 'Fecha de nacimiento YYYY-MM-DD (opcional)' },
        stage: { type: 'string', description: 'Etapa: cattle→(calf/heifer/cow/bull/steer), pig→(piglet/gilt/sow/boar/fattening)' },
        mother_ear_tag: { type: 'string', description: 'Arete de la madre (opcional)' },
        notes: { type: 'string', description: 'Notas adicionales (opcional)' }
      },
      required: ['species', 'sex']
    }
  },
  {
    name: 'update_animal_status',
    description: 'Cambia el estado de un animal: venderlo, marcar como fallecido o descartado.',
    input_schema: {
      type: 'object' as const,
      properties: {
        animal_ear_tag: { type: 'string', description: 'Arete o nombre del animal' },
        status: { type: 'string', enum: ['active', 'sold', 'deceased', 'culled'], description: 'Nuevo estado' },
        notes: { type: 'string', description: 'Notas sobre el cambio (opcional)' }
      },
      required: ['animal_ear_tag', 'status']
    }
  },
  {
    name: 'register_cattle_birth',
    description: 'Registra un parto bovino: crea el ternero, vincula a la madre, actualiza estado de preñez de la vaca.',
    input_schema: {
      type: 'object' as const,
      properties: {
        cow_ear_tag: { type: 'string', description: 'Arete o nombre de la vaca madre' },
        birth_date: { type: 'string', description: 'Fecha del parto YYYY-MM-DD' },
        calf_ear_tag: { type: 'string', description: 'Arete del ternero (opcional)' },
        calf_name: { type: 'string', description: 'Nombre del ternero (opcional)' },
        calf_sex: { type: 'string', enum: ['male', 'female'], description: 'Sexo del ternero' },
        notes: { type: 'string', description: 'Notas (opcional)' }
      },
      required: ['cow_ear_tag', 'birth_date', 'calf_sex']
    }
  },
  {
    name: 'register_litter',
    description: 'Registra una camada porcina (parto de cerda): fecha, total nacidos, nacidos vivos. Actualiza el contador de camadas de la cerda.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sow_ear_tag: { type: 'string', description: 'Arete o nombre de la cerda madre' },
        birth_date: { type: 'string', description: 'Fecha del parto YYYY-MM-DD' },
        total_born: { type: 'number', description: 'Total de lechones nacidos' },
        born_alive: { type: 'number', description: 'Lechones nacidos vivos' },
        notes: { type: 'string', description: 'Notas (opcional)' }
      },
      required: ['sow_ear_tag', 'birth_date', 'total_born', 'born_alive']
    }
  },
  // ── Acciones: vacunas ──────────────────────────────────────────────────────
  {
    name: 'apply_batch_vaccination',
    description: 'Aplica una vacuna o medicamento a todos los lechones activos de una cerda. Descuenta del inventario automáticamente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sow_ear_tag: { type: 'string', description: 'Arete o nombre de la cerda madre' },
        vaccine_name: { type: 'string', description: 'Nombre del producto en el inventario' },
        quantity_per_dose: { type: 'number', description: 'Cantidad a aplicar por lechón' },
        applied_date: { type: 'string', description: 'Fecha YYYY-MM-DD' },
        notes: { type: 'string' }
      },
      required: ['sow_ear_tag', 'vaccine_name', 'quantity_per_dose', 'applied_date']
    }
  },
  {
    name: 'apply_single_vaccination',
    description: 'Aplica una vacuna o medicamento a un animal específico. Descuenta del inventario automáticamente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        animal_ear_tag: { type: 'string', description: 'Arete o nombre del animal' },
        vaccine_name: { type: 'string', description: 'Nombre del producto en el inventario' },
        quantity_used: { type: 'number' },
        applied_date: { type: 'string', description: 'Fecha YYYY-MM-DD' },
        next_date: { type: 'string', description: 'Próxima dosis YYYY-MM-DD (opcional)' },
        notes: { type: 'string' }
      },
      required: ['animal_ear_tag', 'vaccine_name', 'quantity_used', 'applied_date']
    }
  },
  // ── Acciones: inventario ───────────────────────────────────────────────────
  {
    name: 'add_inventory_stock',
    description: 'Agrega stock a un producto existente en el inventario (entrada de mercancía comprada o recibida).',
    input_schema: {
      type: 'object' as const,
      properties: {
        item_name: { type: 'string', description: 'Nombre del producto (búsqueda parcial)' },
        quantity: { type: 'number', description: 'Cantidad a agregar' },
        date: { type: 'string', description: 'Fecha YYYY-MM-DD' },
        notes: { type: 'string', description: 'Notas (ej: "Compra proveedor X")' }
      },
      required: ['item_name', 'quantity', 'date']
    }
  },
  // ── Acciones: leche ────────────────────────────────────────────────────────
  {
    name: 'register_milk_session',
    description: 'Registra la producción total de un ordeño (todo el hato, sin desglose por vaca).',
    input_schema: {
      type: 'object' as const,
      properties: {
        liters: { type: 'number', description: 'Litros totales del ordeño' },
        recorded_date: { type: 'string', description: 'Fecha YYYY-MM-DD' },
        notes: { type: 'string' }
      },
      required: ['liters', 'recorded_date']
    }
  },
  {
    name: 'register_milk_record',
    description: 'Registra la producción de leche de una vaca específica.',
    input_schema: {
      type: 'object' as const,
      properties: {
        animal_ear_tag: { type: 'string', description: 'Arete o nombre de la vaca' },
        liters: { type: 'number' },
        recorded_date: { type: 'string', description: 'Fecha YYYY-MM-DD' },
        notes: { type: 'string' }
      },
      required: ['animal_ear_tag', 'liters', 'recorded_date']
    }
  },
  // ── Acciones: porcinos ─────────────────────────────────────────────────────
  {
    name: 'register_heat',
    description: 'Registra un celo observado en una cerda.',
    input_schema: {
      type: 'object' as const,
      properties: {
        animal_ear_tag: { type: 'string', description: 'Arete o nombre de la cerda' },
        observed_date: { type: 'string', description: 'Fecha YYYY-MM-DD' },
        notes: { type: 'string' }
      },
      required: ['animal_ear_tag', 'observed_date']
    }
  },
  {
    name: 'update_pregnancy',
    description: 'Actualiza el estado de preñez de una vaca o cerda.',
    input_schema: {
      type: 'object' as const,
      properties: {
        animal_ear_tag: { type: 'string', description: 'Arete o nombre del animal' },
        is_pregnant: { type: 'boolean' },
        service_date: { type: 'string', description: 'Fecha de servicio/monta/inseminación YYYY-MM-DD (opcional)' },
        expected_birth: { type: 'string', description: 'Fecha esperada de parto YYYY-MM-DD (opcional)' }
      },
      required: ['animal_ear_tag', 'is_pregnant']
    }
  },
  // ── Acciones: gastos ───────────────────────────────────────────────────────
  {
    name: 'create_expense',
    description: 'Registra un gasto de la finca.',
    input_schema: {
      type: 'object' as const,
      properties: {
        monto: { type: 'number', description: 'Monto en pesos colombianos' },
        descripcion: { type: 'string' },
        categoria: {
          type: 'string',
          enum: ['alimentacion', 'veterinaria', 'mantenimiento', 'equipos', 'combustible', 'personal', 'otro']
        },
        fecha: { type: 'string', description: 'Fecha YYYY-MM-DD' }
      },
      required: ['monto', 'descripcion', 'categoria', 'fecha']
    }
  },
  // ── Acciones: tareas ───────────────────────────────────────────────────────
  {
    name: 'create_task',
    description: 'Crea una tarea o recordatorio en la finca.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        category: { type: 'string', enum: ['health', 'feeding', 'maintenance', 'reproduction', 'other'] },
        due_date: { type: 'string', description: 'Fecha límite YYYY-MM-DD (opcional)' }
      },
      required: ['title', 'priority', 'category']
    }
  },
  {
    name: 'update_task',
    description: 'Actualiza una tarea existente: cambia estado, prioridad, fecha límite o descripción.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title_search: { type: 'string', description: 'Parte del título de la tarea a actualizar' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'Nuevo estado (opcional)' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Nueva prioridad (opcional)' },
        due_date: { type: 'string', description: 'Nueva fecha límite YYYY-MM-DD (opcional)' },
        description: { type: 'string', description: 'Nueva descripción (opcional)' }
      },
      required: ['title_search']
    }
  },
  {
    name: 'complete_task',
    description: 'Marca una tarea como completada.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title_search: { type: 'string', description: 'Parte del título de la tarea a completar' }
      },
      required: ['title_search']
    }
  }
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function findAnimal(identifier: string) {
  const { data: byTag } = await supabase
    .from('animals').select('id, ear_tag, name, species, sex, status, stage')
    .ilike('ear_tag', `%${identifier}%`).limit(3)
  if (byTag?.length) return byTag[0]
  const { data: byName } = await supabase
    .from('animals').select('id, ear_tag, name, species, sex, status, stage')
    .ilike('name', `%${identifier}%`).limit(3)
  return byName?.[0] ?? null
}

async function findInventoryItem(name: string) {
  const { data } = await supabase
    .from('inventory_items').select('id, name, quantity, unit')
    .ilike('name', `%${name}%`).limit(3)
  return data?.[0] ?? null
}

// ─── Tool implementations ─────────────────────────────────────────────────────

async function getFarmSummary(): Promise<string> {
  const firstOfMonth = today().slice(0, 7) + '-01'
  const sevenDaysAgo = localDateOffset(-7)

  const [cattle, pigs, pregnantCows, pregnantSows, tasks, items, expenses, milkSessions] = await Promise.all([
    supabase.from('animals').select('id', { count: 'exact', head: true }).eq('species', 'cattle').eq('status', 'active'),
    supabase.from('animals').select('id', { count: 'exact', head: true }).eq('species', 'pig').eq('status', 'active'),
    supabase.from('cattle_details').select('animal_id', { count: 'exact', head: true }).eq('is_pregnant', true),
    supabase.from('pig_details').select('animal_id', { count: 'exact', head: true }).eq('is_pregnant', true),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']),
    supabase.from('inventory_items').select('name, quantity, min_quantity'),
    supabase.from('gastos').select('monto').gte('fecha', firstOfMonth),
    supabase.from('milk_sessions').select('liters, recorded_date').gte('recorded_date', sevenDaysAgo).order('recorded_date', { ascending: false })
  ])

  const lowStock = (items.data ?? []).filter(i => i.quantity <= i.min_quantity).map(i => i.name)
  const outOfStock = (items.data ?? []).filter(i => i.quantity === 0).map(i => i.name)
  const totalExpenses = (expenses.data ?? []).reduce((s, g) => s + Number(g.monto), 0)
  const totalMilk7d = (milkSessions.data ?? []).reduce((s, m) => s + Number(m.liters), 0)

  return JSON.stringify({
    bovinos_activos: cattle.count ?? 0,
    porcinos_activos: pigs.count ?? 0,
    vacas_preñadas: pregnantCows.count ?? 0,
    cerdas_preñadas: pregnantSows.count ?? 0,
    tareas_pendientes: tasks.count ?? 0,
    productos_stock_bajo: lowStock,
    productos_agotados: outOfStock,
    gastos_mes_actual_COP: totalExpenses,
    leche_ultimos_7_dias_litros: totalMilk7d
  })
}

async function getAnimals(input: { species?: string; status?: string }): Promise<string> {
  let query = supabase
    .from('animals')
    .select('name, ear_tag, species, sex, status, stage, birth_date, notes')
    .eq('status', input.status ?? 'active')
    .order('ear_tag')
  if (input.species) query = query.eq('species', input.species as 'cattle' | 'pig')
  const { data, error } = await query
  if (error) return `Error: ${error.message}`
  return JSON.stringify(data ?? [])
}

async function getAnimalDetail(input: { ear_tag: string }): Promise<string> {
  const animal = await findAnimal(input.ear_tag)
  if (!animal) return `No encontré animal con arete o nombre "${input.ear_tag}".`

  const [detail, vaccinations, milkRecent] = await Promise.all([
    animal.species === 'cattle'
      ? supabase.from('cattle_details').select('*').eq('animal_id', animal.id).single()
      : supabase.from('pig_details').select('*').eq('animal_id', animal.id).single(),
    supabase.from('vaccination_records')
      .select('applied_date, next_date, notes, inventory_item:inventory_items(name)')
      .eq('animal_id', animal.id)
      .order('applied_date', { ascending: false })
      .limit(10),
    animal.species === 'cattle'
      ? supabase.from('milk_records').select('recorded_date, liters')
          .eq('animal_id', animal.id)
          .order('recorded_date', { ascending: false }).limit(10)
      : Promise.resolve({ data: [] })
  ])

  return JSON.stringify({
    animal,
    detalle: detail.data,
    vacunaciones_recientes: vaccinations.data ?? [],
    leche_reciente: milkRecent.data ?? []
  })
}

async function getLitters(input: { sow_ear_tag?: string }): Promise<string> {
  let query = supabase
    .from('litters')
    .select('id, birth_date, total_born, born_alive, notes, sow:animals!litters_sow_id_fkey(id, ear_tag, name)')
    .order('birth_date', { ascending: false })
    .limit(30)

  if (input.sow_ear_tag) {
    const sow = await findAnimal(input.sow_ear_tag)
    if (sow) query = query.eq('sow_id', sow.id)
  }

  const { data, error } = await query
  if (error) return `Error: ${error.message}`
  return JSON.stringify(data ?? [])
}

async function getCalfBirths(input: { cow_ear_tag?: string; days?: number }): Promise<string> {
  const days = input.days ?? 365
  const since = localDateOffset(-days)

  let query = supabase
    .from('calf_births')
    .select(`
      birth_date, notes,
      cow:animals!calf_births_cow_id_fkey(ear_tag, name),
      calf:animals!calf_births_calf_id_fkey(ear_tag, name, sex, stage)
    `)
    .gte('birth_date', since)
    .order('birth_date', { ascending: false })

  if (input.cow_ear_tag) {
    const cow = await findAnimal(input.cow_ear_tag)
    if (cow) query = query.eq('cow_id', cow.id)
  }

  const { data, error } = await query
  if (error) return `Error: ${error.message}`
  return JSON.stringify(data ?? [])
}

async function getInventory(): Promise<string> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('name, quantity, unit, min_quantity, description, category:inventory_categories(name)')
    .order('name')
  if (error) return `Error: ${error.message}`
  const items = (data ?? []).map(i => ({
    ...i,
    estado: i.quantity === 0 ? 'agotado' : i.quantity <= i.min_quantity ? 'bajo' : 'ok'
  }))
  return JSON.stringify(items)
}

async function getInventoryMovements(input: { item_name: string; days?: number }): Promise<string> {
  const item = await findInventoryItem(input.item_name)
  if (!item) return `No encontré producto "${input.item_name}" en el inventario.`

  const days = input.days ?? 30
  const since = localDateOffset(-days)

  const { data, error } = await supabase
    .from('inventory_movements')
    .select('type, quantity, date, notes')
    .eq('item_id', item.id)
    .gte('date', since)
    .order('date', { ascending: false })

  if (error) return `Error: ${error.message}`
  return JSON.stringify({ producto: item.name, stock_actual: item.quantity, unidad: item.unit, movimientos: data ?? [] })
}

async function getPendingTasks(): Promise<string> {
  const { data, error } = await supabase
    .from('tasks')
    .select('title, status, priority, due_date, category, description')
    .in('status', ['pending', 'in_progress'])
    .order('due_date', { ascending: true, nullsFirst: false })
  if (error) return `Error: ${error.message}`
  return JSON.stringify(data ?? [])
}

async function getAllTasks(input: { status?: string; category?: string; limit?: number }): Promise<string> {
  let query = supabase
    .from('tasks')
    .select('title, status, priority, due_date, category, description, created_at')
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 50)

  if (input.status) query = query.eq('status', input.status)
  if (input.category) query = query.eq('category', input.category)

  const { data, error } = await query
  if (error) return `Error: ${error.message}`
  return JSON.stringify(data ?? [])
}

async function getRecentExpenses(input: { days?: number }): Promise<string> {
  const days = input.days ?? 30
  const since = localDateOffset(-days)
  const { data, error } = await supabase
    .from('gastos').select('fecha, monto, descripcion, categoria')
    .gte('fecha', since).order('fecha', { ascending: false })
  if (error) return `Error: ${error.message}`
  const total = (data ?? []).reduce((s, g) => s + Number(g.monto), 0)
  return JSON.stringify({ gastos: data ?? [], total_COP: total, periodo_dias: days })
}

async function getExpenseStats(input: { days?: number; year_month?: string }): Promise<string> {
  let since: string
  let until: string | undefined

  if (input.year_month) {
    since = input.year_month + '-01'
    const [y, m] = input.year_month.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    until = `${input.year_month}-${String(lastDay).padStart(2, '0')}`
  } else {
    const days = input.days ?? 30
    since = localDateOffset(-days)
  }

  let query = supabase.from('gastos').select('monto, categoria').gte('fecha', since)
  if (until) query = query.lte('fecha', until)

  const { data, error } = await query
  if (error) return `Error: ${error.message}`

  const byCategory: Record<string, { total: number; count: number }> = {}
  let grandTotal = 0
  for (const g of data ?? []) {
    const cat = g.categoria as string
    if (!byCategory[cat]) byCategory[cat] = { total: 0, count: 0 }
    byCategory[cat].total += Number(g.monto)
    byCategory[cat].count++
    grandTotal += Number(g.monto)
  }

  const stats = Object.entries(byCategory)
    .map(([categoria, v]) => ({ categoria, total_COP: v.total, registros: v.count }))
    .sort((a, b) => b.total_COP - a.total_COP)

  return JSON.stringify({
    periodo: input.year_month ?? `últimos ${input.days ?? 30} días`,
    total_general_COP: grandTotal,
    por_categoria: stats
  })
}

async function getMilkProduction(input: { days?: number; animal_ear_tag?: string }): Promise<string> {
  const days = input.days ?? 30
  const since = localDateOffset(-days)

  if (input.animal_ear_tag) {
    const animal = await findAnimal(input.animal_ear_tag)
    if (!animal) return `No encontré vaca "${input.animal_ear_tag}".`
    const { data } = await supabase
      .from('milk_records').select('recorded_date, liters, notes')
      .eq('animal_id', animal.id).gte('recorded_date', since)
      .order('recorded_date', { ascending: false })
    const total = (data ?? []).reduce((s, r) => s + Number(r.liters), 0)
    return JSON.stringify({ vaca: animal.ear_tag ?? animal.name, registros: data ?? [], total_litros: total })
  }

  const [sessions, records] = await Promise.all([
    supabase.from('milk_sessions').select('recorded_date, liters, notes')
      .gte('recorded_date', since).order('recorded_date', { ascending: false }),
    supabase.from('milk_records').select('recorded_date, liters, animal:animals(ear_tag, name)')
      .gte('recorded_date', since).order('recorded_date', { ascending: false })
  ])

  const totalSessions = (sessions.data ?? []).reduce((s, r) => s + Number(r.liters), 0)
  const totalRecords = (records.data ?? []).reduce((s, r) => s + Number(r.liters), 0)
  return JSON.stringify({
    sesiones_hato: sessions.data ?? [],
    total_sesiones_litros: totalSessions,
    registros_por_vaca: records.data ?? [],
    total_individual_litros: totalRecords,
    periodo_dias: days
  })
}

async function getHeatRecords(input: { animal_ear_tag?: string; days?: number }): Promise<string> {
  const days = input.days ?? 60
  const since = localDateOffset(-days)

  let query = supabase
    .from('heat_records')
    .select('observed_date, notes, animal:animals(ear_tag, name, species)')
    .gte('observed_date', since)
    .order('observed_date', { ascending: false })

  if (input.animal_ear_tag) {
    const animal = await findAnimal(input.animal_ear_tag)
    if (animal) query = query.eq('animal_id', animal.id)
  }

  const { data, error } = await query
  if (error) return `Error: ${error.message}`

  const enriched = (data ?? []).map(r => ({
    ...r,
    proximo_celo_estimado: addDaysToDate(r.observed_date, 21)
  }))
  return JSON.stringify(enriched)
}

async function getVaccinationHistory(input: { animal_ear_tag: string }): Promise<string> {
  const animal = await findAnimal(input.animal_ear_tag)
  if (!animal) return `No encontré animal "${input.animal_ear_tag}".`

  const { data, error } = await supabase
    .from('vaccination_records')
    .select('applied_date, next_date, applied_by, notes, inventory_item:inventory_items(name, unit)')
    .eq('animal_id', animal.id)
    .order('applied_date', { ascending: false })

  if (error) return `Error: ${error.message}`
  return JSON.stringify({ animal: animal.ear_tag ?? animal.name, historial: data ?? [] })
}

async function registerAnimal(input: {
  name?: string; ear_tag?: string; species: string; sex: string
  birth_date?: string; stage?: string; mother_ear_tag?: string; notes?: string
}): Promise<string> {
  let mother_id: string | null = null
  if (input.mother_ear_tag) {
    const mother = await findAnimal(input.mother_ear_tag)
    if (!mother) return `No encontré la madre "${input.mother_ear_tag}".`
    mother_id = mother.id
  }

  const { data, error } = await supabase.from('animals').insert({
    name: input.name ?? null,
    ear_tag: input.ear_tag ?? null,
    species: input.species,
    sex: input.sex,
    birth_date: input.birth_date ?? null,
    stage: input.stage ?? null,
    mother_id,
    status: 'active',
    notes: input.notes ?? null
  }).select().single()

  if (error) return `Error: ${error.message}`

  // Create empty detail record
  if (input.species === 'cattle') {
    await supabase.from('cattle_details').insert({ animal_id: (data as { id: string }).id })
  } else {
    await supabase.from('pig_details').insert({ animal_id: (data as { id: string }).id })
  }

  const label = input.ear_tag ? `arete ${input.ear_tag}` : (input.name ?? 'sin identificar')
  return `✓ Animal registrado: ${input.species === 'cattle' ? 'bovino' : 'porcino'} ${input.sex === 'male' ? 'macho' : 'hembra'} — ${label}`
}

async function updateAnimalStatus(input: {
  animal_ear_tag: string; status: string; notes?: string
}): Promise<string> {
  const animal = await findAnimal(input.animal_ear_tag)
  if (!animal) return `No encontré animal "${input.animal_ear_tag}".`

  const updateData: Record<string, unknown> = { status: input.status }
  if (input.notes) updateData.notes = input.notes

  const { error } = await supabase.from('animals').update(updateData).eq('id', animal.id)
  if (error) return `Error: ${error.message}`

  const statusLabel: Record<string, string> = { sold: 'vendido', deceased: 'fallecido', culled: 'descartado', active: 'activo' }
  return `✓ ${animal.ear_tag ?? animal.name} marcado como ${statusLabel[input.status] ?? input.status}.`
}

async function registerCattleBirth(input: {
  cow_ear_tag: string; birth_date: string; calf_sex: string
  calf_ear_tag?: string; calf_name?: string; notes?: string
}): Promise<string> {
  const cow = await findAnimal(input.cow_ear_tag)
  if (!cow) return `No encontré vaca "${input.cow_ear_tag}".`
  if (cow.species !== 'cattle') return `${cow.ear_tag ?? cow.name} no es un bovino.`

  // Create calf animal
  const { data: calfData, error: calfError } = await supabase.from('animals').insert({
    ear_tag: input.calf_ear_tag ?? null,
    name: input.calf_name ?? null,
    species: 'cattle',
    sex: input.calf_sex,
    birth_date: input.birth_date,
    stage: 'calf',
    mother_id: cow.id,
    status: 'active',
    notes: input.notes ?? null
  }).select().single()

  if (calfError) return `Error al crear ternero: ${calfError.message}`
  const calf = calfData as { id: string }

  // Create calf_births record
  const { error: birthError } = await supabase.from('calf_births').insert({
    cow_id: cow.id, calf_id: calf.id,
    birth_date: input.birth_date, notes: input.notes ?? null
  })
  if (birthError) return `Error al registrar parto: ${birthError.message}`

  // Create cattle_details for calf
  await supabase.from('cattle_details').insert({ animal_id: calf.id })

  // Update cow: not pregnant, update last_birth_date, increment birth_count
  const { data: cowDetail } = await supabase.from('cattle_details')
    .select('birth_count').eq('animal_id', cow.id).single()
  const newCount = ((cowDetail as { birth_count: number } | null)?.birth_count ?? 0) + 1

  await supabase.from('cattle_details').update({
    is_pregnant: false,
    last_birth_date: input.birth_date,
    birth_count: newCount,
    expected_birth: null
  }).eq('animal_id', cow.id)

  const terneroLabel = input.calf_ear_tag ? `arete ${input.calf_ear_tag}` : (input.calf_name ?? 'sin identificar')
  return `✓ Parto registrado: ${cow.ear_tag ?? cow.name} parió un ternero ${input.calf_sex === 'male' ? 'macho' : 'hembra'} (${terneroLabel}) el ${input.birth_date}. Parto #${newCount}. Estado de preñez actualizado a no preñada.`
}

async function registerLitter(input: {
  sow_ear_tag: string; birth_date: string
  total_born: number; born_alive: number; notes?: string
}): Promise<string> {
  const sow = await findAnimal(input.sow_ear_tag)
  if (!sow) return `No encontré cerda "${input.sow_ear_tag}".`
  if (sow.species !== 'pig') return `${sow.ear_tag ?? sow.name} no es un porcino.`

  const { error: litterError } = await supabase.from('litters').insert({
    sow_id: sow.id, birth_date: input.birth_date,
    total_born: input.total_born, born_alive: input.born_alive,
    notes: input.notes ?? null
  })
  if (litterError) return `Error: ${litterError.message}`

  // Update sow: not pregnant, increment litter_count
  const { data: sowDetail } = await supabase.from('pig_details')
    .select('litter_count').eq('animal_id', sow.id).single()
  const newCount = ((sowDetail as { litter_count: number } | null)?.litter_count ?? 0) + 1

  await supabase.from('pig_details').update({
    is_pregnant: false,
    litter_count: newCount,
    expected_birth: null,
    service_date: null
  }).eq('animal_id', sow.id)

  return `✓ Camada registrada: ${sow.ear_tag ?? sow.name} — ${input.total_born} nacidos (${input.born_alive} vivos) el ${input.birth_date}. Camada #${newCount}. Estado de preñez actualizado.`
}

async function applyBatchVaccination(input: {
  sow_ear_tag: string; vaccine_name: string
  quantity_per_dose: number; applied_date: string; notes?: string
}): Promise<string> {
  const sow = await findAnimal(input.sow_ear_tag)
  if (!sow) return `No encontré cerda "${input.sow_ear_tag}".`

  const item = await findInventoryItem(input.vaccine_name)
  if (!item) return `"${input.vaccine_name}" no está en el inventario.`

  const { data: piglets } = await supabase
    .from('animals').select('id, ear_tag')
    .eq('mother_id', sow.id).eq('status', 'active')

  if (!piglets?.length) return `La cerda ${sow.ear_tag ?? sow.name} no tiene lechones activos.`

  const totalQty = piglets.length * input.quantity_per_dose
  if (item.quantity < totalQty) return `Stock insuficiente: necesitas ${totalQty} ${item.unit}, hay ${item.quantity}.`

  await createBatchVaccinationRecords(piglets.map(p => p.id), {
    vaccine_id: null, inventory_item_id: item.id,
    applied_date: input.applied_date, next_date: null,
    applied_by: null, notes: input.notes ?? null
  })
  await createMovement({
    item_id: item.id, type: 'out', quantity: totalQty,
    date: input.applied_date,
    notes: `Vacunación masiva — ${piglets.length} lechones de ${sow.ear_tag ?? sow.name}`
  })

  return `✓ ${item.name} aplicada a ${piglets.length} lechones de cerda ${sow.ear_tag ?? sow.name}. Descontados ${totalQty} ${item.unit} del inventario.`
}

async function applySingleVaccination(input: {
  animal_ear_tag: string; vaccine_name: string; quantity_used: number
  applied_date: string; next_date?: string; notes?: string
}): Promise<string> {
  const animal = await findAnimal(input.animal_ear_tag)
  if (!animal) return `No encontré animal "${input.animal_ear_tag}".`

  const item = await findInventoryItem(input.vaccine_name)
  if (!item) return `"${input.vaccine_name}" no está en el inventario.`
  if (item.quantity < input.quantity_used) return `Stock insuficiente: hay ${item.quantity} ${item.unit}.`

  await createVaccinationRecord({
    animal_id: animal.id, vaccine_id: null, inventory_item_id: item.id,
    applied_date: input.applied_date, next_date: input.next_date ?? null,
    applied_by: null, notes: input.notes ?? null
  })
  await createMovement({
    item_id: item.id, type: 'out', quantity: input.quantity_used,
    date: input.applied_date, notes: `Vacunación: ${animal.ear_tag ?? animal.name}`
  })

  return `✓ ${item.name} (${input.quantity_used} ${item.unit}) aplicada a ${animal.ear_tag ?? animal.name}. Inventario actualizado.`
}

async function addInventoryStock(input: {
  item_name: string; quantity: number; date: string; notes?: string
}): Promise<string> {
  const item = await findInventoryItem(input.item_name)
  if (!item) return `No encontré producto "${input.item_name}" en el inventario.`

  await createMovement({
    item_id: item.id, type: 'in', quantity: input.quantity,
    date: input.date, notes: input.notes ?? null
  })

  const newStock = item.quantity + input.quantity
  return `✓ ${input.quantity} ${item.unit} agregados a ${item.name}. Stock nuevo: ${newStock} ${item.unit}.`
}

async function registerMilkSession(input: {
  liters: number; recorded_date: string; notes?: string
}): Promise<string> {
  const { error } = await supabase.from('milk_sessions').insert({
    liters: input.liters, recorded_date: input.recorded_date, notes: input.notes ?? null
  })
  if (error) return `Error: ${error.message}`
  return `✓ Producción registrada: ${input.liters} litros el ${input.recorded_date}.`
}

async function registerMilkRecord(input: {
  animal_ear_tag: string; liters: number; recorded_date: string; notes?: string
}): Promise<string> {
  const animal = await findAnimal(input.animal_ear_tag)
  if (!animal) return `No encontré vaca "${input.animal_ear_tag}".`

  const { error } = await supabase.from('milk_records').insert({
    animal_id: animal.id, liters: input.liters,
    recorded_date: input.recorded_date, notes: input.notes ?? null
  })
  if (error) return `Error: ${error.message}`
  return `✓ ${input.liters} litros registrados para ${animal.ear_tag ?? animal.name} el ${input.recorded_date}.`
}

async function registerHeat(input: {
  animal_ear_tag: string; observed_date: string; notes?: string
}): Promise<string> {
  const animal = await findAnimal(input.animal_ear_tag)
  if (!animal) return `No encontré animal "${input.animal_ear_tag}".`

  const { error } = await supabase.from('heat_records').insert({
    animal_id: animal.id, observed_date: input.observed_date, notes: input.notes ?? null
  })
  if (error) return `Error: ${error.message}`

  const nextHeat = addDaysToDate(input.observed_date, 21)
  return `✓ Celo registrado para ${animal.ear_tag ?? animal.name} el ${input.observed_date}. Próximo celo estimado: ${nextHeat}.`
}

async function updatePregnancy(input: {
  animal_ear_tag: string; is_pregnant: boolean
  service_date?: string; expected_birth?: string
}): Promise<string> {
  const animal = await findAnimal(input.animal_ear_tag)
  if (!animal) return `No encontré animal "${input.animal_ear_tag}".`

  if (animal.species === 'cattle') {
    const { error } = await supabase.from('cattle_details').update({
      is_pregnant: input.is_pregnant,
      conception_date: input.service_date ?? null,
      expected_birth: input.expected_birth ?? null
    }).eq('animal_id', animal.id)
    if (error) return `Error: ${error.message}`
  } else {
    const { error } = await supabase.from('pig_details').update({
      is_pregnant: input.is_pregnant,
      service_date: input.service_date ?? null,
      expected_birth: input.expected_birth ?? null
    }).eq('animal_id', animal.id)
    if (error) return `Error: ${error.message}`
  }

  const estado = input.is_pregnant ? 'preñada' : 'no preñada'
  const partoInfo = input.expected_birth ? ` — parto esperado: ${input.expected_birth}` : ''
  return `✓ ${animal.ear_tag ?? animal.name} marcada como ${estado}${partoInfo}.`
}

async function createExpense(input: {
  monto: number; descripcion: string; categoria: string; fecha: string
}): Promise<string> {
  const { error } = await supabase.from('gastos').insert({
    monto: input.monto, descripcion: input.descripcion,
    categoria: input.categoria, fecha: input.fecha, foto_url: null
  })
  if (error) return `Error: ${error.message}`
  const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(input.monto)
  return `✓ Gasto registrado: ${input.descripcion} — ${fmt}`
}

async function createTaskFn(input: {
  title: string; description?: string; priority: string; category: string; due_date?: string
}): Promise<string> {
  const { error } = await supabase.from('tasks').insert({
    title: input.title, description: input.description ?? null,
    status: 'pending', priority: input.priority,
    category: input.category, due_date: input.due_date ?? null, animal_id: null
  })
  if (error) return `Error: ${error.message}`
  return `✓ Tarea creada: "${input.title}"`
}

async function updateTaskFn(input: {
  title_search: string; status?: string; priority?: string; due_date?: string; description?: string
}): Promise<string> {
  const { data } = await supabase
    .from('tasks').select('id, title')
    .ilike('title', `%${input.title_search}%`)
    .limit(3)

  if (!data?.length) return `No encontré tarea con "${input.title_search}".`
  const task = data[0]

  const updates: Record<string, unknown> = {}
  if (input.status) updates.status = input.status
  if (input.priority) updates.priority = input.priority
  if (input.due_date !== undefined) updates.due_date = input.due_date
  if (input.description !== undefined) updates.description = input.description

  if (!Object.keys(updates).length) return 'No se especificaron cambios a aplicar.'

  const { error } = await supabase.from('tasks').update(updates).eq('id', task.id)
  if (error) return `Error: ${error.message}`
  return `✓ Tarea "${task.title}" actualizada.`
}

async function completeTask(input: { title_search: string }): Promise<string> {
  const { data } = await supabase
    .from('tasks').select('id, title')
    .ilike('title', `%${input.title_search}%`)
    .in('status', ['pending', 'in_progress']).limit(3)

  if (!data?.length) return `No encontré tarea pendiente con "${input.title_search}".`
  const task = data[0]

  const { error } = await supabase.from('tasks').update({ status: 'completed' }).eq('id', task.id)
  if (error) return `Error: ${error.message}`
  return `✓ Tarea completada: "${task.title}"`
}

// ─── Router ───────────────────────────────────────────────────────────────────

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      // Consultas
      case 'get_farm_summary':         return await getFarmSummary()
      case 'get_animals':              return await getAnimals(input as Parameters<typeof getAnimals>[0])
      case 'get_animal_detail':        return await getAnimalDetail(input as Parameters<typeof getAnimalDetail>[0])
      case 'get_litters':              return await getLitters(input as Parameters<typeof getLitters>[0])
      case 'get_calf_births':          return await getCalfBirths(input as Parameters<typeof getCalfBirths>[0])
      case 'get_inventory':            return await getInventory()
      case 'get_inventory_movements':  return await getInventoryMovements(input as Parameters<typeof getInventoryMovements>[0])
      case 'get_pending_tasks':        return await getPendingTasks()
      case 'get_all_tasks':            return await getAllTasks(input as Parameters<typeof getAllTasks>[0])
      case 'get_recent_expenses':      return await getRecentExpenses(input as Parameters<typeof getRecentExpenses>[0])
      case 'get_expense_stats':        return await getExpenseStats(input as Parameters<typeof getExpenseStats>[0])
      case 'get_milk_production':      return await getMilkProduction(input as Parameters<typeof getMilkProduction>[0])
      case 'get_heat_records':         return await getHeatRecords(input as Parameters<typeof getHeatRecords>[0])
      case 'get_vaccination_history':  return await getVaccinationHistory(input as Parameters<typeof getVaccinationHistory>[0])
      // Acciones animales
      case 'register_animal':          return await registerAnimal(input as Parameters<typeof registerAnimal>[0])
      case 'update_animal_status':     return await updateAnimalStatus(input as Parameters<typeof updateAnimalStatus>[0])
      case 'register_cattle_birth':    return await registerCattleBirth(input as Parameters<typeof registerCattleBirth>[0])
      case 'register_litter':          return await registerLitter(input as Parameters<typeof registerLitter>[0])
      // Acciones vacunas
      case 'apply_batch_vaccination':  return await applyBatchVaccination(input as Parameters<typeof applyBatchVaccination>[0])
      case 'apply_single_vaccination': return await applySingleVaccination(input as Parameters<typeof applySingleVaccination>[0])
      // Acciones inventario
      case 'add_inventory_stock':      return await addInventoryStock(input as Parameters<typeof addInventoryStock>[0])
      // Acciones leche
      case 'register_milk_session':    return await registerMilkSession(input as Parameters<typeof registerMilkSession>[0])
      case 'register_milk_record':     return await registerMilkRecord(input as Parameters<typeof registerMilkRecord>[0])
      // Acciones porcinos
      case 'register_heat':            return await registerHeat(input as Parameters<typeof registerHeat>[0])
      case 'update_pregnancy':         return await updatePregnancy(input as Parameters<typeof updatePregnancy>[0])
      // Acciones gastos
      case 'create_expense':           return await createExpense(input as Parameters<typeof createExpense>[0])
      // Acciones tareas
      case 'create_task':              return await createTaskFn(input as Parameters<typeof createTaskFn>[0])
      case 'update_task':              return await updateTaskFn(input as Parameters<typeof updateTaskFn>[0])
      case 'complete_task':            return await completeTask(input as Parameters<typeof completeTask>[0])
      default: return `Herramienta desconocida: ${name}`
    }
  } catch (e) {
    return `Error en ${name}: ${(e as Error).message}`
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function sendMessage(
  history: ConversationMessage[],
  onToolUse?: (label: string) => void
): Promise<string> {
  let current: ApiMessage[] = history.map(m => ({ role: m.role, content: m.content }))

  for (let i = 0; i < 10; i++) {
    const response = await callClaude(current)

    if (response.stop_reason === 'end_turn') {
      const text = response.content.find(b => b.type === 'text') as TextBlock | undefined
      return text?.text ?? ''
    }

    if (response.stop_reason === 'tool_use') {
      const toolBlocks = response.content.filter(b => b.type === 'tool_use') as ToolUseBlock[]
      current.push({ role: 'assistant', content: response.content })

      const results: ToolResultBlock[] = []
      for (const tb of toolBlocks) {
        onToolUse?.(TOOL_LABELS[tb.name] ?? `Ejecutando ${tb.name}...`)
        const result = await executeTool(tb.name, tb.input)
        results.push({ type: 'tool_result', tool_use_id: tb.id, content: result })
      }
      current.push({ role: 'user', content: results })
      continue
    }

    break
  }

  return 'No pude completar la solicitud.'
}
