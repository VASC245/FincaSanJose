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

// ─── Correcciones protegidas con clave ───────────────────────────────────────
// La base de datos no deja cambiar ni borrar leche directamente: todo pasa por
// funciones que verifican la clave en el servidor y guardan el motivo.

export type MilkSource = 'milk_sessions' | 'milk_records'

export class MilkCorrectionError extends Error {}

function rpcResult<T>(data: unknown, error: { message: string } | null): T {
  if (error) {
    if (/fetch|network|Failed/i.test(error.message)) {
      throw new MilkCorrectionError('Necesitas señal para corregir registros de leche.')
    }
    throw new MilkCorrectionError(error.message)
  }
  const res = data as { ok: boolean; error?: string; row?: unknown }
  if (!res?.ok) throw new MilkCorrectionError(res?.error ?? 'No se pudo guardar la corrección.')
  return res.row as T
}

export async function correctMilkEntry<T extends MilkSession | MilkRecord>(
  source: MilkSource,
  id: string,
  values: { recorded_date: string; liters: number; notes: string | null },
  reason: string,
  password: string
): Promise<T> {
  const { data, error } = await supabase.rpc('edit_milk_entry', {
    p_source: source,
    p_id: id,
    p_password: password,
    p_reason: reason,
    p_recorded_date: values.recorded_date,
    p_liters: values.liters,
    p_notes: values.notes
  })
  return rpcResult<T>(data, error)
}

export async function deleteMilkEntry(source: MilkSource, id: string, reason: string, password: string): Promise<void> {
  const { data, error } = await supabase.rpc('delete_milk_entry', {
    p_source: source,
    p_id: id,
    p_password: password,
    p_reason: reason
  })
  rpcResult(data, error)
}

export async function changeMilkPassword(current: string, next: string): Promise<void> {
  const { data, error } = await supabase.rpc('change_milk_password', { p_current: current, p_new: next })
  rpcResult(data, error)
}

export interface MilkEditLogEntry {
  id: string
  source: MilkSource
  record_id: string
  action: 'update' | 'delete'
  animal_id: string | null
  old_date: string | null
  old_liters: number | null
  old_notes: string | null
  new_date: string | null
  new_liters: number | null
  new_notes: string | null
  reason: string
  edited_at: string
  animal?: { ear_tag: string | null; name: string | null } | null
}

export async function fetchMilkEditLog(limit = 50): Promise<MilkEditLogEntry[]> {
  const { data, error } = await supabase
    .from('milk_edit_log')
    .select('*, animal:animals(ear_tag, name)')
    .order('edited_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as MilkEditLogEntry[]
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
    // Puede haber varios ordeños el mismo día: el promedio es por día, no por ordeño
    const days = new Set(list.map((r) => r.recorded_date)).size
    return {
      year,
      month,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      sessions: list.sort((a, b) => b.recorded_date.localeCompare(a.recorded_date)),
      total,
      average: total / days,
      daysRecorded: days
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
