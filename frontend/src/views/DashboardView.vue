<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { Beef, PiggyBank, HeartHandshake, ClipboardList, Package, Milk, CalendarCheck, ChevronRight } from 'lucide-vue-next'
import StockAlert from '@/components/inventory/StockAlert.vue'
import MilkWithdrawalAlert from '@/components/cattle/MilkWithdrawalAlert.vue'
import TaskCard from '@/components/tasks/TaskCard.vue'
import PregnancyBadge from '@/components/cattle/PregnancyBadge.vue'
import { useAnimalsStore } from '@/stores/animals'
import { useTasksStore } from '@/stores/tasks'
import { useInventoryStore } from '@/stores/inventory'
import { useGastosStore } from '@/stores/gastos'
import { useVentasStore } from '@/stores/ventas'
import { fetchMilkSessions } from '@/services/milkService'
import { localToday, daysFromToday } from '@/lib/dates'

const animalsStore = useAnimalsStore()
const tasksStore = useTasksStore()
const inventoryStore = useInventoryStore()
const gastosStore = useGastosStore()
const ventasStore = useVentasStore()

// Leche: último ordeño registrado y promedio de los últimos 7 registros
const lastMilk = ref<{ liters: number; date: string } | null>(null)
const milkAvg7 = ref<number | null>(null)

onMounted(async () => {
  await Promise.all([
    animalsStore.loadAnimals(),
    tasksStore.loadTasks(),
    inventoryStore.loadItems(),
    gastosStore.loadGastos(),
    ventasStore.loadVentas()
  ])
  try {
    // Un día puede tener varios ordeños: se suman por fecha
    const sessions = await fetchMilkSessions()
    const byDate = new Map<string, number>()
    for (const s of sessions) byDate.set(s.recorded_date, (byDate.get(s.recorded_date) ?? 0) + Number(s.liters))
    const days = [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]))
    if (days.length) {
      lastMilk.value = { date: days[0][0], liters: days[0][1] }
      const last7 = days.slice(0, 7)
      milkAvg7.value = last7.reduce((sum, [, l]) => sum + l, 0) / last7.length
    }
  } catch {
    // sin datos de leche, la tarjeta muestra "—"
  }
})

// ─── Finanzas del mes ────────────────────────────────────────────────────────
const mesActual = localToday().slice(0, 7)

const ingresosMes = computed(() =>
  ventasStore.ventas
    .filter((v) => v.fecha.startsWith(mesActual))
    .reduce((sum, v) => sum + Number(v.monto), 0)
)

const gastosMes = computed(() =>
  gastosStore.gastos
    .filter((g) => g.fecha.startsWith(mesActual))
    .reduce((sum, g) => sum + Number(g.monto), 0)
)

const balanceMes = computed(() => ingresosMes.value - gastosMes.value)

function fmtCop(n: number) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(n)
}

const recentPendingTasks = computed(() =>
  tasksStore.pending.slice(0, 5)
)

// Preñadas ordenadas por parto más cercano
const pregnantCows = computed(() =>
  animalsStore.cattle
    .filter((a) => a.status === 'active' && a.cattle_detail?.is_pregnant)
    .sort((a, b) =>
      (a.cattle_detail?.expected_birth ?? '9999').localeCompare(b.cattle_detail?.expected_birth ?? '9999')
    )
)

function fmtLiters(n: number) {
  return `${Number.isInteger(n) ? n : n.toFixed(1)} L`
}

function lastMilkLabel(date: string) {
  const d = daysFromToday(date)
  if (d === 0) return 'hoy'
  if (d === -1) return 'ayer'
  return `hace ${-d} días`
}

const herdStats = computed(() => [
  { label: 'Bovinos', value: animalsStore.cattle.filter((a) => a.status === 'active').length, icon: Beef, to: '/cattle' },
  { label: 'Vacas preñadas', value: animalsStore.pregnantCows, icon: HeartHandshake, to: '/reproduccion' },
  { label: 'Porcinos', value: animalsStore.pigs.filter((a) => a.status === 'active').length, icon: PiggyBank, to: '/pigs' },
  { label: 'Cerdas preñadas', value: animalsStore.pregnantSows, icon: HeartHandshake, to: '/pigs/litters' },
  { label: 'Tareas pendientes', value: tasksStore.pending.length, icon: ClipboardList, to: '/tasks' }
])

const quickLinks = [
  { to: '/trabajo', label: 'Qué toca hoy', icon: CalendarCheck },
  { to: '/cattle/milk', label: 'Registrar leche', icon: Milk },
  { to: '/cattle/new', label: 'Nuevo bovino', icon: Beef },
  { to: '/pigs/new', label: 'Nuevo porcino', icon: PiggyBank },
  { to: '/inventory/movement', label: 'Movimiento de inventario', icon: Package },
  { to: '/tasks', label: 'Nueva tarea', icon: ClipboardList }
]
</script>

