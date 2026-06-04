import { supabase } from '@/lib/supabase'
import type { Task, TaskFormData } from '@/types'

export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, animal:animals(id, ear_tag, name, species)')
    .order('due_date', { ascending: true, nullsFirst: false })

  if (error) throw error
  return (data ?? []) as Task[]
}

export async function fetchTaskById(id: string): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, animal:animals(id, ear_tag, name, species)')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as Task
}

export async function createTask(payload: TaskFormData): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data as Task
}

export async function updateTask(id: string, payload: Partial<TaskFormData>): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Task
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}
