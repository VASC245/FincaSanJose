import { supabase } from '@/lib/supabase'
import { createMovement } from './inventoryService'
import { createVaccinationRecord, createBatchVaccinationRecords } from './vaccinationService'
import { fetchWorkLists } from './workListService'
import { fetchAlerts } from './alertsService'
import { fetchReproductionData } from './reproductionService'
import { fetchMetas } from './metasService'
import { localToday, localDateOffset, addDaysToDate } from '@/lib/dates'

// ─── Llamadas a Claude vía Edge Function ai-chat ─────────────────────────────
// La API key de Anthropic vive como secreto del servidor; el navegador solo
// habla con la Edge Function (que fuerza modelo, system prompt y max_tokens).

const API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`

const today = localToday

const formatUSD = (n: number) =>
  new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(n)

interface TextBlock  { type: 'text'; text: string }
interface ToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
interface ToolResultBlock { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
// La respuesta también trae bloques thinking / fallback: se devuelven tal cual
// en la siguiente vuelta, sin tocarlos.
type ContentBlock = TextBlock | ToolUseBlock | { type: string; [key: string]: unknown }

interface ApiMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[] | ToolResultBlock[]
}

interface ApiResponse {
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'pause_turn' | 'stop_sequence'
  content: ContentBlock[]
}

// El system prompt (con la fecha de hoy) se construye en la Edge Function.
async function callClaude(messages: ApiMessage[]): Promise<ApiResponse> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anonKey}`,
      'apikey': anonKey
    },
    body: JSON.stringify({ tools, messages })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string | { message?: string } }
    const msg = typeof err.error === 'string' ? err.error : err.error?.message
    throw new Error(msg ?? `HTTP ${res.status}`)
  }
  return res.json()
}

// Error que se devuelve al modelo como texto (p. ej. arete ambiguo) para que
// le pregunte al usuario en vez de adivinar.
class ToolError extends Error {}

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
  get_recent_sales:         'Consultando ventas...',
  get_finance_summary:      'Calculando balance financiero...',
  get_milk_production:      'Consultando producción de leche...',
  get_heat_records:         'Consultando registros de celo...',
  get_vaccination_history:  'Consultando historial de vacunas...',
  get_milk_withdrawals:     'Consultando retiros de leche...',
  get_weights:              'Consultando pesos y ganancia diaria...',
  get_work_list:            'Revisando qué toca hoy...',
  get_alerts:               'Revisando alertas...',
  get_reproduction_indicators: 'Calculando indicadores reproductivos...',
  get_goals:                'Revisando metas y costos...',
  query_data:               'Buscando en la base de datos...',
  // Acciones
  insert_record:            'Guardando registro...',
  update_record:            'Corrigiendo registro...',
  delete_record:            'Borrando registro...',
  remove_inventory_stock:   'Descontando del inventario...',
  register_weight:          'Registrando pesaje...',
  register_bcs:             'Registrando condición corporal...',
  register_weaning:         'Registrando destete...',
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
  register_insemination:    'Registrando inseminación...',
  update_pregnancy:         'Actualizando estado de preñez...',
  create_expense:           'Registrando gasto...',
  create_sale:              'Registrando venta...',
  create_task:              'Creando tarea...',
  update_task:              'Actualizando tarea...',
  complete_task:            'Completando tarea...',
}

// Tablas que el asistente puede tocar con las herramientas genéricas.
// Las de configuración interna (push, dispositivos IoT) quedan fuera.
const QUERYABLE_TABLES = [
  'animals', 'cattle_details', 'pig_details', 'calf_births', 'litters', 'heat_records',
  'insemination_records', 'vaccination_records', 'vaccines', 'milk_sessions', 'milk_records',
  'weight_records', 'bcs_records', 'inventory_categories', 'inventory_items', 'inventory_movements',
  'tasks', 'gastos', 'ventas', 'iot_alerts', 'sensor_readings', 'camera_events'
] as const
// La leche NO está aquí: corregirla o borrarla exige la clave de corrección
// en la pantalla Leche (la base de datos tampoco lo permite sin clave).
const WRITABLE_TABLES = [
  'animals', 'cattle_details', 'pig_details', 'calf_births', 'litters', 'heat_records',
  'insemination_records', 'vaccination_records', 'vaccines',
  'weight_records', 'bcs_records', 'inventory_categories', 'inventory_items',
  'tasks', 'gastos', 'ventas'
] as const
const DELETABLE_TABLES = [
  'calf_births', 'litters', 'heat_records', 'insemination_records', 'vaccination_records',
  'weight_records', 'bcs_records', 'tasks', 'gastos', 'ventas'
] as const
const MILK_LOCKED_MSG =
  'Los registros de leche ya guardados solo se corrigen o borran en la pantalla Leche, con la clave de corrección. Tócalo allí, escribe el motivo y la clave.'
function isMilkTable(table: string) {
  return table === 'milk_sessions' || table === 'milk_records'
}

