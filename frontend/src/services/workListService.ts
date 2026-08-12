import { supabase } from '@/lib/supabase'
import { localToday, localDateOffset, addDaysToDate, daysFromToday, formatDate } from '@/lib/dates'
import { fetchActiveMilkWithdrawals } from '@/services/vaccinationService'

// Listas de trabajo automáticas ("qué toca hoy"), calculadas sobre los datos
// existentes — estilo Herdwatch / Software Ganadero SG.

export type WorkUrgency = 'overdue' | 'today' | 'soon'

export interface WorkItem {
  id: string
  label: string          // arete · nombre
  detail: string         // qué hay que hacer / contexto
  urgency: WorkUrgency
  link: string
}

export interface WorkList {
  key: string
  title: string
  items: WorkItem[]
}

// Días antes del parto esperado en que se seca la vaca (estándar lechero: 60)
const DIAS_SECADO = 60
// Edad mínima (meses) para considerar una vaca como reproductora sin preñez
const EDAD_REPRODUCTIVA_MESES = 15

function animalLabel(a: { ear_tag: string | null; name: string | null } | null | undefined): string {
  if (!a) return 'Sin arete'
  if (a.ear_tag && a.name) return `${a.ear_tag} · ${a.name}`
  return a.ear_tag ?? a.name ?? 'Sin arete'
}

function urgencyFor(dias: number): WorkUrgency {
  return dias < 0 ? 'overdue' : dias === 0 ? 'today' : 'soon'
}

function enDias(dias: number): string {
  if (dias === 0) return 'hoy'
  if (dias < 0) return `hace ${-dias} día${dias !== -1 ? 's' : ''}`
  return `en ${dias} día${dias !== 1 ? 's' : ''}`
}

function edadEnMeses(birthDate: string): number {
  const nacimiento = new Date(`${birthDate}T12:00:00`)
  const hoy = new Date()
  return (hoy.getFullYear() - nacimiento.getFullYear()) * 12 + (hoy.getMonth() - nacimiento.getMonth())
}

