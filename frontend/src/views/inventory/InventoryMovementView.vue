<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, ArrowDown, ArrowUp } from 'lucide-vue-next'
import BaseInput from '@/components/shared/BaseInput.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import BaseTable from '@/components/shared/BaseTable.vue'
import BaseBadge from '@/components/shared/BaseBadge.vue'
import { useInventoryStore } from '@/stores/inventory'
import type { MovementType, InventoryMovement } from '@/types'

const router = useRouter()
const inventoryStore = useInventoryStore()

const loading = ref(false)

const form = reactive({
  item_id: '',
  type: 'in' as MovementType,
  quantity: 0,
  notes: '',
  date: new Date().toISOString().slice(0, 10)
})

onMounted(async () => {
  await Promise.all([
    inventoryStore.loadItems(),
    inventoryStore.loadMovements()
  ])
})

async function handleSubmit() {
  if (!form.item_id || !form.quantity) return
  loading.value = true
  try {
    await inventoryStore.addMovement({
      item_id: form.item_id,
      type: form.type,
      quantity: Number(form.quantity),
      notes: form.notes || null,
      date: form.date
    })
    // Reset
    form.item_id = ''
    form.quantity = 0
    form.notes = ''
  } catch (e) {
    alert('Error: ' + (e as Error).message)
  } finally {
    loading.value = false
  }
}

const movementColumns = [
  { key: 'date', label: 'Fecha' },
  { key: 'item', label: 'Producto' },
  { key: 'type', label: 'Tipo' },
  { key: 'quantity', label: 'Cantidad' },
  { key: 'notes', label: 'Notas' }
]

const typeConfig: Record<MovementType, { label: string; variant: 'green' | 'red'; icon: typeof ArrowDown }> = {
  in: { label: 'Entrada', variant: 'green', icon: ArrowDown },
  out: { label: 'Salida', variant: 'red', icon: ArrowUp }
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('es', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  })
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-3">
      <button class="p-2 rounded-lg hover:bg-gray-100 text-gray-600" @click="router.back()">
        <ArrowLeft class="w-5 h-5" />
      </button>
      <h1 class="text-xl font-bold text-gray-900">Movimiento de Inventario</h1>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Form -->
      <div class="card lg:col-span-1">
        <h2 class="text-sm font-semibold text-gray-700 mb-4">Registrar movimiento</h2>
        <form class="space-y-4" @submit.prevent="handleSubmit">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="(config, type) in typeConfig"
                :key="type"
                type="button"
                class="flex flex-col items-center gap-1 py-2 px-1 rounded-lg border text-xs font-medium transition-colors"
                :class="
                  form.type === type
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                "
                @click="form.type = type as MovementType"
              >
                <component :is="config.icon" class="w-4 h-4" />
                {{ config.label }}
              </button>
              <!-- Spacer to fill 3rd grid slot -->
              <div />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Producto *</label>
            <select v-model="form.item_id" required class="form-select">
              <option value="">Seleccionar...</option>
              <option
                v-for="item in inventoryStore.items"
                :key="item.id"
                :value="item.id"
              >
                {{ item.name }} ({{ item.quantity }} {{ item.unit }})
              </option>
            </select>
          </div>

          <BaseInput
            v-model="form.quantity"
            label="Cantidad"
            type="number"
            required
            placeholder="ej. 10"
          />
          <BaseInput v-model="form.date" label="Fecha" type="date" />
          <BaseInput v-model="form.notes" label="Notas" placeholder="ej. Compra a proveedor" />

          <BaseButton type="submit" :loading="loading" class="w-full justify-center">
            Registrar movimiento
          </BaseButton>
        </form>
      </div>

      <!-- Recent movements -->
      <div class="lg:col-span-2 space-y-3">
        <h2 class="text-sm font-semibold text-gray-700">Movimientos recientes</h2>
        <BaseTable
          :columns="movementColumns"
          :rows="inventoryStore.movements"
          :loading="inventoryStore.loading"
          empty-message="No hay movimientos registrados."
          @row-click="() => {}"
        >
          <template #date="{ row }">
            {{ formatDateTime((row as InventoryMovement).date) }}
          </template>

          <template #item="{ row }">
            {{ (row as InventoryMovement).item?.name ?? '—' }}
          </template>

          <template #type="{ row }">
            <BaseBadge :variant="typeConfig[(row as InventoryMovement).type]?.variant ?? 'gray'">
              {{ typeConfig[(row as InventoryMovement).type]?.label ?? (row as InventoryMovement).type }}
            </BaseBadge>
          </template>

          <template #quantity="{ row }">
            <span
              class="font-medium"
              :class="{
                'text-green-600': (row as InventoryMovement).type === 'in',
                'text-red-600': (row as InventoryMovement).type === 'out'
              }"
            >
              {{ (row as InventoryMovement).type === 'out' ? '-' : '+' }}
              {{ (row as InventoryMovement).quantity }}
              {{ (row as InventoryMovement).item?.unit }}
            </span>
          </template>

          <template #notes="{ row }">
            {{ (row as InventoryMovement).notes ?? '—' }}
          </template>
        </BaseTable>
      </div>
    </div>
  </div>
</template>
