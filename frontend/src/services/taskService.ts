import { supabase } from '@/lib/supabase'
import type { Task, TaskFormData } from '@/types'

// Mismo select en todas partes para que la tarea conserve su chip de animal
const TASK_SELECT = '*, animal:animals(id, ear_tag, name, species)'

export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .order('due_date', { ascending: true, nullsFirst: false })

  if (error) throw error
  return (data ?? []) as Task[]
}

export async function fetchTaskById(id: string): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('id', id)
    .single()

  if (error) throw error
  return data as Task
}

export async function createTask(payload: TaskFormData): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .insert(payload)
    .select(TASK_SELECT)
    .single()

  if (error) throw error
  return data as Task
}

export async function updateTask(id: string, payload: Partial<TaskFormData>): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update(payload)
    .eq('id', id)
    .select(TASK_SELECT)
    .single()

  if (error) throw error
  return data as Task
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}
