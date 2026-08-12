import { supabase } from '@/lib/supabase'

// Condición corporal (BCS) escala 1-5.
// Referencia lechera: parto y secado ~3.5; servicio ~2.75-3.25.
// 1 = muy flaca, 5 = muy gorda. Fuera de 2.5-4 hay que actuar.

export type BcsMoment = 'secado' | 'parto' | 'servicio' | 'destete' | 'otro'

export interface BcsRecord {
  id: string
  animal_id: string
  recorded_date: string
  score: number
  moment: BcsMoment | null
  notes: string | null
  created_at: string
}

export const BCS_MOMENT_LABELS: Record<BcsMoment, string> = {
  secado: 'Secado',
  parto: 'Parto',
  servicio: 'Servicio',
  destete: 'Destete',
  otro: 'Otro'
}

export async function fetchBcsRecords(animalId: string): Promise<BcsRecord[]> {
  const { data, error } = await supabase
    .from('bcs_records')
    .select('*')
    .eq('animal_id', animalId)
    .order('recorded_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as BcsRecord[]
}

export async function createBcsRecord(
  payload: Omit<BcsRecord, 'id' | 'created_at'>
): Promise<BcsRecord> {
  const { data, error } = await supabase
    .from('bcs_records')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data as BcsRecord
}

export async function deleteBcsRecord(id: string): Promise<void> {
  const { error } = await supabase.from('bcs_records').delete().eq('id', id)
  if (error) throw error
}

/** Nivel del puntaje: ideal 2.5–4 (verde), 2–2.5 o 4–4.5 (ámbar), extremos (rojo). */
export function bcsLevel(score: number): 'good' | 'warn' | 'bad' {
  if (score >= 2.5 && score <= 4) return 'good'
  if (score >= 2 && score <= 4.5) return 'warn'
  return 'bad'
}
