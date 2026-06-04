import { supabase } from '@/lib/supabase'

export type AlertLevel = 'critical' | 'warning' | 'info'

export interface FincaAlert {
  id: string
  level: AlertLevel
  title: string
  description: string
  link?: string
}

const today = () => new Date().toISOString().slice(0, 10)

function addDays(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function fetchAlerts(): Promise<FincaAlert[]> {
  const alerts: FincaAlert[] = []

  const [
    { data: cattlePartos },
    { data: pigPartos },
    { data: inventoryItems },
    { data: overdueTasks },
    { data: heatRecords },
  ] = await Promise.all([
    // Partos vacas próximos (14 días)
    supabase
      .from('cattle_details')
      .select('expected_birth, animal:animals!cattle_details_animal_id_fkey(ear_tag, name)')
      .eq('is_pregnant', true)
      .gte('expected_birth', today())
      .lte('expected_birth', addDays(14)),

    // Partos cerdas próximos (14 días)
    supabase
      .from('pig_details')
      .select('expected_birth, animal:animals!pig_details_animal_id_fkey(ear_tag, name)')
      .eq('is_pregnant', true)
      .gte('expected_birth', today())
      .lte('expected_birth', addDays(14)),

    // Inventario bajo o agotado
    supabase
      .from('inventory_items')
      .select('name, quantity, min_quantity, unit'),

    // Tareas vencidas
    supabase
      .from('tasks')
      .select('title, due_date')
      .in('status', ['pending', 'in_progress'])
      .lt('due_date', today())
      .not('due_date', 'is', null),

    // Celos recientes (para calcular próxima inseminación: último celo + 21 días)
    supabase
      .from('heat_records')
      .select('observed_date, animal:animals!heat_records_animal_id_fkey(ear_tag, name)')
      .gte('observed_date', addDays(-30))
      .order('observed_date', { ascending: false }),
  ])

  // ── Partos vacas ────────────────────────────────────────────────────────────
  for (const r of cattlePartos ?? []) {
    const animal = (r.animal as any)
    const name = animal?.ear_tag ?? animal?.name ?? 'Sin arete'
    const dias = Math.ceil((new Date(r.expected_birth).getTime() - Date.now()) / 86_400_000)
    alerts.push({
      id: `parto-vaca-${name}`,
      level: dias <= 3 ? 'critical' : 'warning',
      title: `Parto de vaca ${name}`,
      description: dias === 0 ? 'Hoy es la fecha esperada' : `En ${dias} día${dias !== 1 ? 's' : ''} (${r.expected_birth})`,
      link: '/cattle'
    })
  }

  // ── Partos cerdas ───────────────────────────────────────────────────────────
  for (const r of pigPartos ?? []) {
    const animal = (r.animal as any)
    const name = animal?.ear_tag ?? animal?.name ?? 'Sin arete'
    const dias = Math.ceil((new Date(r.expected_birth).getTime() - Date.now()) / 86_400_000)
    alerts.push({
      id: `parto-cerda-${name}`,
      level: dias <= 3 ? 'critical' : 'warning',
      title: `Parto de cerda ${name}`,
      description: dias === 0 ? 'Hoy es la fecha esperada' : `En ${dias} día${dias !== 1 ? 's' : ''} (${r.expected_birth})`,
      link: '/pigs'
    })
  }

  // ── Inventario ──────────────────────────────────────────────────────────────
  for (const item of inventoryItems ?? []) {
    if (item.quantity <= 0) {
      alerts.push({
        id: `inv-agotado-${item.name}`,
        level: 'critical',
        title: `${item.name} agotado`,
        description: `Sin stock disponible`,
        link: '/inventory'
      })
    } else if (item.quantity <= item.min_quantity) {
      alerts.push({
        id: `inv-bajo-${item.name}`,
        level: 'warning',
        title: `Stock bajo: ${item.name}`,
        description: `Quedan ${item.quantity} ${item.unit} (mínimo ${item.min_quantity})`,
        link: '/inventory'
      })
    }
  }

  // ── Tareas vencidas ─────────────────────────────────────────────────────────
  for (const task of overdueTasks ?? []) {
    const dias = Math.ceil((Date.now() - new Date(task.due_date).getTime()) / 86_400_000)
    alerts.push({
      id: `tarea-${task.title}`,
      level: dias >= 3 ? 'critical' : 'warning',
      title: `Tarea vencida`,
      description: `"${task.title}" — vencida hace ${dias} día${dias !== 1 ? 's' : ''}`,
      link: '/tasks'
    })
  }

  // ── Próximas inseminaciones (último celo + 21 días) ─────────────────────────
  const seenAnimals = new Set<string>()
  for (const r of heatRecords ?? []) {
    const animal = (r.animal as any)
    const name = animal?.ear_tag ?? animal?.name ?? 'Sin arete'
    if (seenAnimals.has(name)) continue
    seenAnimals.add(name)

    const nextHeat = new Date(r.observed_date)
    nextHeat.setDate(nextHeat.getDate() + 21)
    const diasHastaProximo = Math.ceil((nextHeat.getTime() - Date.now()) / 86_400_000)

    if (diasHastaProximo >= 0 && diasHastaProximo <= 5) {
      alerts.push({
        id: `celo-${name}`,
        level: diasHastaProximo <= 1 ? 'critical' : 'warning',
        title: `Próxima inseminación: ${name}`,
        description: diasHastaProximo === 0
          ? 'Hoy es el día estimado de celo'
          : `En ${diasHastaProximo} día${diasHastaProximo !== 1 ? 's' : ''} (ciclo de 21 días)`,
        link: '/pigs'
      })
    }
  }

  // Ordenar: critical primero
  return alerts.sort((a, b) =>
    a.level === 'critical' && b.level !== 'critical' ? -1 :
    b.level === 'critical' && a.level !== 'critical' ? 1 : 0
  )
}