<template>
  <div class="space-y-5">
    <!-- Lo urgente primero -->
    <MilkWithdrawalAlert />
    <StockAlert />

    <!-- Leche + finanzas del mes -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <RouterLink to="/cattle/milk" class="card-link group flex items-center gap-4">
        <div class="w-11 h-11 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
          <Milk class="w-5 h-5" aria-hidden="true" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="stat-label">Último ordeño<template v-if="lastMilk"> · {{ lastMilkLabel(lastMilk.date) }}</template></p>
          <p class="stat-value">{{ lastMilk ? fmtLiters(lastMilk.liters) : '—' }}</p>
          <p v-if="milkAvg7 !== null" class="stat-sub">Promedio últimos 7 días: {{ fmtLiters(Math.round(milkAvg7 * 10) / 10) }}</p>
        </div>
        <ChevronRight class="w-4 h-4 text-gray-400 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
      </RouterLink>

      <section class="card lg:col-span-2" aria-labelledby="finanzas-title">
        <div class="card-header mb-3">
          <h2 id="finanzas-title" class="card-title">Este mes</h2>
          <RouterLink to="/ventas" class="text-sm font-medium text-primary-700 hover:underline">Ver ventas</RouterLink>
        </div>
        <dl class="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2">
          <div class="flex sm:block items-baseline justify-between">
            <dt class="stat-label">Ingresos</dt>
            <dd class="text-lg sm:text-xl font-semibold tabular-nums text-gray-900">{{ fmtCop(ingresosMes) }}</dd>
          </div>
          <div class="flex sm:block items-baseline justify-between">
            <dt class="stat-label">Gastos</dt>
            <dd class="text-lg sm:text-xl font-semibold tabular-nums text-gray-900">{{ fmtCop(gastosMes) }}</dd>
          </div>
          <div class="flex sm:block items-baseline justify-between border-t sm:border-t-0 sm:border-l border-gray-200 pt-2 sm:pt-0 sm:pl-6">
            <dt class="stat-label">{{ balanceMes >= 0 ? 'Ganancia' : 'Pérdida' }}</dt>
            <dd
              class="text-lg sm:text-xl font-semibold tabular-nums"
              :class="balanceMes >= 0 ? 'text-emerald-700' : 'text-red-700'"
            >
              {{ fmtCop(balanceMes) }}
            </dd>
          </div>
        </dl>
      </section>
    </div>

    <!-- Hato: una tarjeta, cada cifra abre su pantalla -->
    <section aria-label="Resumen del hato" class="rounded-xl border border-gray-200 bg-gray-200 overflow-hidden">
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-px">
        <RouterLink
          v-for="(s, i) in herdStats"
          :key="s.label"
          :to="s.to"
          class="bg-white px-4 py-3 transition-colors duration-150 hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
          :class="i === herdStats.length - 1 ? 'col-span-2 sm:col-span-1' : ''"
        >
          <p class="stat-label flex items-center gap-1.5">
            <component :is="s.icon" class="w-4 h-4 text-gray-500 shrink-0" aria-hidden="true" />
            {{ s.label }}
          </p>
          <p class="stat-value mt-1">{{ s.value }}</p>
        </RouterLink>
      </div>
    </section>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <!-- Tareas pendientes -->
      <section class="lg:col-span-2 space-y-3" aria-labelledby="tareas-title">
        <div class="card-header">
          <h2 id="tareas-title" class="card-title">Tareas pendientes</h2>
          <RouterLink to="/tasks" class="text-sm font-medium text-primary-700 hover:underline">Ver todas</RouterLink>
        </div>

        <div v-if="tasksStore.loading" class="card-empty">Cargando tareas...</div>
        <div v-else-if="!recentPendingTasks.length" class="card-empty">
          No hay tareas pendientes. Las tareas del día aparecen en
          <RouterLink to="/trabajo" class="font-medium text-primary-700 hover:underline">Qué toca hoy</RouterLink>.
        </div>
        <div v-else class="space-y-2">
          <TaskCard
            v-for="task in recentPendingTasks"
            :key="task.id"
            :task="task"
            @edit="$router.push('/tasks')"
            @delete="$router.push('/tasks')"
          />
        </div>
      </section>

      <div class="space-y-5">
        <!-- Vacas preñadas -->
        <section v-if="pregnantCows.length" class="card" aria-labelledby="prenadas-title">
          <div class="card-header mb-2">
            <h2 id="prenadas-title" class="card-title">Vacas preñadas</h2>
            <span class="text-sm text-gray-500 tabular-nums">{{ pregnantCows.length }}</span>
          </div>
          <ul class="-mx-2 divide-y divide-gray-100">
            <li v-for="cow in pregnantCows" :key="cow.id">
              <RouterLink
                :to="`/cattle/${cow.id}`"
                class="flex items-center justify-between gap-3 px-2 py-2.5 rounded-lg hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                <span class="text-sm font-medium text-gray-900 truncate">
                  {{ cow.ear_tag }}<span v-if="cow.name" class="text-gray-600 font-normal"> · {{ cow.name }}</span>
                </span>
                <PregnancyBadge :is-pregnant="true" :expected-date="cow.cattle_detail?.expected_birth" class="shrink-0" />
              </RouterLink>
            </li>
          </ul>
        </section>

        <!-- Accesos rápidos -->
        <section class="card" aria-labelledby="accesos-title">
          <h2 id="accesos-title" class="card-title mb-3">Accesos rápidos</h2>
          <div class="grid grid-cols-2 gap-2">
            <RouterLink
              v-for="l in quickLinks"
              :key="l.to"
              :to="l.to"
              class="flex items-center gap-2 min-h-[44px] rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-800 transition-colors duration-150 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800 active:bg-primary-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              <component :is="l.icon" class="w-4 h-4 shrink-0 text-primary-700" aria-hidden="true" />
              <span class="leading-tight">{{ l.label }}</span>
            </RouterLink>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
