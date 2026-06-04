<script setup lang="ts">
import { reactive, watch, computed } from 'vue'
import BaseInput from '@/components/shared/BaseInput.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import type { Animal, CattleDetail, PigDetail, Species } from '@/types'

const props = withDefaults(
  defineProps<{
    species: Species
    animal?: Animal | null
    loading?: boolean
  }>(),
  { loading: false, animal: null }
)

const emit = defineEmits<{
  submit: [animalData: Partial<Animal>, detailData: Partial<CattleDetail> | Partial<PigDetail>]
  cancel: []
}>()

const form = reactive({
  ear_tag: '',
  name: '',
  sex: 'female' as 'male' | 'female',
  birth_date: '',
  status: 'active' as Animal['status'],
  notes: ''
})

const cattleDetail = reactive({
  is_pregnant: false,
  conception_date: '',
  expected_birth: ''
})

const pigDetail = reactive({
  is_pregnant: false,
  service_date: '',
  expected_birth: ''
})

watch(
  () => props.animal,
  (a) => {
    if (!a) return
    form.ear_tag = a.ear_tag ?? ''
    form.name = a.name ?? ''
    form.sex = a.sex
    form.birth_date = a.birth_date ?? ''
    form.status = a.status
    form.notes = a.notes ?? ''

    if (a.cattle_detail) {
      cattleDetail.is_pregnant = a.cattle_detail.is_pregnant
      cattleDetail.conception_date = a.cattle_detail.conception_date ?? ''
      cattleDetail.expected_birth = a.cattle_detail.expected_birth ?? ''
    }

    if (a.pig_detail) {
      pigDetail.is_pregnant = a.pig_detail.is_pregnant
      pigDetail.service_date = a.pig_detail.service_date ?? ''
      pigDetail.expected_birth = a.pig_detail.expected_birth ?? ''
    }
  },
  { immediate: true }
)

const isFemale = computed(() => form.sex === 'female')

function handleSubmit() {
  const animalData: Partial<Animal> = {
    ear_tag: form.ear_tag || null,
    name: form.name || null,
    sex: form.sex,
    species: props.species,
    birth_date: form.birth_date || null,
    status: form.status,
    notes: form.notes || null
  }

  if (props.species === 'cattle') {
    const detail: Partial<CattleDetail> = {
      is_pregnant: isFemale.value ? cattleDetail.is_pregnant : false,
      conception_date: (isFemale.value && cattleDetail.is_pregnant)
        ? cattleDetail.conception_date || null : null,
      expected_birth: (isFemale.value && cattleDetail.is_pregnant)
        ? cattleDetail.expected_birth || null : null
    }
    emit('submit', animalData, detail)
  } else {
    const detail: Partial<PigDetail> = {
      is_pregnant: isFemale.value ? pigDetail.is_pregnant : false,
      service_date: (isFemale.value && pigDetail.is_pregnant)
        ? pigDetail.service_date || null : null,
      expected_birth: (isFemale.value && pigDetail.is_pregnant)
        ? pigDetail.expected_birth || null : null
    }
    emit('submit', animalData, detail)
  }
}
</script>

<template>
  <form class="space-y-6" @submit.prevent="handleSubmit">
    <fieldset class="space-y-4">
      <legend class="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2 w-full">
        Información básica
      </legend>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <BaseInput v-model="form.ear_tag" label="Número de Arete" placeholder="ej. BOV-001" required />
        <BaseInput v-model="form.name" label="Nombre (opcional)" placeholder="ej. Lola" />
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Sexo *</label>
          <select v-model="form.sex" class="form-select">
            <option value="female">Hembra</option>
            <option value="male">Macho</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Estado *</label>
          <select v-model="form.status" class="form-select">
            <option value="active">Activo</option>
            <option value="sold">Vendido</option>
            <option value="deceased">Fallecido</option>
            <option value="culled">Descartado</option>
          </select>
        </div>
      </div>

      <BaseInput v-model="form.birth_date" label="Fecha de nacimiento" type="date" />
    </fieldset>

    <!-- Bovino detail -->
    <fieldset v-if="species === 'cattle'" class="space-y-4">
      <legend class="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2 w-full">
        Detalles bovino
      </legend>
      <div v-if="isFemale" class="space-y-3">
        <label class="flex items-center gap-2 cursor-pointer">
          <input v-model="cattleDetail.is_pregnant" type="checkbox"
            class="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
          <span class="text-sm font-medium text-gray-700">Preñada</span>
        </label>
        <template v-if="cattleDetail.is_pregnant">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <BaseInput v-model="cattleDetail.conception_date" label="Fecha de concepción" type="date" />
            <BaseInput v-model="cattleDetail.expected_birth" label="Parto esperado" type="date" />
          </div>
        </template>
      </div>
      <p v-else class="text-sm text-gray-500">Sin detalles reproductivos para machos.</p>
    </fieldset>

    <!-- Porcino detail -->
    <fieldset v-if="species === 'pig'" class="space-y-4">
      <legend class="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2 w-full">
        Detalles porcino
      </legend>
      <div v-if="isFemale" class="space-y-3">
        <label class="flex items-center gap-2 cursor-pointer">
          <input v-model="pigDetail.is_pregnant" type="checkbox"
            class="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
          <span class="text-sm font-medium text-gray-700">Preñada</span>
        </label>
        <template v-if="pigDetail.is_pregnant">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <BaseInput v-model="pigDetail.service_date" label="Fecha de servicio/monta" type="date" />
            <BaseInput v-model="pigDetail.expected_birth" label="Parto esperado" type="date" />
          </div>
        </template>
      </div>
      <p v-else class="text-sm text-gray-500">Sin detalles reproductivos para machos.</p>
    </fieldset>

    <div>
      <label class="block text-sm font-medium text-gray-700 mb-1">Notas</label>
      <textarea v-model="form.notes" rows="3" placeholder="Observaciones adicionales..."
        class="block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm" />
    </div>

    <div class="flex items-center justify-end gap-3 pt-2">
      <BaseButton variant="secondary" type="button" @click="emit('cancel')">Cancelar</BaseButton>
      <BaseButton type="submit" :loading="loading">
        {{ animal ? 'Guardar cambios' : 'Crear animal' }}
      </BaseButton>
    </div>
  </form>
</template>
