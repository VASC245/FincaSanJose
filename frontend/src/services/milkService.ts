import { supabase } from '@/lib/supabase'
import type { MilkRecord, MilkRecordFormData, DailyMilkSummary, MilkSession, MilkSessionFormData, MonthlyMilkSummary } from '@/types'

export async function fetchMilkRecords(animalId: string): Promise<MilkRecord[]> {
  const { data, error } = await supabase
    .from('milk_records')
    .select('*')
    .eq('animal_id', animalId)
    .order('recorded_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as MilkRecord[]
}

export async function fetchAllMilkRecords(): Promise<MilkRecord[]> {
  const { data, error } = await supabase
    .from('milk_records')
    .select('*, animal:animals(id, ear_tag, name)')
    .order('recorded_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as MilkRecord[]
}

export async function createMilkRecord(payload: MilkRecordFormData): Promise<MilkRecord> {
  const { data, error } = await supabase
    .from('milk_records')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data as MilkRecord
}

export async function updateMilkRecord(id: string, payload: Partial<MilkRecordFormData>): Promise<MilkRecord> {
  const { data, error } = await supabase
    .from('milk_records')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as MilkRecord
}

export async function deleteMilkRecord(id: string): Promise<void> {
  const { error } = await supabase.from('milk_records').delete().eq('id', id)
  if (error) throw error
}

// ─── Milk sessions (ordeño total) ─────────────────────────────────────────────

export async function fetchMilkSessions(): Promise<MilkSession[]> {
  const { data, error } = await supabase
    .from('milk_sessions')
    .select('*')
    .order('recorded_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as MilkSession[]
}

export async function createMilkSession(payload: MilkSessionFormData): Promise<MilkSession> {
  const { data, error } = await supabase
    .from('milk_sessions')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data as MilkSession
}

export async function deleteMilkSession(id: string): Promise<void> {
  const { error } = await supabase.from('milk_sessions').delete().eq('id', id)
  if (error) throw error
}

// Agrupa sesiones por mes para el resumen mensual
export function groupSessionsByMonth(sessions: MilkSession[]): MonthlyMilkSummary[] {
  const map = new Map<string, MilkSession[]>()
  for (const s of sessions) {
    const d = new Date(s.recorded_date + 'T12:00:00')
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const list = map.get(key) ?? []
    list.push(s)
    map.set(key, list)
  }
  return Array.from(map.entries()).map(([key, list]) => {
    const [year, month] = key.split('-').map(Number)
    const label = new Date(year, month, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' })
    const total = list.reduce((s, r) => s + Number(r.liters), 0)
    return {
      year,
      month,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      sessions: list.sort((a, b) => b.recorded_date.localeCompare(a.recorded_date)),
      total,
      average: total / list.length,
      daysRecorded: list.length
    }
  }).sort((a, b) => b.year - a.year || b.month - a.month)
}

// ─── Milk records per cow ─────────────────────────────────────────────────────

// Agrupa todos los registros por fecha para la vista global
export function groupByDate(records: MilkRecord[]): DailyMilkSummary[] {
  const map = new Map<string, MilkRecord[]>()
  for (const r of records) {
    const list = map.get(r.recorded_date) ?? []
    list.push(r)
    map.set(r.recorded_date, list)
  }
  return Array.from(map.entries())
    .map(([date, recs]) => ({
      date,
      total_liters: recs.reduce((sum, r) => sum + Number(r.liters), 0),
      records: recs
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}
