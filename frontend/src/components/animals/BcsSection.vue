<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Activity, Plus } from 'lucide-vue-next'
import BaseButton from '@/components/shared/BaseButton.vue'
import BaseInput from '@/components/shared/BaseInput.vue'
import { localToday, formatDate } from '@/lib/dates'
import {
  fetchBcsRecords,
  createBcsRecord,
  deleteBcsRecord,
  bcsLevel,
  BCS_MOMENT_LABELS,
  type BcsRecord,
  type BcsMoment
} from '@/services/bcsService'

const props = defineProps<{ animalId: string }>()

const records = ref<BcsRecord[]>([])
const loading = ref(false)
const showForm = ref(false)
const form = reactive({
  recorded_date: localToday(),
  score: '3' as string,
  moment: 'otro' as BcsMoment,
  notes: '',
  saving: false
})

const latest = computed(() => records.value[0] ?? null)

const scoreOptions = ['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5']

onMounted(async () => {
  loading.value = true
  try {
    records.value = await fetchBcsRecords(props.animalId)
  } catch { /* tabla vacía o sin conexión: no se muestra nada */ }
  finally { loading.value = false }
})

async function submit() {
  form.saving = true
  try {
    const record = await createBcsRecord({
      animal_id: props.animalId,
      recorded_date: form.recorded_date,
      score: Number(form.score),
      moment: form.moment,
      notes: form.notes || null
    })
    records.value = [record, ...records.value].sort(
      (a, b) => b.recorded_date.localeCompare(a.recorded_date)
    )
    showForm.value = false
    form.recorded_date = localToday()
    form.notes = ''
  } catch (e) { alert('Error: ' + (e as Error).message) }
  finally { form.saving = false }
}

async function remove(id: string) {
  if (!confirm('¿Eliminar este registro de condición corporal?')) return
  await deleteBcsRecord(id)
  records.value = records.value.filter(r => r.id !== id)
}

function chip(score: number) {
  return {
    good: 'bg-green-100 text-green-700',
    warn: 'bg-amber-100 text-amber-700',
    bad: 'bg-red-100 text-red-700'
  }[bcsLevel(Number(score))]
}
</script>

<template>
  <div class="card space-y-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2 flex-wrap">
        <h3 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Activity class="w-4 h-4 text-teal-500" /> Condición corporal (BCS)
        </h3>
        <span
          v-if="latest"
          class="text-xs font-semibold rounded-full px-2 py-0.5"
          :class="chip(latest.score)"
        >
          {{ Number(latest.score) }} / 5
        </span>
      </div>
      <BaseButton size="sm" @click="showForm = !showForm">
        <Plus class="w-4 h-4" /> Calificar
      </BaseButton>
    </div>

    <div v-if="showForm" class="rounded-xl border border-teal-100 bg-teal-50 p-4 space-y-3">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <BaseInput v-model="form.recorded_date" label="Fecha" type="date" required />
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Puntaje (1 flaca — 5 gorda)</label>
          <select v-model="form.score" class="form-select">
            <option v-for="s in scoreOptions" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Momento</label>
          <select v-model="form.moment" class="form-select">
            <option v-for="(label, key) in BCS_MOMENT_LABELS" :key="key" :value="key">{{ label }}</option>
          </select>
        </div>
      </div>
      <BaseInput v-model="form.notes" label="Notas (opcional)" placeholder="ej. muy flaca tras el destete" />
      <p class="text-xs text-teal-700">
        Ideal: 3 a 3.5 en parto y secado. Por debajo de 2.5 hay que mejorar la alimentación; por encima de 4, cuidado con problemas al parto.
      </p>
      <div class="flex justify-end gap-2">
        <BaseButton variant="secondary" size="sm" @click="showForm = false">Cancelar</BaseButton>
        <BaseButton size="sm" :loading="form.saving" @click="submit">Guardar</BaseButton>
      </div>
    </div>

    <div v-if="loading" class="text-center py-3 text-sm text-gray-400">Cargando...</div>
    <p v-else-if="!records.length" class="text-center py-2 text-sm text-gray-400">
      Sin calificaciones. Califica la condición corporal en secado, parto y destete.
    </p>
    <ul v-else class="divide-y divide-gray-100">
      <li v-for="r in records" :key="r.id" class="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm text-gray-800">
            <span class="font-semibold">{{ Number(r.score) }}</span>
            <span v-if="r.moment" class="text-gray-500"> · {{ BCS_MOMENT_LABELS[r.moment] }}</span>
          </p>
          <p class="text-xs text-gray-400">
            {{ formatDate(r.recorded_date) }}<template v-if="r.notes"> · {{ r.notes }}</template>
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-[11px] font-medium rounded-full px-2 py-0.5" :class="chip(r.score)">
            {{ bcsLevel(Number(r.score)) === 'good' ? 'Bien' : bcsLevel(Number(r.score)) === 'warn' ? 'Vigilar' : 'Actuar' }}
          </span>
          <button class="p-1 text-gray-300 hover:text-red-500 rounded transition-colors" @click="remove(r.id)">✕</button>
        </div>
      </li>
    </ul>
  </div>
</template>
