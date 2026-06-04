<script setup lang="ts">
import { onMounted, ref, reactive } from 'vue'
import { Baby, ChevronDown, ChevronRight, Plus, Check, Loader, Pencil, X, Trash2, Save } from 'lucide-vue-next'
import { usePigsStore } from '@/stores/pigs'
import { useAnimalsStore } from '@/stores/animals'
import { fetchPigletsByLitter, deletePigletsByLitter, updatePigletsBirthDate } from '@/services/animalService'
import { updateLitter, deleteLitter } from '@/services/vaccinationService'
import type { Animal, AnimalFormData } from '@/types'

const props = defineProps<{ motherId: string }>()
const pigsStore = usePigsStore()
const animalsStore = useAnimalsStore()

onMounted(() => pigsStore.loadLitters(props.motherId))

// ─── Expand state ─────────────────────────────────────────────────────────────

const expanded = ref<Record<string, boolean>>({})
const piglets = ref<Record<string, Animal[]>>({})
const loadingPiglets = ref<Record<string, boolean>>({})

async function toggle(litterId: string, birthDate: string) {
  expanded.value[litterId] = !expanded.value[litterId]
  if (expanded.value[litterId] && !piglets.value[litterId]) {
    await loadPiglets(litterId, birthDate)
  }
}

async function loadPiglets(litterId: string, birthDate: string) {
  loadingPiglets.value[litterId] = true
  try {
    piglets.value[litterId] = await fetchPigletsByLitter(props.motherId, birthDate)
  } finally {
    loadingPiglets.value[litterId] = false
  }
}

// ─── Eliminar camada ──────────────────────────────────────────────────────────

const deletingId = ref<string | null>(null)

