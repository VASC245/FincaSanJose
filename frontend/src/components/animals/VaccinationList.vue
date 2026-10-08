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
  // Fecha de calendario: a mediodía local para que no salga un día antes (UTC-5)
  return new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="card-title">
        <Syringe class="w-4 h-4 text-primary-500" />
        Historial de vacunas
      </h3>
      <BaseButton size="sm" @click="showForm = true">
        <Plus class="w-4 h-4" /> Agregar
      </BaseButton>
    </div>

    <div v-if="loading" class="text-center py-6 text-sm text-gray-500">Cargando...</div>

    <div v-else-if="!records.length" class="text-center py-6 text-sm text-gray-500">
      No hay registros de vacunas.
    </div>

    <div v-else class="divide-y divide-gray-200 rounded-lg border border-gray-200 overflow-hidden">
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
          <p v-if="r.next_date" class="text-xs text-gray-500">
            Próxima: {{ formatDate(r.next_date) }}
          </p>
          <p v-if="r.milk_withdrawal_until" class="text-xs font-medium text-red-600">
            🚫🥛 Retiro de leche hasta: {{ formatDate(r.milk_withdrawal_until) }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <BaseBadge v-if="r.applied_by" variant="blue">{{ r.applied_by }}</BaseBadge>
          <button
            class="p-1 text-gray-500 hover:text-red-500 transition-colors"
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
