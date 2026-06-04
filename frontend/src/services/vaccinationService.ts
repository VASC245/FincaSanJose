import { supabase } from '@/lib/supabase'
import type { Vaccine, VaccinationRecord, VaccinationFormData, Litter, LitterFormData, Animal } from '@/types'

export interface LitterWithSow extends Litter {
  sow: Pick<Animal, 'id' | 'ear_tag' | 'name'>
}

// ─── Vaccines ────────────────────────────────────────────────────────────────

export async function fetchVaccines(): Promise<Vaccine[]> {
  const { data, error } = await supabase
    .from('vaccines')
    .select('*')
    .order('name')

  if (error) throw error
  return (data ?? []) as Vaccine[]
}

export async function createVaccine(
  payload: Omit<Vaccine, 'id' | 'created_at'>
): Promise<Vaccine> {
  const { data, error } = await supabase
    .from('vaccines')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data as Vaccine
}

// ─── Vaccination Records ──────────────────────────────────────────────────────

export async function fetchVaccinationRecords(animalId: string): Promise<VaccinationRecord[]> {
  const { data, error } = await supabase
    .from('vaccination_records')
    .select('*, vaccine:vaccines(*), inventory_item:inventory_items(id, name, unit)')
    .eq('animal_id', animalId)
    .order('applied_date', { ascending: false })

  if (error) throw error
  return (data ?? []) as VaccinationRecord[]
}

export async function createVaccinationRecord(
  payload: VaccinationFormData
): Promise<VaccinationRecord> {
  const { data, error } = await supabase
    .from('vaccination_records')
    .insert(payload)
    .select('*, vaccine:vaccines(*), inventory_item:inventory_items(id, name, unit)')
    .single()

  if (error) throw error
  return data as VaccinationRecord
}

export async function createBatchVaccinationRecords(
  animalIds: string[],
  payload: Omit<VaccinationFormData, 'animal_id'>
): Promise<VaccinationRecord[]> {
  const rows = animalIds.map((animal_id) => ({ ...payload, animal_id }))
  const { data, error } = await supabase
    .from('vaccination_records')
    .insert(rows)
    .select('*, inventory_item:inventory_items(id, name, unit)')

  if (error) throw error
  return (data ?? []) as VaccinationRecord[]
}

export async function deleteVaccinationRecord(id: string): Promise<void> {
  const { error } = await supabase.from('vaccination_records').delete().eq('id', id)
  if (error) throw error
}

// ─── Litters (pig births) ─────────────────────────────────────────────────────

export async function fetchLitters(sowId: string): Promise<Litter[]> {
  const { data, error } = await supabase
    .from('litters')
    .select('*')
    .eq('sow_id', sowId)
    .order('birth_date', { ascending: false })

  if (error) throw error
  return (data ?? []) as Litter[]
}

export async function createLitter(payload: LitterFormData): Promise<Litter> {
  const { data, error } = await supabase
    .from('litters')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data as Litter
}

export async function updateLitter(id: string, payload: Partial<LitterFormData>): Promise<Litter> {
  const { data, error } = await supabase
    .from('litters')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Litter
}

export async function deleteLitter(id: string): Promise<void> {
  const { error } = await supabase.from('litters').delete().eq('id', id)
  if (error) throw error
}

export async function fetchAllLitters(): Promise<LitterWithSow[]> {
  const { data, error } = await supabase
    .from('litters')
    .select('*, sow:animals(id, ear_tag, name)')
    .order('birth_date', { ascending: false })

  if (error) throw error
  return (data ?? []) as LitterWithSow[]
}
