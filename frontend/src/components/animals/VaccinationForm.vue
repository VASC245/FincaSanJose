<script setup lang="ts">
import { reactive, ref, onMounted, computed } from 'vue'
import { localToday } from '@/lib/dates'
import BaseModal from '@/components/shared/BaseModal.vue'
import BaseInput from '@/components/shared/BaseInput.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import { createVaccinationRecord } from '@/services/vaccinationService'
import { fetchItems, createMovement } from '@/services/inventoryService'
import type { VaccinationRecord, Species, InventoryItem } from '@/types'

const props = defineProps<{
  open: boolean
  animalId: string
  species: Species
}>()

const emit = defineEmits<{
  close: []
  added: [record: VaccinationRecord]
}>()

const items = ref<InventoryItem[]>([])
const loading = ref(false)
const search = ref('')

const filteredItems = computed(() => {
  if (!search.value.trim()) return items.value
  const q = search.value.toLowerCase()
  return items.value.filter((i) => i.name.toLowerCase().includes(q))
})

const form = reactive({
  inventory_item_id: '',
  applied_date: localToday(),
  next_date: '',
  applied_by: '',
  notes: '',
  quantity_used: 1
})

onMounted(async () => {
  items.value = await fetchItems()
})

async function handleSubmit() {
  if (!form.inventory_item_id || !form.applied_date) return
  loading.value = true
  try {
    const record = await createVaccinationRecord({
      animal_id: props.animalId,
      vaccine_id: null,
      inventory_item_id: form.inventory_item_id,
      applied_date: form.applied_date,
      next_date: form.next_date || null,
      applied_by: form.applied_by || null,
      notes: form.notes || null
    })
    await createMovement({
      item_id: form.inventory_item_id,
      type: 'out',
      quantity: form.quantity_used,
      date: form.applied_date,
      notes: `Vacunación aplicada`
    })
    emit('added', record)
    // Reset
    form.inventory_item_id = ''
    form.applied_date = localToday()
    form.next_date = ''
    form.applied_by = ''
    form.notes = ''
    form.quantity_used = 1
    search.value = ''
  } catch (e) {
    alert('Error al guardar: ' + (e as Error).message)
  } finally {
    loading.value = false
  }
}

const selectedItem = computed(() =>
  items.value.find((i) => i.id === form.inventory_item_id) ?? null
)
</script>

<template>
  <BaseModal :open="open" title="Registrar vacunación" @close="emit('close')">
    <form class="space-y-4" @submit.prevent="handleSubmit">

      <!-- Selector de producto del inventario -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Producto / Vacuna *</label>

        <!-- Búsqueda -->
        <input
          v-model="search"
          type="text"
          class="form-input mb-1.5"
          placeholder="Buscar en inventario..."
        />

        <select v-model="form.inventory_item_id" required class="form-select">
          <option value="">Seleccionar producto...</option>
          <option
            v-for="item in filteredItems"
            :key="item.id"
            :value="item.id"
          >
            {{ item.name }}
            <template v-if="item.category?.name"> · {{ item.category.name }}</template>
            ({{ item.quantity }} {{ item.unit }} disponibles)
          </option>
        </select>

        <!-- Stock seleccionado -->
        <p
          v-if="selectedItem"
          class="mt-1 text-xs"
          :class="selectedItem.quantity <= selectedItem.min_quantity ? 'text-red-500' : 'text-gray-400'"
        >
          Stock actual: {{ selectedItem.quantity }} {{ selectedItem.unit }}
          <span v-if="selectedItem.quantity <= selectedItem.min_quantity"> — Stock bajo</span>
        </p>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <BaseInput
          v-model="form.applied_date"
          label="Fecha aplicación"
          type="date"
          required
        />
        <BaseInput
          v-model="form.next_date"
          label="Próxima aplicación"
          type="date"
        />
      </div>

      <BaseInput
        v-model.number="form.quantity_used"
        label="Cantidad usada"
        type="number"
        :min="0.01"
        step="0.01"
        required
      />

      <BaseInput
        v-model="form.applied_by"
        label="Aplicado por"
        placeholder="ej. Veterinario"
      />

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Notas</label>
        <textarea
          v-model="form.notes"
          rows="2"
          class="form-input"
          placeholder="Observaciones..."
        />
      </div>
    </form>

    <template #footer>
      <BaseButton variant="secondary" @click="emit('close')">Cancelar</BaseButton>
      <BaseButton :loading="loading" @click="handleSubmit">Guardar</BaseButton>
    </template>
  </BaseModal>
</template>
