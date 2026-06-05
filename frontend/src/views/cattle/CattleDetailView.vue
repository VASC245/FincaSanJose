<script setup lang="ts">
import { ref, onMounted, computed, reactive, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ArrowLeft, Pencil, Trash2, Milk, Plus, Syringe, Baby } from 'lucide-vue-next'
import BaseBadge from '@/components/shared/BaseBadge.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import BaseInput from '@/components/shared/BaseInput.vue'
import PregnancyBadge from '@/components/cattle/PregnancyBadge.vue'
import VaccinationList from '@/components/animals/VaccinationList.vue'
import { useAnimalsStore } from '@/stores/animals'
import { upsertCattleDetail } from '@/services/animalService'
import { fetchMilkRecords, createMilkRecord, updateMilkRecord, deleteMilkRecord } from '@/services/milkService'
import {
  fetchInseminationRecords,
  createInseminationRecord,
  updateInseminationConfirmation,
  deleteInseminationRecord,
  type InseminationRecord
} from '@/services/inseminationService'
import { supabase } from '@/lib/supabase'
import { localToday, addDaysToDate, daysFromToday } from '@/lib/dates'
import type { Animal, MilkRecord } from '@/types'

const route = useRoute()
const router = useRouter()
const animalsStore = useAnimalsStore()

const animal = ref<Animal | null>(null)
const loading = ref(true)

// ─── Leche ────────────────────────────────────────────────────────────────────

const milkRecords = ref<MilkRecord[]>([])
const milkLoading = ref(false)
const showMilkForm = ref(false)
const milkForm = reactive({
  recorded_date: localToday(),
  liters: '' as string | number,
  notes: '',
  saving: false
})

const editingMilkId = ref<string | null>(null)
const milkEditForm = reactive({ recorded_date: '', liters: '' as string | number, notes: '', saving: false })

const milkTotal = computed(() => milkRecords.value.reduce((s, r) => s + Number(r.liters), 0))

function startEditMilk(r: MilkRecord) {
  editingMilkId.value = r.id
  milkEditForm.recorded_date = r.recorded_date
  milkEditForm.liters = r.liters
  milkEditForm.notes = r.notes ?? ''
  milkEditForm.saving = false
}

function cancelEditMilk() { editingMilkId.value = null }

async function submitMilk() {
  if (!animal.value || !milkForm.recorded_date || milkForm.liters === '') return
  milkForm.saving = true
  try {
    const record = await createMilkRecord({
      animal_id: animal.value.id,
      recorded_date: milkForm.recorded_date,
      liters: Number(milkForm.liters),
      notes: milkForm.notes || null
    })
    milkRecords.value.unshift(record)
    showMilkForm.value = false
    milkForm.recorded_date = localToday()
    milkForm.liters = ''
    milkForm.notes = ''
  } catch (e) { alert('Error: ' + (e as Error).message) }
  finally { milkForm.saving = false }
}

async function saveMilkEdit() {
  if (!editingMilkId.value || milkEditForm.liters === '') return
  milkEditForm.saving = true
  try {
    const updated = await updateMilkRecord(editingMilkId.value, {
      recorded_date: milkEditForm.recorded_date,
      liters: Number(milkEditForm.liters),
      notes: milkEditForm.notes || null
    })
    const idx = milkRecords.value.findIndex(r => r.id === editingMilkId.value)
    if (idx !== -1) milkRecords.value[idx] = updated
    editingMilkId.value = null
  } catch (e) { alert('Error: ' + (e as Error).message) }
  finally { milkEditForm.saving = false }
}

async function removeMilk(id: string) {
  if (!confirm('¿Eliminar este registro?')) return
  await deleteMilkRecord(id)
  milkRecords.value = milkRecords.value.filter(r => r.id !== id)
}

// ─── Inseminación / Gestación ─────────────────────────────────────────────────

const GESTATION_DAYS = 280
const HEAT_CHECK_DAYS = 21

const showInseminationForm = ref(false)
const inseminForm = reactive({
  conception_date: localToday(),
  expected_birth: '',
  heat_check_date: '',
  semen_source: '',
  saving: false
})

const inseminationHistory = ref<InseminationRecord[]>([])
const inseminHistLoading = ref(false)

watch(
  () => inseminForm.conception_date,
  (val) => {
    if (val) {
      inseminForm.expected_birth = addDaysToDate(val, GESTATION_DAYS)
      inseminForm.heat_check_date = addDaysToDate(val, HEAT_CHECK_DAYS)
    }
  },
  { immediate: true }
)

