<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Search, AlertTriangle, Package, Pencil, Trash2 } from 'lucide-vue-next'
import BaseTable from '@/components/shared/BaseTable.vue'
import BaseBadge from '@/components/shared/BaseBadge.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import BaseInput from '@/components/shared/BaseInput.vue'
import { useInventoryStore } from '@/stores/inventory'
import type { InventoryItem, InventoryItemFormData } from '@/types'

const inventoryStore = useInventoryStore()
const router = useRouter()

const searchQuery = ref('')
const showLowStock = ref(false)
const showForm = ref(false)
const editingItem = ref<InventoryItem | null>(null)
const formLoading = ref(false)

const form = ref<InventoryItemFormData>({
  category_id: '',
  name: '',
  description: null,
  unit: 'unidad',
  quantity: 0,
  min_quantity: 0
})

onMounted(async () => {
  await Promise.all([inventoryStore.loadItems(), inventoryStore.loadCategories()])
})

const filteredItems = computed(() => {
  let items = showLowStock.value ? inventoryStore.lowStockItems : inventoryStore.items
  if (searchQuery.value) {
    items = items.filter((i) =>
      i.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
  }
  return items
})

const columns = [
  { key: 'name', label: 'Producto' },
  { key: 'category', label: 'Categoría' },
  { key: 'stock', label: 'Stock actual' },
  { key: 'min', label: 'Stock mín.' },
  { key: 'unit', label: 'Unidad' },
  { key: 'description', label: 'Descripción' }
]

function openCreate() {
  editingItem.value = null
  form.value = {
    category_id: '',
    name: '',
    description: null,
    unit: 'unidad',
    quantity: 0,
    min_quantity: 0
  }
  showForm.value = true
}

function openEdit(item: InventoryItem) {
  editingItem.value = item
  form.value = {
    category_id: item.category_id,
    name: item.name,
    description: item.description,
    unit: item.unit,
    quantity: item.quantity,
    min_quantity: item.min_quantity
  }
  showForm.value = true
}

async function handleSubmit() {
  formLoading.value = true
  try {
    if (editingItem.value) {
      await inventoryStore.editItem(editingItem.value.id, form.value)
    } else {
      await inventoryStore.addItem(form.value)
    }
    showForm.value = false
  } catch (e) {
    alert('Error: ' + (e as Error).message)
  } finally {
    formLoading.value = false
  }
}

async function handleDelete(id: string) {
  if (!confirm('¿Eliminar este ítem?')) return
  await inventoryStore.removeItem(id)
}


</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold text-gray-900">Inventario</h1>
        <p class="text-sm text-gray-500">{{ inventoryStore.items.length }} ítems registrados</p>
      </div>
      <div class="flex gap-2">
        <BaseButton variant="secondary" @click="router.push('/inventory/movement')">
          Registrar movimiento
        </BaseButton>
        <BaseButton @click="openCreate">
          <Plus class="w-4 h-4" /> Nuevo ítem
        </BaseButton>
      </div>
    </div>

    <!-- Low stock alert banner -->
    <div
      v-if="inventoryStore.lowStockItems.length"
      class="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3"
    >
      <AlertTriangle class="w-5 h-5 text-yellow-600 shrink-0" />
      <p class="text-sm text-yellow-800 font-medium">
        {{ inventoryStore.lowStockItems.length }} ítems con stock bajo o agotado
      </p>
      <button
        class="ml-auto text-xs text-yellow-700 underline"
        @click="showLowStock = !showLowStock"
      >
        {{ showLowStock ? 'Ver todos' : 'Ver solo alertas' }}
      </button>
    </div>

    <!-- Filters -->
    <div class="card">
      <div class="relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Buscar producto..."
          class="form-input pl-9"
        />
      </div>
    </div>

    <!-- Table -->
    <BaseTable
      :columns="columns"
      :rows="filteredItems"
      :loading="inventoryStore.loading"
      empty-message="No hay ítems de inventario."
      @row-click="() => {}"
    >
      <template #name="{ row }">
        <div class="flex items-center gap-2">
          <Package class="w-4 h-4 text-gray-400" />
          <span class="font-medium text-gray-800">{{ (row as InventoryItem).name }}</span>
        </div>
      </template>

      <template #category="{ row }">
        {{ (row as InventoryItem).category?.name ?? '—' }}
      </template>

      <template #stock="{ row }">
        <span
          class="font-semibold"
          :class="
            (row as InventoryItem).quantity <= (row as InventoryItem).min_quantity
              ? 'text-red-600'
              : 'text-gray-800'
          "
        >
          {{ (row as InventoryItem).quantity }}
        </span>
        <BaseBadge
          v-if="(row as InventoryItem).quantity <= (row as InventoryItem).min_quantity"
          variant="red"
          class="ml-2"
        >
          Bajo
        </BaseBadge>
      </template>

      <template #min="{ row }">{{ (row as InventoryItem).min_quantity }}</template>
      <template #description="{ row }">{{ (row as InventoryItem).description ?? '—' }}</template>

      <template #actions="{ row }">
        <div class="flex gap-2 justify-end">
          <button
            class="p-1 text-gray-400 hover:text-primary-600"
            @click.stop="openEdit(row as InventoryItem)"
          >
            <Pencil class="w-4 h-4" />
          </button>
          <button
            class="p-1 text-gray-400 hover:text-red-500"
            @click.stop="handleDelete((row as InventoryItem).id)"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
      </template>
    </BaseTable>

    <!-- Item form modal -->
    <BaseModal
      :open="showForm"
      :title="editingItem ? 'Editar ítem' : 'Nuevo ítem de inventario'"
      @close="showForm = false"
    >
      <form class="space-y-4" @submit.prevent="handleSubmit">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
          <select v-model="form.category_id" class="form-select" required>
            <option value="">Seleccionar categoría...</option>
            <option
              v-for="cat in inventoryStore.categories"
              :key="cat.id"
              :value="cat.id"
            >
              {{ cat.name }}
            </option>
          </select>
        </div>

        <BaseInput v-model="form.name" label="Nombre del producto" required />

        <div class="grid grid-cols-2 gap-4">
          <BaseInput v-model="form.unit" label="Unidad" placeholder="ej. kg, L, unidad" required />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <BaseInput v-model="form.quantity" label="Stock actual" type="number" required />
          <BaseInput v-model="form.min_quantity" label="Stock mínimo" type="number" required />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
          <textarea v-model="form.description" rows="2" class="form-input" />
        </div>
      </form>

      <template #footer>
        <BaseButton variant="secondary" @click="showForm = false">Cancelar</BaseButton>
        <BaseButton :loading="formLoading" @click="handleSubmit">
          {{ editingItem ? 'Guardar' : 'Crear' }}
        </BaseButton>
      </template>
    </BaseModal>
  </div>
</template>
