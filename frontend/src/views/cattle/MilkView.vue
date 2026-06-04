<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { Milk, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-vue-next'
import BaseButton from '@/components/shared/BaseButton.vue'
import BaseInput from '@/components/shared/BaseInput.vue'
import { useAnimalsStore } from '@/stores/animals'
import {
  fetchAllMilkRecords, createMilkRecord, deleteMilkRecord, groupByDate,
  fetchMilkSessions, createMilkSession, deleteMilkSession, groupSessionsByMonth
} from '@/services/milkService'
import type { MilkRecord, MilkSession } from '@/types'

const animalsStore = useAnimalsStore()
const tab = ref<'sessions' | 'cows'>('sessions')
const pageLoading = ref(true)

// ─── ORDEÑOS (sessions) ───────────────────────────────────────────────────────

const sessions = ref<MilkSession[]>([])
const monthlySummaries = computed(() => groupSessionsByMonth(sessions.value))
const expandedMonths = ref<Record<string, boolean>>({ [currentMonthKey()]: true })

function currentMonthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth()}`
}

// form
const showSessionForm = ref(false)
const sessionForm = reactive({
  recorded_date: new Date().toISOString().slice(0, 10),
  liters: '' as string | number,
  notes: '',
  saving: false
})

async function submitSession() {
  if (!sessionForm.recorded_date || sessionForm.liters === '') return
  sessionForm.saving = true
  try {
    const record = await createMilkSession({
      recorded_date: sessionForm.recorded_date,
      liters: Number(sessionForm.liters),
      notes: sessionForm.notes || null
    })
    sessions.value.unshift(record)
    showSessionForm.value = false
    sessionForm.liters = ''
    sessionForm.notes = ''
    sessionForm.recorded_date = new Date().toISOString().slice(0, 10)
  } catch (e) { alert('Error: ' + (e as Error).message) }
  finally { sessionForm.saving = false }
}

async function removeSession(id: string) {
  if (!confirm('¿Eliminar este ordeño?')) return
  await deleteMilkSession(id)
  sessions.value = sessions.value.filter(s => s.id !== id)
}

// ─── POR VACA (records) ───────────────────────────────────────────────────────

const allRecords = ref<MilkRecord[]>([])
const dailySummaries = computed(() => groupByDate(allRecords.value))
const expandedDays = ref<Record<string, boolean>>({})
const grandTotal = computed(() => allRecords.value.reduce((s, r) => s + Number(r.liters), 0))

const cows = computed(() =>
  animalsStore.animals.filter(a => a.species === 'cattle' && a.sex === 'female' && a.status === 'active')
)

const showCowForm = ref(false)
const cowForm = reactive({
  animal_id: '',
  recorded_date: new Date().toISOString().slice(0, 10),
  liters: '' as string | number,
  notes: '',
  saving: false
})

async function submitCowRecord() {
  if (!cowForm.animal_id || !cowForm.recorded_date || cowForm.liters === '') return
  cowForm.saving = true
  try {
    const record = await createMilkRecord({
      animal_id: cowForm.animal_id,
      recorded_date: cowForm.recorded_date,
      liters: Number(cowForm.liters),
      notes: cowForm.notes || null
    })
    const cow = animalsStore.animals.find(a => a.id === cowForm.animal_id)
    allRecords.value.unshift({ ...record, animal: cow ? { id: cow.id, ear_tag: cow.ear_tag, name: cow.name } : undefined })
    showCowForm.value = false
    cowForm.animal_id = ''
    cowForm.liters = ''
    cowForm.notes = ''
  } catch (e) { alert('Error: ' + (e as Error).message) }
  finally { cowForm.saving = false }
}

async function removeCowRecord(id: string) {
  if (!confirm('¿Eliminar este registro?')) return
  await deleteMilkRecord(id)
  allRecords.value = allRecords.value.filter(r => r.id !== id)
}

// ─── Init ─────────────────────────────────────────────────────────────────────

onMounted(async () => {
  await Promise.all([
    animalsStore.loadAnimals('cattle'),
    fetchMilkSessions().then(d => { sessions.value = d }),
    fetchAllMilkRecords().then(d => { allRecords.value = d })
  ]).finally(() => { pageLoading.value = false })
})

// ─── Utils ────────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function formatDay(d: string) {
  const date = new Date(d + 'T12:00:00')
  return `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${date.toLocaleDateString('es', { month: 'short' })}`
}

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
}

function monthKey(s: { year: number; month: number }) {
  return `${s.year}-${s.month}`
}

// max liters in current view for bar scaling
function maxLiters(sessions: MilkSession[]) {
  return Math.max(...sessions.map(s => Number(s.liters)), 1)
}
</script>

<template>
  <div class="space-y-5">

    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Milk class="w-5 h-5 text-blue-400" /> Producción de leche
        </h1>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
      <button
        class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
        :class="tab === 'sessions' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
        @click="tab = 'sessions'"
      >
        Por ordeño
      </button>
      <button
        class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
        :class="tab === 'cows' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
        @click="tab = 'cows'"
      >
        Por vaca
      </button>
    </div>

    <div v-if="pageLoading" class="card text-center py-16 text-gray-400">Cargando...</div>

    <!-- ═══════════════════════ TAB: POR ORDEÑO ═══════════════════════════ -->
    <template v-else-if="tab === 'sessions'">

      <!-- Botón registrar -->
      <div class="flex justify-end">
        <BaseButton @click="showSessionForm = !showSessionForm">
          <Plus class="w-4 h-4" /> Registrar ordeño
        </BaseButton>
      </div>

      <!-- Formulario -->
      <div v-if="showSessionForm" class="card border-blue-100 bg-blue-50 space-y-3">
        <p class="text-sm font-semibold text-blue-700">Nuevo ordeño</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <BaseInput v-model="sessionForm.recorded_date" label="Fecha *" type="date" required />
          <BaseInput v-model="sessionForm.liters" label="Litros totales *" type="number" placeholder="0.0" required />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Notas</label>
          <textarea v-model="sessionForm.notes" rows="2" class="form-input" placeholder="Observaciones..." />
        </div>
        <div class="flex justify-end gap-2">
          <BaseButton variant="secondary" size="sm" @click="showSessionForm = false">Cancelar</BaseButton>
          <BaseButton size="sm" :loading="sessionForm.saving"
            :disabled="!sessionForm.liters"
            @click="submitSession">
            Guardar
          </BaseButton>
        </div>
      </div>

      <!-- Sin datos -->
      <div v-if="!monthlySummaries.length" class="card text-center py-16 text-gray-400">
        No hay ordeños registrados.
      </div>

      <!-- Resumen mensual -->
      <div v-else class="space-y-4">
        <div
          v-for="month in monthlySummaries"
          :key="monthKey(month)"
          class="card space-y-4"
        >
          <!-- Cabecera mes -->
          <button
            type="button"
            class="w-full flex items-center justify-between"
            @click="expandedMonths[monthKey(month)] = !expandedMonths[monthKey(month)]"
          >
            <div class="flex items-center gap-2">
              <component :is="expandedMonths[monthKey(month)] ? ChevronDown : ChevronRight" class="w-4 h-4 text-gray-400" />
              <h3 class="text-base font-bold text-gray-800 capitalize">{{ month.label }}</h3>
            </div>
            <span class="text-sm text-blue-600 font-semibold">{{ month.total.toFixed(1) }} L</span>
          </button>

          <!-- KPIs del mes -->
          <div v-if="expandedMonths[monthKey(month)]" class="space-y-4">
            <div class="grid grid-cols-3 gap-3">
              <div class="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-center">
                <p class="text-xs text-blue-500 font-semibold uppercase tracking-wide">Total del mes</p>
                <p class="text-2xl font-bold text-blue-700 mt-1">{{ month.total.toFixed(1) }}</p>
                <p class="text-xs text-blue-400">litros</p>
              </div>
              <div class="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 text-center">
                <p class="text-xs text-indigo-500 font-semibold uppercase tracking-wide">Promedio diario</p>
                <p class="text-2xl font-bold text-indigo-700 mt-1">{{ month.average.toFixed(1) }}</p>
                <p class="text-xs text-indigo-400">L / ordeño</p>
              </div>
              <div class="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-center">
                <p class="text-xs text-gray-500 font-semibold uppercase tracking-wide">Días registrados</p>
                <p class="text-2xl font-bold text-gray-700 mt-1">{{ month.daysRecorded }}</p>
                <p class="text-xs text-gray-400">ordeños</p>
              </div>
            </div>

            <!-- Lista de días con barra -->
            <div class="space-y-1.5">
              <div
                v-for="s in month.sessions"
                :key="s.id"
                class="flex items-center gap-3 group"
              >
                <span class="text-xs text-gray-500 w-20 shrink-0">{{ formatDay(s.recorded_date) }}</span>
                <div class="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                  <div
                    class="bg-blue-400 h-4 rounded-full transition-all flex items-center justify-end pr-2"
                    :style="{ width: Math.max((Number(s.liters) / maxLiters(month.sessions)) * 100, 4).toFixed(1) + '%' }"
                  >
                    <span class="text-xs text-white font-bold leading-none hidden sm:block">
                      {{ Number(s.liters).toFixed(1) }}
                    </span>
                  </div>
                </div>
                <span class="text-sm font-semibold text-blue-700 w-16 text-right shrink-0 sm:hidden">
                  {{ Number(s.liters).toFixed(1) }} L
                </span>
                <button
                  class="p-1 text-gray-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                  @click="removeSession(s.id)"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <!-- Nota de sesión si existe -->
            <div v-if="month.sessions.some(s => s.notes)" class="space-y-1">
              <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">Notas</p>
              <div v-for="s in month.sessions.filter(s => s.notes)" :key="s.id + '_note'"
                class="text-xs text-gray-500">
                <span class="font-medium">{{ formatDay(s.recorded_date) }}:</span> {{ s.notes }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ═══════════════════════ TAB: POR VACA ═════════════════════════════ -->
    <template v-else>

      <div class="flex items-center justify-between">
        <p class="text-sm text-gray-500">
          Total registrado: <span class="font-semibold text-blue-700">{{ grandTotal.toFixed(1) }} L</span>
        </p>
        <BaseButton size="sm" @click="showCowForm = !showCowForm">
          <Plus class="w-4 h-4" /> Registrar
        </BaseButton>
      </div>

      <!-- Formulario por vaca -->
      <div v-if="showCowForm" class="card border-blue-100 bg-blue-50 space-y-3">
        <p class="text-sm font-semibold text-blue-700">Registrar por vaca</p>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Vaca *</label>
            <select v-model="cowForm.animal_id" class="form-select">
              <option value="">Seleccionar vaca...</option>
              <option v-for="cow in cows" :key="cow.id" :value="cow.id">
                {{ cow.ear_tag ?? 'Sin arete' }}<template v-if="cow.name"> · {{ cow.name }}</template>
              </option>
            </select>
          </div>
          <BaseInput v-model="cowForm.recorded_date" label="Fecha *" type="date" required />
          <BaseInput v-model="cowForm.liters" label="Litros *" type="number" placeholder="0.0" required />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Notas</label>
          <textarea v-model="cowForm.notes" rows="2" class="form-input" placeholder="Observaciones..." />
        </div>
        <div class="flex justify-end gap-2">
          <BaseButton variant="secondary" size="sm" @click="showCowForm = false">Cancelar</BaseButton>
          <BaseButton size="sm" :loading="cowForm.saving"
            :disabled="!cowForm.animal_id || cowForm.liters === ''"
            @click="submitCowRecord">
            Guardar
          </BaseButton>
        </div>
      </div>

      <div v-if="!dailySummaries.length" class="card text-center py-16 text-gray-400">
        No hay registros individuales.
      </div>

      <!-- Historial por día -->
      <div v-else class="space-y-3">
        <div v-for="day in dailySummaries" :key="day.date"
          class="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <button type="button"
            class="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left"
            @click="expandedDays[day.date] = !expandedDays[day.date]">
            <div class="flex items-center gap-3">
              <component :is="expandedDays[day.date] ? ChevronDown : ChevronRight" class="w-4 h-4 text-gray-400 shrink-0" />
              <div>
                <p class="text-sm font-semibold text-gray-800">{{ formatDate(day.date) }}</p>
                <p class="text-xs text-gray-500">{{ day.records.length }} {{ day.records.length === 1 ? 'vaca' : 'vacas' }}</p>
              </div>
            </div>
            <div class="text-right shrink-0">
              <span class="text-xl font-bold text-blue-600">{{ day.total_liters.toFixed(1) }}</span>
              <p class="text-xs text-gray-400">litros</p>
            </div>
          </button>

          <div v-if="expandedDays[day.date]" class="border-t border-gray-100 bg-gray-50">
            <div v-for="r in day.records" :key="r.id"
              class="flex items-center justify-between px-5 py-2.5 gap-3 border-b border-gray-100 last:border-0">
              <div class="flex items-center gap-3 flex-1 min-w-0">
                <div class="w-2 h-2 rounded-full bg-blue-400 shrink-0"></div>
                <div class="min-w-0">
                  <p class="text-sm font-medium text-gray-800 truncate">
                    {{ r.animal?.ear_tag ?? 'Sin arete' }}
                    <span v-if="r.animal?.name" class="text-gray-400 font-normal"> · {{ r.animal.name }}</span>
                  </p>
                  <p v-if="r.notes" class="text-xs text-gray-400 truncate">{{ r.notes }}</p>
                </div>
              </div>
              <div class="flex items-center gap-3 shrink-0">
                <span class="text-sm font-bold text-blue-700">{{ Number(r.liters).toFixed(1) }} L</span>
                <button class="p-1 text-gray-300 hover:text-red-500 transition-colors rounded"
                  @click="removeCowRecord(r.id)">
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div v-if="day.records.length > 1" class="px-5 py-3 bg-white border-t border-gray-100">
              <p class="text-xs text-gray-400 mb-2 uppercase tracking-wide font-medium">Distribución</p>
              <div class="space-y-1.5">
                <div v-for="r in day.records" :key="r.id + '_bar'" class="flex items-center gap-2">
                  <span class="text-xs text-gray-500 w-20 truncate shrink-0">{{ r.animal?.ear_tag ?? '—' }}</span>
                  <div class="flex-1 bg-gray-100 rounded-full h-2">
                    <div class="bg-blue-400 h-2 rounded-full"
                      :style="{ width: ((Number(r.liters) / day.total_liters) * 100).toFixed(1) + '%' }" />
                  </div>
                  <span class="text-xs text-gray-500 w-12 text-right shrink-0">{{ Number(r.liters).toFixed(1) }} L</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

  </div>
</template>
