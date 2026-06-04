import { supabase } from '@/lib/supabase'
import type { Gasto, GastoFormData } from '@/types'

export async function fetchGastos(): Promise<Gasto[]> {
  const { data, error } = await supabase
    .from('gastos')
    .select('*')
    .order('fecha', { ascending: false })

  if (error) throw error
  return (data ?? []) as Gasto[]
}

export async function createGasto(payload: GastoFormData): Promise<Gasto> {
  const { data, error } = await supabase
    .from('gastos')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data as Gasto
}

export async function updateGasto(id: string, payload: Partial<GastoFormData>): Promise<Gasto> {
  const { data, error } = await supabase
    .from('gastos')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Gasto
}

export async function deleteGasto(id: string): Promise<void> {
  const { error } = await supabase.from('gastos').delete().eq('id', id)
  if (error) throw error
}

export async function uploadFactura(file: File): Promise<string> {
  const ext = file.name.split('.').pop()
  const path = `${Date.now()}.${ext}`

  const { error } = await supabase.storage.from('facturas').upload(path, file)
  if (error) throw error

  const { data } = supabase.storage.from('facturas').getPublicUrl(path)
  return data.publicUrl
}

export async function deleteFactura(url: string): Promise<void> {
  const path = url.split('/facturas/')[1]
  if (!path) return
  await supabase.storage.from('facturas').remove([path])
}