async function removeLitter(id: string, birthDate: string) {
  if (!confirm('¿Eliminar esta camada y todos sus lechones asociados?')) return
  deletingId.value = id
  try {
    await deletePigletsByLitter(props.motherId, birthDate)
    await deleteLitter(id)
    pigsStore.litters = pigsStore.litters.filter((l) => l.id !== id)
    delete piglets.value[id]
    delete expanded.value[id]
    animalsStore.removePigletsByLitter(props.motherId, birthDate)
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

function startEditLitter(litter: { id: string; birth_date: string; total_born: number; born_alive: number; notes: string | null }) {
  editingLitterId.value = litter.id
  litterEditForm.birth_date = litter.birth_date
  litterEditForm.total_born = litter.total_born
  litterEditForm.born_alive = litter.born_alive
  litterEditForm.notes = litter.notes ?? ''
  litterEditForm.saving = false
}

function cancelEditLitter() {
  editingLitterId.value = null
}

async function saveEditLitter() {
  if (!editingLitterId.value) return
  litterEditForm.saving = true
  const oldBirthDate = pigsStore.litters.find((l) => l.id === editingLitterId.value)?.birth_date
  const newBirthDate = litterEditForm.birth_date
  try {
    const updated = await updateLitter(editingLitterId.value, {
      birth_date: newBirthDate,
      total_born: litterEditForm.total_born,
      born_alive: litterEditForm.born_alive,
      notes: litterEditForm.notes || null
    })
    const idx = pigsStore.litters.findIndex((l) => l.id === editingLitterId.value)
    if (idx !== -1) pigsStore.litters[idx] = updated

    // Si la fecha cambió, actualizar birth_date de todos los lechones
    if (oldBirthDate && newBirthDate !== oldBirthDate) {
      await updatePigletsBirthDate(props.motherId, oldBirthDate, newBirthDate)
      if (piglets.value[editingLitterId.value]) {
        piglets.value[editingLitterId.value] = piglets.value[editingLitterId.value].map((p) => ({
          ...p, birth_date: newBirthDate
        }))
      }
      animalsStore.updatePigletsBirthDateLocal(props.motherId, oldBirthDate, newBirthDate)
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

// ─── Agregar lechón ───────────────────────────────────────────────────────────

interface AddForm { ear_tag: string; sex: 'male' | 'female'; saving: boolean }
const addForms = ref<Record<string, AddForm>>({})

function getAddForm(id: string): AddForm {
  if (!addForms.value[id]) addForms.value[id] = { ear_tag: '', sex: 'female', saving: false }
  return addForms.value[id]
}

async function savePiglet(litterId: string, birthDate: string) {
  const form = getAddForm(litterId)
  if (!form.ear_tag.trim()) return
  form.saving = true
  try {
    const payload: AnimalFormData = {
      ear_tag: form.ear_tag.trim(),
      name: null,
      sex: form.sex,
      species: 'pig',
      birth_date: birthDate,
      status: 'active',
      stage: null,
      mother_id: props.motherId,
      notes: null
    }
    const animal = await animalsStore.addAnimal(payload)
    if (!piglets.value[litterId]) piglets.value[litterId] = []
    piglets.value[litterId].push(animal)
    form.ear_tag = ''
    form.sex = 'female'
  } catch (e) {
    alert('Error: ' + (e as Error).message)
  } finally {
    form.saving = false
  }
}

// ─── Editar lechón ────────────────────────────────────────────────────────────

const editingId = ref<string | null>(null)
const editForm = reactive({ ear_tag: '', sex: 'female' as 'male' | 'female', saving: false })

function startEdit(piglet: Animal) {
  editingId.value = piglet.id
  editForm.ear_tag = piglet.ear_tag ?? ''
  editForm.sex = piglet.sex as 'male' | 'female'
  editForm.saving = false
}

function cancelEdit() {
  editingId.value = null
}

async function saveEdit(litterId: string) {
  if (!editingId.value || !editForm.ear_tag.trim()) return
  editForm.saving = true
  try {
    await animalsStore.editAnimal(editingId.value, {
      ear_tag: editForm.ear_tag.trim(),
      sex: editForm.sex
    })
    const list = piglets.value[litterId]
    if (list) {
      const idx = list.findIndex((p) => p.id === editingId.value)
      if (idx !== -1) {
        list[idx] = { ...list[idx], ear_tag: editForm.ear_tag.trim(), sex: editForm.sex }
      }
    }
    editingId.value = null
  } catch (e) {
    alert('Error: ' + (e as Error).message)
  } finally {
    editForm.saving = false
  }
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="space-y-3">
    <h3 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
      <Baby class="w-4 h-4 text-pink-500" />
      Camadas registradas
    </h3>

    <div v-if="pigsStore.loading" class="text-center py-6 text-sm text-gray-400">Cargando...</div>

    <div v-else-if="!pigsStore.litters.length" class="text-center py-6 text-sm text-gray-400">
      No hay camadas registradas.
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="litter in pigsStore.litters"
        :key="litter.id"
        class="rounded-xl border border-gray-100 overflow-hidden"
      >
        <!-- Cabecera — modo edición -->
        <div
          v-if="editingLitterId === litter.id"
          class="px-4 py-3 bg-amber-50 border-b border-amber-100 space-y-3"
        >
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
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg text-gray-600 hover:bg-gray-100"
              @click="cancelEditLitter"
            >
              <X class="w-3.5 h-3.5" /> Cancelar
            </button>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              :disabled="litterEditForm.saving"
              @click="saveEditLitter"
            >
              <Loader v-if="litterEditForm.saving" class="w-3.5 h-3.5 animate-spin" />
              <Save v-else class="w-3.5 h-3.5" />
              Guardar
            </button>
          </div>
        </div>

        <!-- Cabecera — modo vista -->
        <button
          v-else
          type="button"
          class="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left"
          @click="toggle(litter.id, litter.birth_date)"
        >
          <div class="flex items-center gap-3">
            <component
              :is="expanded[litter.id] ? ChevronDown : ChevronRight"
              class="w-4 h-4 text-gray-400 shrink-0"
            />
            <div>
              <p class="text-sm font-medium text-gray-800">{{ formatDate(litter.birth_date) }}</p>
              <p class="text-xs text-gray-500">{{ litter.total_born }} nacidos · {{ litter.born_alive }} vivos</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
              title="Editar camada"
              @click.stop="startEditLitter(litter)"
            >
              <Pencil class="w-3.5 h-3.5" />
            </button>
            <button
              class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Eliminar camada"
              :disabled="deletingId === litter.id"
              @click.stop="removeLitter(litter.id, litter.birth_date)"
            >
              <Loader v-if="deletingId === litter.id" class="w-3.5 h-3.5 animate-spin" />
              <Trash2 v-else class="w-3.5 h-3.5" />
            </button>
            <div class="text-right ml-1">
              <span class="text-xl font-bold text-pink-500">{{ litter.born_alive }}</span>
              <p class="text-xs text-gray-400">vivos</p>
            </div>
          </div>
        </button>

        <!-- Panel expandible -->
        <div v-if="expanded[litter.id] && editingLitterId !== litter.id" class="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-3">
          <p v-if="litter.notes" class="text-xs text-gray-500 italic">{{ litter.notes }}</p>

          <div v-if="loadingPiglets[litter.id]" class="text-center py-3 text-xs text-gray-400">
            Cargando lechones...
          </div>

          <template v-else>
            <div v-if="piglets[litter.id]?.length" class="space-y-1">
              <p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Lechones ({{ piglets[litter.id].length }})
              </p>
              <div class="rounded-lg border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
                <div
                  v-for="piglet in piglets[litter.id]"
                  :key="piglet.id"
                  class="flex items-center gap-2 px-3 py-2"
                >
                  <template v-if="editingId === piglet.id">
                    <input
                      v-model="editForm.ear_tag"
                      class="form-input text-sm flex-1 min-w-0 py-1"
                      placeholder="Arete"
                      @keyup.enter="saveEdit(litter.id)"
                      @keyup.escape="cancelEdit"
                    />
                    <select v-model="editForm.sex" class="form-select text-sm w-28 py-1 shrink-0">
                      <option value="female">Hembra</option>
                      <option value="male">Macho</option>
                    </select>
                    <button
                      class="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 shrink-0"
                      :disabled="editForm.saving"
                      @click="saveEdit(litter.id)"
                    >
                      <Loader v-if="editForm.saving" class="w-3.5 h-3.5 animate-spin" />
                      <Check v-else class="w-3.5 h-3.5" />
                    </button>
                    <button
                      class="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 shrink-0"
                      @click="cancelEdit"
                    >
                      <X class="w-3.5 h-3.5" />
                    </button>
                  </template>

                  <template v-else>
                    <span class="text-sm font-medium text-gray-800 flex-1">{{ piglet.ear_tag ?? '—' }}</span>
                    <span
                      class="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                      :class="piglet.sex === 'female' ? 'bg-pink-50 text-pink-700' : 'bg-blue-50 text-blue-700'"
                    >
                      {{ piglet.sex === 'female' ? 'Hembra' : 'Macho' }}
                    </span>
                    <button
                      class="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors shrink-0"
                      @click="startEdit(piglet)"
                    >
                      <Pencil class="w-3.5 h-3.5" />
                    </button>
                  </template>
                </div>
              </div>
            </div>

            <p v-else class="text-xs text-gray-400 italic">Sin lechones registrados aún.</p>

            <div class="pt-1">
              <p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Agregar lechón</p>
              <div class="flex items-center gap-2">
                <input
                  v-model="getAddForm(litter.id).ear_tag"
                  type="text"
                  class="form-input text-sm flex-1 min-w-0"
                  placeholder="Nº Arete (ej. CER-015)"
                  @keyup.enter="savePiglet(litter.id, litter.birth_date)"
                />
                <select v-model="getAddForm(litter.id).sex" class="form-select text-sm w-32 shrink-0">
                  <option value="female">Hembra</option>
                  <option value="male">Macho</option>
                </select>
                <button
                  type="button"
                  class="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 shrink-0"
                  :disabled="!getAddForm(litter.id).ear_tag.trim() || getAddForm(litter.id).saving"
                  @click="savePiglet(litter.id, litter.birth_date)"
                >
                  <Loader v-if="getAddForm(litter.id).saving" class="w-4 h-4 animate-spin" />
                  <Plus v-else class="w-4 h-4" />
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
