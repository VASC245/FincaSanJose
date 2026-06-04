<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { Plus } from 'lucide-vue-next'
import BaseButton from '@/components/shared/BaseButton.vue'
import TaskCard from '@/components/tasks/TaskCard.vue'
import TaskForm from '@/components/tasks/TaskForm.vue'
import { useTasksStore } from '@/stores/tasks'
import type { Task, TaskFormData, TaskStatus } from '@/types'

const tasksStore = useTasksStore()

const showForm = ref(false)
const editingTask = ref<Task | null>(null)
const formLoading = ref(false)
const filterPriority = ref('')

onMounted(() => tasksStore.loadTasks())

const columns: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'pending', label: 'Pendiente', color: 'bg-yellow-50 border-yellow-200' },
  { status: 'in_progress', label: 'En progreso', color: 'bg-blue-50 border-blue-200' },
  { status: 'completed', label: 'Completado', color: 'bg-green-50 border-green-200' }
]

function tasksForColumn(status: TaskStatus) {
  return tasksStore.tasks.filter(
    (t) =>
      t.status === status &&
      (!filterPriority.value || t.priority === filterPriority.value)
  )
}

function openCreate() {
  editingTask.value = null
  showForm.value = true
}

function openEdit(task: Task) {
  editingTask.value = task
  showForm.value = true
}

async function handleSubmit(data: TaskFormData) {
  formLoading.value = true
  try {
    if (editingTask.value) {
      await tasksStore.editTask(editingTask.value.id, data)
    } else {
      await tasksStore.addTask(data)
    }
    showForm.value = false
  } catch (e) {
    alert('Error: ' + (e as Error).message)
  } finally {
    formLoading.value = false
  }
}

async function handleDelete(id: string) {
  if (!confirm('¿Eliminar esta tarea?')) return
  await tasksStore.removeTask(id)
}

async function moveToStatus(task: Task, status: TaskStatus) {
  await tasksStore.updateStatus(task.id, status)
}

const totalPending = computed(() => tasksStore.pending.length)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold text-gray-900">Tareas</h1>
        <p class="text-sm text-gray-500">{{ totalPending }} pendientes</p>
      </div>
      <div class="flex items-center gap-3">
        <select v-model="filterPriority" class="form-select w-36">
          <option value="">Todas las prioridades</option>
          <option value="high">Alta</option>
          <option value="medium">Media</option>
          <option value="low">Baja</option>
        </select>
        <BaseButton @click="openCreate">
          <Plus class="w-4 h-4" /> Nueva tarea
        </BaseButton>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="tasksStore.loading" class="text-center py-12 text-gray-400">Cargando tareas...</div>

    <!-- Kanban-style columns -->
    <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div
        v-for="col in columns"
        :key="col.status"
        class="rounded-xl border p-4 space-y-3"
        :class="col.color"
      >
        <!-- Column header -->
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-gray-700">{{ col.label }}</h2>
          <span class="text-xs bg-white border border-gray-200 rounded-full px-2 py-0.5 text-gray-500">
            {{ tasksForColumn(col.status).length }}
          </span>
        </div>

        <!-- Empty state -->
        <div
          v-if="!tasksForColumn(col.status).length"
          class="text-center py-6 text-xs text-gray-400"
        >
          Sin tareas
        </div>

        <!-- Task cards -->
        <TaskCard
          v-for="task in tasksForColumn(col.status)"
          :key="task.id"
          :task="task"
          @edit="openEdit"
          @delete="handleDelete"
        />

        <!-- Quick move buttons (for non-completed columns) -->
        <div v-if="col.status !== 'completed'" class="text-center pt-1">
          <button
            class="text-xs text-gray-400 hover:text-gray-600"
            @click="openCreate"
          >
            + Agregar tarea
          </button>
        </div>
      </div>
    </div>

    <!-- Task form modal -->
    <TaskForm
      :open="showForm"
      :task="editingTask"
      :loading="formLoading"
      @close="showForm = false"
      @submit="handleSubmit"
    />
  </div>
</template>