export async function fetchWorkLists(): Promise<WorkList[]> {
  const today = localToday()

  const [
    { data: animals },
    { data: dueVaccinations },
    { data: recentVaccinations },
    { data: dueTasks },
    retiros,
  ] = await Promise.all([
    supabase
      .from('animals')
      .select('id, ear_tag, name, species, sex, birth_date, stage, cattle_detail:cattle_details(*), pig_detail:pig_details(*)')
      .eq('status', 'active'),

    // Vacunas con próxima dosis vencida o en los próximos 7 días
    supabase
      .from('vaccination_records')
      .select('id, animal_id, vaccine_id, inventory_item_id, applied_date, next_date, animal:animals!vaccination_records_animal_id_fkey(id, ear_tag, name, species, status), vaccine:vaccines(name), inventory_item:inventory_items(name)')
      .not('next_date', 'is', null)
      .gte('next_date', localDateOffset(-60))
      .lte('next_date', localDateOffset(7)),

    // Aplicaciones recientes (para no avisar dosis que ya se pusieron)
    supabase
      .from('vaccination_records')
      .select('animal_id, vaccine_id, inventory_item_id, applied_date')
      .gte('applied_date', localDateOffset(-60)),

    // Tareas vencidas o para hoy
    supabase
      .from('tasks')
      .select('id, title, due_date, priority')
      .in('status', ['pending', 'in_progress'])
      .not('due_date', 'is', null)
      .lte('due_date', today),

    fetchActiveMilkWithdrawals().catch(() => []),
  ])

  type AnimalRow = {
    id: string
    ear_tag: string | null
    name: string | null
    species: 'cattle' | 'pig'
    sex: 'male' | 'female'
    birth_date: string | null
    stage: string | null
    cattle_detail: {
      is_pregnant: boolean
      conception_date: string | null
      expected_birth: string | null
      birth_count: number
    } | null
    pig_detail: {
      is_pregnant: boolean
      service_date: string | null
      expected_birth: string | null
      litter_count: number
    } | null
  }

  // Supabase devuelve la relación 1-1 como objeto o array según el esquema
  const all: AnimalRow[] = ((animals ?? []) as any[]).map((a) => ({
    ...a,
    cattle_detail: Array.isArray(a.cattle_detail) ? a.cattle_detail[0] ?? null : a.cattle_detail,
    pig_detail: Array.isArray(a.pig_detail) ? a.pig_detail[0] ?? null : a.pig_detail,
  }))

  const vacas = all.filter((a) => a.species === 'cattle' && a.sex === 'female')
  const cerdas = all.filter((a) => a.species === 'pig' && a.sex === 'female')

  // ── 1. Vacas a secar (60 días antes del parto esperado) ────────────────────
  const secar: WorkItem[] = []
  for (const v of vacas) {
    const d = v.cattle_detail
    if (!d?.is_pregnant || !d.expected_birth) continue
    if (d.expected_birth < today) continue // parto ya pasó (dato por actualizar)
    const fechaSecado = addDaysToDate(d.expected_birth, -DIAS_SECADO)
    const dias = daysFromToday(fechaSecado)
    if (dias > 7) continue
    secar.push({
      id: `secar-${v.id}`,
      label: animalLabel(v),
      detail: dias <= 0
        ? `Secar ya — parto esperado el ${formatDate(d.expected_birth)}`
        : `Secar ${enDias(dias)} (parto el ${formatDate(d.expected_birth)})`,
      urgency: urgencyFor(dias),
      link: `/cattle/${v.id}`,
    })
  }

  // ── 2. Partos próximos (14 días) o vencidos por registrar ──────────────────
  const partos: WorkItem[] = []
  for (const a of [...vacas, ...cerdas]) {
    const d = a.species === 'cattle' ? a.cattle_detail : a.pig_detail
    if (!d?.is_pregnant || !d.expected_birth) continue
    const dias = daysFromToday(d.expected_birth)
    if (dias > 14 || dias < -7) continue
    const tipo = a.species === 'cattle' ? 'Vaca' : 'Cerda'
    partos.push({
      id: `parto-${a.id}`,
      label: `${tipo} ${animalLabel(a)}`,
      detail: dias < 0
        ? `Fecha esperada pasó ${enDias(dias)} — registrar el parto o revisar`
        : `Parto esperado ${enDias(dias)} (${formatDate(d.expected_birth)})`,
      urgency: urgencyFor(dias),
      link: a.species === 'cattle' ? `/cattle/${a.id}` : `/pigs/${a.id}`,
    })
  }

  // ── 3. Revisar preñez día 21 (retorno de celo post-servicio) ───────────────
  const revisar: WorkItem[] = []
  for (const a of [...vacas, ...cerdas]) {
    const esVaca = a.species === 'cattle'
    const d = esVaca ? a.cattle_detail : a.pig_detail
    const servicio = esVaca
      ? a.cattle_detail?.conception_date
      : a.pig_detail?.service_date
    if (!d?.is_pregnant || !servicio) continue
    const fechaRevision = addDaysToDate(servicio, 21)
    const dias = daysFromToday(fechaRevision)
    if (dias < -2 || dias > 3) continue
    revisar.push({
      id: `revisar-${a.id}`,
      label: `${esVaca ? 'Vaca' : 'Cerda'} ${animalLabel(a)}`,
      detail: dias <= 0
        ? `Revisar si regresó el celo (servicio el ${formatDate(servicio)})`
        : `Revisión de celo ${enDias(dias)} (día 21 del servicio)`,
      urgency: urgencyFor(dias),
      link: esVaca ? `/cattle/${a.id}` : `/pigs/${a.id}`,
    })
  }

  // ── 4. Hembras sin preñez confirmada ───────────────────────────────────────
  const vacias: WorkItem[] = []
  for (const v of vacas) {
    const d = v.cattle_detail
    if (d?.is_pregnant) continue
    const esAdulta =
      (d?.birth_count ?? 0) > 0 ||
      (v.birth_date ? edadEnMeses(v.birth_date) >= EDAD_REPRODUCTIVA_MESES : false)
    if (!esAdulta) continue
    vacias.push({
      id: `vacia-${v.id}`,
      label: `Vaca ${animalLabel(v)}`,
      detail: d?.conception_date
        ? `Último servicio el ${formatDate(d.conception_date)} — sin preñez confirmada`
        : 'Sin servicio registrado — programar inseminación',
      urgency: 'soon',
      link: `/cattle/${v.id}`,
    })
  }
  for (const c of cerdas) {
    const d = c.pig_detail
    if (d?.is_pregnant) continue
    const esReproductora = c.stage === 'reproduccion' || (d?.litter_count ?? 0) > 0
    if (!esReproductora) continue
    vacias.push({
      id: `vacia-${c.id}`,
      label: `Cerda ${animalLabel(c)}`,
      detail: d?.service_date
        ? `Último servicio el ${formatDate(d.service_date)} — sin preñez confirmada`
        : 'Sin servicio registrado — programar monta o inseminación',
      urgency: 'soon',
      link: `/pigs/${c.id}`,
    })
  }

  // ── 5. Vacunas por aplicar (vencidas o en 7 días) ──────────────────────────
  type DueVac = {
    id: string
    animal_id: string
    vaccine_id: string | null
    inventory_item_id: string | null
    applied_date: string
    next_date: string
    animal: { id: string; ear_tag: string | null; name: string | null; species: string; status: string } | null
    vaccine: { name: string } | null
    inventory_item: { name: string } | null
  }
  const aplicadas = (recentVaccinations ?? []) as {
    animal_id: string
    vaccine_id: string | null
    inventory_item_id: string | null
    applied_date: string
  }[]

  // Dedupe por animal+producto quedándonos con la aplicación más reciente
  const porClave = new Map<string, DueVac>()
  for (const r of ((dueVaccinations ?? []) as unknown as DueVac[])) {
    if (!r.animal || r.animal.status !== 'active') continue
    const clave = `${r.animal_id}|${r.vaccine_id ?? r.inventory_item_id ?? 'x'}`
    const prev = porClave.get(clave)
    if (!prev || r.applied_date > prev.applied_date) porClave.set(clave, r)
  }

  const vacunas: WorkItem[] = []
  for (const r of porClave.values()) {
    // Si ya se aplicó el mismo producto después de esa dosis, no avisar
    const yaAplicada = aplicadas.some(
      (a) =>
        a.animal_id === r.animal_id &&
        (a.vaccine_id ?? a.inventory_item_id) === (r.vaccine_id ?? r.inventory_item_id) &&
        a.applied_date > r.applied_date
    )
    if (yaAplicada) continue
    const dias = daysFromToday(r.next_date)
    const producto = r.vaccine?.name ?? r.inventory_item?.name ?? 'dosis'
    vacunas.push({
      id: `vacuna-${r.id}`,
      label: animalLabel(r.animal),
      detail: dias < 0
        ? `${producto} — vencida ${enDias(dias)}`
        : `${producto} — aplicar ${enDias(dias)}`,
      urgency: urgencyFor(dias),
      link: r.animal.species === 'cattle' ? `/cattle/${r.animal.id}` : `/pigs/${r.animal.id}`,
    })
  }

  // ── 6. Leche en retiro (no vender) ─────────────────────────────────────────
  const retiro: WorkItem[] = retiros.map((w) => {
    const dias = daysFromToday(w.until)
    return {
      id: `retiro-${w.animal_id}`,
      label: animalLabel(w.animal),
      detail: `NO vender leche hasta el ${formatDate(w.until)}${w.item_name ? ` (${w.item_name})` : ''}`,
      urgency: 'today' as WorkUrgency,
      link: w.animal ? `/cattle/${w.animal.id}` : '/cattle',
    }
  })

  // ── 7. Tareas vencidas o para hoy ──────────────────────────────────────────
  const tareas: WorkItem[] = ((dueTasks ?? []) as { id: string; title: string; due_date: string }[]).map((t) => {
    const dias = daysFromToday(t.due_date)
    return {
      id: `tarea-${t.id}`,
      label: t.title,
      detail: dias === 0 ? 'Vence hoy' : `Vencida ${enDias(dias)}`,
      urgency: urgencyFor(dias),
      link: '/tasks',
    }
  })

  const ordenar = (items: WorkItem[]) => {
    const peso: Record<WorkUrgency, number> = { overdue: 0, today: 1, soon: 2 }
    return items.sort((a, b) => peso[a.urgency] - peso[b.urgency])
  }

  return [
    { key: 'partos', title: 'Partos próximos', items: ordenar(partos) },
    { key: 'secar', title: 'Vacas a secar', items: ordenar(secar) },
    { key: 'revisar', title: 'Revisar preñez (día 21)', items: ordenar(revisar) },
    { key: 'vacunas', title: 'Vacunas por aplicar', items: ordenar(vacunas) },
    { key: 'retiro', title: 'Leche en retiro', items: retiro },
    { key: 'tareas', title: 'Tareas vencidas o de hoy', items: ordenar(tareas) },
    { key: 'vacias', title: 'Hembras sin preñez confirmada', items: vacias },
  ]
}