const INSERTABLE_TABLES = ['inventory_items', 'inventory_categories', 'vaccines'] as const

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
        stage: { type: 'string', enum: ['lactancia', 'destete', 'iniciacion', 'crecimiento', 'engorde', 'reproduccion'], description: 'Etapa — SOLO para cerdos (opcional). En bovinos no se usa.' },
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
    description: 'Aplica una vacuna o medicamento a un animal específico. Descuenta del inventario automáticamente. Si el medicamento tiene período de retiro de leche (antibióticos, etc.), indica milk_withdrawal_days y la app avisará hasta cuándo NO vender la leche.',
    input_schema: {
      type: 'object' as const,
      properties: {
        animal_ear_tag: { type: 'string', description: 'Arete o nombre del animal' },
        vaccine_name: { type: 'string', description: 'Nombre del producto en el inventario' },
        quantity_used: { type: 'number' },
        applied_date: { type: 'string', description: 'Fecha YYYY-MM-DD' },
        next_date: { type: 'string', description: 'Próxima dosis YYYY-MM-DD (opcional)' },
        milk_withdrawal_days: { type: 'number', description: 'Días de retiro de leche del medicamento (opcional, solo vacas en producción)' },
        notes: { type: 'string' }
      },
      required: ['animal_ear_tag', 'vaccine_name', 'quantity_used', 'applied_date']
    }
  },
  {
    name: 'get_milk_withdrawals',
    description: 'Lista los animales cuya leche NO se puede vender hoy por retiro de medicamento, con la fecha hasta la cual dura el retiro.',
    input_schema: { type: 'object' as const, properties: {}, required: [] }
  },
  {
    name: 'get_weights',
    description: 'Consulta los pesos registrados y la ganancia diaria de peso (ADG) de un animal, o el resumen de engorde de todos los cerdos si no se indica animal.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ear_tag: { type: 'string', description: 'Arete o nombre del animal (opcional; sin él muestra el resumen de engorde)' }
      },
      required: []
    }
  },
  {
    name: 'register_weight',
    description: 'Registra un pesaje de un animal en kilogramos, para seguimiento de ganancia diaria (ADG) en engorde.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ear_tag: { type: 'string', description: 'Arete o nombre del animal' },
        weight_kg: { type: 'number', description: 'Peso en kilogramos' },
        date: { type: 'string', description: 'Fecha YYYY-MM-DD (opcional, por defecto hoy)' },
        notes: { type: 'string', description: 'Notas (opcional)' }
      },
      required: ['ear_tag', 'weight_kg']
    }
  },
  {
    name: 'register_bcs',
    description: 'Registra la condición corporal (BCS) de un animal, escala 1 (muy flaca) a 5 (muy gorda). Ideal 3-3.5 en parto y secado.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ear_tag: { type: 'string', description: 'Arete o nombre del animal' },
        score: { type: 'number', description: 'Puntaje 1 a 5 (acepta medios: 2.5, 3.5...)' },
        moment: { type: 'string', enum: ['secado', 'parto', 'servicio', 'destete', 'otro'], description: 'Momento de la calificación' },
        date: { type: 'string', description: 'Fecha YYYY-MM-DD (opcional, por defecto hoy)' },
        notes: { type: 'string', description: 'Notas (opcional)' }
      },
      required: ['ear_tag', 'score']
    }
  },
  {
    name: 'register_weaning',
    description: 'Registra cuántos lechones destetó la última camada de una cerda (alimenta el KPI destetados/cerda/año).',
    input_schema: {
      type: 'object' as const,
      properties: {
        sow_ear_tag: { type: 'string', description: 'Arete o nombre de la cerda' },
        weaned_count: { type: 'number', description: 'Número de lechones destetados' }
      },
      required: ['sow_ear_tag', 'weaned_count']
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
    name: 'register_insemination',
    description: 'Registra una inseminación o monta de una vaca o cerda. Crea el registro con fecha de chequeo de retorno de celo (día 21), fecha probable de parto y una tarea recordatorio. NO marca al animal como preñado todavía — la preñez se confirma después con update_pregnancy si no hubo retorno de celo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        animal_ear_tag: { type: 'string', description: 'Arete o nombre de la hembra' },
        insemination_date: { type: 'string', description: 'Fecha de inseminación/monta YYYY-MM-DD' },
        semen_source: { type: 'string', description: 'Origen del semen o nombre del macho (opcional)' },
        notes: { type: 'string', description: 'Notas (opcional)' }
      },
      required: ['animal_ear_tag', 'insemination_date']
    }
  },
  {
    name: 'update_pregnancy',
    description: 'Confirma o descarta la preñez de una vaca o cerda. Al confirmar (is_pregnant=true) también marca como confirmada la inseminación pendiente más reciente, o crea el registro si no existe.',
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
        monto: { type: 'number', description: 'Monto en dólares (USD)' },
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
  // ── Ventas ─────────────────────────────────────────────────────────────────
  {
    name: 'get_recent_sales',
    description: 'Lista las ventas (ingresos) recientes de la finca: leche, animales u otros.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days: { type: 'number', description: 'Días hacia atrás (default 30)' }
      },
      required: []
    }
  },
  {
    name: 'get_finance_summary',
    description: 'Balance financiero: total de ingresos (ventas), total de gastos y ganancia/pérdida neta en un período.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days: { type: 'number', description: 'Días hacia atrás (default 30)' },
        year_month: { type: 'string', description: 'Mes específico YYYY-MM (opcional, reemplaza days)' }
      },
      required: []
    }
  },
  {
    name: 'create_sale',
    description: 'Registra una venta (ingreso) de la finca: leche, un animal u otro. Si es venta de un animal, se puede indicar el arete/nombre para vincularlo y marcarlo como vendido.',
    input_schema: {
      type: 'object' as const,
      properties: {
        monto: { type: 'number', description: 'Monto total en dólares (USD)' },
        descripcion: { type: 'string' },
        tipo: { type: 'string', enum: ['leche', 'animal', 'otro'] },
        fecha: { type: 'string', description: 'Fecha YYYY-MM-DD' },
        cantidad: { type: 'number', description: 'Cantidad vendida, ej. litros (opcional)' },
        unidad: { type: 'string', description: 'Unidad de la cantidad, ej. litros, kg (opcional)' },
        comprador: { type: 'string', description: 'Nombre del comprador (opcional)' },
        animal_ear_tag: { type: 'string', description: 'Arete o nombre del animal vendido (solo tipo=animal)' },
        mark_animal_sold: { type: 'boolean', description: 'Marcar el animal como vendido (default true si se indica animal)' }
      },
      required: ['monto', 'descripcion', 'tipo', 'fecha']
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
  },
  // ── Inventario: salidas ────────────────────────────────────────────────────
  {
    name: 'remove_inventory_stock',
    description: 'Registra una salida de inventario (consumo de alimento, insumo usado, producto dañado). Para medicamentos aplicados a un animal usa apply_single_vaccination, que ya descuenta.',
    input_schema: {
      type: 'object' as const,
      properties: {
        item_name: { type: 'string', description: 'Nombre del producto (búsqueda parcial)' },
        quantity: { type: 'number', description: 'Cantidad que sale' },
        date: { type: 'string', description: 'Fecha YYYY-MM-DD (opcional, por defecto hoy)' },
        notes: { type: 'string', description: 'Motivo (ej: "comida cerdos de engorde")' }
      },
      required: ['item_name', 'quantity']
    }
  },
  // ── Paneles de la app ──────────────────────────────────────────────────────
  {
    name: 'get_work_list',
    description: 'Lo que toca hacer hoy y en los próximos días, calculado por la app: vacas por secar, partos próximos, chequeos de celo del día 21, hembras vacías, vacunas pendientes, retiros de leche y tareas vencidas.',
    input_schema: { type: 'object' as const, properties: {}, required: [] }
  },
  {
    name: 'get_alerts',
    description: 'Alertas activas de la finca (stock bajo, partos cercanos, vacunas vencidas, etc.) con su nivel de urgencia.',
    input_schema: { type: 'object' as const, properties: {}, required: [] }
  },
  {
    name: 'get_reproduction_indicators',
    description: 'Indicadores reproductivos: por vaca (días abiertos, intervalo entre partos, servicios por concepción), por cerda (camadas/año, nacidos vivos, destetados/año), ranking de toros/verracos por tasa de preñez, y promedios del hato.',
    input_schema: { type: 'object' as const, properties: {}, required: [] }
  },
  {
    name: 'get_goals',
    description: 'Tablero de metas con semáforo (bien / atención / mal) y costos unitarios: costo por litro de leche, precio de venta por litro, margen, costo por lechón destetado.',
    input_schema: { type: 'object' as const, properties: {}, required: [] }
  },
  // ── Acceso general a la base de datos ──────────────────────────────────────
  {
    name: 'query_data',
    description: 'Lee cualquier tabla de la finca con filtros, orden y límite. Úsala para cualquier pregunta que las otras herramientas no cubran. Con stats_columns devuelve conteo, suma, promedio, mínimo y máximo calculados sobre TODAS las filas que cumplen los filtros (úsalo para totales y promedios en vez de sumar a mano). group_by agrupa esas estadísticas por una columna, o por mes/semana de una fecha con "month:columna" / "week:columna".',
    input_schema: {
      type: 'object' as const,
      properties: {
        table: { type: 'string', enum: QUERYABLE_TABLES as unknown as string[], description: 'Tabla a leer' },
        select: { type: 'string', description: 'Columnas, sintaxis de Supabase. Por defecto "*". Ej: "recorded_date, liters" o "*, animal:animals(ear_tag,name)"' },
        filters: {
          type: 'array',
          description: 'Filtros combinados con Y',
          items: {
            type: 'object',
            properties: {
              column: { type: 'string' },
              op: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'ilike', 'is', 'in'], description: 'ilike busca texto parcial sin importar mayúsculas; is sirve para null/true/false; in recibe una lista' },
              value: { description: 'Valor a comparar (para in: lista; para is: null, true o false)' }
            },
            required: ['column', 'op', 'value']
          }
        },
        order_by: { type: 'string', description: 'Columna para ordenar (opcional)' },
        ascending: { type: 'boolean', description: 'Orden ascendente (default false = más reciente primero)' },
        limit: { type: 'number', description: 'Máximo de filas a devolver (default 50, máx 300)' },
        stats_columns: { type: 'array', items: { type: 'string' }, description: 'Columnas numéricas para calcular conteo/suma/promedio/mín/máx (opcional)' },
        group_by: { type: 'string', description: 'Agrupar las estadísticas por esta columna, o "month:fecha" / "week:fecha" (opcional, requiere stats_columns)' }
      },
      required: ['table']
    }
  },
  {
    name: 'insert_record',
    description: 'Crea un registro en tablas que no tienen herramienta propia: inventory_items (producto nuevo), inventory_categories, vaccines (catálogo). Para todo lo demás usa la herramienta específica.',
    input_schema: {
      type: 'object' as const,
      properties: {
        table: { type: 'string', enum: INSERTABLE_TABLES as unknown as string[] },
        values: { type: 'object', description: 'Columnas y valores del registro nuevo' }
      },
      required: ['table', 'values']
    }
  },
  {
    name: 'update_record',
    description: 'Corrige campos de un registro existente por su id (primero búscalo con query_data). Sirve para arreglar datos mal dictados: litros, montos, fechas, nombres, aretes, notas, etc. No uses esto para cambiar stock de inventario (usa entradas/salidas) ni para vender animales (usa create_sale).',
    input_schema: {
      type: 'object' as const,
      properties: {
        table: { type: 'string', enum: WRITABLE_TABLES as unknown as string[] },
        id: { type: 'string', description: 'id (uuid) del registro' },
        changes: { type: 'object', description: 'Solo las columnas a cambiar con su nuevo valor' }
      },
      required: ['table', 'id', 'changes']
    }
  },
  {
    name: 'delete_record',
    description: 'Borra un registro por su id. SOLO después de que el usuario confirmó explícitamente el borrado en su último mensaje. No borra animales (usa update_animal_status) ni movimientos de inventario (registra el movimiento contrario).',
    input_schema: {
      type: 'object' as const,
      properties: {
        table: { type: 'string', enum: DELETABLE_TABLES as unknown as string[] },
        id: { type: 'string', description: 'id (uuid) del registro' }
      },
      required: ['table', 'id']
    }
  }
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface FoundAnimal {
  id: string; ear_tag: string | null; name: string | null
  species: 'cattle' | 'pig'; sex: string; status: string; stage: string | null
}

