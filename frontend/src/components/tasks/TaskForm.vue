<script setup lang="ts">
import { reactive, watch, onMounted } from 'vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import BaseInput from '@/components/shared/BaseInput.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import { useAnimalsStore } from '@/stores/animals'
import type { Task, TaskFormData } from '@/types'

const props = defineProps<{
  open: boolean
  task?: Task | null
  loading?: boolean
}>()

const emit = defineEmits<{
  close: []
  submit: [data: TaskFormData]
}>()

const animalsStore = useAnimalsStore()

const form = reactive<TaskFormData>({
  title: '',
  description: null,
  status: 'pending',
  priority: 'medium',
  due_date: null,
  category: null,
  animal_id: null
})

watch(
  () => props.task,
  (t) => {
    if (t) {
      form.title = t.title
      form.description = t.description
      form.status = t.status
      form.priority = t.priority
      form.due_date = t.due_date
      form.category = t.category
      form.animal_id = t.animal_id
    } else {
      form.title = ''
      form.description = null
      form.status = 'pending'
      form.priority = 'medium'
      form.due_date = null
      form.category = null
      form.animal_id = null
    }
  },
  { immediate: true }
)

onMounted(() => {
  if (!animalsStore.animals.length) animalsStore.loadAnimals()
})

function handleSubmit() {
  if (!form.title.trim()) return
  emit('submit', { ...form })
}
</script>

<template>
  <BaseModal :open="open" :title="task ? 'Editar tarea' : 'Nueva tarea'" @close="emit('close')">
    <form class="space-y-4" @submit.prevent="handleSubmit">
      <BaseInput v-model="form.title" label="Título" required placeholder="ej. Vacunar terneros" />

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
        <textarea
          v-model="form.description"
          rows="3"
          class="form-input"
          placeholder="Detalles de la tarea..."
        />
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Estado</label>
          <select v-model="form.status" class="form-select">
            <option value="pending">Pendiente</option>
            <option value="in_progress">En progreso</option>
            <option value="completed">Completado</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Prioridad</label>
          <select v-model="form.priority" class="form-select">
            <option value="low">Baja</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
          </select>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <BaseInput v-model="form.due_date" label="Fecha límite" type="date" />
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Animal relacionado</label>
        <select v-model="form.animal_id" class="form-select">
          <option :value="null">Sin animal</option>
          <option
            v-for="animal in animalsStore.animals"
            :key="animal.id"
            :value="animal.id"
          >
            {{ animal.ear_tag }}{{ animal.name ? ` — ${animal.name}` : '' }}
            ({{ animal.species === 'cattle' ? 'Bovino' : 'Porcino' }})
          </option>
        </select>
      </div>
    </form>

    <template #footer>
      <BaseButton variant="secondary" @click="emit('close')">Cancelar</BaseButton>
      <BaseButton :loading="loading" @click="handleSubmit">
        {{ task ? 'Guardar' : 'Crear tarea' }}
      </BaseButton>
    </template>
  </BaseModal>
</template>
