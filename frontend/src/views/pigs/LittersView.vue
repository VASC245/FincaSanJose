<script setup lang="ts">
import { onMounted, ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  Baby, ChevronDown, ChevronRight, Plus, Check, Loader,
  Pencil, X, Syringe, PiggyBank, Heart, Trash2
} from 'lucide-vue-next'
import BaseModal from '@/components/shared/BaseModal.vue'
import BaseInput from '@/components/shared/BaseInput.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import VaccinationForm from '@/components/animals/VaccinationForm.vue'
import { fetchAllLitters, createBatchVaccinationRecords, updateLitter, deleteLitter, type LitterWithSow } from '@/services/vaccinationService'
import { fetchPigletsByLitter, deletePigletsByLitter, updatePigletsBirthDate } from '@/services/animalService'
import { fetchItems, createMovement } from '@/services/inventoryService'
import {
  fetchHeatRecords, createHeatRecord, deleteHeatRecord,
  calcNextHeat, calcExpectedBirth, daysUntil, stageConfig,
  calcPigStage, pigAgeLabel
} from '@/services/pigService'
import { useAnimalsStore } from '@/stores/animals'
import type { Animal, AnimalFormData, InventoryItem, HeatRecord, LitterFormData } from '@/types'

const router = useRouter()
const animalsStore = useAnimalsStore()

const litters = ref<LitterWithSow[]>([])
const pageLoading = ref(true)

onMounted(async () => {
  try { litters.value = await fetchAllLitters() }
  finally { pageLoading.value = false }
})

// ─── Expand state ─────────────────────────────────────────────────────────────

const expanded = ref<Record<string, boolean>>({})
const piglets = ref<Record<string, Animal[]>>({})
const loadingPiglets = ref<Record<string, boolean>>({})

async function toggle(litter: LitterWithSow) {
  expanded.value[litter.id] = !expanded.value[litter.id]
  if (expanded.value[litter.id] && !piglets.value[litter.id]) await loadPiglets(litter)
}

async function loadPiglets(litter: LitterWithSow) {
  loadingPiglets.value[litter.id] = true
  try { piglets.value[litter.id] = await fetchPigletsByLitter(litter.sow_id, litter.birth_date) }
  finally { loadingPiglets.value[litter.id] = false }
}

// ─── Agregar lechón ───────────────────────────────────────────────────────────

interface AddForm { ear_tag: string; sex: 'male' | 'female'; saving: boolean }
const addForms = ref<Record<string, AddForm>>({})
function getAddForm(id: string): AddForm {
  if (!addForms.value[id]) addForms.value[id] = { ear_tag: '', sex: 'female', saving: false }
  return addForms.value[id]
}

async function savePiglet(litter: LitterWithSow) {
  const form = getAddForm(litter.id)
  if (!form.ear_tag.trim()) return
  form.saving = true
  try {
    const payload: AnimalFormData = {
      ear_tag: form.ear_tag.trim(), name: null, sex: form.sex,
      species: 'pig', birth_date: litter.birth_date, status: 'active',
      stage: null, mother_id: litter.sow_id, notes: null
    }
    const animal = await animalsStore.addAnimal(payload)
    if (!piglets.value[litter.id]) piglets.value[litter.id] = []
    piglets.value[litter.id].push(animal)
    form.ear_tag = ''; form.sex = 'female'
  } catch (e) { alert('Error: ' + (e as Error).message) }
  finally { form.saving = false }
}

// ─── Editar lechón (arete/sexo) ───────────────────────────────────────────────

const editingId = ref<string | null>(null)
const editForm = reactive({ ear_tag: '', sex: 'female' as 'male' | 'female', saving: false })

function startEdit(piglet: Animal) {
  editingId.value = piglet.id
  editForm.ear_tag = piglet.ear_tag ?? ''
  editForm.sex = piglet.sex as 'male' | 'female'
  editForm.saving = false
}
function cancelEdit() { editingId.value = null }

