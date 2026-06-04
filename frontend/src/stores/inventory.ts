import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { InventoryItem, InventoryCategory, InventoryMovement, InventoryItemFormData, InventoryMovementFormData } from '@/types'
import * as inventoryService from '@/services/inventoryService'

export const useInventoryStore = defineStore('inventory', () => {
  const items = ref<InventoryItem[]>([])
  const categories = ref<InventoryCategory[]>([])
  const movements = ref<InventoryMovement[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const lowStockItems = computed(() =>
    items.value.filter((i) => i.quantity <= i.min_quantity)
  )

  async function loadItems() {
    loading.value = true
    error.value = null
    try {
      items.value = await inventoryService.fetchItems()
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function loadCategories() {
    try {
      categories.value = await inventoryService.fetchCategories()
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function loadMovements(itemId?: string) {
    loading.value = true
    error.value = null
    try {
      movements.value = await inventoryService.fetchMovements(itemId)
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function addItem(payload: InventoryItemFormData): Promise<InventoryItem> {
    const item = await inventoryService.createItem(payload)
    items.value.push(item)
    return item
  }

  async function editItem(id: string, payload: Partial<InventoryItemFormData>): Promise<InventoryItem> {
    const updated = await inventoryService.updateItem(id, payload)
    const idx = items.value.findIndex((i) => i.id === id)
    if (idx !== -1) items.value[idx] = updated
    return updated
  }

  async function removeItem(id: string): Promise<void> {
    await inventoryService.deleteItem(id)
    items.value = items.value.filter((i) => i.id !== id)
  }

  async function addMovement(payload: InventoryMovementFormData): Promise<InventoryMovement> {
    const movement = await inventoryService.createMovement(payload)
    movements.value.unshift(movement)

    // Refresh item stock
    const updated = await inventoryService.fetchItemById(payload.item_id)
    const idx = items.value.findIndex((i) => i.id === payload.item_id)
    if (idx !== -1) items.value[idx] = updated

    return movement
  }

  return {
    items,
    categories,
    movements,
    loading,
    error,
    lowStockItems,
    loadItems,
    loadCategories,
    loadMovements,
    addItem,
    editItem,
    removeItem,
    addMovement
  }
})
