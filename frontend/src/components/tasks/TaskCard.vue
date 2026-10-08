<script setup lang="ts">
import { computed } from 'vue'
import { Calendar, Pencil, Trash2, PawPrint } from 'lucide-vue-next'
import { daysFromToday } from '@/lib/dates'
import type { Task } from '@/types'

const props = defineProps<{ task: Task }>()
const emit = defineEmits<{ edit: [task: Task]; delete: [id: string] }>()

const priority = {
  low: { label: 'Baja', dot: 'bg-gray-400', text: 'text-gray-600' },
  medium: { label: 'Media', dot: 'bg-amber-500', text: 'text-amber-800' },
  high: { label: 'Alta', dot: 'bg-red-600', text: 'text-red-700' }
}

// due_date es una fecha de calendario (YYYY-MM-DD): se compara en hora local
const done = computed(() => props.task.status === 'completed')
const dueIn = computed(() => (props.task.due_date ? daysFromToday(props.task.due_date.slice(0, 10)) : null))
// Una tarea completada no está "vencida", aunque su fecha ya pasó
const overdue = computed(() => !done.value && dueIn.value !== null && dueIn.value < 0)

const dueLabel = computed(() => {
  const d = dueIn.value
  if (d === null) return 'Sin fecha'
  if (d === 0) return 'Hoy'
  if (d === 1) return 'Mañana'
  if (d < 0 && !done.value) return `Vencida hace ${-d} ${d === -1 ? 'día' : 'días'}`
  return new Date(`${props.task.due_date!.slice(0, 10)}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' })
})
</script>

<template>
  <article
    class="card p-4 sm:p-4 flex gap-3"
    :class="overdue ? 'border-red-200' : ''"
  >
    <div class="min-w-0 flex-1 space-y-1.5">
      <div class="flex items-start justify-between gap-3">
        <h3 class="text-sm font-semibold text-gray-900 leading-snug">{{ task.title }}</h3>
        <span class="inline-flex items-center gap-1.5 text-xs font-medium shrink-0 mt-0.5" :class="priority[task.priority].text">
          <span class="w-2 h-2 rounded-full" :class="priority[task.priority].dot" aria-hidden="true" />
          {{ priority[task.priority].label }}
        </span>
      </div>

      <p v-if="task.description" class="text-sm text-gray-600 line-clamp-2">{{ task.description }}</p>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span
          class="inline-flex items-center gap-1"
          :class="overdue ? 'text-red-700 font-semibold' : dueIn === 0 && !done ? 'text-gray-900 font-semibold' : 'text-gray-600'"
        >
          <Calendar class="w-3.5 h-3.5" aria-hidden="true" />
          {{ dueLabel }}
        </span>
        <span v-if="task.animal" class="inline-flex items-center gap-1 text-gray-600">
          <PawPrint class="w-3.5 h-3.5" aria-hidden="true" />
          {{ task.animal.ear_tag }}{{ task.animal.name ? ` · ${task.animal.name}` : '' }}
        </span>
      </div>
    </div>

    <div class="flex flex-col -my-1 -mr-1 shrink-0">
      <button type="button" class="icon-btn" :aria-label="`Editar tarea ${task.title}`" @click="emit('edit', task)">
        <Pencil />
      </button>
      <button type="button" class="icon-btn hover:text-red-700 hover:bg-red-50" :aria-label="`Eliminar tarea ${task.title}`" @click="emit('delete', task.id)">
        <Trash2 />
      </button>
    </div>
  </article>
</template>
