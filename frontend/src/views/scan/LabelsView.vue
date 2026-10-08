<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { Printer, QrCode } from 'lucide-vue-next'
import BaseButton from '@/components/shared/BaseButton.vue'
import { useAnimalsStore } from '@/stores/animals'
import { animalQrSvg, isLocalOrigin } from '@/services/scanService'
import type { Animal } from '@/types'

// Hoja de etiquetas QR para imprimir: una por animal, para el arete o el corral.
const route = useRoute()
const animalsStore = useAnimalsStore()

const species = ref<'all' | 'cattle' | 'pig'>('all')
const size = ref<'small' | 'large'>('large')
const svgs = ref<Record<string, string>>({})
const loading = ref(true)

// ?ids=a,b → solo esos animales (desde el botón Imprimir de la ficha)
const onlyIds = computed(() => {
  const q = route.query.ids
  const raw = Array.isArray(q) ? q.join(',') : (q ?? '')
  return raw ? new Set(String(raw).split(',').filter(Boolean)) : null
})

function label(a: Animal) {
  return a.ear_tag ?? a.name ?? 'Sin arete'
}

const animals = computed(() =>
  animalsStore.animals
    .filter((a) => (onlyIds.value ? onlyIds.value.has(a.id) : a.status === 'active'))
    .filter((a) => onlyIds.value || species.value === 'all' || a.species === species.value)
    .sort((a, b) =>
      a.species.localeCompare(b.species) || label(a).localeCompare(label(b), 'es', { numeric: true })
    )
)

watch(
  animals,
  async (list) => {
    const missing = list.filter((a) => !svgs.value[a.id])
    const entries = await Promise.all(missing.map(async (a) => [a.id, await animalQrSvg(a.id)] as const))
    svgs.value = { ...svgs.value, ...Object.fromEntries(entries) }
  },
  { immediate: true }
)

onMounted(async () => {
  document.body.classList.add('printing-labels')
  if (!animalsStore.animals.length) await animalsStore.loadAnimals()
  loading.value = false
})

onBeforeUnmount(() => document.body.classList.remove('printing-labels'))

function print() {
  window.print()
}
</script>

<template>
  <div class="space-y-4">
    <div class="no-print space-y-4">
      <div class="flex items-center justify-between gap-3">
        <h1 class="text-xl font-bold text-gray-900 flex items-center gap-2">
          <QrCode class="w-5 h-5 text-primary-700" aria-hidden="true" /> Etiquetas QR
        </h1>
        <BaseButton :disabled="!animals.length" @click="print">
          <Printer class="w-4 h-4" /> Imprimir {{ animals.length }}
        </BaseButton>
      </div>

      <p v-if="isLocalOrigin" class="notice-warning text-sm">
        Estás en la versión de prueba de la computadora. Imprime las etiquetas desde la app publicada para que
        la cámara normal del teléfono también las abra. (La app las lee igual).
      </p>

      <div class="card flex flex-col sm:flex-row gap-3 sm:items-end">
        <div v-if="!onlyIds" class="flex-1">
          <label for="lbl-species" class="block text-sm font-medium text-gray-700 mb-1">Animales</label>
          <select id="lbl-species" v-model="species" class="form-select">
            <option value="all">Todos los activos</option>
            <option value="cattle">Solo bovinos</option>
            <option value="pig">Solo porcinos</option>
          </select>
        </div>
        <p v-else class="flex-1 text-sm text-gray-700">
          Imprimiendo {{ animals.length === 1 ? 'la etiqueta de 1 animal' : `${animals.length} etiquetas` }}.
          <RouterLink to="/etiquetas" class="font-medium text-primary-700 hover:underline">Ver todos</RouterLink>
        </p>
        <div class="flex-1">
          <label for="lbl-size" class="block text-sm font-medium text-gray-700 mb-1">Tamaño</label>
          <select id="lbl-size" v-model="size" class="form-select">
            <option value="large">Grande (corral o puerta, 6 cm)</option>
            <option value="small">Pequeña (arete, 3 cm)</option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="loading" class="card-empty no-print">Cargando animales...</div>
    <div v-else-if="!animals.length" class="card-empty no-print">No hay animales para imprimir.</div>

    <!-- Hoja imprimible -->
    <div
      v-else
      class="print-area grid gap-3"
      :class="size === 'large' ? 'labels-large' : 'labels-small'"
    >
      <div
        v-for="a in animals"
        :key="a.id"
        class="label rounded-lg border border-gray-300 bg-white text-center break-inside-avoid"
      >
        <div class="label-qr [&>svg]:w-full [&>svg]:h-full" v-html="svgs[a.id] ?? ''" />
        <p class="label-tag font-bold text-gray-900 leading-tight tabular-nums">{{ label(a) }}</p>
        <p v-if="size === 'large'" class="text-xs text-gray-700 leading-tight truncate">
          <template v-if="a.name && a.ear_tag">{{ a.name }} · </template>{{ a.species === 'cattle' ? 'Bovino' : 'Porcino' }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.labels-large {
  grid-template-columns: repeat(auto-fill, minmax(6.5cm, 1fr));
}
.labels-large .label { padding: 0.3cm; }
.labels-large .label-qr { width: 5cm; height: 5cm; margin: 0 auto; }
.labels-large .label-tag { font-size: 18pt; margin-top: 0.15cm; }

.labels-small {
  grid-template-columns: repeat(auto-fill, minmax(3.4cm, 1fr));
}
.labels-small .label { padding: 0.15cm; }
.labels-small .label-qr { width: 3cm; height: 3cm; margin: 0 auto; }
.labels-small .label-tag { font-size: 10pt; margin-top: 0.05cm; }
</style>

<style>
/* Al imprimir: solo la hoja de etiquetas, sin menú ni botones, y sin el
   recorte de la pantalla (h-screen / overflow) para que salgan todas las páginas */
@media print {
  body.printing-labels aside,
  body.printing-labels header,
  body.printing-labels .no-print,
  body.printing-labels [data-no-print],
  body.printing-labels .fixed {
    display: none !important;
  }
  body.printing-labels .h-screen { height: auto !important; }
  body.printing-labels .overflow-hidden,
  body.printing-labels .overflow-y-auto { overflow: visible !important; }
  body.printing-labels main { padding: 0 !important; }
  body.printing-labels { background: white !important; }
  body.printing-labels .label { border-color: #9ca3af; }
}
</style>