async function saveEdit(litterId: string) {
  if (!editingId.value || !editForm.ear_tag.trim()) return
  editForm.saving = true
  try {
    await animalsStore.editAnimal(editingId.value, { ear_tag: editForm.ear_tag.trim(), sex: editForm.sex })
    const list = piglets.value[litterId]
    if (list) {
      const idx = list.findIndex(p => p.id === editingId.value)
      if (idx !== -1) list[idx] = { ...list[idx], ear_tag: editForm.ear_tag.trim(), sex: editForm.sex }
    }
    editingId.value = null
  } catch (e) { alert('Error: ' + (e as Error).message) }
  finally { editForm.saving = false }
}

// ─── Celo (heat records) ──────────────────────────────────────────────────────

interface HeatTarget { piglet: Animal; records: HeatRecord[]; loading: boolean }
const heatTarget = ref<HeatTarget | null>(null)

const heatForm = reactive({
  observed_date: new Date().toISOString().slice(0, 10),
  notes: '',
  saving: false
})

async function openHeat(piglet: Animal) {
  heatTarget.value = { piglet, records: [], loading: true }
  try {
    heatTarget.value.records = await fetchHeatRecords(piglet.id)
  } finally {
    if (heatTarget.value) heatTarget.value.loading = false
  }
  heatForm.observed_date = new Date().toISOString().slice(0, 10)
  heatForm.notes = ''
  heatForm.saving = false
}

function closeHeat() { heatTarget.value = null }

async function submitHeat() {
  if (!heatTarget.value || !heatForm.observed_date) return
  heatForm.saving = true
  try {
    const record = await createHeatRecord({
      animal_id: heatTarget.value.piglet.id,
      observed_date: heatForm.observed_date,
      notes: heatForm.notes || null
    })
    heatTarget.value.records.unshift(record)
    heatForm.observed_date = new Date().toISOString().slice(0, 10)
    heatForm.notes = ''
  } catch (e) { alert('Error: ' + (e as Error).message) }
  finally { heatForm.saving = false }
}

async function removeHeat(id: string) {
  if (!heatTarget.value || !confirm('¿Eliminar este registro de celo?')) return
  await deleteHeatRecord(id)
  heatTarget.value.records = heatTarget.value.records.filter(r => r.id !== id)
}

// ─── Vacuna individual ────────────────────────────────────────────────────────

const vaccinePiglet = ref<Animal | null>(null)

// ─── Vacuna masiva ────────────────────────────────────────────────────────────

const inventoryItems = ref<InventoryItem[]>([])
const inventoryLoaded = ref(false)
async function ensureInventory() {
  if (!inventoryLoaded.value) { inventoryItems.value = await fetchItems(); inventoryLoaded.value = true }
}

interface BatchTarget { litter: LitterWithSow; piglets: Animal[] }
const batchTarget = ref<BatchTarget | null>(null)
const batchForm = reactive({
  inventory_item_id: '', applied_date: new Date().toISOString().slice(0, 10),
  next_date: '', applied_by: '', notes: '', saving: false, quantity_per_dose: 1
})
const batchSearch = ref('')
const batchFilteredItems = computed(() => {
  if (!batchSearch.value.trim()) return inventoryItems.value
  const q = batchSearch.value.toLowerCase()
  return inventoryItems.value.filter(i => i.name.toLowerCase().includes(q))
})
const batchSelectedItem = computed(() => inventoryItems.value.find(i => i.id === batchForm.inventory_item_id) ?? null)

async function openBatchVaccine(litter: LitterWithSow) {
  await ensureInventory()
  batchTarget.value = { litter, piglets: piglets.value[litter.id] ?? [] }
  Object.assign(batchForm, {
    inventory_item_id: '', applied_date: new Date().toISOString().slice(0, 10),
    next_date: '', applied_by: '', notes: '', saving: false, quantity_per_dose: 1
  })
  batchSearch.value = ''
}

