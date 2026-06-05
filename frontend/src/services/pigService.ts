import { supabase } from '@/lib/supabase'
import type { HeatRecord, HeatRecordFormData, PigStage } from '@/types'

// ─── Configuración de etapas ─────────────────────────────────────────────────

export const stageConfig: Record<PigStage, { label: string; class: string }> = {
  lactancia:    { label: 'Lactancia',    class: 'bg-pink-50 text-pink-700 border-pink-200' },
  destete:      { label: 'Destete',      class: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  iniciacion:   { label: 'Iniciación',   class: 'bg-orange-50 text-orange-700 border-orange-200' },
  crecimiento:  { label: 'Crecimiento',  class: 'bg-blue-50 text-blue-700 border-blue-200' },
  engorde:      { label: 'Engorde',      class: 'bg-green-50 text-green-700 border-green-200' },
  reproduccion: { label: 'Reproducción', class: 'bg-purple-50 text-purple-700 border-purple-200' }
}

// ─── Cálculo automático de etapa por edad ────────────────────────────────────
//  0 – 28 días  → lactancia
// 29 – 60 días  → destete
// 61 – 90 días  → iniciacion
// 91 – 150 días → crecimiento
// 151+ días     → engorde

export function pigAgeDays(birthDate: string | null): number | null {
  if (!birthDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const birth = new Date(birthDate)
  const days = Math.floor((today.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24))
  return days >= 0 ? days : null
}

export function pigAgeLabel(birthDate: string | null): string {
  const days = pigAgeDays(birthDate)
  if (days === null) return ''
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}m`
  const years = Math.floor(months / 12)
  const rem = months % 12
  return rem > 0 ? `${years}a ${rem}m` : `${years}a`
}

export function calcPigStage(birthDate: string | null): PigStage | null {
  const days = pigAgeDays(birthDate)
  if (days === null) return null
  if (days <= 28)  return 'lactancia'
  if (days <= 60)  return 'destete'
  if (days <= 90)  return 'iniciacion'
  if (days <= 150) return 'crecimiento'
  return 'engorde'
}

// ─── Registros de celo ────────────────────────────────────────────────────────

export async function fetchHeatRecords(animalId: string): Promise<HeatRecord[]> {
  const { data, error } = await supabase
    .from('heat_records')
    .select('*')
    .eq('animal_id', animalId)
    .order('observed_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as HeatRecord[]
}

export async function createHeatRecord(payload: HeatRecordFormData): Promise<HeatRecord> {
  const { data, error } = await supabase
    .from('heat_records')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data as HeatRecord
}

export async function deleteHeatRecord(id: string): Promise<void> {
  const { error } = await supabase.from('heat_records').delete().eq('id', id)
  if (error) throw error
}

// ─── Cálculos de celo ────────────────────────────────────────────────────────
// Ciclo estral porcino: ~21 días
// Ventana de inseminación: mismo día del celo (12-36h post inicio)
// Gestación: 114 días (3 meses, 3 semanas, 3 días)

export const HEAT_CYCLE_DAYS = 21
export const GESTATION_DAYS = 114

export function calcNextHeat(observedDate: string): string {
  const d = new Date(`${observedDate}T12:00:00`)
  d.setDate(d.getDate() + HEAT_CYCLE_DAYS)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export function calcExpectedBirth(inseminationDate: string): string {
  const d = new Date(`${inseminationDate}T12:00:00`)
  d.setDate(d.getDate() + GESTATION_DAYS)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export function daysUntil(targetDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${targetDate}T12:00:00`)
  target.setHours(12, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}
