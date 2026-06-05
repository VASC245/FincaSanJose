import { supabase } from '@/lib/supabase'

export interface InseminationRecord {
  id: string
  animal_id: string
  insemination_date: string
  semen_source: string | null
  expected_birth: string | null
  heat_check_date: string | null
  pregnancy_confirmed: boolean | null
  pregnancy_confirmed_date: string | null
  notes: string | null
  created_at: string
}

export async function fetchInseminationRecords(animalId: string): Promise<InseminationRecord[]> {
  const { data, error } = await supabase
    .from('insemination_records')
    .select('*')
    .eq('animal_id', animalId)
    .order('insemination_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as InseminationRecord[]
}

export async function createInseminationRecord(payload: {
  animal_id: string
  insemination_date: string
  semen_source?: string | null
  expected_birth?: string | null
  heat_check_date?: string | null
  notes?: string | null
  pregnancy_confirmed?: boolean | null
  pregnancy_confirmed_date?: string | null
}): Promise<InseminationRecord> {
  const { data, error } = await supabase
    .from('insemination_records')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data as InseminationRecord
}

export async function updateInseminationConfirmation(
  id: string,
  confirmed: boolean | null,
  confirmedDate?: string | null
): Promise<InseminationRecord> {
  const { data, error } = await supabase
    .from('insemination_records')
    .update({
      pregnancy_confirmed: confirmed,
      pregnancy_confirmed_date: confirmed === true ? (confirmedDate ?? null) : null
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as InseminationRecord
}

export async function deleteInseminationRecord(id: string): Promise<void> {
  const { error } = await supabase.from('insemination_records').delete().eq('id', id)
  if (error) throw error
}
