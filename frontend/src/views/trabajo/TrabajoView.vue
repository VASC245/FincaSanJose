<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  Baby,
  MilkOff,
  Droplets,
  Search,
  Syringe,
  ClipboardList,
  HeartCrack,
  CheckCircle2,
  RefreshCw
} from 'lucide-vue-next'
import { fetchWorkLists, type WorkList, type WorkUrgency } from '@/services/workListService'
import { formatDate, localToday } from '@/lib/dates'

const lists = ref<WorkList[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const icons: Record<string, any> = {
  partos: Baby,
  secar: Droplets,
  revisar: Search,
  vacunas: Syringe,
  retiro: MilkOff,
  tareas: ClipboardList,
  vacias: HeartCrack
}

const totalItems = computed(() =>
  lists.value.reduce((sum, l) => sum + l.items.length, 0)
)

const urgentes = computed(() =>
  lists.value.reduce(
    (sum, l) => sum + l.items.filter((i) => i.urgency !== 'soon').length,
    0
  )
)

const nonEmpty = computed(() => lists.value.filter((l) => l.items.length > 0))

async function load() {
  loading.value = true
  error.value = null
  try {
    lists.value = await fetchWorkLists()
  } catch (e: any) {
    error.value = e?.message ?? 'Error cargando las listas de trabajo'
  } finally {
    loading.value = false
  }
}

onMounted(load)

function badgeClass(u: WorkUrgency) {
  return {
    overdue: 'bg-red-100 text-red-700',
    today: 'bg-amber-100 text-amber-700',
    soon: 'bg-gray-100 text-gray-600'
  }[u]
}

function badgeText(u: WorkUrgency) {
  return { overdue: 'Vencido', today: 'Hoy', soon: 'Próximo' }[u]
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between flex-wrap gap-2">
      <div>
        <h1 class="text-xl font-bold text-gray-800">Qué toca hoy</h1>
        <p class="text-sm text-gray-500">{{ formatDate(localToday()) }}</p>
      </div>
      <div class="flex items-center gap-3">
        <span v-if="!loading && totalItems" class="text-sm text-gray-600">
          <span class="font-semibold text-gray-800">{{ totalItems }}</span> pendiente{{ totalItems !== 1 ? 's' : '' }}
          <span v-if="urgentes" class="text-red-600">· {{ urgentes }} urgente{{ urgentes !== 1 ? 's' : '' }}</span>
        </span>
        <button
          class="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          title="Actualizar"
          @click="load"
        >
          <RefreshCw class="w-4 h-4" :class="loading ? 'animate-spin' : ''" />
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12 text-sm text-gray-400">
      Calculando el trabajo del día...
    </div>

    <!-- Error -->
    <div v-else-if="error" class="card text-center py-8 text-sm text-red-600">
      {{ error }}
    </div>

    <!-- Todo al día -->
    <div v-else-if="!totalItems" class="card text-center py-12 space-y-2">
      <CheckCircle2 class="w-10 h-10 text-primary-500 mx-auto" />
      <p class="text-base font-semibold text-gray-700">Todo al día</p>
      <p class="text-sm text-gray-500">No hay trabajo pendiente calculado para hoy.</p>
    </div>

    <!-- Work lists -->
    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      <div v-for="list in nonEmpty" :key="list.key" class="card space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <component :is="icons[list.key]" class="w-4 h-4 text-primary-600 shrink-0" />
            {{ list.title }}
          </h2>
          <span class="text-xs font-medium bg-primary-50 text-primary-700 rounded-full px-2 py-0.5">
            {{ list.items.length }}
          </span>
        </div>

        <ul class="divide-y divide-gray-100">
          <li v-for="item in list.items" :key="item.id" class="py-2 first:pt-0 last:pb-0">
            <RouterLink :to="item.link" class="flex items-start justify-between gap-3 group">
              <div class="min-w-0">
                <p class="text-sm font-medium text-gray-800 group-hover:text-primary-600 truncate">
                  {{ item.label }}
                </p>
                <p class="text-xs text-gray-500">{{ item.detail }}</p>
              </div>
              <span
                class="text-[11px] font-medium rounded-full px-2 py-0.5 whitespace-nowrap mt-0.5"
                :class="badgeClass(item.urgency)"
              >
                {{ badgeText(item.urgency) }}
              </span>
            </RouterLink>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
