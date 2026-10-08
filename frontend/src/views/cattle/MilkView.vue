<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { localToday } from '@/lib/dates'
import { Milk, ChevronDown, Plus, Pencil, History, KeyRound } from 'lucide-vue-next'
import BaseButton from '@/components/shared/BaseButton.vue'
import BaseInput from '@/components/shared/BaseInput.vue'
import MilkWithdrawalAlert from '@/components/cattle/MilkWithdrawalAlert.vue'
import MilkCorrectionForm from '@/components/cattle/MilkCorrectionForm.vue'
import { useAnimalsStore } from '@/stores/animals'
import {
  fetchAllMilkRecords, createMilkRecord, groupByDate,
  fetchMilkSessions, createMilkSession, groupSessionsByMonth,
  fetchMilkEditLog, changeMilkPassword, type MilkEditLogEntry
} from '@/services/milkService'
import type { MilkRecord, MilkSession } from '@/types'

const animalsStore = useAnimalsStore()
const tab = ref<'sessions' | 'cows'>('sessions')
const pageLoading = ref(true)

// Registro que se está corrigiendo (uno a la vez en toda la pantalla)
const correcting = ref<string | null>(null)

// ─── ORDEÑOS (sessions) ───────────────────────────────────────────────────────

const sessions = ref<MilkSession[]>([])
const monthlySummaries = computed(() => groupSessionsByMonth(sessions.value))
const expandedMonths = ref<Record<string, boolean>>({ [currentMonthKey()]: true })

function currentMonthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth()}`
}

const showSessionForm = ref(false)
const sessionForm = reactive({
  recorded_date: localToday(),
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
    sessionForm.recorded_date = localToday()
  } catch (e) { alert('Error: ' + (e as Error).message) }
  finally { sessionForm.saving = false }
}

function onSessionSaved(row: MilkSession | MilkRecord) {
  const idx = sessions.value.findIndex(s => s.id === row.id)
  if (idx !== -1) sessions.value[idx] = row as MilkSession
  correcting.value = null
  loadLog()
}

function onSessionDeleted(id: string) {
  sessions.value = sessions.value.filter(s => s.id !== id)
  correcting.value = null
  loadLog()
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
  recorded_date: localToday(),
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

function onRecordSaved(row: MilkSession | MilkRecord) {
  const idx = allRecords.value.findIndex(r => r.id === row.id)
  if (idx !== -1) allRecords.value[idx] = { ...allRecords.value[idx], ...(row as MilkRecord) }
  correcting.value = null
  loadLog()
}

function onRecordDeleted(id: string) {
  allRecords.value = allRecords.value.filter(r => r.id !== id)
  correcting.value = null
  loadLog()
}

// ─── Historial de correcciones ────────────────────────────────────────────────

const editLog = ref<MilkEditLogEntry[]>([])
const showLog = ref(false)

async function loadLog() {
  try { editLog.value = await fetchMilkEditLog() } catch { /* sin historial disponible */ }
}

function logWhat(e: MilkEditLogEntry) {
  const who = e.source === 'milk_records'
    ? `Vaca ${e.animal?.ear_tag ?? e.animal?.name ?? ''}`.trim()
    : 'Ordeño'
  return `${who} del ${e.old_date ? formatDay(e.old_date) : '—'}`
}

function logChange(e: MilkEditLogEntry) {
  if (e.action === 'delete') return `Borrado (${Number(e.old_liters).toFixed(1)} L)`
  const parts: string[] = []
  if (Number(e.old_liters) !== Number(e.new_liters)) parts.push(`${Number(e.old_liters).toFixed(1)} L → ${Number(e.new_liters).toFixed(1)} L`)
  if (e.old_date !== e.new_date && e.new_date) parts.push(`fecha → ${formatDay(e.new_date)}`)
  if ((e.old_notes ?? '') !== (e.new_notes ?? '')) parts.push('notas cambiadas')
  return parts.join(' · ') || 'Sin cambios'
}

function formatStamp(ts: string) {
  return new Date(ts).toLocaleString('es', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

// ─── Cambiar clave (requiere la clave actual) ─────────────────────────────────

const showPwForm = ref(false)
const pwForm = reactive({ current: '', next: '', confirm: '', saving: false, error: '', done: false })

async function submitPassword() {
  pwForm.error = ''
  if (pwForm.next.length < 4) { pwForm.error = 'La clave nueva debe tener al menos 4 caracteres.'; return }
  if (pwForm.next !== pwForm.confirm) { pwForm.error = 'La clave nueva y la confirmación no coinciden.'; return }
  pwForm.saving = true
  try {
    await changeMilkPassword(pwForm.current, pwForm.next)
    pwForm.done = true
    pwForm.current = pwForm.next = pwForm.confirm = ''
    showPwForm.value = false
  } catch (e) {
    pwForm.error = (e as Error).message
    pwForm.current = ''
  } finally { pwForm.saving = false }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

onMounted(async () => {
  await Promise.all([
    animalsStore.loadAnimals(),
    fetchMilkSessions().then(d => { sessions.value = d }),
    fetchAllMilkRecords().then(d => { allRecords.value = d }),
    loadLog()
  ]).finally(() => { pageLoading.value = false })
})

// ─── Utils ────────────────────────────────────────────────────────────────────

const DAY_NAMES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

function formatDay(d: string) {
  const date = new Date(d + 'T12:00:00')
  return `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${date.toLocaleDateString('es', { month: 'short' })}`
}

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function monthKey(s: { year: number; month: number }) {
  return `${s.year}-${s.month}`
}

function maxLiters(list: MilkSession[]) {
  return Math.max(...list.map(s => Number(s.liters)), 1)
}

function cowLabel(r: MilkRecord) {
  return r.animal?.ear_tag ?? r.animal?.name ?? 'Sin arete'
}
</script>

<template>
  <div class="space-y-5 max-w-4xl">

    <!-- Header -->
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-xl font-bold text-gray-900 flex items-center gap-2">
        <Milk class="w-5 h-5 text-sky-700" aria-hidden="true" /> Leche
      </h1>
      <BaseButton v-if="tab === 'sessions'" @click="showSessionForm = !showSessionForm">
        <Plus class="w-4 h-4" /> Registrar ordeño
      </BaseButton>
      <BaseButton v-else @click="showCowForm = !showCowForm">
        <Plus class="w-4 h-4" /> Registrar por vaca
      </BaseButton>
    </div>

    <MilkWithdrawalAlert />

    <!-- Tabs -->
    <div class="flex gap-1 p-1 bg-gray-200/70 rounded-lg w-full sm:w-fit" role="tablist">
      <button
        role="tab"
        :aria-selected="tab === 'sessions'"
        class="flex-1 sm:flex-none px-4 min-h-[40px] rounded-md text-sm font-medium transition-colors"
        :class="tab === 'sessions' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'"
        @click="tab = 'sessions'; correcting = null"
      >
        Por ordeño
      </button>
      <button
        role="tab"
        :aria-selected="tab === 'cows'"
        class="flex-1 sm:flex-none px-4 min-h-[40px] rounded-md text-sm font-medium transition-colors"
        :class="tab === 'cows' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'"
        @click="tab = 'cows'; correcting = null"
      >
        Por vaca
      </button>
    </div>

    <div v-if="pageLoading" class="card-empty">Cargando...</div>

    <!-- ═══════════════════════ TAB: POR ORDEÑO ═══════════════════════════ -->
    <template v-else-if="tab === 'sessions'">

      <form v-if="showSessionForm" class="card space-y-3" @submit.prevent="submitSession">
        <h2 class="card-title">Nuevo ordeño</h2>
        <div class="grid grid-cols-2 gap-3">
          <BaseInput v-model="sessionForm.recorded_date" label="Fecha" type="date" required />
          <BaseInput v-model="sessionForm.liters" label="Litros totales" type="number" placeholder="0.0" required />
        </div>
        <BaseInput v-model="sessionForm.notes" label="Notas" placeholder="Opcional" />
        <div class="flex justify-end gap-2">
          <BaseButton variant="secondary" size="sm" @click="showSessionForm = false">Cancelar</BaseButton>
          <BaseButton type="submit" size="sm" :loading="sessionForm.saving" :disabled="sessionForm.liters === ''">
            Guardar ordeño
          </BaseButton>
        </div>
      </form>

      <div v-if="!monthlySummaries.length" class="card-empty">
        Todavía no hay ordeños. Registra el total del día con “Registrar ordeño” o díctaselo al asistente.
      </div>

      <div v-else class="space-y-3">
        <section
          v-for="month in monthlySummaries"
          :key="monthKey(month)"
          class="card p-0 sm:p-0 overflow-hidden"
        >
          <button
            type="button"
            class="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
            :aria-expanded="!!expandedMonths[monthKey(month)]"
            @click="expandedMonths[monthKey(month)] = !expandedMonths[monthKey(month)]"
          >
            <span class="flex items-center gap-2">
              <ChevronDown
                class="w-4 h-4 text-gray-500 transition-transform duration-200"
                :class="expandedMonths[monthKey(month)] ? '' : '-rotate-90'"
                aria-hidden="true"
              />
              <span class="text-base font-semibold text-gray-900">{{ month.label }}</span>
            </span>
            <span class="text-base font-semibold text-gray-900 tabular-nums">{{ month.total.toFixed(1) }} L</span>
          </button>

          <div v-if="expandedMonths[monthKey(month)]" class="border-t border-gray-200">
            <dl class="grid grid-cols-3 divide-x divide-gray-200 border-b border-gray-200 bg-gray-50">
              <div class="px-4 py-3">
                <dt class="stat-label">Total</dt>
                <dd class="text-lg font-semibold tabular-nums text-gray-900">{{ month.total.toFixed(1) }} L</dd>
              </div>
              <div class="px-4 py-3">
                <dt class="stat-label">Promedio diario</dt>
                <dd class="text-lg font-semibold tabular-nums text-gray-900">{{ month.average.toFixed(1) }} L</dd>
              </div>
              <div class="px-4 py-3">
                <dt class="stat-label">Días</dt>
                <dd class="text-lg font-semibold tabular-nums text-gray-900">{{ month.daysRecorded }}</dd>
              </div>
            </dl>

            <ul class="divide-y divide-gray-100">
              <li v-for="s in month.sessions" :key="s.id" class="px-2 sm:px-3">
                <button
                  v-if="correcting !== s.id"
                  type="button"
                  class="group w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-left hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  :aria-label="`Corregir ordeño del ${formatDay(s.recorded_date)}, ${Number(s.liters).toFixed(1)} litros`"
                  @click="correcting = s.id"
                >
                  <span class="text-sm text-gray-700 w-20 shrink-0">{{ formatDay(s.recorded_date) }}</span>
                  <span class="flex-1 min-w-0">
                    <span class="block bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <span
                        class="block bg-sky-500 h-full rounded-full"
                        :style="{ width: Math.max((Number(s.liters) / maxLiters(month.sessions)) * 100, 3).toFixed(1) + '%' }"
                      />
                    </span>
                    <span v-if="s.notes" class="block text-xs text-gray-600 mt-1 truncate">{{ s.notes }}</span>
                  </span>
                  <span class="text-sm font-semibold text-gray-900 tabular-nums w-16 text-right shrink-0">
                    {{ Number(s.liters).toFixed(1) }} L
                  </span>
                  <Pencil class="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-700 shrink-0" aria-hidden="true" />
                </button>
                <div v-else class="py-2">
                  <MilkCorrectionForm
                    source="milk_sessions"
                    :entry="s"
                    :title="`Ordeño del ${formatDay(s.recorded_date)}`"
                    @saved="onSessionSaved"
                    @deleted="onSessionDeleted"
                    @cancel="correcting = null"
                  />
                </div>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </template>

    <!-- ═══════════════════════ TAB: POR VACA ═════════════════════════════ -->
    <template v-else>

      <p class="text-sm text-gray-600">
        Total registrado por vaca: <span class="font-semibold text-gray-900 tabular-nums">{{ grandTotal.toFixed(1) }} L</span>
      </p>

      <form v-if="showCowForm" class="card space-y-3" @submit.prevent="submitCowRecord">
        <h2 class="card-title">Registrar por vaca</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div class="col-span-2 sm:col-span-1">
            <label class="block text-sm font-medium text-gray-700 mb-1">Vaca <span class="text-red-500">*</span></label>
            <select v-model="cowForm.animal_id" class="form-select" required>
              <option value="">Seleccionar vaca...</option>
              <option v-for="cow in cows" :key="cow.id" :value="cow.id">
                {{ cow.ear_tag ?? 'Sin arete' }}<template v-if="cow.name"> · {{ cow.name }}</template>
              </option>
            </select>
          </div>
          <BaseInput v-model="cowForm.recorded_date" label="Fecha" type="date" required />
          <BaseInput v-model="cowForm.liters" label="Litros" type="number" placeholder="0.0" required />
        </div>
        <BaseInput v-model="cowForm.notes" label="Notas" placeholder="Opcional" />
        <div class="flex justify-end gap-2">
          <BaseButton variant="secondary" size="sm" @click="showCowForm = false">Cancelar</BaseButton>
          <BaseButton type="submit" size="sm" :loading="cowForm.saving"
            :disabled="!cowForm.animal_id || cowForm.liters === ''">
            Guardar
          </BaseButton>
        </div>
      </form>

      <div v-if="!dailySummaries.length" class="card-empty">
        No hay registros por vaca. Úsalo cuando quieras medir la producción de cada vaca.
      </div>

      <div v-else class="space-y-2">
        <section v-for="day in dailySummaries" :key="day.date" class="card p-0 sm:p-0 overflow-hidden">
          <button type="button"
            class="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
            :aria-expanded="!!expandedDays[day.date]"
            @click="expandedDays[day.date] = !expandedDays[day.date]">
            <span class="flex items-center gap-2 min-w-0">
              <ChevronDown
                class="w-4 h-4 text-gray-500 shrink-0 transition-transform duration-200"
                :class="expandedDays[day.date] ? '' : '-rotate-90'"
                aria-hidden="true"
              />
              <span class="min-w-0">
                <span class="block text-sm font-semibold text-gray-900 capitalize">{{ formatDate(day.date) }}</span>
                <span class="block text-xs text-gray-600">{{ day.records.length }} {{ day.records.length === 1 ? 'vaca' : 'vacas' }}</span>
              </span>
            </span>
            <span class="text-lg font-semibold text-gray-900 tabular-nums shrink-0">{{ day.total_liters.toFixed(1) }} L</span>
          </button>

          <ul v-if="expandedDays[day.date]" class="border-t border-gray-200 divide-y divide-gray-100 px-2 sm:px-3">
            <li v-for="r in day.records" :key="r.id">
              <button
                v-if="correcting !== r.id"
                type="button"
                class="group w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-left hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                :aria-label="`Corregir registro de ${cowLabel(r)}, ${Number(r.liters).toFixed(1)} litros`"
                @click="correcting = r.id"
              >
                <span class="min-w-0 w-24 sm:w-32 shrink-0">
                  <span class="block text-sm font-medium text-gray-900 truncate">{{ cowLabel(r) }}</span>
                  <span v-if="r.animal?.name && r.animal?.ear_tag" class="block text-xs text-gray-600 truncate">{{ r.animal.name }}</span>
                </span>
                <span class="flex-1 min-w-0">
                  <span class="block bg-gray-100 rounded-full h-2 overflow-hidden">
                    <span class="block bg-sky-500 h-full rounded-full"
                      :style="{ width: ((Number(r.liters) / Math.max(day.total_liters, 1)) * 100).toFixed(1) + '%' }" />
                  </span>
                  <span v-if="r.notes" class="block text-xs text-gray-600 mt-1 truncate">{{ r.notes }}</span>
                </span>
                <span class="text-sm font-semibold text-gray-900 tabular-nums w-16 text-right shrink-0">{{ Number(r.liters).toFixed(1) }} L</span>
                <Pencil class="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-700 shrink-0" aria-hidden="true" />
              </button>
              <div v-else class="py-2">
                <MilkCorrectionForm
                  source="milk_records"
                  :entry="r"
                  :title="`${cowLabel(r)}, ${formatDay(r.recorded_date)}`"
                  @saved="onRecordSaved"
                  @deleted="onRecordDeleted"
                  @cancel="correcting = null"
                />
              </div>
            </li>
          </ul>
        </section>
      </div>
    </template>

    <!-- ═══════════════════ Historial de correcciones ═════════════════════ -->
    <section v-if="!pageLoading" class="card p-0 sm:p-0 overflow-hidden">
      <button
        type="button"
        class="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
        :aria-expanded="showLog"
        @click="showLog = !showLog"
      >
        <span class="card-title"><History aria-hidden="true" /> Historial de correcciones</span>
        <span class="flex items-center gap-2 text-sm text-gray-600">
          <span class="tabular-nums">{{ editLog.length }}</span>
          <ChevronDown class="w-4 h-4 transition-transform duration-200" :class="showLog ? '' : '-rotate-90'" aria-hidden="true" />
        </span>
      </button>
      <div v-if="showLog" class="border-t border-gray-200">
        <p v-if="!editLog.length" class="px-5 py-6 text-sm text-gray-600 text-center">
          Sin correcciones. Toca un registro para corregirlo con la clave.
        </p>
        <ul v-else class="divide-y divide-gray-100">
          <li v-for="e in editLog" :key="e.id" class="px-4 sm:px-5 py-3">
            <div class="flex items-baseline justify-between gap-3">
              <p class="text-sm font-medium text-gray-900">{{ logWhat(e) }}</p>
              <p class="text-xs text-gray-600 shrink-0">{{ formatStamp(e.edited_at) }}</p>
            </div>
            <p class="text-sm tabular-nums" :class="e.action === 'delete' ? 'text-red-700' : 'text-gray-800'">{{ logChange(e) }}</p>
            <p class="text-sm text-gray-600 mt-0.5">Motivo: {{ e.reason }}</p>
          </li>
        </ul>
      </div>
    </section>

    <!-- Cambiar clave -->
    <div v-if="!pageLoading" class="pb-2">
      <button
        v-if="!showPwForm"
        type="button"
        class="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 hover:underline min-h-[40px]"
        @click="showPwForm = true; pwForm.done = false; pwForm.error = ''"
      >
        <KeyRound class="w-4 h-4" aria-hidden="true" /> Cambiar clave de corrección
      </button>
      <p v-if="pwForm.done && !showPwForm" role="status" class="text-sm font-medium text-emerald-700">Clave cambiada.</p>

      <form v-if="showPwForm" class="card space-y-3 max-w-md" @submit.prevent="submitPassword">
        <h2 class="card-title"><KeyRound aria-hidden="true" /> Cambiar clave de corrección</h2>
        <p class="text-sm text-gray-600">Necesitas la clave actual. Usa al menos 4 caracteres.</p>
        <div class="space-y-3">
          <div>
            <label for="pw-current" class="block text-sm font-medium text-gray-700 mb-1">Clave actual</label>
            <input id="pw-current" v-model="pwForm.current" type="password" autocomplete="current-password" class="form-input" required />
          </div>
          <div>
            <label for="pw-next" class="block text-sm font-medium text-gray-700 mb-1">Clave nueva</label>
            <input id="pw-next" v-model="pwForm.next" type="password" autocomplete="new-password" class="form-input" required />
          </div>
          <div>
            <label for="pw-confirm" class="block text-sm font-medium text-gray-700 mb-1">Repite la clave nueva</label>
            <input id="pw-confirm" v-model="pwForm.confirm" type="password" autocomplete="new-password" class="form-input" required />
          </div>
        </div>
        <p v-if="pwForm.error" role="alert" class="text-sm font-medium text-red-700">{{ pwForm.error }}</p>
        <div class="flex justify-end gap-2">
          <BaseButton variant="secondary" size="sm" @click="showPwForm = false">Cancelar</BaseButton>
          <BaseButton type="submit" size="sm" :loading="pwForm.saving" :disabled="!pwForm.current || !pwForm.next">
            Cambiar clave
          </BaseButton>
        </div>
      </form>
    </div>

  </div>
</template>