const norm = (s: string | null | undefined) =>
  (s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Por voz llegan cosas como "la 7", "vaca uno", "la Eva": se busca primero
// coincidencia exacta de arete, luego de nombre, luego arete numérico sin
// ceros a la izquierda ("4" ≠ "0004" si existe un "4"), y solo al final
// coincidencia parcial. Si la parcial da varios, se pide aclarar en vez de
// adivinar (antes "1" podía caer en la 10, la 11 o AE-HE-0001).
async function findAnimal(identifier: string): Promise<FoundAnimal | null> {
  const q = norm(identifier).replace(/^(la|el|vaca|cerda|cerdo|toro|ternero|ternera|arete|numero|#)\s+/, '')
  if (!q) return null

  const { data } = await supabase
    .from('animals').select('id, ear_tag, name, species, sex, status, stage')
  const animals = (data ?? []) as FoundAnimal[]
  // Ante empates, preferir los activos
  const pick = (list: FoundAnimal[]) => {
    const active = list.filter(a => a.status === 'active')
    return active.length ? active : list
  }

  const exactTag = pick(animals.filter(a => norm(a.ear_tag) === q))
  if (exactTag.length === 1) return exactTag[0]

  const exactName = pick(animals.filter(a => norm(a.name) === q))
  if (exactName.length === 1) return exactName[0]

  if (/^\d+$/.test(q)) {
    const n = q.replace(/^0+/, '') || '0'
    const numeric = pick(animals.filter(a => (norm(a.ear_tag).replace(/^0+/, '') || '0') === n))
    if (numeric.length === 1) return numeric[0]
  }

  const partial = pick(animals.filter(a => norm(a.ear_tag).includes(q) || norm(a.name).includes(q)))
  if (partial.length === 1) return partial[0]
  if (partial.length > 1 || exactTag.length > 1 || exactName.length > 1) {
    const options = (exactTag.length > 1 ? exactTag : exactName.length > 1 ? exactName : partial)
      .slice(0, 8)
      .map(a => [a.ear_tag?.trim(), a.name?.trim()].filter(Boolean).join(' · '))
    throw new ToolError(`Hay varios animales que coinciden con "${identifier}": ${options.join('; ')}. Pregunta al usuario cuál es.`)
  }
  return null
}

// Varias coincidencias parciales: solo se elige sola si hay una exacta (sin
// importar mayúsculas/tildes); si no, se pide aclarar como en findAnimal en
// vez de tomar la primera que devuelva la base (orden no garantizado).
function pickOne<T>(
  rows: T[], label: (r: T) => string | null | undefined, search: string, what: string,
  prefer?: (r: T) => boolean
): T | null {
  const preferred = prefer ? rows.filter(prefer) : []
  const list = preferred.length ? preferred : rows
  if (list.length <= 1) return list[0] ?? null
  const exact = list.filter(r => norm(label(r)) === norm(search))
  if (exact.length === 1) return exact[0]
  const options = (exact.length > 1 ? exact : list).slice(0, 8).map(r => (label(r) ?? '').trim())
  throw new ToolError(`Hay varias ${what} que coinciden con "${search}": ${options.join('; ')}. Pregunta al usuario cuál es.`)
}

async function findInventoryItem(name: string) {
  const { data } = await supabase
    .from('inventory_items').select('id, name, quantity, unit')
    .ilike('name', `%${name}%`).limit(50)
  return pickOne(data ?? [], i => i.name, name, 'opciones en el inventario')
}

// ─── Tool implementations ─────────────────────────────────────────────────────

async function getFarmSummary(): Promise<string> {
  const firstOfMonth = today().slice(0, 7) + '-01'
  // "Últimos 7 días" = hoy + los 6 anteriores (gte incluye el día de inicio)
  const sevenDaysAgo = localDateOffset(-6)

  const [cattle, pigs, pregnantCows, pregnantSows, tasks, items, expenses, milkSessions] = await Promise.all([
    supabase.from('animals').select('id', { count: 'exact', head: true }).eq('species', 'cattle').eq('status', 'active'),
    supabase.from('animals').select('id', { count: 'exact', head: true }).eq('species', 'pig').eq('status', 'active'),
    // Solo animales activos: una vendida o muerta no cuenta como preñada
    supabase.from('cattle_details').select('animal_id, animals!inner(status)', { count: 'exact', head: true }).eq('is_pregnant', true).eq('animals.status', 'active'),
    supabase.from('pig_details').select('animal_id, animals!inner(status)', { count: 'exact', head: true }).eq('is_pregnant', true).eq('animals.status', 'active'),
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
    gastos_mes_actual_USD: totalExpenses,
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
  const since = localDateOffset(-(days - 1))

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
  const since = localDateOffset(-(days - 1))

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
  const since = localDateOffset(-(days - 1))
  const { data, error } = await supabase
    .from('gastos').select('fecha, monto, descripcion, categoria')
    .gte('fecha', since).order('fecha', { ascending: false })
  if (error) return `Error: ${error.message}`
  const total = (data ?? []).reduce((s, g) => s + Number(g.monto), 0)
  return JSON.stringify({ gastos: data ?? [], total_USD: total, periodo_dias: days })
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
    since = localDateOffset(-(days - 1))
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
    .map(([categoria, v]) => ({ categoria, total_USD: v.total, registros: v.count }))
    .sort((a, b) => b.total_USD - a.total_USD)

  return JSON.stringify({
    periodo: input.year_month ?? `últimos ${input.days ?? 30} días`,
    total_general_USD: grandTotal,
    por_categoria: stats
  })
}

async function getMilkProduction(input: { days?: number; animal_ear_tag?: string }): Promise<string> {
  const days = input.days ?? 30
  const since = localDateOffset(-(days - 1))

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
  const since = localDateOffset(-(days - 1))

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
    .select('applied_date, next_date, applied_by, notes, milk_withdrawal_days, milk_withdrawal_until, inventory_item:inventory_items(name, unit)')
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
    // La columna stage solo admite etapas de cerdos (CHECK en la BD)
    stage: input.species === 'pig' ? (input.stage ?? null) : null,
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
  return `Animal registrado: ${input.species === 'cattle' ? 'bovino' : 'porcino'} ${input.sex === 'male' ? 'macho' : 'hembra'} — ${label}`
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

  // Padre de la cría: el toro anotado en la pajuela de la inseminación
  // que produjo esta preñez (la confirmada, o la más reciente)
  const { data: insems } = await supabase
    .from('insemination_records')
    .select('semen_source, pregnancy_confirmed, insemination_date')
    .eq('animal_id', cow.id)
    .order('insemination_date', { ascending: false })
    .limit(5)
  const sire = (insems ?? []).find((r) => r.pregnancy_confirmed === true) ?? (insems ?? [])[0]
  const fatherName = sire?.semen_source ?? null

  // Create calf animal
  const { data: calfData, error: calfError } = await supabase.from('animals').insert({
    ear_tag: input.calf_ear_tag ?? null,
    name: input.calf_name ?? null,
    species: 'cattle',
    sex: input.calf_sex,
    birth_date: input.birth_date,
    // stage solo admite etapas de cerdos: en bovinos va null (igual que el
    // formulario de parto de la app). Con 'calf' el insert fallaba.
    stage: null,
    mother_id: cow.id,
    father_name: fatherName,
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

  // El trigger trg_update_cow_birth_count ya incrementó birth_count y marcó
  // la vaca como no preñada — aquí solo leemos el conteo para el mensaje
  const { data: cowDetail } = await supabase.from('cattle_details')
    .select('birth_count').eq('animal_id', cow.id).single()
  const newCount = (cowDetail as { birth_count: number } | null)?.birth_count ?? 1

  const terneroLabel = input.calf_ear_tag ? `arete ${input.calf_ear_tag}` : (input.calf_name ?? 'sin identificar')
  const padreInfo = fatherName ? ` Padres: madre ${cow.ear_tag ?? cow.name}, padre ${fatherName} (pajuela).` : ` Madre: ${cow.ear_tag ?? cow.name}.`
  return `✓ Parto registrado: ${cow.ear_tag ?? cow.name} parió un ternero ${input.calf_sex === 'male' ? 'macho' : 'hembra'} (${terneroLabel}) el ${input.birth_date}. Parto #${newCount}.${padreInfo} Estado de preñez actualizado a no preñada.`
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

  // El trigger trg_update_pig_litter_count ya incrementó litter_count y marcó
  // la cerda como no preñada — aquí solo leemos el conteo para el mensaje
  const { data: sowDetail } = await supabase.from('pig_details')
    .select('litter_count').eq('animal_id', sow.id).single()
  const newCount = (sowDetail as { litter_count: number } | null)?.litter_count ?? 1

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
    applied_by: null, notes: input.notes ?? null,
    milk_withdrawal_days: null, milk_withdrawal_until: null
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
  applied_date: string; next_date?: string; milk_withdrawal_days?: number; notes?: string
}): Promise<string> {
  const animal = await findAnimal(input.animal_ear_tag)
  if (!animal) return `No encontré animal "${input.animal_ear_tag}".`

  const item = await findInventoryItem(input.vaccine_name)
  if (!item) return `"${input.vaccine_name}" no está en el inventario.`
  if (item.quantity < input.quantity_used) return `Stock insuficiente: hay ${item.quantity} ${item.unit}.`

  const withdrawalDays = input.milk_withdrawal_days && input.milk_withdrawal_days > 0
    ? input.milk_withdrawal_days : null
  const withdrawalUntil = withdrawalDays
    ? addDaysToDate(input.applied_date, withdrawalDays) : null

  await createVaccinationRecord({
    animal_id: animal.id, vaccine_id: null, inventory_item_id: item.id,
    applied_date: input.applied_date, next_date: input.next_date ?? null,
    applied_by: null, notes: input.notes ?? null,
    milk_withdrawal_days: withdrawalDays, milk_withdrawal_until: withdrawalUntil
  })
  await createMovement({
    item_id: item.id, type: 'out', quantity: input.quantity_used,
    date: input.applied_date, notes: `Vacunación: ${animal.ear_tag ?? animal.name}`
  })

  const retiroInfo = withdrawalUntil
    ? ` 🚫🥛 Retiro de leche: NO vender la leche de ${animal.ear_tag ?? animal.name} hasta el ${withdrawalUntil}.`
    : ''
  return `✓ ${item.name} (${input.quantity_used} ${item.unit}) aplicada a ${animal.ear_tag ?? animal.name}. Inventario actualizado.${retiroInfo}`
}

async function getMilkWithdrawals(): Promise<string> {
  const { data, error } = await supabase
    .from('vaccination_records')
    .select('milk_withdrawal_until, applied_date, animal:animals(ear_tag, name), inventory_item:inventory_items(name)')
    .gte('milk_withdrawal_until', today())
    .order('milk_withdrawal_until', { ascending: true })
  if (error) return `Error: ${error.message}`
  if (!data?.length) return 'No hay animales con retiro de leche activo — toda la leche se puede vender.'
  return JSON.stringify({
    aviso: 'La leche de estos animales NO se puede vender hasta la fecha indicada',
    retiros: data.map(r => ({
      animal: (r.animal as { ear_tag: string | null; name: string | null } | null)?.ear_tag
        ?? (r.animal as { name: string | null } | null)?.name,
      producto: (r.inventory_item as { name: string } | null)?.name,
      aplicado: r.applied_date,
      no_vender_hasta: r.milk_withdrawal_until
    }))
  })
}

async function getWeights(input: { ear_tag?: string }): Promise<string> {
  if (input.ear_tag) {
    const animal = await findAnimal(input.ear_tag)
    if (!animal) return `No encontré animal "${input.ear_tag}".`
    const { data } = await supabase
      .from('weight_records')
      .select('recorded_date, weight_kg, notes')
      .eq('animal_id', animal.id)
      .order('recorded_date', { ascending: true })
    const records = (data ?? []) as { recorded_date: string; weight_kg: number; notes: string | null }[]
    if (!records.length) return `${animal.ear_tag ?? animal.name} no tiene pesajes registrados.`
    const lines = records.map((r) => `- ${r.recorded_date}: ${Number(r.weight_kg).toFixed(1)} kg${r.notes ? ` (${r.notes})` : ''}`)
    let resumen = ''
    if (records.length >= 2) {
      const first = records[0], last = records[records.length - 1]
      const days = Math.round((new Date(`${last.recorded_date}T12:00:00`).getTime() - new Date(`${first.recorded_date}T12:00:00`).getTime()) / 86_400_000)
      const gain = Number(last.weight_kg) - Number(first.weight_kg)
      const adg = days > 0 ? Math.round((gain / days) * 1000) : null
      resumen = `\nGanancia total: ${gain.toFixed(1)} kg en ${days} días${adg != null ? ` → ADG ${adg} g/día` : ''}.`
    }
    return `Pesos de ${animal.ear_tag ?? animal.name}:\n${lines.join('\n')}${resumen}`
  }

  // Resumen de engorde: todos los cerdos activos con pesajes
  const [{ data: pigs }, { data: weights }] = await Promise.all([
    supabase.from('animals').select('id, ear_tag, name, stage').eq('species', 'pig').eq('status', 'active'),
    supabase.from('weight_records').select('animal_id, recorded_date, weight_kg').order('recorded_date', { ascending: true })
  ])
  const byAnimal = new Map<string, { recorded_date: string; weight_kg: number }[]>()
  for (const w of (weights ?? []) as { animal_id: string; recorded_date: string; weight_kg: number }[]) {
    const arr = byAnimal.get(w.animal_id) ?? []
    arr.push(w)
    byAnimal.set(w.animal_id, arr)
  }
  const lines: string[] = []
  for (const p of (pigs ?? []) as { id: string; ear_tag: string | null; name: string | null; stage: string | null }[]) {
    const recs = byAnimal.get(p.id)
    if (!recs?.length) continue
    const last = recs[recs.length - 1]
    let extra = ''
    if (recs.length >= 2) {
      const first = recs[0]
      const days = Math.round((new Date(`${last.recorded_date}T12:00:00`).getTime() - new Date(`${first.recorded_date}T12:00:00`).getTime()) / 86_400_000)
      const gain = Number(last.weight_kg) - Number(first.weight_kg)
      if (days > 0) extra = ` — ADG ${Math.round((gain / days) * 1000)} g/día (${gain.toFixed(1)} kg en ${days} d)`
    }
    lines.push(`- ${p.ear_tag ?? p.name ?? 'Sin arete'}${p.stage ? ` [${p.stage}]` : ''}: ${Number(last.weight_kg).toFixed(1)} kg${extra}`)
  }
  if (!lines.length) return 'No hay pesajes registrados en cerdos.'
  return `Resumen de engorde (${lines.length} cerdo(s) con pesajes):\n${lines.join('\n')}`
}

async function registerWeight(input: {
  ear_tag: string; weight_kg: number; date?: string; notes?: string
}): Promise<string> {
  const animal = await findAnimal(input.ear_tag)
  if (!animal) return `No encontré animal "${input.ear_tag}".`
  const fecha = input.date ?? localToday()
  const { error } = await supabase.from('weight_records').insert({
    animal_id: animal.id,
    recorded_date: fecha,
    weight_kg: input.weight_kg,
    notes: input.notes ?? null
  })
  if (error) return `Error al registrar pesaje: ${error.message}`
  return `✓ Pesaje registrado: ${animal.ear_tag ?? animal.name} pesó ${input.weight_kg} kg el ${fecha}.`
}

async function registerBcs(input: {
  ear_tag: string; score: number; moment?: string; date?: string; notes?: string
}): Promise<string> {
  const animal = await findAnimal(input.ear_tag)
  if (!animal) return `No encontré animal "${input.ear_tag}".`
  if (input.score < 1 || input.score > 5) return 'El puntaje BCS debe estar entre 1 y 5.'
  const fecha = input.date ?? localToday()
  const { error } = await supabase.from('bcs_records').insert({
    animal_id: animal.id,
    recorded_date: fecha,
    score: input.score,
    moment: input.moment ?? 'otro',
    notes: input.notes ?? null
  })
  if (error) return `Error al registrar condición corporal: ${error.message}`
  const alerta = input.score < 2.5
    ? ' ⚠ Está flaca — revisar alimentación.'
    : input.score > 4
      ? ' ⚠ Está pasada de condición — cuidado con problemas al parto.'
      : ''
  return `✓ Condición corporal registrada: ${animal.ear_tag ?? animal.name} con BCS ${input.score}/5 el ${fecha}.${alerta}`
}

async function registerWeaning(input: {
  sow_ear_tag: string; weaned_count: number
}): Promise<string> {
  const sow = await findAnimal(input.sow_ear_tag)
  if (!sow) return `No encontré cerda "${input.sow_ear_tag}".`
  const { data: litter } = await supabase
    .from('litters')
    .select('id, birth_date, born_alive')
    .eq('sow_id', sow.id)
    .order('birth_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!litter) return `${sow.ear_tag ?? sow.name} no tiene camadas registradas.`
  const { error } = await supabase
    .from('litters')
    .update({ weaned_count: input.weaned_count })
    .eq('id', litter.id)
  if (error) return `Error al registrar destete: ${error.message}`
  return `✓ Destete registrado: la camada del ${litter.birth_date} de ${sow.ear_tag ?? sow.name} destetó ${input.weaned_count} lechón(es) de ${litter.born_alive} nacidos vivos.`
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

  // Total del día: ayuda a notar si la misma leche se anotó dos veces
  const { data: sameDay } = await supabase
    .from('milk_sessions').select('liters').eq('recorded_date', input.recorded_date)
  const sessions = sameDay ?? []
  const dayTotal = sessions.reduce((s, r) => s + Number(r.liters), 0)
  const dayInfo = sessions.length > 1
    ? ` Ese día ya suma ${dayTotal} litros en ${sessions.length} ordeños (avisa al usuario por si se anotó dos veces).`
    : ''
  return `Producción registrada: ${input.liters} litros el ${input.recorded_date}.${dayInfo}`
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

const GESTATION_DAYS_CATTLE = 280
const GESTATION_DAYS_PIG = 114
const HEAT_CYCLE_DAYS = 21

async function registerInsemination(input: {
  animal_ear_tag: string; insemination_date: string
  semen_source?: string; notes?: string
}): Promise<string> {
  const animal = await findAnimal(input.animal_ear_tag)
  if (!animal) return `No encontré animal "${input.animal_ear_tag}".`
  if (animal.sex !== 'female') return `${animal.ear_tag ?? animal.name} no es una hembra.`

  const gestation = animal.species === 'cattle' ? GESTATION_DAYS_CATTLE : GESTATION_DAYS_PIG
  const heatCheckDate = addDaysToDate(input.insemination_date, HEAT_CYCLE_DAYS)
  const expectedBirth = addDaysToDate(input.insemination_date, gestation)

  const { error } = await supabase.from('insemination_records').insert({
    animal_id: animal.id,
    insemination_date: input.insemination_date,
    semen_source: input.semen_source ?? null,
    expected_birth: expectedBirth,
    heat_check_date: heatCheckDate,
    pregnancy_confirmed: null,
    pregnancy_confirmed_date: null,
    notes: input.notes ?? null
  })
  if (error) return `Error: ${error.message}`

  // Tarea recordatorio del chequeo de celo (igual que el flujo de la app)
  const label = animal.ear_tag ?? animal.name
  await supabase.from('tasks').insert({
    title: `Revisar retorno de celo — ${label}`,
    description: `Verificar si ${label} regresó al celo a los ${HEAT_CYCLE_DAYS} días de la inseminación (${input.insemination_date}). Si hay retorno, NO quedó preñada.`,
    status: 'pending',
    priority: 'high',
    category: 'reproduction',
    due_date: heatCheckDate,
    animal_id: animal.id
  })

  return `✓ Inseminación registrada para ${label} el ${input.insemination_date}. Chequeo de retorno de celo: ${heatCheckDate}. Parto probable si queda preñada: ${expectedBirth}. Creé una tarea recordatorio para el día 21.`
}

async function updatePregnancy(input: {
  animal_ear_tag: string; is_pregnant: boolean
  service_date?: string; expected_birth?: string
}): Promise<string> {
  const animal = await findAnimal(input.animal_ear_tag)
  if (!animal) return `No encontré animal "${input.animal_ear_tag}".`

  // Buscar la inseminación pendiente más reciente para vincularla
  const { data: pendingRecs } = await supabase
    .from('insemination_records')
    .select('id, insemination_date, expected_birth')
    .eq('animal_id', animal.id)
    .is('pregnancy_confirmed', null)
    .order('insemination_date', { ascending: false })
    .limit(1)
  const pending = pendingRecs?.[0] ?? null

  const gestation = animal.species === 'cattle' ? GESTATION_DAYS_CATTLE : GESTATION_DAYS_PIG
  const serviceDate = input.service_date ?? pending?.insemination_date ?? null
  const expectedBirth = input.expected_birth
    ?? pending?.expected_birth
    ?? (serviceDate ? addDaysToDate(serviceDate, gestation) : null)

  // Al confirmar preñez solo se sobreescriben fechas si hay valor;
  // al descartar se limpian
  const detailUpdate: Record<string, unknown> = { is_pregnant: input.is_pregnant }
  const dateField = animal.species === 'cattle' ? 'conception_date' : 'service_date'
  if (input.is_pregnant) {
    if (serviceDate) detailUpdate[dateField] = serviceDate
    if (expectedBirth) detailUpdate.expected_birth = expectedBirth
  } else {
    detailUpdate[dateField] = null
    detailUpdate.expected_birth = null
  }

  // Upsert: a los lechones/terneros que nacieron en la finca a veces les falta
  // la fila de detalle y un update a secas no tocaba nada (0 filas)
  const table = animal.species === 'cattle' ? 'cattle_details' : 'pig_details'
  const { data: written, error } = await supabase
    .from(table)
    .upsert({ animal_id: animal.id, ...detailUpdate }, { onConflict: 'animal_id' })
    .select('animal_id')
  if (error) return `Error: ${error.message}`
  if (!written?.length) return `No pude guardar la preñez de ${animal.ear_tag ?? animal.name}. No se cambió nada.`

  // Mantener el historial de inseminaciones sincronizado
  let recordInfo = ''
  if (input.is_pregnant) {
    if (pending) {
      await supabase.from('insemination_records').update({
        pregnancy_confirmed: true,
        pregnancy_confirmed_date: localToday()
      }).eq('id', pending.id)
      recordInfo = ' Inseminación pendiente marcada como confirmada.'
    } else if (serviceDate) {
      await supabase.from('insemination_records').insert({
        animal_id: animal.id,
        insemination_date: serviceDate,
        expected_birth: expectedBirth,
        heat_check_date: addDaysToDate(serviceDate, HEAT_CYCLE_DAYS),
        pregnancy_confirmed: true,
        pregnancy_confirmed_date: localToday(),
        notes: 'Creado al confirmar preñez (asistente IA)'
      })
      recordInfo = ' Registro de inseminación creado y confirmado.'
    }
  } else if (pending) {
    await supabase.from('insemination_records').update({
      pregnancy_confirmed: false,
      pregnancy_confirmed_date: null
    }).eq('id', pending.id)
    recordInfo = ' Inseminación pendiente marcada como fallida (retorno de celo).'
  }

  const estado = input.is_pregnant ? 'preñada' : 'no preñada'
  const partoInfo = input.is_pregnant && expectedBirth ? ` — parto esperado: ${expectedBirth}` : ''
  return `✓ ${animal.ear_tag ?? animal.name} marcada como ${estado}${partoInfo}.${recordInfo}`
}

async function createExpense(input: {
  monto: number; descripcion: string; categoria: string; fecha: string
}): Promise<string> {
  const { error } = await supabase.from('gastos').insert({
    monto: input.monto, descripcion: input.descripcion,
    categoria: input.categoria, fecha: input.fecha, foto_url: null
  })
  if (error) return `Error: ${error.message}`
  return `Gasto registrado: ${input.descripcion} — ${formatUSD(input.monto)} el ${input.fecha}`
}

async function getRecentSales(input: { days?: number }): Promise<string> {
  const days = input.days ?? 30
  const since = localDateOffset(-(days - 1))
  const { data, error } = await supabase
    .from('ventas').select('fecha, monto, tipo, descripcion, cantidad, unidad, comprador')
    .gte('fecha', since).order('fecha', { ascending: false })
  if (error) return `Error: ${error.message}`
  const total = (data ?? []).reduce((s, v) => s + Number(v.monto), 0)
  return JSON.stringify({ ventas: data ?? [], total_USD: total, periodo_dias: days })
}

async function getFinanceSummary(input: { days?: number; year_month?: string }): Promise<string> {
  let since: string
  let until: string | undefined

  if (input.year_month) {
    since = input.year_month + '-01'
    const [y, m] = input.year_month.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    until = `${input.year_month}-${String(lastDay).padStart(2, '0')}`
  } else {
    const days = input.days ?? 30
    since = localDateOffset(-(days - 1))
  }

  let ventasQ = supabase.from('ventas').select('monto, tipo').gte('fecha', since)
  let gastosQ = supabase.from('gastos').select('monto').gte('fecha', since)
  if (until) {
    ventasQ = ventasQ.lte('fecha', until)
    gastosQ = gastosQ.lte('fecha', until)
  }

  const [ventasRes, gastosRes] = await Promise.all([ventasQ, gastosQ])
  if (ventasRes.error) return `Error: ${ventasRes.error.message}`
  if (gastosRes.error) return `Error: ${gastosRes.error.message}`

  const porTipo: Record<string, number> = {}
  let ingresos = 0
  for (const v of ventasRes.data ?? []) {
    ingresos += Number(v.monto)
    porTipo[v.tipo] = (porTipo[v.tipo] ?? 0) + Number(v.monto)
  }
  const gastos = (gastosRes.data ?? []).reduce((s, g) => s + Number(g.monto), 0)

  return JSON.stringify({
    periodo: input.year_month ?? `últimos ${input.days ?? 30} días`,
    ingresos_USD: ingresos,
    ingresos_por_tipo: porTipo,
    gastos_USD: gastos,
    balance_USD: ingresos - gastos
  })
}

async function createSale(input: {
  monto: number; descripcion: string; tipo: string; fecha: string
  cantidad?: number; unidad?: string; comprador?: string
  animal_ear_tag?: string; mark_animal_sold?: boolean
}): Promise<string> {
  let animalId: string | null = null
  let animalInfo = ''

  if (input.tipo === 'animal' && input.animal_ear_tag) {
    const animal = await findAnimal(input.animal_ear_tag)
    if (!animal) return `No encontré animal con "${input.animal_ear_tag}".`
    animalId = animal.id
    if (input.mark_animal_sold !== false) {
      const { error: statusError } = await supabase
        .from('animals').update({ status: 'sold' }).eq('id', animal.id)
      if (statusError) return `Error: ${statusError.message}`
      animalInfo = ` — ${animal.ear_tag ?? animal.name} marcado como vendido`
    } else {
      animalInfo = ` — animal: ${animal.ear_tag ?? animal.name}`
    }
  }

  const { error } = await supabase.from('ventas').insert({
    monto: input.monto, descripcion: input.descripcion, tipo: input.tipo,
    fecha: input.fecha, cantidad: input.cantidad ?? null, unidad: input.unidad ?? null,
    comprador: input.comprador ?? null, animal_id: animalId
  })
  if (error) return `Error: ${error.message}`
  return `Venta registrada: ${input.descripcion} — ${formatUSD(input.monto)}${animalInfo}`
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
    .from('tasks').select('id, title, status')
    .ilike('title', `%${input.title_search}%`)
    .order('created_at', { ascending: false })
    .limit(50)

  // Ante empates, preferir las tareas abiertas
  const task = pickOne(data ?? [], t => t.title, input.title_search, 'tareas',
    t => t.status === 'pending' || t.status === 'in_progress')
  if (!task) return `No encontré tarea con "${input.title_search}".`

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
    .in('status', ['pending', 'in_progress']).limit(50)

  const task = pickOne(data ?? [], t => t.title, input.title_search, 'tareas pendientes')
  if (!task) return `No encontré tarea pendiente con "${input.title_search}".`

  const { error } = await supabase.from('tasks').update({ status: 'completed' }).eq('id', task.id)
  if (error) return `Error: ${error.message}`
  return `✓ Tarea completada: "${task.title}"`
}

async function removeInventoryStock(input: {
  item_name: string; quantity: number; date?: string; notes?: string
}): Promise<string> {
  const item = await findInventoryItem(input.item_name)
  if (!item) return `No encontré producto "${input.item_name}" en el inventario.`
  if (input.quantity <= 0) return 'La cantidad debe ser mayor que cero.'
  if (item.quantity < input.quantity) {
    return `Stock insuficiente: hay ${item.quantity} ${item.unit} de ${item.name} y quieres sacar ${input.quantity}.`
  }
  await createMovement({
    item_id: item.id, type: 'out', quantity: input.quantity,
    date: input.date ?? today(), notes: input.notes ?? null
  })
  return `Salida registrada: ${input.quantity} ${item.unit} de ${item.name}. Quedan ${item.quantity - input.quantity} ${item.unit}.`
}

// ─── Paneles de la app (mismos cálculos que las pantallas) ───────────────────

async function getWorkList(): Promise<string> {
  const lists = await fetchWorkLists()
  const urg: Record<string, string> = { overdue: 'atrasado', today: 'hoy', soon: 'próximo' }
  const out = lists
    .filter(l => l.items.length)
    .map(l => ({
      lista: l.title,
      items: l.items.map(i => `${i.label}: ${i.detail} (${urg[i.urgency] ?? i.urgency})`)
    }))
  return out.length ? JSON.stringify(out) : 'No hay nada pendiente en las listas de trabajo.'
}

async function getAlerts(): Promise<string> {
  const alerts = await fetchAlerts()
  if (!alerts.length) return 'No hay alertas activas.'
  return JSON.stringify(alerts.map(a => ({ nivel: a.level, titulo: a.title, detalle: a.description })))
}

async function getReproductionIndicators(): Promise<string> {
  const d = await fetchReproductionData()
  return JSON.stringify({
    promedios_hato: d.herd,
    vacas: d.cows.map(c => ({
      vaca: c.label, preñada: c.isPregnant, ultimo_parto: c.lastBirth, partos: c.birthCount,
      dias_abiertos: c.diasAbiertos, sigue_vacia: c.diasAbiertosEnCurso,
      intervalo_partos_dias: c.intervaloPartos, servicios: c.servicios
    })),
    cerdas: d.sows.map(s => ({
      cerda: s.label, preñada: s.isPregnant, ultima_camada: s.lastLitter, camadas: s.litterCount,
      camadas_por_año: s.camadasPorAno, nacidos_vivos_prom: s.nacidosVivosProm,
      destetados_prom: s.destetadosProm, destetados_por_año: s.destetadosPorAno
    })),
    sementales: d.sires.map(s => ({
      nombre: s.name, servicios: s.servicios, preñadas: s.prenadas,
      fallidas: s.fallidas, pendientes: s.pendientes, tasa_preñez_pct: s.tasa
    }))
  })
}

async function getGoals(): Promise<string> {
  const { metas, costos } = await fetchMetas()
  const nivel: Record<string, string> = { good: 'bien', warn: 'atención', bad: 'mal', nodata: 'sin datos' }
  return JSON.stringify({
    metas: metas.map(m => ({ meta: m.title, valor: m.display, objetivo: m.metaLabel, estado: nivel[m.level] ?? m.level })),
    costos_USD: costos
  })
}

// ─── Acceso general a la base de datos ───────────────────────────────────────

const MAX_ROWS = 300
const MAX_STATS_ROWS = 5000

interface QueryFilter { column: string; op: string; value: unknown }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(query: any, filters: QueryFilter[] | undefined) {
  for (const f of filters ?? []) {
    switch (f.op) {
      case 'eq': query = query.eq(f.column, f.value); break
      case 'neq': query = query.neq(f.column, f.value); break
      case 'gt': query = query.gt(f.column, f.value); break
      case 'gte': query = query.gte(f.column, f.value); break
      case 'lt': query = query.lt(f.column, f.value); break
      case 'lte': query = query.lte(f.column, f.value); break
      case 'ilike': query = query.ilike(f.column, `%${String(f.value).replace(/^%|%$/g, '')}%`); break
      case 'is': query = query.is(f.column, f.value as null | boolean); break
      case 'in': query = query.in(f.column, Array.isArray(f.value) ? f.value : [f.value]); break
      default: throw new ToolError(`Operador de filtro no válido: ${f.op}`)
    }
  }
  return query
}

function groupKey(row: Record<string, unknown>, groupBy: string): string {
  const [mode, col] = groupBy.includes(':') ? groupBy.split(':') : ['col', groupBy]
  const v = row[col]
  if (v == null) return '(vacío)'
  const s = String(v)
  if (mode === 'month') return s.slice(0, 7)
  if (mode === 'week') {
    // Lunes de la semana de la fecha
    const d = new Date(`${s.slice(0, 10)}T12:00:00`)
    const offset = (d.getDay() + 6) % 7
    return addDaysToDate(s.slice(0, 10), -offset)
  }
  return s
}

function computeStats(rows: Record<string, unknown>[], cols: string[]) {
  const out: Record<string, unknown> = { filas: rows.length }
  for (const c of cols) {
    const nums = rows.map(r => Number(r[c])).filter(n => Number.isFinite(n))
    if (!nums.length) { out[c] = 'sin valores numéricos'; continue }
    const sum = nums.reduce((s, n) => s + n, 0)
    out[c] = {
      suma: Math.round(sum * 100) / 100,
      promedio: Math.round((sum / nums.length) * 100) / 100,
      minimo: Math.min(...nums),
      maximo: Math.max(...nums)
    }
  }
  return out
}

async function queryData(input: {
  table: string; select?: string; filters?: QueryFilter[]
  order_by?: string; ascending?: boolean; limit?: number
  stats_columns?: string[]; group_by?: string
}): Promise<string> {
  if (!(QUERYABLE_TABLES as readonly string[]).includes(input.table)) {
    return `Tabla no permitida: ${input.table}`
  }

  // Estadísticas: se calculan sobre todas las filas que cumplen los filtros
  if (input.stats_columns?.length) {
    const statsCols = input.stats_columns
    const groupCol = input.group_by?.includes(':') ? input.group_by.split(':')[1] : input.group_by
    const cols = Array.from(new Set([...statsCols, ...(groupCol ? [groupCol] : [])]))
    let q = supabase.from(input.table as 'animals').select(cols.join(','), { count: 'exact' })
    q = applyFilters(q, input.filters)
    const { data, error, count } = await q.limit(MAX_STATS_ROWS)
    if (error) return `Error: ${error.message}`
    const rows = (data ?? []) as unknown as Record<string, unknown>[]
    const aviso = (count ?? rows.length) > rows.length
      ? { aviso: `solo se usaron ${rows.length} de ${count} filas` } : {}

    if (!input.group_by) return JSON.stringify({ ...computeStats(rows, statsCols), ...aviso })

    const groups = new Map<string, Record<string, unknown>[]>()
    for (const r of rows) {
      const k = groupKey(r, input.group_by)
      const arr = groups.get(k) ?? []
      arr.push(r)
      groups.set(k, arr)
    }
    const grupos = Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([grupo, rs]) => ({ grupo, ...computeStats(rs, statsCols) }))
    return JSON.stringify({ agrupado_por: input.group_by, grupos, ...aviso })
  }

  const limit = Math.min(Math.max(1, input.limit ?? 50), MAX_ROWS)
  let q = supabase.from(input.table as 'animals').select(input.select?.trim() || '*', { count: 'exact' })
  q = applyFilters(q, input.filters)
  // Las tablas de detalle no tienen created_at
  const orderCol = input.order_by ?? (input.table.endsWith('_details') ? undefined : 'created_at')
  if (orderCol) q = q.order(orderCol, { ascending: input.ascending ?? false })
  const { data, error, count } = await q.limit(limit)
  if (error) return `Error: ${error.message}`
  const rows = data ?? []
  return JSON.stringify({ total_que_cumplen: count ?? rows.length, devueltas: rows.length, filas: rows })
}

async function insertRecord(input: { table: string; values: Record<string, unknown> }): Promise<string> {
  if (!(INSERTABLE_TABLES as readonly string[]).includes(input.table)) {
    return `No se puede crear en ${input.table} con esta herramienta; usa la herramienta específica.`
  }
  const { data, error } = await supabase.from(input.table as 'vaccines').insert(input.values as never).select().single()
  if (error) return `Error: ${error.message}`
  return `Registro creado en ${input.table}: ${JSON.stringify(data)}`
}

async function updateRecord(input: { table: string; id: string; changes: Record<string, unknown> }): Promise<string> {
  if (isMilkTable(input.table)) return MILK_LOCKED_MSG
  if (!(WRITABLE_TABLES as readonly string[]).includes(input.table)) {
    return `No se puede modificar ${input.table}.`
  }
  const changes = { ...input.changes }
  delete changes.id
  delete changes.created_at
  if (input.table === 'inventory_items' && 'quantity' in changes) {
    return 'El stock no se cambia directo: registra una entrada (add_inventory_stock) o una salida (remove_inventory_stock).'
  }
  if (!Object.keys(changes).length) return 'No hay cambios que aplicar.'

  const { data: before } = await supabase.from(input.table as 'animals').select('*').eq('id', input.id).maybeSingle()
  if (!before) return `No encontré el registro ${input.id} en ${input.table}.`
  const prev = before as Record<string, unknown>
  if (input.table === 'animals' && changes.stage != null && prev.species === 'cattle') {
    return 'La etapa (stage) solo aplica a cerdos.'
  }
  const { data, error } = await supabase.from(input.table as 'animals').update(changes as never).eq('id', input.id).select().single()
  if (error) return `Error: ${error.message}`
  const next = data as Record<string, unknown>
  const changed = Object.keys(changes).map(k => `${k}: ${JSON.stringify(prev[k])} → ${JSON.stringify(next[k])}`)
  return `Registro corregido en ${input.table}. ${changed.join('; ')}`
}

async function deleteRecord(input: { table: string; id: string }): Promise<string> {
  if (isMilkTable(input.table)) return MILK_LOCKED_MSG
  if (!(DELETABLE_TABLES as readonly string[]).includes(input.table)) {
    return `No se puede borrar en ${input.table}.`
  }
  const { data: before } = await supabase.from(input.table as 'tasks').select('*').eq('id', input.id).maybeSingle()
  if (!before) return `No encontré el registro ${input.id} en ${input.table}.`
  const { error } = await supabase.from(input.table as 'tasks').delete().eq('id', input.id)
  if (error) return `Error: ${error.message}`
  return `Registro borrado de ${input.table}: ${JSON.stringify(before)}`
}

// ─── Router ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyInput = any

const HANDLERS: Record<string, (input: AnyInput) => Promise<string>> = {
  // Consultas
  get_farm_summary:            () => getFarmSummary(),
  get_animals:                 getAnimals,
  get_animal_detail:           getAnimalDetail,
  get_litters:                 getLitters,
  get_calf_births:             getCalfBirths,
  get_inventory:               () => getInventory(),
  get_inventory_movements:     getInventoryMovements,
  get_pending_tasks:           () => getPendingTasks(),
  get_all_tasks:               getAllTasks,
  get_recent_expenses:         getRecentExpenses,
  get_expense_stats:           getExpenseStats,
  get_milk_production:         getMilkProduction,
  get_heat_records:            getHeatRecords,
  get_vaccination_history:     getVaccinationHistory,
  get_milk_withdrawals:        () => getMilkWithdrawals(),
  get_weights:                 getWeights,
  get_recent_sales:            getRecentSales,
  get_finance_summary:         getFinanceSummary,
  get_work_list:               () => getWorkList(),
  get_alerts:                  () => getAlerts(),
  get_reproduction_indicators: () => getReproductionIndicators(),
  get_goals:                   () => getGoals(),
  query_data:                  queryData,
  // Acciones
  register_weight:             registerWeight,
  register_bcs:                registerBcs,
  register_weaning:            registerWeaning,
  register_animal:             registerAnimal,
  update_animal_status:        updateAnimalStatus,
  register_cattle_birth:       registerCattleBirth,
  register_litter:             registerLitter,
  apply_batch_vaccination:     applyBatchVaccination,
  apply_single_vaccination:    applySingleVaccination,
  add_inventory_stock:         addInventoryStock,
  remove_inventory_stock:      removeInventoryStock,
  register_milk_session:       registerMilkSession,
  register_milk_record:        registerMilkRecord,
  register_heat:               registerHeat,
  register_insemination:       registerInsemination,
  update_pregnancy:            updatePregnancy,
  create_expense:              createExpense,
  create_sale:                 createSale,
  create_task:                 createTaskFn,
  update_task:                 updateTaskFn,
  complete_task:               completeTask,
  insert_record:               insertRecord,
  update_record:               updateRecord,
  delete_record:               deleteRecord,
}

// El modelo a veces cambia mayúsculas en el nombre de la herramienta
function resolveHandler(name: string) {
  return HANDLERS[name] ?? HANDLERS[name.toLowerCase()]
}

async function executeTool(name: string, input: Record<string, unknown>): Promise<{ content: string; isError: boolean }> {
  const handler = resolveHandler(name)
  if (!handler) {
    return { content: `Herramienta desconocida: ${name}. Las disponibles son: ${Object.keys(HANDLERS).join(', ')}`, isError: true }
  }
  try {
    const content = await handler(input ?? {})
    return { content, isError: /^Error/.test(content) }
  } catch (e) {
    if (e instanceof ToolError) return { content: e.message, isError: false }
    return { content: `Error en ${name}: ${(e as Error).message}`, isError: true }
  }
}

// Herramientas que cambian datos: se muestran como "acciones" en el chat
// para que la persona vea qué quedó guardado.
const isWriteTool = (name: string) =>
  /^(register_|create_|update_|complete_|apply_|add_|remove_|insert_|delete_)/.test(name)

// Resultados que no guardaron nada (no encontrado, sin stock, ambiguo…)
const NOT_DONE = /^(Error|No |Stock insuficiente|Hay varios|Hay varias|La |El |Tabla no|Herramienta desconocida|Operador)/

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantAction {
  ok: boolean
  summary: string
}

export interface AssistantReply {
  text: string
  actions: AssistantAction[]
}

const MAX_STEPS = 12

/** Respuesta cuando ya se guardó algo pero la llamada al modelo falló después. */
export const PARTIAL_REPLY = 'Guardé lo anterior, pero no pude terminar la respuesta. No lo repitas.'

// El historial entre preguntas viaja solo como texto (sin bloques de
// herramientas ni de razonamiento): más barato, y no hay bloques viejos que
// reenviar. Dentro de una misma pregunta la conversación solo se agrega
// (append-only), devolviendo cada respuesta tal cual llegó.
export async function sendMessage(
  history: ConversationMessage[],
  onToolUse?: (label: string) => void
): Promise<AssistantReply> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Sin conexión a internet. El asistente necesita señal; mientras tanto puedes registrar desde las pantallas de la app, que sí guardan sin internet.')
  }

  const current: ApiMessage[] = history.map(m => ({ role: m.role, content: m.content }))
  const actions: AssistantAction[] = []
  const textOf = (blocks: ContentBlock[]) =>
    blocks.filter((b): b is TextBlock => b.type === 'text').map(b => b.text).join('\n').trim()

  for (let i = 0; i < MAX_STEPS; i++) {
    let response: ApiResponse
    try {
      response = await callClaude(current)
    } catch (e) {
      // Si ya se guardó algo en esta pregunta, no lanzar el error: la persona
      // volvería a dictarlo y quedaría duplicado. Se devuelve lo que sí quedó.
      if (actions.some(a => a.ok)) {
        return { text: PARTIAL_REPLY, actions }
      }
      throw e
    }

    switch (response.stop_reason) {
      case 'tool_use': {
        const toolBlocks = response.content.filter((b): b is ToolUseBlock => b.type === 'tool_use')
        current.push({ role: 'assistant', content: response.content })

        // Las herramientas de una misma vuelta son independientes: en paralelo
        onToolUse?.(toolBlocks.map(tb => TOOL_LABELS[tb.name] ?? `Ejecutando ${tb.name}...`)[0])
        const results = await Promise.all(toolBlocks.map(async (tb) => {
          const r = await executeTool(tb.name, tb.input)
          if (isWriteTool(tb.name)) {
            actions.push({ ok: !r.isError && !NOT_DONE.test(r.content), summary: r.content.split('\n')[0].slice(0, 160) })
          }
          const block: ToolResultBlock = { type: 'tool_result', tool_use_id: tb.id, content: r.content }
          if (r.isError) block.is_error = true
          return block
        }))
        // Todos los resultados juntos en un solo mensaje
        current.push({ role: 'user', content: results })
        continue
      }
      case 'pause_turn':
        current.push({ role: 'assistant', content: response.content })
        continue
      case 'max_tokens': {
        const partial = textOf(response.content)
        return { text: partial ? `${partial}…` : 'La respuesta salió muy larga y se cortó. Pregúntame algo más puntual.', actions }
      }
      case 'refusal':
        return { text: 'No puedo ayudar con eso. Intenta decirlo de otra forma.', actions }
      default:
        return { text: textOf(response.content), actions }
    }
  }

  return { text: 'No alcancé a terminar: eran demasiados pasos. Divide la pregunta en partes más pequeñas.', actions }
}
