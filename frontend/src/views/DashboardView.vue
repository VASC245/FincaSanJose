<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { Beef, PiggyBank, HeartHandshake, ClipboardList, AlertTriangle, Milk } from 'lucide-vue-next'
import StatCard from '@/components/shared/StatCard.vue'
import StockAlert from '@/components/inventory/StockAlert.vue'
import TaskCard from '@/components/tasks/TaskCard.vue'
import PregnancyBadge from '@/components/cattle/PregnancyBadge.vue'
import { useAnimalsStore } from '@/stores/animals'
import { useTasksStore } from '@/stores/tasks'
import { useInventoryStore } from '@/stores/inventory'
import { fetchMilkSessions } from '@/services/milkService'

const animalsStore = useAnimalsStore()
const tasksStore = useTasksStore()
const inventoryStore = useInventoryStore()

const totalMilkLiters = ref(0)
const totalMilkDisplay = computed(() =>
  totalMilkLiters.value % 1 === 0
    ? totalMilkLiters.value
    : totalMilkLiters.value.toFixed(1)
)

onMounted(async () => {
  await Promise.all([
    animalsStore.loadAnimals(),
    tasksStore.loadTasks(),
    inventoryStore.loadItems()
  ])
  const sessions = await fetchMilkSessions()
  totalMilkLiters.value = sessions.reduce((sum, s) => sum + Number(s.liters), 0)
})

const recentPendingTasks = computed(() =>
  tasksStore.pending.slice(0, 5)
)

const pregnantCows = computed(() =>
  animalsStore.cattle.filter((a) => a.cattle_detail?.is_pregnant)
)
</script>

<template>
  <div class="space-y-6">
    <!-- Stats row -->
    <div class="grid grid-cols-2 lg:grid-cols-6 gap-4">
      <StatCard
        title="Total Bovinos"
        :value="animalsStore.cattle.length"
        :icon="Beef"
        color="green"
      />
      <StatCard
        title="Total Porcinos"
        :value="animalsStore.pigs.length"
        :icon="PiggyBank"
        color="purple"
      />
      <StatCard
        title="Vacas Preñadas"
        :value="animalsStore.pregnantCows"
        :icon="HeartHandshake"
        color="pink"
        subtitle="bovinos"
      />
      <StatCard
        title="Cerdas Preñadas"
        :value="animalsStore.pregnantSows"
        :icon="HeartHandshake"
        color="orange"
        subtitle="porcinos"
      />
      <StatCard
        title="Tareas Pendientes"
        :value="tasksStore.pending.length"
        :icon="ClipboardList"
        color="yellow"
      />
      <StatCard
        title="Litros de Leche"
        :value="totalMilkDisplay"
        :icon="Milk"
        color="blue"
        subtitle="total registrado"
      />
    </div>

    <!-- Main content grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Pending tasks -->
      <div class="lg:col-span-2 space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold text-gray-800">Tareas pendientes</h2>
          <RouterLink to="/tasks" class="text-sm text-primary-600 hover:underline">
            Ver todas
          </RouterLink>
        </div>

        <div v-if="tasksStore.loading" class="text-center py-8 text-sm text-gray-400">
          Cargando tareas...
        </div>
        <div
          v-else-if="!recentPendingTasks.length"
          class="card text-center text-sm text-gray-400 py-8"
        >
          No hay tareas pendientes.
        </div>
        <div v-else class="space-y-3">
          <TaskCard
            v-for="task in recentPendingTasks"
            :key="task.id"
            :task="task"
            @edit="$router.push('/tasks')"
            @delete="$router.push('/tasks')"
          />
        </div>
      </div>

      <!-- Right column -->
      <div class="space-y-4">
        <!-- Stock alerts -->
        <StockAlert />

        <!-- Pregnant cows -->
        <div class="card space-y-3" v-if="pregnantCows.length">
          <h2 class="text-sm font-semibold text-gray-700">Vacas preñadas</h2>
          <div class="space-y-2">
            <div
              v-for="cow in pregnantCows"
              :key="cow.id"
              class="flex items-center justify-between text-sm"
            >
              <RouterLink
                :to="`/cattle/${cow.id}`"
                class="font-medium text-gray-800 hover:text-primary-600"
              >
                {{ cow.ear_tag }}{{ cow.name ? ` · ${cow.name}` : '' }}
              </RouterLink>
              <PregnancyBadge
                :is-pregnant="true"
                :expected-date="cow.cattle_detail?.expected_birth"
              />
            </div>
          </div>
        </div>

        <!-- Quick links -->
        <div class="card space-y-2">
          <h2 class="text-sm font-semibold text-gray-700 mb-2">Accesos rápidos</h2>
          <RouterLink
            to="/cattle/new"
            class="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 py-1"
          >
            <Beef class="w-4 h-4" /> Registrar bovino
          </RouterLink>
          <RouterLink
            to="/pigs/new"
            class="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 py-1"
          >
            <PiggyBank class="w-4 h-4" /> Registrar porcino
          </RouterLink>
          <RouterLink
            to="/inventory/movement"
            class="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 py-1"
          >
            <AlertTriangle class="w-4 h-4" /> Registrar movimiento
          </RouterLink>
          <RouterLink
            to="/tasks"
            class="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 py-1"
          >
            <ClipboardList class="w-4 h-4" /> Nueva tarea
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
