<script setup lang="ts">
import { ref, onMounted, computed, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ArrowLeft, Pencil, Trash2, Milk, Plus } from 'lucide-vue-next'
import BaseBadge from '@/components/shared/BaseBadge.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import BaseInput from '@/components/shared/BaseInput.vue'
import PregnancyBadge from '@/components/cattle/PregnancyBadge.vue'
import VaccinationList from '@/components/animals/VaccinationList.vue'
import { useAnimalsStore } from '@/stores/animals'
import { fetchMilkRecords, createMilkRecord, updateMilkRecord, deleteMilkRecord } from '@/services/milkService'
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
  recorded_date: new Date().toISOString().slice(0, 10),
  liters: '' as string | number,
  notes: '',
  saving: false
})

// inline edit
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
    milkForm.recorded_date = new Date().toISOString().slice(0, 10)
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

onMounted(async () => {
  animal.value = (await animalsStore.getAnimal(route.params.id as string)) ?? null
  loading.value = false
  if (animal.value?.sex === 'female') {
    milkLoading.value = true
    try { milkRecords.value = await fetchMilkRecords(animal.value.id) }
    finally { milkLoading.value = false }
  }
})

async function handleDelete() {
  if (!animal.value) return
  if (!confirm(`¿Eliminar al animal ${animal.value.ear_tag}? Esta acción no se puede deshacer.`)) return
  await animalsStore.removeAnimal(animal.value.id)
  router.push('/cattle')
}

const detail = computed(() => animal.value?.cattle_detail)

function formatDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })
}

const statusVariant: Record<string, 'green' | 'red' | 'gray' | 'blue'> = {
  active: 'green',
  sold: 'blue',
  deceased: 'red',
  culled: 'gray'
}

const statusLabel: Record<string, string> = {
  active: 'Activo',
  sold: 'Vendido',
  deceased: 'Fallecido',
  culled: 'Descartado'
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
        <BaseButton
          variant="secondary"
          size="sm"
          @click="router.push(`/cattle/${animal.id}/edit`)"
        >
          <Pencil class="w-4 h-4" /> Editar
        </BaseButton>
        <BaseButton variant="danger" size="sm" @click="handleDelete">
          <Trash2 class="w-4 h-4" />
        </BaseButton>
      </div>
    </div>

    <!-- Loading state -->
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
          <div>
            <p class="text-xs text-gray-500 uppercase tracking-wide">Raza</p>
            <p class="text-sm text-gray-800 font-medium mt-0.5 capitalize">
            </p>
          </div>
          <div>
            <p class="text-xs text-gray-500 uppercase tracking-wide">Peso</p>
            <p class="text-sm text-gray-800 font-medium mt-0.5">
            </p>
          </div>
          <div v-if="detail?.is_pregnant">
            <p class="text-xs text-gray-500 uppercase tracking-wide">Inicio preñez</p>
            <p class="text-sm text-gray-800 font-medium mt-0.5">
              {{ formatDate(detail.conception_date) }}
            </p>
          </div>
          <div v-if="detail?.is_pregnant">
            <p class="text-xs text-gray-500 uppercase tracking-wide">Parto esperado</p>
            <p class="text-sm text-gray-800 font-medium mt-0.5">
              {{ formatDate(detail.expected_birth) }}
            </p>
          </div>
        </div>

        <div v-if="animal.notes" class="mt-4 pt-4 border-t border-gray-100">
          <p class="text-xs text-gray-500 uppercase tracking-wide mb-1">Notas</p>
          <p class="text-sm text-gray-700">{{ animal.notes }}</p>
        </div>
      </div>

      <!-- Producción de leche (hembras) -->
      <div v-if="animal.sex === 'female'" class="card space-y-4">
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

        <!-- Formulario nuevo registro -->
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
                  <td class="px-3 py-2 text-gray-700">{{ new Date(r.recorded_date + 'T12:00:00').toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) }}</td>
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
