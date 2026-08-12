import { supabase } from '@/lib/supabase'
import { localToday, daysFromToday } from '@/lib/dates'

// Indicadores reproductivos calculados sobre los datos existentes
// (partos, servicios/inseminaciones y camadas) — estilo DairyComp / PigCHAMP.

// Metas lecheras estándar:
//  - Días abiertos: ideal ≤ 120, alerta > 150
//  - Intervalo entre partos: ideal ≤ 400 días (~13 meses), alerta > 430
//  - Servicios por concepción: ideal ≤ 2, alerta > 3
// Metas porcinas:
//  - Intervalo entre camadas: ideal ≤ 165 días (~2.2 camadas/año), alerta > 180

export type IndicatorLevel = 'good' | 'warn' | 'bad'

export interface CowIndicators {
  animalId: string
  label: string
  isPregnant: boolean
  lastBirth: string | null       // último parto
  birthCount: number             // partos registrados
  diasAbiertos: number | null    // último parto → concepción (o hasta hoy si vacía)
  diasAbiertosEnCurso: boolean   // true si sigue vacía (el contador corre)
  intervaloPartos: number | null // promedio días entre partos consecutivos
  servicios: number | null       // servicios desde el último parto
}

export interface SowIndicators {
  animalId: string
  label: string
  isPregnant: boolean
  lastLitter: string | null
  litterCount: number
  intervaloCamadas: number | null  // promedio días entre camadas
  camadasPorAno: number | null     // 365 / intervalo
  diasDesdeCamada: number | null
}

export interface HerdIndicators {
  promDiasAbiertos: number | null
  promIntervaloPartos: number | null
  promServiciosPorConcepcion: number | null
  promIntervaloCamadas: number | null
  promCamadasPorAno: number | null
}

export interface ReproductionData {
  cows: CowIndicators[]
  sows: SowIndicators[]
  herd: HerdIndicators
}

function animalLabel(a: { ear_tag: string | null; name: string | null }): string {
  if (a.ear_tag && a.name) return `${a.ear_tag} · ${a.name}`
  return a.ear_tag ?? a.name ?? 'Sin arete'
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86_400_000
  )
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length)
}

// Niveles según metas
export function nivelDiasAbiertos(d: number): IndicatorLevel {
  return d <= 120 ? 'good' : d <= 150 ? 'warn' : 'bad'
}
export function nivelIntervaloPartos(d: number): IndicatorLevel {
  return d <= 400 ? 'good' : d <= 430 ? 'warn' : 'bad'
}
export function nivelServicios(s: number): IndicatorLevel {
  return s <= 2 ? 'good' : s <= 3 ? 'warn' : 'bad'
}
export function nivelIntervaloCamadas(d: number): IndicatorLevel {
  return d <= 165 ? 'good' : d <= 180 ? 'warn' : 'bad'
}