async function saveInsemination() {
  if (!animal.value || !inseminForm.conception_date) return
  inseminForm.saving = true
  try {
    const record = await createInseminationRecord({
      animal_id: animal.value.id,
      insemination_date: inseminForm.conception_date,
      semen_source: inseminForm.semen_source || null,
      expected_birth: inseminForm.expected_birth || addDaysToDate(inseminForm.conception_date, GESTATION_DAYS),
      heat_check_date: inseminForm.heat_check_date
    })
    inseminationHistory.value.unshift(record)

    await supabase.from('tasks').insert({
      title: `Revisar retorno de celo — ${animal.value.ear_tag ?? animal.value.name}`,
      description: `Verificar si la vaca ${animal.value.ear_tag ?? animal.value.name} regresó al celo a los 21 días de inseminación. Si hay retorno, NO quedó preñada.`,
      status: 'pending',
      priority: 'high',
      category: 'reproduction',
      due_date: inseminForm.heat_check_date,
      animal_id: animal.value.id
    })

    showInseminationForm.value = false
    inseminForm.semen_source = ''
  } catch (e) { alert('Error: ' + (e as Error).message) }
  finally { inseminForm.saving = false }
}

async function confirmPregnancyFromRecord(record: InseminationRecord) {
  if (!animal.value) return
  try {
    const updated = await upsertCattleDetail(animal.value.id, {
      is_pregnant: true,
      conception_date: record.insemination_date,
      expected_birth: record.expected_birth || addDaysToDate(record.insemination_date, GESTATION_DAYS),
      last_birth_date: detail.value?.last_birth_date ?? null,
      birth_count: detail.value?.birth_count ?? 0
    })
    animal.value = { ...animal.value, cattle_detail: updated }

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
  if (!confirm('¿Registrar parto y cerrar la preñez? Esto marcará la vaca como no preñada y sumará un parto.')) return
  try {
    const updated = await upsertCattleDetail(animal.value.id, {
      is_pregnant: false,
      conception_date: null,
      expected_birth: null,
      last_birth_date: localToday(),
      birth_count: (detail.value?.birth_count ?? 0) + 1
    })
    animal.value = { ...animal.value, cattle_detail: updated }
  } catch (e) { alert('Error: ' + (e as Error).message) }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(async () => {
  animal.value = (await animalsStore.getAnimal(route.params.id as string)) ?? null
  loading.value = false
  if (animal.value?.sex === 'female') {
    milkLoading.value = true
    inseminHistLoading.value = true
    try {
      ;[milkRecords.value, inseminationHistory.value] = await Promise.all([
        fetchMilkRecords(animal.value.id),
        fetchInseminationRecords(animal.value.id)
      ])

      // Migrar inseminaciones antiguas: si el animal está preñado pero no tiene
      // registros (se inseminó antes de que existiera esta funcionalidad)
      const d = animal.value.cattle_detail
      if (d?.is_pregnant && d.conception_date && inseminationHistory.value.length === 0) {
        const record = await createInseminationRecord({
          animal_id: animal.value.id,
          insemination_date: d.conception_date,
          expected_birth: d.expected_birth,
          heat_check_date: addDaysToDate(d.conception_date, 21),
          pregnancy_confirmed: true,
          pregnancy_confirmed_date: d.conception_date
        })
        inseminationHistory.value = [record]
      }
    } finally {
      milkLoading.value = false
      inseminHistLoading.value = false
    }
  }
})

async function handleDelete() {
  if (!animal.value) return
  if (!confirm(`¿Eliminar al animal ${animal.value.ear_tag}? Esta acción no se puede deshacer.`)) return
  await animalsStore.removeAnimal(animal.value.id)
  router.push('/cattle')
}

const detail = computed(() => animal.value?.cattle_detail)
const isFemale = computed(() => animal.value?.sex === 'female')

function formatDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(`${d}T12:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
}

function daysLabel(days: number): string {
  if (days === 0) return 'hoy'
  if (days < 0) return `hace ${Math.abs(days)} días`
  return `en ${days} días`
}

const statusVariant: Record<string, 'green' | 'red' | 'gray' | 'blue'> = {
  active: 'green', sold: 'blue', deceased: 'red', culled: 'gray'
}
const statusLabel: Record<string, string> = {
  active: 'Activo', sold: 'Vendido', deceased: 'Fallecido', culled: 'Descartado'
}
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <!-- Back header -->
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
          <p class="text-sm text-gray-500">Bovino</p>
        </div>
      </div>
      <div class="flex gap-2" v-if="animal">
        <BaseButton variant="secondary" size="sm" @click="router.push(`/cattle/${animal.id}/edit`)">
          <Pencil class="w-4 h-4" /> Editar
        </BaseButton>
        <BaseButton variant="danger" size="sm" @click="handleDelete">
          <Trash2 class="w-4 h-4" />
        </BaseButton>
      </div>
    </div>

    <div v-if="loading" class="card text-center py-12 text-gray-400">Cargando...</div>

    <template v-else-if="animal">
      <!-- Info card -->
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
          <div>
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
          <div v-if="detail?.birth_count">
            <p class="text-xs text-gray-500 uppercase tracking-wide">Partos</p>
            <p class="text-sm text-gray-800 font-medium mt-0.5">{{ detail.birth_count }}</p>
          </div>
          <div v-if="detail?.last_birth_date">
            <p class="text-xs text-gray-500 uppercase tracking-wide">Último parto</p>
            <p class="text-sm text-gray-800 font-medium mt-0.5">{{ formatDate(detail.last_birth_date) }}</p>
          </div>
          <div v-if="detail?.is_pregnant">
            <p class="text-xs text-gray-500 uppercase tracking-wide">Inseminación</p>
            <p class="text-sm text-gray-800 font-medium mt-0.5">{{ formatDate(detail.conception_date) }}</p>
          </div>
          <div v-if="detail?.is_pregnant">
            <p class="text-xs text-gray-500 uppercase tracking-wide">Parto esperado</p>
            <p class="text-sm text-gray-800 font-medium mt-0.5">{{ formatDate(detail.expected_birth) }}</p>
          </div>
        </div>
        <div v-if="animal.notes" class="mt-4 pt-4 border-t border-gray-100">
          <p class="text-xs text-gray-500 uppercase tracking-wide mb-1">Notas</p>
          <p class="text-sm text-gray-700">{{ animal.notes }}</p>
        </div>
      </div>

      <!-- Inseminación / Gestación (hembras) -->
      <div v-if="isFemale" class="card space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Baby class="w-4 h-4 text-emerald-600" /> Gestación e Inseminaciones
          </h3>
          <BaseButton
            v-if="!detail?.is_pregnant && !showInseminationForm"
            size="sm"
            @click="showInseminationForm = true; inseminForm.conception_date = localToday()"
          >
            <Syringe class="w-4 h-4" /> Registrar inseminación
          </BaseButton>
        </div>

        <!-- Preñada: mostrar info -->
        <div v-if="detail?.is_pregnant" class="rounded-xl bg-emerald-50 border border-emerald-100 p-4 space-y-3">
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <p class="text-xs text-emerald-600 font-semibold uppercase tracking-wide">Inseminación</p>
              <p class="text-sm font-medium text-emerald-900 mt-0.5">{{ formatDate(detail.conception_date) }}</p>
            </div>
            <div>
              <p class="text-xs text-emerald-600 font-semibold uppercase tracking-wide">Parto esperado</p>
              <p class="text-sm font-medium text-emerald-900 mt-0.5">{{ formatDate(detail.expected_birth) }}</p>
            </div>
            <div v-if="detail.expected_birth">
              <p class="text-xs text-emerald-600 font-semibold uppercase tracking-wide">Días restantes</p>
              <p class="text-sm font-bold mt-0.5"
                :class="daysFromToday(detail.expected_birth) <= 7 ? 'text-red-600' : 'text-emerald-900'">
                {{ daysLabel(daysFromToday(detail.expected_birth)) }}
              </p>
            </div>
            <div v-if="detail.conception_date">
              <p class="text-xs text-emerald-600 font-semibold uppercase tracking-wide">Revisión de celo</p>
              <p class="text-sm font-medium text-emerald-900 mt-0.5">
                {{ formatDate(addDaysToDate(detail.conception_date, 21)) }}
              </p>
              <p class="text-xs"
                :class="daysFromToday(addDaysToDate(detail.conception_date, 21)) <= 0 ? 'text-red-500 font-semibold' : 'text-emerald-500'">
                {{ daysLabel(daysFromToday(addDaysToDate(detail.conception_date, 21))) }}
              </p>
            </div>
          </div>
          <div class="flex justify-end">
            <BaseButton variant="secondary" size="sm" @click="clearPregnancy">
              Registrar parto
            </BaseButton>
          </div>
        </div>

        <!-- Inseminaciones pendientes de confirmación (mostrar prominentemente cuando no está preñada) -->
        <template v-if="!detail?.is_pregnant && !inseminHistLoading">
          <div
            v-for="r in inseminationHistory.filter(x => x.pregnancy_confirmed === null)"
            :key="'pending-' + r.id"
            class="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-3"
          >
            <div class="flex items-center gap-2">
              <span class="text-base">⏳</span>
              <p class="text-sm font-semibold text-amber-800">Inseminación pendiente de confirmación</p>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              <div>
                <p class="text-xs text-amber-600 font-medium uppercase tracking-wide">Fecha</p>
                <p class="font-semibold text-amber-900">{{ formatDate(r.insemination_date) }}</p>
              </div>
              <div v-if="r.semen_source">
                <p class="text-xs text-amber-600 font-medium uppercase tracking-wide">Semental</p>
                <p class="font-semibold text-amber-900">{{ r.semen_source }}</p>
              </div>
              <div v-if="r.expected_birth">
                <p class="text-xs text-amber-600 font-medium uppercase tracking-wide">Parto estimado</p>
                <p class="font-semibold text-amber-900">{{ formatDate(r.expected_birth) }}</p>
              </div>
            </div>
            <p class="text-xs text-amber-600">¿La vaca quedó preñada? Confirma o descarta esta inseminación.</p>
            <div class="flex gap-2">
              <BaseButton size="sm" @click="confirmPregnancyFromRecord(r)">
                ✓ Confirmar preñez
              </BaseButton>
              <BaseButton variant="secondary" size="sm" @click="markNoPregnancyFromRecord(r)">
                ✕ No preñó
              </BaseButton>
            </div>
          </div>
        </template>

        <!-- No preñada y sin pendientes -->
        <p v-if="!detail?.is_pregnant && !showInseminationForm && !inseminHistLoading
              && !inseminationHistory.filter(x => x.pregnancy_confirmed === null).length"
          class="text-sm text-gray-400 text-center py-2">
          Sin gestación activa.
        </p>

        <!-- Formulario inseminación -->
        <div v-if="showInseminationForm" class="rounded-xl border border-emerald-100 bg-emerald-50 p-4 space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <BaseInput
              v-model="inseminForm.conception_date"
              label="Fecha de inseminación / monta"
              type="date"
              required
            />
            <BaseInput
              v-model="inseminForm.semen_source"
              label="Nombre del semental / toro"
              type="text"
              placeholder="Ej: Toro Campeón"
            />
            <BaseInput
              v-model="inseminForm.expected_birth"
              label="Parto esperado (280 días, auto)"
              type="date"
            />
          </div>

          <!-- Info calculada -->
          <div v-if="inseminForm.conception_date" class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div class="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
              <p class="text-xs font-semibold text-amber-700">Revisión de retorno de celo</p>
              <p class="text-sm font-bold text-amber-900">{{ inseminForm.heat_check_date ? formatDate(inseminForm.heat_check_date) : '—' }}</p>
              <p class="text-xs text-amber-600">Si regresa al celo → no quedó preñada</p>
            </div>
            <div class="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
              <p class="text-xs font-semibold text-blue-700">Parto esperado</p>
              <p class="text-sm font-bold text-blue-900">{{ inseminForm.expected_birth ? formatDate(inseminForm.expected_birth) : '—' }}</p>
              <p class="text-xs text-blue-600">Gestación bovina: 280 días</p>
            </div>
          </div>
          <p class="text-xs text-gray-500">
            Se creará automáticamente una tarea de alta prioridad para revisar el retorno de celo a los 21 días.
          </p>
          <div class="flex justify-end gap-2">
            <BaseButton variant="secondary" size="sm" @click="showInseminationForm = false">Cancelar</BaseButton>
            <BaseButton size="sm" :loading="inseminForm.saving" @click="saveInsemination">
              <Syringe class="w-4 h-4" /> Guardar inseminación
            </BaseButton>
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
                  ? 'bg-emerald-50 border-emerald-100'
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
                      class="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-medium"
                    >✓ Preñez confirmada</span>
                    <span
                      v-else
                      class="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100 font-medium"
                    >✕ No quedó preñada</span>
                  </div>
                  <p v-if="r.semen_source" class="text-xs text-gray-500">
                    Semental: <span class="font-medium text-gray-700">{{ r.semen_source }}</span>
                  </p>
                  <p v-if="r.expected_birth" class="text-xs text-gray-400">
                    Parto estimado: {{ formatDate(r.expected_birth) }}
                  </p>
                  <p v-if="r.pregnancy_confirmed && r.pregnancy_confirmed_date" class="text-xs text-emerald-600">
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
                  class="flex-1 text-xs font-semibold py-1.5 px-3 rounded-lg border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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

        <div v-if="detail?.birth_count" class="text-xs text-gray-400 text-right">
          Partos totales: <span class="font-semibold text-gray-600">{{ detail.birth_count }}</span>
        </div>
      </div>

      <!-- Producción de leche (hembras) -->
      <div v-if="isFemale" class="card space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Milk class="w-4 h-4 text-blue-400" /> Producción de leche
            </h3>
            <span v-if="milkTotal > 0" class="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5 font-semibold">
              {{ milkTotal.toFixed(1) }} L registrados
            </span>
          </div>
          <BaseButton size="sm" @click="showMilkForm = !showMilkForm">
            <Plus class="w-4 h-4" /> Registrar
          </BaseButton>
        </div>

        <div v-if="showMilkForm" class="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <BaseInput v-model="milkForm.recorded_date" label="Fecha" type="date" required />
            <BaseInput v-model="milkForm.liters" label="Litros" type="number" placeholder="0.0" required />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea v-model="milkForm.notes" rows="2" class="form-input" placeholder="Observaciones..." />
          </div>
          <div class="flex justify-end gap-2">
            <BaseButton variant="secondary" size="sm" @click="showMilkForm = false">Cancelar</BaseButton>
            <BaseButton size="sm" :loading="milkForm.saving" @click="submitMilk">Guardar</BaseButton>
          </div>
        </div>

        <div v-if="milkLoading" class="text-center py-6 text-sm text-gray-400">Cargando...</div>
        <p v-else-if="!milkRecords.length" class="text-center py-4 text-sm text-gray-400">Sin registros de leche.</p>

        <div v-else class="rounded-lg border border-gray-200 overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th class="px-3 py-2 text-left">Fecha</th>
                <th class="px-3 py-2 text-right">Litros</th>
                <th class="px-3 py-2 text-left">Notas</th>
                <th class="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 bg-white">
              <tr v-for="r in milkRecords" :key="r.id">
                <template v-if="editingMilkId === r.id">
                  <td class="px-3 py-2">
                    <input v-model="milkEditForm.recorded_date" type="date" class="form-input text-sm py-1" />
                  </td>
                  <td class="px-3 py-2">
                    <input v-model="milkEditForm.liters" type="number" class="form-input text-sm py-1 w-24 text-right" step="0.1" />
                  </td>
                  <td class="px-3 py-2">
                    <input v-model="milkEditForm.notes" type="text" class="form-input text-sm py-1" placeholder="Notas..." />
                  </td>
                  <td class="px-3 py-2">
                    <div class="flex gap-1 justify-end">
                      <button class="p-1 text-green-600 hover:bg-green-50 rounded" :disabled="milkEditForm.saving" @click="saveMilkEdit">✓</button>
                      <button class="p-1 text-gray-400 hover:bg-gray-100 rounded" @click="cancelEditMilk">✕</button>
                    </div>
                  </td>
                </template>
                <template v-else>
                  <td class="px-3 py-2 text-gray-700">{{ new Date(`${r.recorded_date}T12:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) }}</td>
                  <td class="px-3 py-2 text-right font-semibold text-blue-700">{{ Number(r.liters).toFixed(1) }} L</td>
                  <td class="px-3 py-2 text-gray-400 text-xs">{{ r.notes ?? '—' }}</td>
                  <td class="px-3 py-2">
                    <div class="flex gap-1 justify-end">
                      <button class="p-1 text-gray-300 hover:text-blue-500 rounded transition-colors" @click="startEditMilk(r)">✎</button>
                      <button class="p-1 text-gray-300 hover:text-red-500 rounded transition-colors" @click="removeMilk(r.id)">✕</button>
                    </div>
                  </td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Vaccination history -->
      <div class="card">
        <VaccinationList :animal-id="animal.id" species="cattle" />
      </div>
    </template>

    <div v-else class="card text-center py-12 text-gray-400">Animal no encontrado.</div>
  </div>
</template>
