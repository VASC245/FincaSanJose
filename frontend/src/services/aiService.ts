import { supabase } from '@/lib/supabase'
import { createMovement } from './inventoryService'
import { createVaccinationRecord, createBatchVaccinationRecords } from './vaccinationService'

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
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
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

const today = () => new Date().toISOString().slice(0, 10)

const SYSTEM_PROMPT = `Eres el asistente de gestión de la Finca San José. Siempre respondes en español, de forma breve y directa.

La finca maneja bovinos (vacas, toros, terneros), porcinos (cerdas, cerdos, lechones), inventario de insumos, tareas, gastos y producción de leche.

Tienes acceso completo a todos los datos y puedes consultar y registrar cualquier información.
Cuando te pidan una acción, ejecútala directamente con las herramientas y confirma lo que hiciste.
Si el usuario no especifica fecha, usa hoy: ${today()}.
Sé conciso — una o dos oraciones si es posible.`

export const TOOL_LABELS: Record<string, string> = {
  get_farm_summary: 'Consultando estado de la finca...',
  get_animals: 'Buscando animales...',
  get_animal_detail: 'Cargando detalle del animal...',
  get_litters: 'Consultando camadas...',
  get_inventory: 'Revisando inventario...',
  get_pending_tasks: 'Revisando tareas pendientes...',
  get_recent_expenses: 'Consultando gastos...',
  get_milk_production: 'Consultando producción de leche...',
  get_heat_records: 'Consultando registros de celo...',
  get_vaccination_history: 'Consultando historial de vacunas...',
  apply_batch_vaccination: 'Aplicando vacunación al lote...',
  apply_single_vaccination: 'Registrando vacunación...',
  register_milk_session: 'Registrando producción de leche...',
  register_milk_record: 'Registrando leche por vaca...',
  register_heat: 'Registrando celo...',
  update_pregnancy: 'Actualizando estado de preñez...',
  create_expense: 'Registrando gasto...',
  create_task: 'Creando tarea...',
  complete_task: 'Completando tarea...',
}

interface Tool {
  name: string
  description: string
  input_schema: { type: 'object'; properties: Record<string, unknown>; required: string[] }
}

const tools: Tool[] = [
  // ── Consultas ──────────────────────────────────────────────────────────────
  {
    name: 'get_farm_summary',
    description: 'Resumen general: animales activos, preñeces, tareas pendientes, stock bajo, gastos del mes y producción de leche reciente.',
    input_schema: { type: 'object' as const, properties: {}, required: [] }
  },
  {
    name: 'get_animals',
    description: 'Lista animales con sus datos. Filtra por especie o estado.',
    input_schema: {
      type: 'object' as const,
      properties: {
        species: { type: 'string', enum: ['cattle', 'pig'], description: 'cattle=bovinos, pig=porcinos' },
        status: { type: 'string', enum: ['active', 'sold', 'deceased', 'culled'] }
      },
      required: []
    }
  },
  {
    name: 'get_animal_detail',
    description: 'Detalle completo de un animal: datos, preñez, vacunas, historial.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ear_tag: { type: 'string', description: 'Arete o nombre del animal' }
      },
      required: ['ear_tag']
    }
  },
  {
    name: 'get_litters',
    description: 'Camadas registradas de cerdas con conteo de lechones.',
    input_schema: { type: 'object' as const, properties: {}, required: [] }
  },
  {
    name: 'get_inventory',
    description: 'Inventario completo con stock actual de cada producto.',
    input_schema: { type: 'object' as const, properties: {}, required: [] }
  },
  {
    name: 'get_pending_tasks',
    description: 'Tareas pendientes o en progreso.',
    input_schema: { type: 'object' as const, properties: {}, required: [] }
  },
  {
    name: 'get_recent_expenses',
    description: 'Gastos recientes de la finca.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days: { type: 'number', description: 'Días hacia atrás (default 30)' }
      },
      required: []
    }
  },
  {
    name: 'get_milk_production',
    description: 'Producción de leche: sesiones totales del hato y registros por vaca individual.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days: { type: 'number', description: 'Días hacia atrás (default 30)' },
        animal_ear_tag: { type: 'string', description: 'Filtrar por vaca específica (opcional)' }
      },
      required: []
    }
  },
  {
    name: 'get_heat_records',
    description: 'Registros de celo de cerdas.',
    input_schema: {
      type: 'object' as const,
      properties: {
        animal_ear_tag: { type: 'string', description: 'Filtrar por cerda específica (opcional)' },
        days: { type: 'number', description: 'Días hacia atrás (default 60)' }
      },
      required: []
    }
  },
  {
    name: 'get_vaccination_history',
    description: 'Historial de vacunaciones de un animal.',
    input_schema: {
      type: 'object' as const,
      properties: {
        animal_ear_tag: { type: 'string', description: 'Arete o nombre del animal' }
      },
      required: ['animal_ear_tag']
    }
  },
  // ── Acciones vacunas ───────────────────────────────────────────────────────
  {
    name: 'apply_batch_vaccination',
    description: 'Aplica una vacuna o medicamento a todos los lechones activos de una cerda. Descuenta del inventario.',
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
    description: 'Aplica una vacuna o medicamento a un animal específico. Descuenta del inventario.',
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
  // ── Acciones leche ─────────────────────────────────────────────────────────
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
  // ── Acciones porcinos ──────────────────────────────────────────────────────
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
        service_date: { type: 'string', description: 'Fecha de servicio/monta YYYY-MM-DD (opcional)' },
        expected_birth: { type: 'string', description: 'Fecha esperada de parto YYYY-MM-DD (opcional)' }
      },
      required: ['animal_ear_tag', 'is_pregnant']
    }
  },
  // ── Acciones generales ─────────────────────────────────────────────────────
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
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)

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
  const totalExpenses = (expenses.data ?? []).reduce((s, g) => s + Number(g.monto), 0)
  const totalMilk7d = (milkSessions.data ?? []).reduce((s, m) => s + Number(m.liters), 0)

  return JSON.stringify({
    bovinos_activos: cattle.count ?? 0,
    porcinos_activos: pigs.count ?? 0,
    vacas_preñadas: pregnantCows.count ?? 0,
    cerdas_preñadas: pregnantSows.count ?? 0,
    tareas_pendientes: tasks.count ?? 0,
    productos_stock_bajo: lowStock,
    gastos_mes_actual: totalExpenses,
    leche_ultimos_7_dias_litros: totalMilk7d
  })
}