async function submitBatchVaccine() {
  if (!batchTarget.value || !batchForm.inventory_item_id) return
  const animalIds = batchTarget.value.piglets.map(p => p.id)
  if (!animalIds.length) return
  batchForm.saving = true
  try {
    await createBatchVaccinationRecords(animalIds, {
      vaccine_id: null, inventory_item_id: batchForm.inventory_item_id,
      applied_date: batchForm.applied_date, next_date: batchForm.next_date || null,
      applied_by: batchForm.applied_by || null, notes: batchForm.notes || null
    })
    await createMovement({
      item_id: batchForm.inventory_item_id,
      type: 'out',
      quantity: animalIds.length * batchForm.quantity_per_dose,
      date: batchForm.applied_date,
      notes: `Vacunación masiva — ${animalIds.length} lechones`
    })
    batchTarget.value = null
  } catch (e) { alert('Error: ' + (e as Error).message) }
  finally { batchForm.saving = false }
}

// ─── Eliminar camada ──────────────────────────────────────────────────────────

const deletingId = ref<string | null>(null)

async function removeLitter(litter: LitterWithSow) {
  if (!confirm('¿Eliminar esta camada y sus lechones asociados?')) return
  deletingId.value = litter.id
  try {
    await deletePigletsByLitter(litter.sow_id, litter.birth_date)
    await deleteLitter(litter.id)
    litters.value = litters.value.filter((l) => l.id !== litter.id)
    delete piglets.value[litter.id]
    delete expanded.value[litter.id]
    animalsStore.removePigletsByLitter(litter.sow_id, litter.birth_date)
  } catch (e) {
    alert('Error: ' + (e as Error).message)
  } finally {
    deletingId.value = null
  }
}

// ─── Editar camada ────────────────────────────────────────────────────────────

const editingLitterId = ref<string | null>(null)
const litterEditForm = reactive({
  birth_date: '',
  total_born: 0,
  born_alive: 0,
  notes: '' as string | null,
  saving: false
})

function startEditLitter(litter: LitterWithSow) {
  editingLitterId.value = litter.id
  litterEditForm.birth_date = litter.birth_date
  litterEditForm.total_born = litter.total_born
  litterEditForm.born_alive = litter.born_alive
  litterEditForm.notes = litter.notes ?? ''
  litterEditForm.saving = false
}

function cancelEditLitter() { editingLitterId.value = null }

