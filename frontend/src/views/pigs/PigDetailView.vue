<script setup lang="ts">
import { ref, onMounted, computed, reactive, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ArrowLeft, Pencil, Trash2, Plus, Heart, Baby } from 'lucide-vue-next'
import BaseBadge from '@/components/shared/BaseBadge.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import BaseInput from '@/components/shared/BaseInput.vue'
import PregnancyBadge from '@/components/cattle/PregnancyBadge.vue'
import VaccinationList from '@/components/animals/VaccinationList.vue'
import LitterList from '@/components/pigs/LitterList.vue'
import { useAnimalsStore } from '@/stores/animals'
import { upsertPigDetail } from '@/services/animalService'
import { supabase } from '@/lib/supabase'
import { localToday, addDaysToDate } from '@/lib/dates'
import {
  fetchHeatRecords, createHeatRecord, deleteHeatRecord,
  calcNextHeat, calcExpectedBirth, daysUntil,
  calcPigStage, pigAgeLabel, stageConfig
} from '@/services/pigService'
import {
  fetchInseminationRecords,
  createInseminationRecord,
  updateInseminationConfirmation,
  deleteInseminationRecord,
  type InseminationRecord
} from '@/services/inseminationService'
import type { Animal, HeatRecord } from '@/types'

const route = useRoute()
const router = useRouter()
const animalsStore = useAnimalsStore()

const animal = ref<Animal | null>(null)
const loading = ref(true)

async function handleDelete() {
  if (!animal.value) return
  if (!confirm(`¿Eliminar al animal ${animal.value.ear_tag}?`)) return
  await animalsStore.removeAnimal(animal.value.id)
  router.push('/pigs')
}

const detail = computed(() => animal.value?.pig_detail)
const isFemale = computed(() => animal.value?.sex === 'female')

function formatDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(`${d}T12:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
}

const statusVariant: Record<string, 'green' | 'red' | 'gray' | 'blue'> = {
  active: 'green', sold: 'blue', deceased: 'red', culled: 'gray'
}
const statusLabel: Record<string, string> = {
  active: 'Activo', sold: 'Vendido', deceased: 'Fallecido', culled: 'Descartado'
}

// ─── Gestación ────────────────────────────────────────────────────────────────

const showPregnancyForm = ref(false)
const pregnancyForm = reactive({
  service_date: localToday(),
  expected_birth: '',
  semen_source: '',
  saving: false
})

watch(
  () => pregnancyForm.service_date,
  (val) => { if (val) pregnancyForm.expected_birth = calcExpectedBirth(val) },
  { immediate: true }
)

const inseminationHistory = ref<InseminationRecord[]>([])
const inseminHistLoading = ref(false)

async function savePregnancy() {
  if (!animal.value || !pregnancyForm.service_date) return
  pregnancyForm.saving = true
  try {
    const expectedBirth = pregnancyForm.expected_birth || calcExpectedBirth(pregnancyForm.service_date)
    const record = await createInseminationRecord({
      animal_id: animal.value.id,
      insemination_date: pregnancyForm.service_date,
      semen_source: pregnancyForm.semen_source || null,
      expected_birth: expectedBirth,
      heat_check_date: addDaysToDate(pregnancyForm.service_date, 21)
    })
    inseminationHistory.value.unshift(record)

    const heatCheckDate = addDaysToDate(pregnancyForm.service_date, 21)
    await supabase.from('tasks').insert({
      title: `Revisar retorno de celo — ${animal.value.ear_tag ?? animal.value.name}`,
      description: `Verificar si la cerda ${animal.value.ear_tag ?? animal.value.name} regresó al celo a los 21 días de inseminación. Si hay retorno, NO quedó preñada.`,
      status: 'pending',
      priority: 'high',
      category: 'reproduction',
      due_date: heatCheckDate,
      animal_id: animal.value.id
    })

    showPregnancyForm.value = false
    pregnancyForm.semen_source = ''
  } catch (e) { alert('Error: ' + (e as Error).message) }
  finally { pregnancyForm.saving = false }
}

async function confirmPregnancyFromRecord(record: InseminationRecord) {
  if (!animal.value) return
  try {
    const expectedBirth = record.expected_birth || calcExpectedBirth(record.insemination_date)
    const updated = await upsertPigDetail(animal.value.id, {
      is_pregnant: true,
      service_date: record.insemination_date,
      expected_birth: expectedBirth,
      litter_count: detail.value?.litter_count ?? 0
    })
    animal.value = { ...animal.value, pig_detail: updated }

    const updatedRecord = await updateInseminationConfirmation(record.id, true, localToday())
    const idx = inseminationHistory.value.findIndex(r => r.id === record.id)
    if (idx !== -1) inseminationHistory.value[idx] = updatedRecord
  } catch (e) { alert('Error: ' + (e as Error).message) }
}

async function markNoPregnancyFromRecord(record: InseminationRecord) {
  if (!confirm('¿Marcar esta inseminación como fallida (no quedó preñada)?')) return
  try {
    const updatedRecord = await updateInseminationConfirmation(record.id, false)
    const idx = inseminationHistory.value.findIndex(r => r.id === record.id)
    if (idx !== -1) inseminationHistory.value[idx] = updatedRecord
  } catch (e) { alert('Error: ' + (e as Error).message) }
}

async function removeInseminationRecord(record: InseminationRecord) {
  if (!confirm('¿Eliminar este registro de inseminación?')) return
  await deleteInseminationRecord(record.id)
  inseminationHistory.value = inseminationHistory.value.filter(r => r.id !== record.id)
}

async function clearPregnancy() {
  if (!animal.value) return
  if (!confirm('¿Registrar parto y cerrar la preñez?')) return
  try {
    const updated = await upsertPigDetail(animal.value.id, {
      is_pregnant: false,
      service_date: null,
      expected_birth: null,
      litter_count: (animal.value.pig_detail?.litter_count ?? 0) + 1
    })
    animal.value = { ...animal.value, pig_detail: updated }
  } catch (e) { alert('Error: ' + (e as Error).message) }
}

// ─── Celo ─────────────────────────────────────────────────────────────────────

const heatRecords = ref<HeatRecord[]>([])
const heatLoading = ref(false)
const showHeatForm = ref(false)
const heatForm = reactive({
  observed_date: localToday(),
  notes: '',
  saving: false
})

onMounted(async () => {
  animal.value = (await animalsStore.getAnimal(route.params.id as string)) ?? null
  loading.value = false
  if (animal.value?.species === 'pig' && animal.value.sex === 'female') {
    heatLoading.value = true
    inseminHistLoading.value = true
    try {
      ;[heatRecords.value, inseminationHistory.value] = await Promise.all([
        fetchHeatRecords(animal.value.id),
        fetchInseminationRecords(animal.value.id)
      ])
    } finally {
      heatLoading.value = false
      inseminHistLoading.value = false
    }
  }
})

async function submitHeat() {
  if (!animal.value || !heatForm.observed_date) return
  heatForm.saving = true
  try {
    const record = await createHeatRecord({
      animal_id: animal.value.id,
      observed_date: heatForm.observed_date,
      notes: heatForm.notes || null
    })
    heatRecords.value.unshift(record)
    showHeatForm.value = false
    heatForm.observed_date = localToday()
    heatForm.notes = ''
  } catch (e) { alert('Error: ' + (e as Error).message) }
  finally { heatForm.saving = false }
}

async function removeHeat(id: string) {
  if (!confirm('¿Eliminar este registro?')) return
  await deleteHeatRecord(id)
  heatRecords.value = heatRecords.value.filter(r => r.id !== id)
}

function daysLabel(days: number): string {
  if (days === 0) return 'hoy'
  if (days < 0) return `hace ${Math.abs(days)} días`
  return `en ${days} días`
}
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <button class="p-2 rounded-lg hover:bg-gray-100 text-gray-600" @click="router.back()">
          <ArrowLeft class="w-5 h-5" />
        </button>
        <div>
          <h1 class="text-xl font-bold text-gray-900">
            {{ animal?.ear_tag ?? '...' }}
            <span v-if="animal?.name" class="text-gray-500 font-normal text-base ml-1">
              · {{ animal.name }}
            </span>
          </h1>
          <p class="text-sm text-gray-500">Porcino</p>
        </div>
      </div>
      <div class="flex gap-2" v-if="animal">
        <BaseButton
          variant="secondary"
          size="sm"
          @click="router.push(`/pigs/${animal.id}/edit`)"
        >
          <Pencil class="w-4 h-4" /> Editar
        </BaseButton>
        <BaseButton
          v-if="isFemale"
          variant="secondary"
          size="sm"
          @click="router.push(`/pigs/${animal.id}/litter/new`)"
        >
          <Plus class="w-4 h-4" /> Camada
        </BaseButton>
        <BaseButton variant="danger" size="sm" @click="handleDelete">
          <Trash2 class="w-4 h-4" />
        </BaseButton>
      </div>
    </div>

    <div v-if="loading" class="card text-center py-12 text-gray-400">Cargando...</div>

    <template v-else-if="animal">
      <div class="card">
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p class="text-xs text-gray-500 uppercase tracking-wide">Estado</p>
            <BaseBadge :variant="statusVariant[animal.status]" class="mt-1">
              {{ statusLabel[animal.status] }}
            </BaseBadge>
          </div>
          <div>
            <p class="text-xs text-gray-500 uppercase tracking-wide">Sexo</p>
            <BaseBadge :variant="animal.sex === 'female' ? 'pink' : 'blue'" class="mt-1">
              {{ animal.sex === 'female' ? 'Hembra' : 'Macho' }}
            </BaseBadge>
          </div>
          <div v-if="isFemale">
            <p class="text-xs text-gray-500 uppercase tracking-wide">Preñez</p>
            <PregnancyBadge
              :is-pregnant="!!detail?.is_pregnant"
              :expected-date="detail?.expected_birth"
              class="mt-1"
            />
          </div>
          <div>
            <p class="text-xs text-gray-500 uppercase tracking-wide">Nacimiento</p>
            <p class="text-sm text-gray-800 font-medium mt-0.5">{{ formatDate(animal.birth_date) }}</p>
          </div>
          <div>
            <p class="text-xs text-gray-500 uppercase tracking-wide">Etapa</p>
            <div class="mt-1 flex items-center gap-2 flex-wrap">
              <span
                v-if="calcPigStage(animal.birth_date)"
                class="text-sm px-2.5 py-0.5 rounded-full font-medium border"
                :class="stageConfig[calcPigStage(animal.birth_date)!].class"
              >
                {{ stageConfig[calcPigStage(animal.birth_date)!].label }}
              </span>
              <span v-else class="text-sm text-gray-400">—</span>
              <span v-if="pigAgeLabel(animal.birth_date)" class="text-xs text-gray-400">
                {{ pigAgeLabel(animal.birth_date) }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="animal.notes" class="mt-4 pt-4 border-t border-gray-100">
          <p class="text-xs text-gray-500 uppercase tracking-wide mb-1">Notas</p>
          <p class="text-sm text-gray-700">{{ animal.notes }}</p>
        </div>
      </div>

      <!-- Gestación e inseminaciones (hembras) -->
      <div v-if="isFemale" class="card space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Baby class="w-4 h-4 text-purple-500" /> Gestación e Inseminaciones
          </h3>
          <BaseButton
            v-if="!detail?.is_pregnant && !showPregnancyForm"
            size="sm"
            @click="showPregnancyForm = true"
          >
            <Plus class="w-4 h-4" /> Registrar servicio
          </BaseButton>
        </div>

        <!-- Estado: preñada -->
        <div v-if="detail?.is_pregnant" class="rounded-xl bg-purple-50 border border-purple-100 p-4 space-y-3">
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <p class="text-xs text-purple-500 font-semibold uppercase tracking-wide">Fecha servicio</p>
              <p class="text-sm font-medium text-purple-900 mt-0.5">{{ formatDate(detail.service_date) }}</p>
            </div>
            <div>
              <p class="text-xs text-purple-500 font-semibold uppercase tracking-wide">Parto esperado</p>
              <p class="text-sm font-medium text-purple-900 mt-0.5">{{ formatDate(detail.expected_birth) }}</p>
            </div>
            <div>
              <p class="text-xs text-purple-500 font-semibold uppercase tracking-wide">Días restantes</p>
              <p class="text-sm font-bold mt-0.5"
                :class="daysUntil(detail.expected_birth ?? '') <= 7 ? 'text-red-600' : 'text-purple-900'">
                {{ detail.expected_birth ? daysLabel(daysUntil(detail.expected_birth)) : '—' }}
              </p>
            </div>
            <div v-if="detail.service_date">
              <p class="text-xs text-purple-500 font-semibold uppercase tracking-wide">Revisión de celo</p>
              <p class="text-sm font-medium text-purple-900 mt-0.5">
                {{ formatDate(addDaysToDate(detail.service_date, 21)) }}
              </p>
              <p class="text-xs"
                :class="daysUntil(addDaysToDate(detail.service_date, 21)) <= 0 ? 'text-red-500 font-semibold' : 'text-purple-500'">
                {{ daysLabel(daysUntil(addDaysToDate(detail.service_date, 21))) }}
              </p>
            </div>
          </div>
          <div class="flex justify-end">
            <BaseButton variant="secondary" size="sm" @click="clearPregnancy">
              Registrar parto
            </BaseButton>
          </div>
        </div>

        <!-- Estado: no preñada -->
        <p v-else-if="!showPregnancyForm && !inseminationHistory.length && !inseminHistLoading"
          class="text-sm text-gray-400 text-center py-2">
          Sin preñez activa registrada.
        </p>

        <!-- Formulario registro servicio -->
        <div v-if="showPregnancyForm" class="rounded-xl border border-purple-100 bg-purple-50 p-4 space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <BaseInput
              v-model="pregnancyForm.service_date"
              label="Fecha de servicio / inseminación"
              type="date"
              required
            />
            <BaseInput
              v-model="pregnancyForm.semen_source"
              label="Nombre del verraco / semental"
              type="text"
              placeholder="Ej: Verraco Grande"
            />
            <BaseInput
              v-model="pregnancyForm.expected_birth"
              label="Parto esperado (114 días, auto)"
              type="date"
            />
          </div>
          <!-- Info calculada -->
          <div v-if="pregnancyForm.service_date" class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div class="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
              <p class="text-xs font-semibold text-amber-700">Revisión de retorno de celo</p>
              <p class="text-sm font-bold text-amber-900">{{ formatDate(addDaysToDate(pregnancyForm.service_date, 21)) }}</p>
              <p class="text-xs text-amber-600">Si regresa al celo → no quedó preñada</p>
            </div>
            <div class="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
              <p class="text-xs font-semibold text-blue-700">Parto esperado</p>
              <p class="text-sm font-bold text-blue-900">{{ formatDate(pregnancyForm.expected_birth) }}</p>
              <p class="text-xs text-blue-600">Gestación porcina: 114 días</p>
            </div>
          </div>
          <p class="text-xs text-gray-500">
            Se creará automáticamente una tarea de alta prioridad para revisar el retorno de celo a los 21 días.
          </p>
          <div class="flex justify-end gap-2">
            <BaseButton variant="secondary" size="sm" @click="showPregnancyForm = false">Cancelar</BaseButton>
            <BaseButton size="sm" :loading="pregnancyForm.saving" @click="savePregnancy">Guardar</BaseButton>
          </div>
        </div>

        <!-- Historial de inseminaciones -->
        <div v-if="inseminHistLoading" class="text-sm text-gray-400 text-center py-2">Cargando historial...</div>
        <div v-else-if="inseminationHistory.length > 0" class="pt-2 border-t border-gray-100 space-y-2">
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Historial de inseminaciones</p>
          <div class="space-y-2">
            <div
              v-for="r in inseminationHistory"
              :key="r.id"
              class="rounded-lg border p-3 space-y-2"
              :class="
                r.pregnancy_confirmed === true
                  ? 'bg-purple-50 border-purple-100'
                  : r.pregnancy_confirmed === false
                    ? 'bg-red-50 border-red-100'
                    : 'bg-white border-gray-100'
              "
            >
              <div class="flex items-start justify-between gap-2">
                <div class="space-y-0.5 flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <p class="text-sm font-semibold text-gray-800">{{ formatDate(r.insemination_date) }}</p>
                    <span
                      v-if="r.pregnancy_confirmed === null"
                      class="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 font-medium"
                    >Pendiente</span>
                    <span
                      v-else-if="r.pregnancy_confirmed"
                      class="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 font-medium"
                    >✓ Preñez confirmada</span>
                    <span
                      v-else
                      class="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100 font-medium"
                    >✕ No quedó preñada</span>
                  </div>
                  <p v-if="r.semen_source" class="text-xs text-gray-500">
                    Verraco: <span class="font-medium text-gray-700">{{ r.semen_source }}</span>
                  </p>
                  <p v-if="r.expected_birth" class="text-xs text-gray-400">
                    Parto estimado: {{ formatDate(r.expected_birth) }}
                  </p>
                  <p v-if="r.pregnancy_confirmed && r.pregnancy_confirmed_date" class="text-xs text-purple-600">
                    Confirmado el {{ formatDate(r.pregnancy_confirmed_date) }}
                  </p>
                </div>
                <button
                  class="p-1 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                  @click="removeInseminationRecord(r)"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>

              <!-- Acciones para registros pendientes -->
              <div v-if="r.pregnancy_confirmed === null" class="flex gap-2 pt-1">
                <button
                  class="flex-1 text-xs font-semibold py-1.5 px-3 rounded-lg border border-purple-200 bg-white text-purple-700 hover:bg-purple-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  :disabled="!!detail?.is_pregnant"
                  :title="detail?.is_pregnant ? 'Ya hay una preñez activa' : ''"
                  @click="confirmPregnancyFromRecord(r)"
                >
                  ✓ Confirmar preñez
                </button>
                <button
                  class="flex-1 text-xs font-semibold py-1.5 px-3 rounded-lg border border-red-100 bg-white text-red-500 hover:bg-red-50 transition-colors"
                  @click="markNoPregnancyFromRecord(r)"
                >
                  ✕ No preñó
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="detail?.litter_count" class="text-xs text-gray-400 text-right">
          Camadas totales: <span class="font-semibold text-gray-600">{{ detail.litter_count }}</span>
        </div>
      </div>

      <!-- Litters (females only) -->
      <div v-if="isFemale" class="card">
        <LitterList :mother-id="animal.id" />
      </div>

      <!-- Celos (hembras) -->
      <div v-if="isFemale" class="card space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Heart class="w-4 h-4 text-rose-500" /> Registros de celo
          </h3>
          <BaseButton size="sm" @click="showHeatForm = !showHeatForm">
            <Plus class="w-4 h-4" /> Registrar celo
          </BaseButton>
        </div>

        <!-- Formulario nuevo celo -->
        <div v-if="showHeatForm" class="border border-rose-100 bg-rose-50 rounded-xl p-4 space-y-3">
          <BaseInput v-model="heatForm.observed_date" label="Fecha del celo" type="date" required />
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea v-model="heatForm.notes" rows="2" class="form-input" placeholder="Observaciones..." />
          </div>
          <div class="flex justify-end gap-2">
            <BaseButton variant="secondary" size="sm" @click="showHeatForm = false">Cancelar</BaseButton>
            <BaseButton size="sm" :loading="heatForm.saving" @click="submitHeat">Guardar</BaseButton>
          </div>
        </div>

        <div v-if="heatLoading" class="text-center py-6 text-sm text-gray-400">Cargando...</div>
        <p v-else-if="!heatRecords.length" class="text-center py-4 text-sm text-gray-400">Sin registros de celo.</p>

        <div v-else class="space-y-3">
          <div v-for="r in heatRecords" :key="r.id"
            class="rounded-xl border border-gray-100 bg-white p-4 space-y-3">
            <div class="flex items-start justify-between">
              <div>
                <p class="text-sm font-semibold text-gray-800">Celo observado: {{ formatDate(r.observed_date) }}</p>
                <p v-if="r.notes" class="text-xs text-gray-500 mt-0.5">{{ r.notes }}</p>
              </div>
              <button class="p-1 text-gray-300 hover:text-red-500 transition-colors" @click="removeHeat(r.id)">
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div class="bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                <p class="text-xs font-semibold text-rose-600">Ventana de inseminación</p>
                <p class="text-sm font-bold text-rose-800 mt-0.5">{{ formatDate(r.observed_date) }}</p>
                <p class="text-xs text-rose-500">Mismo día – día siguiente</p>
              </div>
              <div class="rounded-lg px-3 py-2"
                :class="daysUntil(calcNextHeat(r.observed_date)) < 0 ? 'bg-gray-50 border border-gray-100' : 'bg-amber-50 border border-amber-100'">
                <p class="text-xs font-semibold" :class="daysUntil(calcNextHeat(r.observed_date)) < 0 ? 'text-gray-500' : 'text-amber-600'">
                  Próximo celo estimado
                </p>
                <p class="text-sm font-bold mt-0.5" :class="daysUntil(calcNextHeat(r.observed_date)) < 0 ? 'text-gray-700' : 'text-amber-800'">
                  {{ formatDate(calcNextHeat(r.observed_date)) }}
                </p>
                <p class="text-xs" :class="daysUntil(calcNextHeat(r.observed_date)) < 0 ? 'text-gray-400' : 'text-amber-600'">
                  {{ daysLabel(daysUntil(calcNextHeat(r.observed_date))) }}
                </p>
              </div>
              <div class="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                <p class="text-xs font-semibold text-blue-600">Parto esperado (si inseminó)</p>
                <p class="text-sm font-bold text-blue-800 mt-0.5">{{ formatDate(calcExpectedBirth(r.observed_date)) }}</p>
                <p class="text-xs text-blue-500">{{ daysLabel(daysUntil(calcExpectedBirth(r.observed_date))) }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Vaccination history -->
      <div class="card">
        <VaccinationList :animal-id="animal.id" species="pig" />
      </div>
    </template>

    <div v-else class="card text-center py-12 text-gray-400">Animal no encontrado.</div>
  </div>
</template>
