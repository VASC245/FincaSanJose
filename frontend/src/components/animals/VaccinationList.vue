<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Syringe, Trash2, Plus } from 'lucide-vue-next'
import BaseBadge from '@/components/shared/BaseBadge.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import VaccinationForm from './VaccinationForm.vue'
import { fetchVaccinationRecords, deleteVaccinationRecord } from '@/services/vaccinationService'
import type { VaccinationRecord, Species } from '@/types'

const props = defineProps<{
  animalId: string
  species: Species
}>()

const records = ref<VaccinationRecord[]>([])
const loading = ref(false)
const showForm = ref(false)

async function load() {
  loading.value = true
  try {
    records.value = await fetchVaccinationRecords(props.animalId)
  } finally {
    loading.value = false
  }
}

async function remove(id: string) {
  if (!confirm('¿Eliminar este registro de vacunación?')) return
  await deleteVaccinationRecord(id)
  records.value = records.value.filter((r) => r.id !== id)
}

function onAdded(record: VaccinationRecord) {
  records.value.unshift(record)
  showForm.value = false
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
        <Syringe class="w-4 h-4 text-primary-500" />
        Historial de vacunas
      </h3>
      <BaseButton size="sm" @click="showForm = true">
        <Plus class="w-4 h-4" /> Agregar
      </BaseButton>
    </div>

    <div v-if="loading" class="text-center py-6 text-sm text-gray-400">Cargando...</div>

    <div v-else-if="!records.length" class="text-center py-6 text-sm text-gray-400">
      No hay registros de vacunas.
    </div>

    <div v-else class="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
      <div
        v-for="r in records"
        :key="r.id"
        class="flex items-start justify-between px-4 py-3 bg-white hover:bg-gray-50"
      >
        <div class="space-y-0.5">
          <p class="text-sm font-medium text-gray-800">
            {{ r.inventory_item?.name ?? r.vaccine?.name ?? 'Vacuna' }}
          </p>
          <p class="text-xs text-gray-500">Aplicado: {{ formatDate(r.applied_date) }}</p>
          <p v-if="r.next_date" class="text-xs text-gray-400">
            Próxima: {{ formatDate(r.next_date) }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <BaseBadge v-if="r.applied_by" variant="blue">{{ r.applied_by }}</BaseBadge>
          <button
            class="p-1 text-gray-400 hover:text-red-500 transition-colors"
            @click="remove(r.id)"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    <VaccinationForm
      :open="showForm"
      :animal-id="animalId"
      :species="species"
      @close="showForm = false"
      @added="onAdded"
    />
  </div>
</template>