async function getAnimals(input: { species?: string; status?: string }): Promise<string> {
  let query = supabase
    .from('animals')
    .select('name, ear_tag, species, sex, status, stage, birth_date')
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

  const [detail, vaccinations] = await Promise.all([
    animal.species === 'cattle'
      ? supabase.from('cattle_details').select('*').eq('animal_id', animal.id).single()
      : supabase.from('pig_details').select('*').eq('animal_id', animal.id).single(),
    supabase.from('vaccination_records')
      .select('applied_date, next_date, notes, inventory_item:inventory_items(name)')
      .eq('animal_id', animal.id)
      .order('applied_date', { ascending: false })
      .limit(5)
  ])

  return JSON.stringify({ animal, detail: detail.data, recent_vaccinations: vaccinations.data ?? [] })
}

async function getLitters(): Promise<string> {
  const { data, error } = await supabase
    .from('litters')
    .select('id, birth_date, total_born, born_alive, notes, sow:animals!litters_sow_id_fkey(id, ear_tag, name)')
    .order('birth_date', { ascending: false })
    .limit(20)
  if (error) return `Error: ${error.message}`
  return JSON.stringify(data ?? [])
}

async function getInventory(): Promise<string> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('name, quantity, unit, min_quantity, category:inventory_categories(name)')
    .order('name')
  if (error) return `Error: ${error.message}`
  return JSON.stringify(data ?? [])
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

async function getRecentExpenses(input: { days?: number }): Promise<string> {
  const days = input.days ?? 30
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('gastos').select('fecha, monto, descripcion, categoria')
    .gte('fecha', since).order('fecha', { ascending: false })
  if (error) return `Error: ${error.message}`
  return JSON.stringify(data ?? [])
}

async function getMilkProduction(input: { days?: number; animal_ear_tag?: string }): Promise<string> {
  const days = input.days ?? 30
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

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
  return JSON.stringify({
    sesiones_totales: sessions.data ?? [],
    total_sesiones_litros: totalSessions,
    registros_por_vaca: records.data ?? []
  })
}

async function getHeatRecords(input: { animal_ear_tag?: string; days?: number }): Promise<string> {
  const days = input.days ?? 60
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

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
  return JSON.stringify(data ?? [])
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
  return `✓ Celo registrado para ${animal.ear_tag ?? animal.name} el ${input.observed_date}.`
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
  return `✓ ${animal.ear_tag ?? animal.name} marcada como ${estado}.`
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

async function createTask(input: {
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
      case 'get_farm_summary':        return await getFarmSummary()
      case 'get_animals':             return await getAnimals(input as Parameters<typeof getAnimals>[0])
      case 'get_animal_detail':       return await getAnimalDetail(input as Parameters<typeof getAnimalDetail>[0])
      case 'get_litters':             return await getLitters()
      case 'get_inventory':           return await getInventory()
      case 'get_pending_tasks':       return await getPendingTasks()
      case 'get_recent_expenses':     return await getRecentExpenses(input as Parameters<typeof getRecentExpenses>[0])
      case 'get_milk_production':     return await getMilkProduction(input as Parameters<typeof getMilkProduction>[0])
      case 'get_heat_records':        return await getHeatRecords(input as Parameters<typeof getHeatRecords>[0])
      case 'get_vaccination_history': return await getVaccinationHistory(input as Parameters<typeof getVaccinationHistory>[0])
      case 'apply_batch_vaccination': return await applyBatchVaccination(input as Parameters<typeof applyBatchVaccination>[0])
      case 'apply_single_vaccination':return await applySingleVaccination(input as Parameters<typeof applySingleVaccination>[0])
      case 'register_milk_session':   return await registerMilkSession(input as Parameters<typeof registerMilkSession>[0])
      case 'register_milk_record':    return await registerMilkRecord(input as Parameters<typeof registerMilkRecord>[0])
      case 'register_heat':           return await registerHeat(input as Parameters<typeof registerHeat>[0])
      case 'update_pregnancy':        return await updatePregnancy(input as Parameters<typeof updatePregnancy>[0])
      case 'create_expense':          return await createExpense(input as Parameters<typeof createExpense>[0])
      case 'create_task':             return await createTask(input as Parameters<typeof createTask>[0])
      case 'complete_task':           return await completeTask(input as Parameters<typeof completeTask>[0])
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

  for (let i = 0; i < 8; i++) {
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
