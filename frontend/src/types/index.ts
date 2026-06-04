// ─── Animal & Species ────────────────────────────────────────────────────────

export type Species = 'cattle' | 'pig'
export type Sex = 'male' | 'female'
export type AnimalStatus = 'active' | 'sold' | 'deceased' | 'culled'
export type PigStage = 'lactancia' | 'destete' | 'iniciacion' | 'crecimiento' | 'engorde' | 'reproduccion'

export interface Animal {
  id: string
  name: string | null
  ear_tag: string | null
  species: Species
  sex: Sex
  birth_date: string | null
  status: AnimalStatus
  stage: PigStage | null
  mother_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // joined relations (optional)
  cattle_detail?: CattleDetail | null
  pig_detail?: PigDetail | null
}

// ─── Cattle ──────────────────────────────────────────────────────────────────

export interface CattleDetail {
  id: string
  animal_id: string
  is_pregnant: boolean
  conception_date: string | null
  expected_birth: string | null
  last_birth_date: string | null
  birth_count: number
}

export interface CalfBirth {
  id: string
  cow_id: string
  calf_id: string | null
  birth_date: string
  notes: string | null
  created_at: string
}

// ─── Pigs ────────────────────────────────────────────────────────────────────

export interface PigDetail {
  id: string
  animal_id: string
  is_pregnant: boolean
  service_date: string | null
  expected_birth: string | null
  litter_count: number
}

export interface Litter {
  id: string
  sow_id: string
  birth_date: string
  total_born: number
  born_alive: number
  notes: string | null
  created_at: string
}

// ─── Vaccinations ────────────────────────────────────────────────────────────

export interface Vaccine {
  id: string
  name: string
  description: string | null
  manufacturer: string | null
  disease_target: string | null
  created_at: string
}

export interface VaccinationRecord {
  id: string
  animal_id: string
  vaccine_id: string | null
  inventory_item_id: string | null
  applied_date: string
  next_date: string | null
  applied_by: string | null
  notes: string | null
  created_at: string
  // joined
  vaccine?: Vaccine
  inventory_item?: Pick<InventoryItem, 'id' | 'name' | 'unit'>
  animal?: Pick<Animal, 'id' | 'ear_tag' | 'name' | 'species'>
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export interface InventoryCategory {
  id: string
  name: string
  description: string | null
  created_at: string
}

export interface InventoryItem {
  id: string
  category_id: string | null
  name: string
  description: string | null
  unit: string
  quantity: number
  min_quantity: number
  created_at: string
  updated_at: string
  // joined
  category?: InventoryCategory
}

export type MovementType = 'in' | 'out'

export interface InventoryMovement {
  id: string
  item_id: string
  type: MovementType
  quantity: number
  date: string
  notes: string | null
  created_at: string
  // joined
  item?: Pick<InventoryItem, 'id' | 'name' | 'unit'>
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export type TaskStatus = 'pending' | 'in_progress' | 'completed'
export type TaskPriority = 'low' | 'medium' | 'high'
export type TaskCategory = 'health' | 'feeding' | 'maintenance' | 'reproduction' | 'other'

export interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  category: TaskCategory | null
  animal_id: string | null
  created_at: string
  updated_at: string
  // joined
  animal?: Pick<Animal, 'id' | 'ear_tag' | 'name' | 'species'>
}

// ─── Milk production ─────────────────────────────────────────────────────────

export interface MilkRecord {
  id: string
  animal_id: string
  recorded_date: string
  liters: number
  notes: string | null
  created_at: string
  // joined
  animal?: Pick<Animal, 'id' | 'ear_tag' | 'name'>
}

export type MilkRecordFormData = Omit<MilkRecord, 'id' | 'created_at' | 'animal'>

export interface DailyMilkSummary {
  date: string
  total_liters: number
  records: MilkRecord[]
}

export interface MilkSession {
  id: string
  recorded_date: string
  liters: number
  notes: string | null
  created_at: string
}

export type MilkSessionFormData = Omit<MilkSession, 'id' | 'created_at'>

export interface MonthlyMilkSummary {
  year: number
  month: number          // 0-based (JS Date)
  label: string          // "Abril 2026"
  sessions: MilkSession[]
  total: number
  average: number        // total / days with records
  daysRecorded: number
}

// ─── Heat records (celo) ─────────────────────────────────────────────────────

export interface HeatRecord {
  id: string
  animal_id: string
  observed_date: string
  notes: string | null
  created_at: string
}

export type HeatRecordFormData = Omit<HeatRecord, 'id' | 'created_at'>

// ─── Gastos ──────────────────────────────────────────────────────────────────

export type GastoCategoria =
  | 'alimentacion'
  | 'veterinaria'
  | 'mantenimiento'
  | 'equipos'
  | 'combustible'
  | 'personal'
  | 'otro'

export interface Gasto {
  id: string
  fecha: string
  monto: number
  descripcion: string
  categoria: GastoCategoria
  foto_url: string | null
  created_at: string
}

export type GastoFormData = Omit<Gasto, 'id' | 'created_at'>

// ─── Dashboard KPIs ──────────────────────────────────────────────────────────

export interface DashboardStats {
  total_cattle: number
  total_pigs: number
  pregnant_cows: number
  pregnant_sows: number
  pending_tasks: number
  low_stock_items: number
}

// ─── Form helpers ────────────────────────────────────────────────────────────

export type AnimalFormData = Omit<Animal, 'id' | 'created_at' | 'updated_at' | 'cattle_detail' | 'pig_detail'>
export type CattleDetailFormData = Omit<CattleDetail, 'id' | 'animal_id'>
export type PigDetailFormData = Omit<PigDetail, 'id' | 'animal_id'>
export type TaskFormData = Omit<Task, 'id' | 'created_at' | 'updated_at' | 'animal'>
export type InventoryItemFormData = Omit<InventoryItem, 'id' | 'created_at' | 'updated_at' | 'category'>
export type InventoryMovementFormData = Omit<InventoryMovement, 'id' | 'created_at' | 'item'>
export type LitterFormData = Omit<Litter, 'id' | 'created_at'>
export type VaccinationFormData = Omit<VaccinationRecord, 'id' | 'created_at' | 'vaccine' | 'animal'>
