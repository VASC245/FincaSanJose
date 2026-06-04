import { supabase } from '@/lib/supabase'
import type {
  InventoryCategory,
  InventoryItem,
  InventoryMovement,
  InventoryItemFormData,
  InventoryMovementFormData
} from '@/types'

// ─── Categories ───────────────────────────────────────────────────────────────

export async function fetchCategories(): Promise<InventoryCategory[]> {
  const { data, error } = await supabase
    .from('inventory_categories')
    .select('*')
    .order('name')

  if (error) throw error
  return (data ?? []) as InventoryCategory[]
}

export async function createCategory(
  name: string,
  description?: string
): Promise<InventoryCategory> {
  const { data, error } = await supabase
    .from('inventory_categories')
    .insert({ name, description: description ?? null })
    .select()
    .single()

  if (error) throw error
  return data as InventoryCategory
}

// ─── Items ────────────────────────────────────────────────────────────────────

export async function fetchItems(): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*, category:inventory_categories(*)')
    .order('name')

  if (error) throw error
  return (data ?? []) as InventoryItem[]
}

export async function fetchItemById(id: string): Promise<InventoryItem> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*, category:inventory_categories(*)')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as InventoryItem
}

export async function createItem(payload: InventoryItemFormData): Promise<InventoryItem> {
  const { data, error } = await supabase
    .from('inventory_items')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data as InventoryItem
}

export async function updateItem(
  id: string,
  payload: Partial<InventoryItemFormData>
): Promise<InventoryItem> {
  const { data, error } = await supabase
    .from('inventory_items')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as InventoryItem
}

export async function deleteItem(id: string): Promise<void> {
  const { error } = await supabase.from('inventory_items').delete().eq('id', id)
  if (error) throw error
}

// ─── Movements ────────────────────────────────────────────────────────────────

export async function fetchMovements(itemId?: string): Promise<InventoryMovement[]> {
  let query = supabase
    .from('inventory_movements')
    .select('*, item:inventory_items(id, name, unit)')
    .order('date', { ascending: false })
    .limit(200)

  if (itemId) {
    query = query.eq('item_id', itemId)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as InventoryMovement[]
}

export async function createMovement(
  payload: InventoryMovementFormData
): Promise<InventoryMovement> {
  // The DB trigger update_inventory_quantity() handles stock automatically
  const { data, error } = await supabase
    .from('inventory_movements')
    .insert(payload)
    .select('*, item:inventory_items(id, name, unit)')
    .single()

  if (error) throw error
  return data as InventoryMovement
}
