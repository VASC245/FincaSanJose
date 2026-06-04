<script setup lang="ts">
import { Calendar, Flag } from 'lucide-vue-next'
import BaseBadge from '@/components/shared/BaseBadge.vue'
import type { Task } from '@/types'

const props = defineProps<{ task: Task }>()
const emit = defineEmits<{ edit: [task: Task]; delete: [id: string] }>()

const priorityVariant = {
  low: 'green' as const,
  medium: 'yellow' as const,
  high: 'red' as const
}

const priorityLabel = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta'
}

function isOverdue(date: string | null) {
  if (!date) return false
  return new Date(date) < new Date()
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('es', { day: '2-digit', month: 'short' })
}
</script>

<template>
  <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2 hover:shadow-md transition-shadow">
    <div class="flex items-start justify-between gap-2">
      <p class="text-sm font-medium text-gray-800 leading-tight">{{ task.title }}</p>
      <BaseBadge :variant="priorityVariant[task.priority]">
        <Flag class="w-3 h-3" />
        {{ priorityLabel[task.priority] }}
      </BaseBadge>
    </div>

    <p v-if="task.description" class="text-xs text-gray-500 line-clamp-2">
      {{ task.description }}
    </p>

    <div class="flex items-center justify-between pt-1">
      <div class="flex items-center gap-1.5 text-xs text-gray-400">
        <Calendar class="w-3.5 h-3.5" />
        <span
          v-if="task.due_date"
          :class="isOverdue(task.due_date) ? 'text-red-500 font-medium' : ''"
        >
          {{ formatDate(task.due_date) }}
        </span>
        <span v-else>Sin fecha</span>
      </div>

      <div class="flex gap-1">
        <button
          class="text-xs text-primary-600 hover:text-primary-800 font-medium"
          @click="emit('edit', task)"
        >
          Editar
        </button>
        <span class="text-gray-300">|</span>
        <button
          class="text-xs text-red-500 hover:text-red-700 font-medium"
          @click="emit('delete', task.id)"
        >
          Eliminar
        </button>
      </div>
    </div>

    <p v-if="task.animal" class="text-xs text-primary-600 bg-primary-50 rounded px-2 py-0.5 inline-block">
      Animal: {{ task.animal.ear_tag }}{{ task.animal.name ? ` — ${task.animal.name}` : '' }}
    </p>
  </div>
</template>
