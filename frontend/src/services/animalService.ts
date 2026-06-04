import { supabase } from '@/lib/supabase'
import type {
  Animal,
  CattleDetail,
  PigDetail,
  AnimalFormData,
  CattleDetailFormData,
  PigDetailFormData,
  Species
} from '@/types'

// ─── Animals ─────────────────────────────────────────────────────────────────

export async function fetchAnimals(species?: Species): Promise<Animal[]> {
  let query = supabase
    .from('animals')
    .select('*, cattle_detail:cattle_details(*), pig_detail:pig_details(*)')
    .order('created_at', { ascending: false })

  if (species) {
    query = query.eq('species', species)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Animal[]
}

export async function fetchAnimalById(id: string): Promise<Animal> {
  const { data, error } = await supabase
    .from('animals')
    .select('*, cattle_detail:cattle_details(*), pig_detail:pig_details(*)')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as Animal
}

export async function createAnimal(payload: AnimalFormData): Promise<Animal> {
  const { data, error } = await supabase
    .from('animals')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data as Animal
}

export async function updateAnimal(id: string, payload: Partial<AnimalFormData>): Promise<Animal> {
  const { data, error } = await supabase
    .from('animals')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Animal
}

export async function deleteAnimal(id: string): Promise<void> {
  const { error } = await supabase.from('animals').delete().eq('id', id)
  if (error) throw error
}

export async function deletePigletsByLitter(sowId: string, birthDate: string): Promise<void> {
  const { error } = await supabase
    .from('animals')
    .delete()
    .eq('mother_id', sowId)
    .eq('species', 'pig')
    .eq('birth_date', birthDate)
  if (error) throw error
}

export async function updatePigletsBirthDate(
  sowId: string,
  oldBirthDate: string,
  newBirthDate: string
): Promise<void> {
  const { error } = await supabase
    .from('animals')
    .update({ birth_date: newBirthDate })
    .eq('mother_id', sowId)
    .eq('species', 'pig')
    .eq('birth_date', oldBirthDate)
  if (error) throw error
}

export async function fetchPigletsByLitter(sowId: string, birthDate: string): Promise<Animal[]> {
  const { data, error } = await supabase
    .from('animals')
    .select('*')
    .eq('mother_id', sowId)
    .eq('species', 'pig')
    .eq('birth_date', birthDate)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as Animal[]
}

// ─── Cattle Details ───────────────────────────────────────────────────────────

export async function fetchCattleDetail(animalId: string): Promise<CattleDetail | null> {
  const { data, error } = await supabase
    .from('cattle_details')
    .select('*')
    .eq('animal_id', animalId)
    .maybeSingle()

  if (error) throw error
  return data as CattleDetail | null
}

export async function upsertCattleDetail(
  animalId: string,
  payload: CattleDetailFormData
): Promise<CattleDetail> {
  const { data, error } = await supabase
    .from('cattle_details')
    .upsert({ ...payload, animal_id: animalId }, { onConflict: 'animal_id' })
    .select()
    .single()

  if (error) throw error
  return data as CattleDetail
}

// ─── Pig Details ──────────────────────────────────────────────────────────────

export async function fetchPigDetail(animalId: string): Promise<PigDetail | null> {
  const { data, error } = await supabase
    .from('pig_details')
    .select('*')
    .eq('animal_id', animalId)
    .maybeSingle()

  if (error) throw error
  return data as PigDetail | null
}

export async function upsertPigDetail(
  animalId: string,
  payload: PigDetailFormData
): Promise<PigDetail> {
  const { data, error } = await supabase
    .from('pig_details')
    .upsert({ ...payload, animal_id: animalId }, { onConflict: 'animal_id' })
    .select()
    .single()

  if (error) throw error
  return data as PigDetail
}
