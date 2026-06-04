import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Task, TaskFormData, TaskStatus } from '@/types'
import * as taskService from '@/services/taskService'

export const useTasksStore = defineStore('tasks', () => {
  const tasks = ref<Task[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const pending = computed(() => tasks.value.filter((t) => t.status === 'pending'))
  const inProgress = computed(() => tasks.value.filter((t) => t.status === 'in_progress'))
  const done = computed(() => tasks.value.filter((t) => t.status === 'completed'))

  function tasksByStatus(status: TaskStatus) {
    return tasks.value.filter((t) => t.status === status)
  }

  async function loadTasks() {
    loading.value = true
    error.value = null
    try {
      tasks.value = await taskService.fetchTasks()
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function addTask(payload: TaskFormData): Promise<Task> {
    const task = await taskService.createTask(payload)
    tasks.value.push(task)
    return task
  }

  async function editTask(id: string, payload: Partial<TaskFormData>): Promise<Task> {
    const updated = await taskService.updateTask(id, payload)
    const idx = tasks.value.findIndex((t) => t.id === id)
    if (idx !== -1) tasks.value[idx] = updated
    return updated
  }

  async function updateStatus(id: string, status: TaskStatus): Promise<void> {
    await editTask(id, { status })
  }

  async function removeTask(id: string): Promise<void> {
    await taskService.deleteTask(id)
    tasks.value = tasks.value.filter((t) => t.id !== id)
  }

  return {
    tasks,
    loading,
    error,
    pending,
    inProgress,
    done,
    tasksByStatus,
    loadTasks,
    addTask,
    editTask,
    updateStatus,
    removeTask
  }
})
