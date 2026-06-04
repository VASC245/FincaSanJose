<script setup lang="ts">
import { ref, onMounted, reactive, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ArrowLeft, Plus, Trash2 } from 'lucide-vue-next'
import BaseInput from '@/components/shared/BaseInput.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import { usePigsStore } from '@/stores/pigs'
import { useAnimalsStore } from '@/stores/animals'
import type { Animal, AnimalFormData } from '@/types'

const route = useRoute()
const router = useRouter()
const pigsStore = usePigsStore()
const animalsStore = useAnimalsStore()

const loading = ref(false)
const mother = ref<Animal | null>(null)

const form = reactive({
  birth_date: new Date().toISOString().slice(0, 10),
  total_born: 0,
  born_alive: 0,
  notes: ''
})

interface PigletRow {
  ear_tag: string
  sex: 'male' | 'female'
}

const piglets = ref<PigletRow[]>([])

const pigletCount = computed(() => piglets.value.length)
const bornAlive = computed(() => Number(form.born_alive) || 0)

onMounted(async () => {
  mother.value = (await animalsStore.getAnimal(route.params.id as string)) ?? null
})

function addPiglet() {
  piglets.value.push({ ear_tag: '', sex: 'female' })
}

function removePiglet(index: number) {
  piglets.value.splice(index, 1)
}

async function handleSubmit() {
  if (!mother.value) return
  loading.value = true
  try {
    // 1. Crear la camada
    await pigsStore.addLitter({
      sow_id: mother.value.id,
      birth_date: form.birth_date,
      total_born: Number(form.total_born),
      born_alive: Number(form.born_alive),
      notes: form.notes || null
    })

    // 2. Crear cada lechón que tenga arete o sea necesario registrar
    const pigletAnimals = piglets.value.filter((p) => p.ear_tag.trim())
    for (const p of pigletAnimals) {
      const payload: AnimalFormData = {
        ear_tag: p.ear_tag.trim(),
        name: null,
        sex: p.sex,
        species: 'pig',
        birth_date: form.birth_date,
        status: 'active',
        mother_id: mother.value.id,
        notes: null
      }
      await animalsStore.addAnimal(payload)
    }

    router.push(`/pigs/${mother.value.id}`)
  } catch (e) {
    alert('Error: ' + (e as Error).message)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-4">
    <div class="flex items-center gap-3">
      <button class="p-2 rounded-lg hover:bg-gray-100 text-gray-600" @click="router.back()">
        <ArrowLeft class="w-5 h-5" />
      </button>
      <div>
        <h1 class="text-xl font-bold text-gray-900">Registrar Camada</h1>
        <p v-if="mother" class="text-sm text-gray-500">
          Madre: {{ mother.ear_tag }}{{ mother.name ? ` · ${mother.name}` : '' }}
        </p>
      </div>
    </div>

    <form class="space-y-4" @submit.prevent="handleSubmit">
      <!-- Datos de la camada -->
      <div class="card space-y-4">
        <h2 class="text-sm font-semibold text-gray-700">Datos del parto</h2>

        <BaseInput v-model="form.birth_date" label="Fecha de parto" type="date" required />

        <div class="grid grid-cols-2 gap-4">
          <BaseInput
            v-model="form.total_born"
            label="Lechones nacidos"
            type="number"
            required
            placeholder="ej. 10"
          />
          <BaseInput
            v-model="form.born_alive"
            label="Lechones vivos"
            type="number"
            required
            placeholder="ej. 9"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Notas</label>
          <textarea
            v-model="form.notes"
            rows="2"
            class="form-input"
            placeholder="Observaciones del parto..."
          />
        </div>
      </div>

      <!-- Registro de lechones -->
      <div class="card space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-sm font-semibold text-gray-700">Lechones</h2>
            <p class="text-xs text-gray-400 mt-0.5">
              {{ pigletCount }} de {{ bornAlive }} vivos registrados
            </p>
          </div>
          <BaseButton type="button" variant="secondary" size="sm" @click="addPiglet">
            <Plus class="w-4 h-4" /> Agregar lechón
          </BaseButton>
        </div>

        <!-- Tabla de lechones -->
        <div v-if="piglets.length" class="space-y-2">
          <!-- Header -->
          <div class="grid grid-cols-[1fr_140px_36px] gap-2 px-1">
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">Arete</span>
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">Sexo</span>
            <span />
          </div>

          <!-- Rows -->
          <div
            v-for="(piglet, i) in piglets"
            :key="i"
            class="grid grid-cols-[1fr_140px_36px] gap-2 items-center"
          >
            <input
              v-model="piglet.ear_tag"
              type="text"
              class="form-input text-sm"
              placeholder="ej. CER-015"
            />
            <select v-model="piglet.sex" class="form-select text-sm">
              <option value="female">Hembra</option>
              <option value="male">Macho</option>
            </select>
            <button
              type="button"
              class="flex items-center justify-center w-9 h-9 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              @click="removePiglet(i)"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
        </div>

        <div v-else class="text-center py-6 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
          Ningún lechón registrado — presiona "Agregar lechón" para comenzar
        </div>
      </div>

      <!-- Acciones -->
      <div class="flex justify-end gap-3">
        <BaseButton variant="secondary" type="button" @click="router.back()">
          Cancelar
        </BaseButton>
        <BaseButton type="submit" :loading="loading">
          Guardar camada
        </BaseButton>
      </div>
    </form>
  </div>
</template>
