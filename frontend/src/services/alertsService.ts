import { supabase } from '@/lib/supabase'

export type AlertLevel = 'critical' | 'warning' | 'info'

export interface FincaAlert {
  id: string
  level: AlertLevel
  title: string
  description: string
  link?: string
}

import { localToday, localDateOffset, addDaysToDate } from '@/lib/dates'

const today = localToday

function addDays(days: number) {
  return localDateOffset(days)
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

  function daysDiff(dateStr: string): number {
    const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0)
    const target = new Date(`${dateStr}T12:00:00`)
    return Math.round((target.getTime() - todayMidnight.getTime()) / 86_400_000)
  }

  // ── Partos vacas ────────────────────────────────────────────────────────────
  for (const r of cattlePartos ?? []) {
    const animal = (r.animal as any)
    const name = animal?.ear_tag ?? animal?.name ?? 'Sin arete'
    const dias = daysDiff(r.expected_birth)
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
    const dias = daysDiff(r.expected_birth)
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
    const dias = Math.abs(daysDiff(task.due_date))
    alerts.push({
      id: `tarea-${task.title}`,
      level: dias >= 3 ? 'critical' : 'warning',
      title: `Tarea vencida`,
      description: `"${task.title}" — vencida hace ${dias} día${dias !== 1 ? 's' : ''}`,
      link: '/tasks'
    })
  }

  // ── Próximas inseminaciones porcinas (último celo + 21 días) ─────────────────
  const seenAnimals = new Set<string>()
  for (const r of heatRecords ?? []) {
    const animal = (r.animal as any)
    const name = animal?.ear_tag ?? animal?.name ?? 'Sin arete'
    if (seenAnimals.has(name)) continue
    seenAnimals.add(name)

    const nextHeatDate = addDaysToDate(r.observed_date, 21)
    const diasHastaProximo = daysDiff(nextHeatDate)

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

  // ── Revisión de retorno de celo post-inseminación (bovinos y porcinos) ──────
  // Si a los 21 días post-inseminación regresa el celo → no quedó preñada
  const [{ data: cattleInsem }, { data: pigInsem }] = await Promise.all([
    supabase
      .from('cattle_details')
      .select('conception_date, animal:animals!cattle_details_animal_id_fkey(ear_tag, name)')
      .eq('is_pregnant', true)
      .not('conception_date', 'is', null)
      .gte('conception_date', addDays(-30))
      .lte('conception_date', addDays(-18)),
    supabase
      .from('pig_details')
      .select('service_date, animal:animals!pig_details_animal_id_fkey(ear_tag, name)')
      .eq('is_pregnant', true)
      .not('service_date', 'is', null)
      .gte('service_date', addDays(-30))
      .lte('service_date', addDays(-18)),
  ])

  for (const r of cattleInsem ?? []) {
    const animal = (r.animal as any)
    const name = animal?.ear_tag ?? animal?.name ?? 'Sin arete'
    const checkDate = addDaysToDate(r.conception_date, 21)
    const diasParaRevision = daysDiff(checkDate)
    if (diasParaRevision >= -2 && diasParaRevision <= 3) {
      alerts.push({
        id: `revision-celo-vaca-${name}`,
        level: diasParaRevision <= 0 ? 'critical' : 'warning',
        title: `Revisar preñez: vaca ${name}`,
        description: diasParaRevision < 0
          ? `Verificar si regresó el celo (día ${Math.abs(diasParaRevision)} de revisión)`
          : diasParaRevision === 0
            ? 'Hoy — revisar si regresó el celo para confirmar preñez'
            : `En ${diasParaRevision} días — revisión de retorno de celo`,
        link: '/cattle'
      })
    }
  }

  for (const r of pigInsem ?? []) {
    const animal = (r.animal as any)
    const name = animal?.ear_tag ?? animal?.name ?? 'Sin arete'
    const checkDate = addDaysToDate(r.service_date, 21)
    const diasParaRevision = daysDiff(checkDate)
    if (diasParaRevision >= -2 && diasParaRevision <= 3) {
      alerts.push({
        id: `revision-celo-cerda-${name}`,
        level: diasParaRevision <= 0 ? 'critical' : 'warning',
        title: `Revisar preñez: cerda ${name}`,
        description: diasParaRevision < 0
          ? `Verificar si regresó el celo (día ${Math.abs(diasParaRevision)} de revisión)`
          : diasParaRevision === 0
            ? 'Hoy — revisar si regresó el celo para confirmar preñez'
            : `En ${diasParaRevision} días — revisión de retorno de celo`,
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