export async function fetchReproductionData(): Promise<ReproductionData> {
  const today = localToday()

  const [
    { data: animals },
    { data: calfBirths },
    { data: litters },
    { data: inseminations },
  ] = await Promise.all([
    supabase
      .from('animals')
      .select('id, ear_tag, name, species, sex, birth_date, stage, cattle_detail:cattle_details(*), pig_detail:pig_details(*)')
      .eq('status', 'active')
      .eq('sex', 'female'),
    supabase
      .from('calf_births')
      .select('cow_id, birth_date')
      .order('birth_date', { ascending: true }),
    supabase
      .from('litters')
      .select('sow_id, birth_date')
      .order('birth_date', { ascending: true }),
    supabase
      .from('insemination_records')
      .select('animal_id, insemination_date, pregnancy_confirmed'),
  ])

  type Row = {
    id: string
    ear_tag: string | null
    name: string | null
    species: 'cattle' | 'pig'
    birth_date: string | null
    stage: string | null
    cattle_detail: any
    pig_detail: any
  }

  const all: Row[] = ((animals ?? []) as any[]).map((a) => ({
    ...a,
    cattle_detail: Array.isArray(a.cattle_detail) ? a.cattle_detail[0] ?? null : a.cattle_detail,
    pig_detail: Array.isArray(a.pig_detail) ? a.pig_detail[0] ?? null : a.pig_detail,
  }))

  // Partos por vaca y camadas por cerda (fechas ascendentes)
  const partosPorVaca = new Map<string, string[]>()
  for (const b of (calfBirths ?? []) as { cow_id: string; birth_date: string }[]) {
    const arr = partosPorVaca.get(b.cow_id) ?? []
    arr.push(b.birth_date)
    partosPorVaca.set(b.cow_id, arr)
  }
  const camadasPorCerda = new Map<string, string[]>()
  for (const l of (litters ?? []) as { sow_id: string; birth_date: string }[]) {
    const arr = camadasPorCerda.get(l.sow_id) ?? []
    arr.push(l.birth_date)
    camadasPorCerda.set(l.sow_id, arr)
  }
  const serviciosPorAnimal = new Map<string, { date: string; confirmed: boolean | null }[]>()
  for (const s of (inseminations ?? []) as {
    animal_id: string
    insemination_date: string
    pregnancy_confirmed: boolean | null
  }[]) {
    const arr = serviciosPorAnimal.get(s.animal_id) ?? []
    arr.push({ date: s.insemination_date, confirmed: s.pregnancy_confirmed })
    serviciosPorAnimal.set(s.animal_id, arr)
  }

  // ── Vacas ──────────────────────────────────────────────────────────────────
  const cows: CowIndicators[] = []
  for (const a of all.filter((r) => r.species === 'cattle')) {
    const d = a.cattle_detail
    const partos = [...(partosPorVaca.get(a.id) ?? [])]
    // Si no hay registros en calf_births pero sí una fecha de último parto, usarla
    if (!partos.length && d?.last_birth_date) partos.push(d.last_birth_date)
    partos.sort()
    const lastBirth = partos.length ? partos[partos.length - 1] : null
    const birthCount = Math.max(partos.length, d?.birth_count ?? 0)

    // Sin historial reproductivo: solo incluir si es adulta con algún dato
    if (!lastBirth && !d?.is_pregnant && !serviciosPorAnimal.has(a.id)) continue

    // Intervalo entre partos (necesita ≥ 2 partos registrados)
    const gaps: number[] = []
    for (let i = 1; i < partos.length; i++) {
      const g = daysBetween(partos[i - 1], partos[i])
      if (g > 0) gaps.push(g)
    }
    const intervaloPartos = avg(gaps)

    // Días abiertos: último parto → concepción; si vacía, corre hasta hoy
    let diasAbiertos: number | null = null
    let enCurso = false
    if (lastBirth) {
      if (d?.is_pregnant && d?.conception_date && d.conception_date >= lastBirth) {
        diasAbiertos = daysBetween(lastBirth, d.conception_date)
      } else if (!d?.is_pregnant && lastBirth <= today) {
        diasAbiertos = -daysFromToday(lastBirth)
        enCurso = true
      }
    }

    // Servicios desde el último parto (ciclo actual)
    const servicios = serviciosPorAnimal.get(a.id) ?? []
    const serviciosCiclo = lastBirth
      ? servicios.filter((s) => s.date > lastBirth).length
      : servicios.length
    // Solo mostrar si hubo servicios registrados (evitar 0 engañoso sin datos)
    const serviciosMostrar = serviciosCiclo > 0 ? serviciosCiclo : null

    cows.push({
      animalId: a.id,
      label: animalLabel(a),
      isPregnant: !!d?.is_pregnant,
      lastBirth,
      birthCount,
      diasAbiertos,
      diasAbiertosEnCurso: enCurso,
      intervaloPartos,
      servicios: serviciosMostrar,
    })
  }

  // Orden: peores días abiertos primero
  cows.sort((a, b) => (b.diasAbiertos ?? -1) - (a.diasAbiertos ?? -1))

  // ── Cerdas ─────────────────────────────────────────────────────────────────
  const sows: SowIndicators[] = []
  for (const a of all.filter((r) => r.species === 'pig')) {
    const d = a.pig_detail
    const camadas = camadasPorCerda.get(a.id) ?? []
    const esReproductora = a.stage === 'reproduccion' || camadas.length > 0 || (d?.litter_count ?? 0) > 0 || !!d?.is_pregnant
    if (!esReproductora) continue

    const lastLitter = camadas.length ? camadas[camadas.length - 1] : null
    const gaps: number[] = []
    for (let i = 1; i < camadas.length; i++) {
      const g = daysBetween(camadas[i - 1], camadas[i])
      if (g > 0) gaps.push(g)
    }
    const intervaloCamadas = avg(gaps)

    sows.push({
      animalId: a.id,
      label: animalLabel(a),
      isPregnant: !!d?.is_pregnant,
      lastLitter,
      litterCount: Math.max(camadas.length, d?.litter_count ?? 0),
      intervaloCamadas,
      camadasPorAno: intervaloCamadas ? Math.round((365 / intervaloCamadas) * 10) / 10 : null,
      diasDesdeCamada: lastLitter ? -daysFromToday(lastLitter) : null,
    })
  }

  sows.sort((a, b) => (b.diasDesdeCamada ?? -1) - (a.diasDesdeCamada ?? -1))

  // ── Promedios del hato ─────────────────────────────────────────────────────
  // Servicios por concepción global: servicios del ciclo entre vacas que quedaron preñadas
  const serviciosConcebidas = cows
    .filter((c) => c.isPregnant && c.servicios != null && c.servicios > 0)
    .map((c) => c.servicios as number)

  const herd: HerdIndicators = {
    promDiasAbiertos: avg(cows.map((c) => c.diasAbiertos).filter((n): n is number => n != null)),
    promIntervaloPartos: avg(cows.map((c) => c.intervaloPartos).filter((n): n is number => n != null)),
    promServiciosPorConcepcion: serviciosConcebidas.length
      ? Math.round((serviciosConcebidas.reduce((s, n) => s + n, 0) / serviciosConcebidas.length) * 10) / 10
      : null,
    promIntervaloCamadas: avg(sows.map((s) => s.intervaloCamadas).filter((n): n is number => n != null)),
    promCamadasPorAno: null,
  }
  herd.promCamadasPorAno = herd.promIntervaloCamadas
    ? Math.round((365 / herd.promIntervaloCamadas) * 10) / 10
    : null

  return { cows, sows, herd }
}
