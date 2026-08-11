import { supabase } from '@/lib/supabase'
import type { Venta, VentaFormData } from '@/types'

export async function fetchVentas(): Promise<Venta[]> {
  const { data, error } = await supabase
    .from('ventas')
    .select('*')
    .order('fecha', { ascending: false })

  if (error) throw error
  return (data ?? []) as Venta[]
}

export async function createVenta(payload: VentaFormData): Promise<Venta> {
  const { data, error } = await supabase
    .from('ventas')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data as Venta
}

export async function updateVenta(id: string, payload: Partial<VentaFormData>): Promise<Venta> {
  const { data, error } = await supabase
    .from('ventas')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Venta
}

export async function deleteVenta(id: string): Promise<void> {
  const { error } = await supabase.from('ventas').delete().eq('id', id)
  if (error) throw error
}
