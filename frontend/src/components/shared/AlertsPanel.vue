<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Bell, X, AlertTriangle, AlertCircle, Info, RefreshCw } from 'lucide-vue-next'
import { fetchAlerts, type FincaAlert } from '@/services/alertsService'

const router = useRouter()
const alerts   = ref<FincaAlert[]>([])
const open     = ref(false)
const loading  = ref(false)
const panelEl  = ref<HTMLElement | null>(null)

const criticalCount = () => alerts.value.filter(a => a.level === 'critical').length
const totalCount    = () => alerts.value.length

async function load() {
  loading.value = true
  try { alerts.value = await fetchAlerts() }
  finally { loading.value = false }
}

function navigate(link?: string) {
  if (link) router.push(link)
  open.value = false
}

function onClickOutside(e: MouseEvent) {
  if (panelEl.value && !panelEl.value.contains(e.target as Node)) open.value = false
}

onMounted(() => { load(); document.addEventListener('mousedown', onClickOutside) })
onUnmounted(() => document.removeEventListener('mousedown', onClickOutside))

const LEVEL_STYLE: Record<string, string> = {
  critical: 'bg-red-50 border-red-200 text-red-700',
  warning:  'bg-amber-50 border-amber-200 text-amber-700',
  info:     'bg-blue-50 border-blue-200 text-blue-700'
}
const LEVEL_ICON: Record<string, any> = {
  critical: AlertCircle,
  warning:  AlertTriangle,
  info:     Info
}
</script>

<template>
  <div ref="panelEl" class="relative">
    <!-- Campana -->
    <button
      class="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
      @click="open = !open"
    >
      <Bell class="w-5 h-5 text-slate-600" />
      <!-- Badge -->
      <span
        v-if="totalCount() > 0"
        :class="[
          'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full text-white text-[10px] font-bold flex items-center justify-center px-1',
          criticalCount() > 0 ? 'bg-red-500' : 'bg-amber-400'
        ]"
      >
        {{ totalCount() > 9 ? '9+' : totalCount() }}
      </span>
    </button>

    <!-- Panel desplegable -->
    <Transition name="dropdown">
      <div
        v-if="open"
        class="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <span class="font-semibold text-slate-800 text-sm">
            Alertas
            <span v-if="totalCount() > 0" class="text-slate-400 font-normal">({{ totalCount() }})</span>
          </span>
          <div class="flex gap-1">
            <button
              class="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              title="Actualizar"
              @click="load"
            >
              <RefreshCw :class="['w-3.5 h-3.5 text-slate-400', loading && 'animate-spin']" />
            </button>
            <button class="p-1.5 rounded-lg hover:bg-slate-100 transition-colors" @click="open = false">
              <X class="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>

        <!-- Lista -->
        <div class="max-h-[400px] overflow-y-auto">
          <div v-if="loading" class="py-8 text-center text-sm text-slate-400">Cargando...</div>

          <div v-else-if="alerts.length === 0" class="py-10 text-center">
            <Bell class="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p class="text-sm text-slate-400">Sin alertas activas</p>
          </div>

          <button
            v-else
            v-for="alert in alerts"
            :key="alert.id"
            class="w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors flex gap-3 items-start last:border-0"
            @click="navigate(alert.link)"
          >
            <div :class="['mt-0.5 p-1 rounded-lg border shrink-0', LEVEL_STYLE[alert.level]]">
              <component :is="LEVEL_ICON[alert.level]" class="w-3.5 h-3.5" />
            </div>
            <div class="min-w-0">
              <p class="text-sm font-medium text-slate-800 truncate">{{ alert.title }}</p>
              <p class="text-xs text-slate-500 mt-0.5 leading-relaxed">{{ alert.description }}</p>
            </div>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.dropdown-enter-active, .dropdown-leave-active { transition: opacity 0.15s, transform 0.15s }
.dropdown-enter-from, .dropdown-leave-to       { opacity: 0; transform: translateY(-6px) }
</style>