async function saveEditLitter() {
  if (!editingLitterId.value) return
  litterEditForm.saving = true
  const current = litters.value.find((l) => l.id === editingLitterId.value)
  const oldBirthDate = current?.birth_date
  const newBirthDate = litterEditForm.birth_date
  try {
    const updated = await updateLitter(editingLitterId.value, {
      birth_date: newBirthDate,
      total_born: litterEditForm.total_born,
      born_alive: litterEditForm.born_alive,
      notes: litterEditForm.notes || null
    })
    const idx = litters.value.findIndex((l) => l.id === editingLitterId.value)
    if (idx !== -1) litters.value[idx] = { ...litters.value[idx], ...updated }

    if (oldBirthDate && newBirthDate !== oldBirthDate && current) {
      await updatePigletsBirthDate(current.sow_id, oldBirthDate, newBirthDate)
      if (piglets.value[editingLitterId.value]) {
        piglets.value[editingLitterId.value] = piglets.value[editingLitterId.value].map((p) => ({
          ...p, birth_date: newBirthDate
        }))
      }
      animalsStore.updatePigletsBirthDateLocal(current.sow_id, oldBirthDate, newBirthDate)
    } else {
      delete piglets.value[editingLitterId.value]
    }
    editingLitterId.value = null
  } catch (e) {
    alert('Error: ' + (e as Error).message)
  } finally {
    litterEditForm.saving = false
  }
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysLabel(days: number): string {
  if (days === 0) return 'hoy'
  if (days < 0) return `hace ${Math.abs(days)} días`
  return `en ${days} días`
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-xl font-bold text-gray-900 flex items-center gap-2">
        <Baby class="w-5 h-5 text-pink-500" /> Camadas
      </h1>
      <p class="text-sm text-gray-500 mt-0.5">{{ litters.length }} camadas registradas</p>
    </div>

    <div v-if="pageLoading" class="card text-center py-16 text-gray-400">Cargando camadas...</div>
    <div v-else-if="!litters.length" class="card text-center py-16 text-gray-400">No hay camadas registradas.</div>

    <div v-else class="space-y-3">
      <div v-for="litter in litters" :key="litter.id" class="rounded-xl border border-gray-200 overflow-hidden shadow-sm">

        <!-- Cabecera — modo edición -->
        <div v-if="editingLitterId === litter.id" class="px-4 py-4 bg-amber-50 border-b border-amber-100 space-y-3">
          <p class="text-xs font-semibold text-amber-700 uppercase tracking-wide">Editar camada</p>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div class="col-span-2 sm:col-span-1">
              <label class="block text-xs text-gray-500 mb-1">Fecha de nacimiento</label>
              <input v-model="litterEditForm.birth_date" type="date" class="form-input text-sm" />
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">Total nacidos</label>
              <input v-model.number="litterEditForm.total_born" type="number" min="0" class="form-input text-sm" />
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">Nacidos vivos</label>
              <input v-model.number="litterEditForm.born_alive" type="number" min="0" class="form-input text-sm" />
            </div>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Notas</label>
            <input v-model="litterEditForm.notes" type="text" class="form-input text-sm" placeholder="Opcional..." />
          </div>
          <div class="flex justify-end gap-2">
            <button class="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg text-gray-600 hover:bg-gray-100"
              @click="cancelEditLitter">
              <X class="w-3.5 h-3.5" /> Cancelar
            </button>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              :disabled="litterEditForm.saving" @click="saveEditLitter">
              <Loader v-if="litterEditForm.saving" class="w-3.5 h-3.5 animate-spin" />
              <Check v-else class="w-3.5 h-3.5" />
              Guardar
            </button>
          </div>
        </div>

        <!-- Cabecera — modo vista -->
        <button v-else type="button"
          class="w-full flex items-center justify-between px-4 py-4 bg-white hover:bg-gray-50 transition-colors text-left"
          @click="toggle(litter)"
        >
          <div class="flex items-center gap-3">
            <component :is="expanded[litter.id] ? ChevronDown : ChevronRight" class="w-4 h-4 text-gray-400 shrink-0" />
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-semibold text-gray-800">{{ formatDate(litter.birth_date) }}</span>
                <button type="button" class="flex items-center gap-1 text-xs text-primary-600 hover:underline"
                  @click.stop="router.push(`/pigs/${litter.sow.id}`)">
                  <PiggyBank class="w-3 h-3" />
                  {{ litter.sow.ear_tag ?? 'Sin arete' }}
                  <span v-if="litter.sow.name" class="text-gray-400">· {{ litter.sow.name }}</span>
                </button>
              </div>
              <p class="text-xs text-gray-500 mt-0.5">{{ litter.total_born }} nacidos · {{ litter.born_alive }} vivos</p>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button class="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
              title="Editar camada" @click.stop="startEditLitter(litter)">
              <Pencil class="w-3.5 h-3.5" />
            </button>
            <button class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Eliminar camada" :disabled="deletingId === litter.id" @click.stop="removeLitter(litter)">
              <Loader v-if="deletingId === litter.id" class="w-3.5 h-3.5 animate-spin" />
              <Trash2 v-else class="w-3.5 h-3.5" />
            </button>
            <div class="text-right ml-1">
              <span class="text-2xl font-bold text-pink-500">{{ litter.born_alive }}</span>
              <p class="text-xs text-gray-400">vivos</p>
            </div>
          </div>
        </button>

        <!-- Panel expandible -->
        <div v-if="expanded[litter.id] && editingLitterId !== litter.id" class="border-t border-gray-100 bg-gray-50 px-4 py-4 space-y-4">
          <p v-if="litter.notes" class="text-xs text-gray-500 italic">{{ litter.notes }}</p>
          <div v-if="loadingPiglets[litter.id]" class="text-center py-4 text-sm text-gray-400">Cargando lechones...</div>

          <template v-else>
            <!-- Encabezado + vacunar todos -->
            <div class="flex items-center justify-between">
              <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Lechones{{ piglets[litter.id]?.length ? ` (${piglets[litter.id].length})` : '' }}
              </p>
              <button v-if="piglets[litter.id]?.length" type="button"
                class="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                @click="openBatchVaccine(litter)">
                <Syringe class="w-3.5 h-3.5" /> Vacunar toda la camada
              </button>
            </div>

            <!-- Lista lechones -->
            <div v-if="piglets[litter.id]?.length"
              class="rounded-lg border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
              <div v-for="piglet in piglets[litter.id]" :key="piglet.id" class="px-3 py-2.5">

                <!-- Modo edición (arete/sexo) -->
                <div v-if="editingId === piglet.id" class="flex items-center gap-2">
                  <input v-model="editForm.ear_tag" class="form-input text-sm flex-1 min-w-0 py-1" placeholder="Nº Arete"
                    @keyup.enter="saveEdit(litter.id)" @keyup.escape="cancelEdit" />
                  <select v-model="editForm.sex" class="form-select text-sm w-28 py-1 shrink-0">
                    <option value="female">Hembra</option>
                    <option value="male">Macho</option>
                  </select>
                  <button class="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 shrink-0"
                    :disabled="editForm.saving" @click="saveEdit(litter.id)">
                    <Loader v-if="editForm.saving" class="w-3.5 h-3.5 animate-spin" />
                    <Check v-else class="w-3.5 h-3.5" />
                  </button>
                  <button class="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 shrink-0"
                    @click="cancelEdit">
                    <X class="w-3.5 h-3.5" />
                  </button>
                </div>

                <!-- Modo vista -->
                <div v-else class="flex items-center gap-2 flex-wrap">
                  <!-- Arete + sexo -->
                  <span class="text-sm font-medium text-gray-800 w-24 truncate shrink-0">
                    {{ piglet.ear_tag ?? '—' }}
                  </span>
                  <span class="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                    :class="piglet.sex === 'female' ? 'bg-pink-50 text-pink-700' : 'bg-blue-50 text-blue-700'">
                    {{ piglet.sex === 'female' ? 'Hembra' : 'Macho' }}
                  </span>

                  <!-- Edad + etapa automática -->
                  <span class="text-xs text-gray-400 shrink-0 w-8 text-right">
                    {{ pigAgeLabel(piglet.birth_date) }}
                  </span>
                  <span
                    v-if="calcPigStage(piglet.birth_date)"
                    class="text-xs px-2 py-0.5 rounded-full font-medium border shrink-0"
                    :class="stageConfig[calcPigStage(piglet.birth_date)!].class"
                  >
                    {{ stageConfig[calcPigStage(piglet.birth_date)!].label }}
                  </span>

                  <!-- Acciones -->
                  <div class="flex items-center gap-1 ml-auto shrink-0">
                    <button class="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      title="Editar arete/sexo" @click="startEdit(piglet)">
                      <Pencil class="w-3.5 h-3.5" />
                    </button>
                    <button class="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      title="Vacuna individual" @click="vaccinePiglet = piglet">
                      <Syringe class="w-3.5 h-3.5" />
                    </button>
                    <button v-if="piglet.sex === 'female'"
                      class="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Registrar celo" @click="openHeat(piglet)">
                      <Heart class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <p v-else class="text-xs text-gray-400 italic py-2">Sin lechones registrados aún.</p>

            <!-- Agregar lechón -->
            <div>
              <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Agregar lechón</p>
              <div class="flex items-center gap-2">
                <input v-model="getAddForm(litter.id).ear_tag" type="text" class="form-input text-sm flex-1 min-w-0"
                  placeholder="Nº Arete (ej. CER-015)" @keyup.enter="savePiglet(litter)" />
                <select v-model="getAddForm(litter.id).sex" class="form-select text-sm w-32 shrink-0">
                  <option value="female">Hembra</option>
                  <option value="male">Macho</option>
                </select>
                <button type="button"
                  class="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 shrink-0"
                  :disabled="!getAddForm(litter.id).ear_tag.trim() || getAddForm(litter.id).saving"
                  @click="savePiglet(litter)">
                  <Loader v-if="getAddForm(litter.id).saving" class="w-4 h-4 animate-spin" />
                  <Plus v-else class="w-4 h-4" />
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Modal: vacuna individual -->
    <VaccinationForm v-if="vaccinePiglet" :open="!!vaccinePiglet" :animal-id="vaccinePiglet.id"
      species="pig" @close="vaccinePiglet = null" @added="vaccinePiglet = null" />

    <!-- Modal: vacunar toda la camada -->
    <BaseModal :open="!!batchTarget" title="Vacunar toda la camada" @close="batchTarget = null">
      <div v-if="batchTarget" class="space-y-4">
        <div class="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          <p class="text-sm font-semibold text-emerald-800 flex items-center gap-2">
            <Syringe class="w-4 h-4" /> Se aplicará a {{ batchTarget.piglets.length }} lechones
          </p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <span v-for="p in batchTarget.piglets" :key="p.id"
              class="text-xs bg-white border border-emerald-200 text-emerald-700 rounded-full px-2 py-0.5">
              {{ p.ear_tag ?? 'Sin arete' }}
            </span>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Producto / Vacuna *</label>
          <input v-model="batchSearch" type="text" class="form-input mb-1.5" placeholder="Buscar en inventario..." />
          <select v-model="batchForm.inventory_item_id" required class="form-select">
            <option value="">Seleccionar producto...</option>
            <option v-for="item in batchFilteredItems" :key="item.id" :value="item.id">
              {{ item.name }}<template v-if="item.category?.name"> · {{ item.category.name }}</template>
              ({{ item.quantity }} {{ item.unit }})
            </option>
          </select>
          <p v-if="batchSelectedItem" class="mt-1 text-xs"
            :class="batchSelectedItem.quantity <= batchSelectedItem.min_quantity ? 'text-red-500' : 'text-gray-400'">
            Stock: {{ batchSelectedItem.quantity }} {{ batchSelectedItem.unit }}
            <span v-if="batchSelectedItem.quantity <= batchSelectedItem.min_quantity"> — Stock bajo</span>
          </p>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <BaseInput v-model="batchForm.applied_date" label="Fecha aplicación" type="date" required />
          <BaseInput v-model="batchForm.next_date" label="Próxima aplicación" type="date" />
        </div>
        <BaseInput
          v-model.number="batchForm.quantity_per_dose"
          label="Cantidad por dosis"
          type="number"
          :min="0.01"
          step="0.01"
          required
        />
        <p v-if="batchTarget" class="text-xs text-slate-500">
          Total a descontar: {{ (batchForm.quantity_per_dose * batchTarget.piglets.length).toFixed(2) }}
          {{ batchSelectedItem?.unit ?? '' }}
        </p>
        <BaseInput v-model="batchForm.applied_by" label="Aplicado por" placeholder="ej. Veterinario" />
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Notas</label>
          <textarea v-model="batchForm.notes" rows="2" class="form-input" placeholder="Observaciones..." />
        </div>
      </div>
      <template #footer>
        <BaseButton variant="secondary" @click="batchTarget = null">Cancelar</BaseButton>
        <BaseButton :loading="batchForm.saving" :disabled="!batchForm.inventory_item_id" @click="submitBatchVaccine">
          <Syringe class="w-4 h-4" /> Aplicar a {{ batchTarget?.piglets.length ?? 0 }} lechones
        </BaseButton>
      </template>
    </BaseModal>

    <!-- Modal: registrar celo -->
    <BaseModal :open="!!heatTarget" title="Registro de celo" @close="closeHeat">
      <div v-if="heatTarget" class="space-y-4">

        <!-- Info del animal -->
        <div class="flex items-center gap-2 text-sm text-gray-700 font-medium">
          <Heart class="w-4 h-4 text-rose-500" />
          {{ heatTarget.piglet.ear_tag ?? 'Sin arete' }}
          <span v-if="heatTarget.piglet.name" class="text-gray-400">· {{ heatTarget.piglet.name }}</span>
        </div>

        <!-- Historial de celos -->
        <div v-if="heatTarget.loading" class="text-center py-4 text-sm text-gray-400">Cargando...</div>
        <div v-else-if="heatTarget.records.length" class="space-y-2">
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Historial</p>
          <div class="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div v-for="r in heatTarget.records" :key="r.id" class="px-3 py-2.5 space-y-1.5">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <p class="text-sm font-medium text-gray-800">{{ formatDate(r.observed_date) }}</p>
                  <p v-if="r.notes" class="text-xs text-gray-500 mt-0.5">{{ r.notes }}</p>
                </div>
                <button class="p-1 text-gray-300 hover:text-red-500 transition-colors shrink-0"
                  @click="removeHeat(r.id)">
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
              <!-- Cálculos -->
              <div class="grid grid-cols-2 gap-2">
                <div class="bg-rose-50 rounded-lg px-2.5 py-1.5">
                  <p class="text-xs text-rose-500 font-medium">Inseminación</p>
                  <p class="text-xs text-rose-800 font-semibold">{{ formatDate(r.observed_date) }}</p>
                  <p class="text-xs text-rose-500">mismo día – siguiente</p>
                </div>
                <div class="rounded-lg px-2.5 py-1.5"
                  :class="daysUntil(calcNextHeat(r.observed_date)) < 0 ? 'bg-gray-50' : 'bg-amber-50'">
                  <p class="text-xs font-medium" :class="daysUntil(calcNextHeat(r.observed_date)) < 0 ? 'text-gray-400' : 'text-amber-600'">
                    Próximo celo
                  </p>
                  <p class="text-xs font-semibold" :class="daysUntil(calcNextHeat(r.observed_date)) < 0 ? 'text-gray-600' : 'text-amber-800'">
                    {{ formatDate(calcNextHeat(r.observed_date)) }}
                  </p>
                  <p class="text-xs" :class="daysUntil(calcNextHeat(r.observed_date)) < 0 ? 'text-gray-400' : 'text-amber-600'">
                    {{ daysLabel(daysUntil(calcNextHeat(r.observed_date))) }}
                  </p>
                </div>
                <div class="bg-blue-50 rounded-lg px-2.5 py-1.5 col-span-2">
                  <p class="text-xs text-blue-500 font-medium">Parto esperado (si inseminó)</p>
                  <p class="text-xs text-blue-800 font-semibold">
                    {{ formatDate(calcExpectedBirth(r.observed_date)) }}
                    <span class="font-normal text-blue-500 ml-1">({{ daysLabel(daysUntil(calcExpectedBirth(r.observed_date))) }})</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p v-else-if="!heatTarget.loading" class="text-xs text-gray-400 italic">Sin registros de celo aún.</p>

        <!-- Formulario nuevo celo -->
        <div class="border-t border-gray-100 pt-4 space-y-3">
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Registrar nuevo celo</p>
          <BaseInput v-model="heatForm.observed_date" label="Fecha observada" type="date" required />
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea v-model="heatForm.notes" rows="2" class="form-input" placeholder="Observaciones..." />
          </div>
        </div>
      </div>
      <template #footer>
        <BaseButton variant="secondary" @click="closeHeat">Cerrar</BaseButton>
        <BaseButton :loading="heatForm.saving" @click="submitHeat">
          <Heart class="w-4 h-4" /> Guardar celo
        </BaseButton>
      </template>
    </BaseModal>
  </div>
</template>
