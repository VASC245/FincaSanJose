import { supabase } from '@/lib/supabase'
import type { WeightRecord, WeightRecordFormData } from '@/types'

// Pesos y ganancia diaria de peso (ADG) para cerdos de engorde.

export async function fetchWeightRecords(animalId: string): Promise<WeightRecord[]> {
  const { data, error } = await supabase
    .from('weight_records')
    .select('*')
    .eq('animal_id', animalId)
    .order('recorded_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as WeightRecord[]
}

export async function fetchAllWeightRecords(): Promise<WeightRecord[]> {
  const { data, error } = await supabase
    .from('weight_records')
    .select('*')
    .order('recorded_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as WeightRecord[]
}

export async function createWeightRecord(payload: WeightRecordFormData): Promise<WeightRecord> {
  const { data, error } = await supabase
    .from('weight_records')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data as WeightRecord
}

export async function deleteWeightRecord(id: string): Promise<void> {
  const { error } = await supabase.from('weight_records').delete().eq('id', id)
  if (error) throw error
}

// ─── Cálculos ────────────────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86_400_000
  )
}

export interface AdgSummary {
  firstDate: string
  lastDate: string
  firstWeight: number
  lastWeight: number
  totalGain: number      // kg ganados en el período
  days: number           // días entre primer y último pesaje
  adg: number | null     // kg/día (ganancia diaria promedio)
}

/** ADG global entre el primer y el último pesaje (requiere ≥ 2 registros). */
export function computeAdg(records: WeightRecord[]): AdgSummary | null {
  if (records.length < 2) return null
  const sorted = [...records].sort((a, b) => a.recorded_date.localeCompare(b.recorded_date))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const days = daysBetween(first.recorded_date, last.recorded_date)
  const totalGain = Number(last.weight_kg) - Number(first.weight_kg)
  return {
    firstDate: first.recorded_date,
    lastDate: last.recorded_date,
    firstWeight: Number(first.weight_kg),
    lastWeight: Number(last.weight_kg),
    totalGain: Math.round(totalGain * 100) / 100,
    days,
    adg: days > 0 ? Math.round((totalGain / days) * 1000) / 1000 : null,
  }
}

/** Ganancia diaria de cada pesaje respecto al anterior (para la tabla). */
export function gainPerRecord(records: WeightRecord[]): Map<string, number | null> {
  const sorted = [...records].sort((a, b) => a.recorded_date.localeCompare(b.recorded_date))
  const gains = new Map<string, number | null>()
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) { gains.set(sorted[i].id, null); continue }
    const days = daysBetween(sorted[i - 1].recorded_date, sorted[i].recorded_date)
    const diff = Number(sorted[i].weight_kg) - Number(sorted[i - 1].weight_kg)
    gains.set(sorted[i].id, days > 0 ? Math.round((diff / days) * 1000) / 1000 : null)
  }
  return gains
}
