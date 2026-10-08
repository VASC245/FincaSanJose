import { supabase } from '@/lib/supabase'
import { localToday, daysFromToday } from '@/lib/dates'
import { fetchReproductionData, type IndicatorLevel } from '@/services/reproductionService'
import { fetchAllWeightRecords, computeAdg } from '@/services/weightService'
import type { WeightRecord } from '@/types'

// Tablero de metas con semáforo: junta los indicadores clave de toda la app
// y los compara contra metas de referencia para finca lechera + cerdos.

export interface Meta {
  key: string
  title: string
  display: string        // valor formateado para mostrar
  metaLabel: string      // "meta: ≤ 120 días"
  level: IndicatorLevel | 'nodata'
  hint: string           // explicación corta en lenguaje sencillo
}

export interface UnitCosts {
  mesLabel: string
  litrosMes: number
  gastosMes: number
  costoPorLitro: number | null       // gastos del mes / litros del mes
  precioVentaLitro: number | null    // promedio de ventas tipo leche (monto/cantidad)
  margenPorLitro: number | null
  gastosAno: number
  destetadosAno: number
  costoPorLechon: number | null      // gastos del año / destetados del año
}

export interface MetasData {
  metas: Meta[]
  costos: UnitCosts
}

function nivel(value: number, good: (v: number) => boolean, warn: (v: number) => boolean): IndicatorLevel {
  return good(value) ? 'good' : warn(value) ? 'warn' : 'bad'
}

export async function fetchMetas(): Promise<MetasData> {
  const today = localToday()
  const mesActual = today.slice(0, 7)          // YYYY-MM
  const inicioAno = `${today.slice(0, 4)}-01-01`

  const [
    repro,
    allWeights,
    { data: sessions },
    { data: gastosMesData },
    { data: gastosAnoData },
    { data: ventasLeche },
    { data: vacas },
    { data: camadasAno },
  ] = await Promise.all([
    fetchReproductionData(),
    fetchAllWeightRecords(),
    supabase
      .from('milk_sessions')
      .select('recorded_date, liters')
      .gte('recorded_date', `${mesActual}-01`)
      .lte('recorded_date', today),
    supabase.from('gastos').select('monto').gte('fecha', `${mesActual}-01`).lte('fecha', today),
    supabase.from('gastos').select('monto').gte('fecha', inicioAno).lte('fecha', today),
    supabase
      .from('ventas')
      .select('monto, cantidad')
      .eq('tipo', 'leche')
      .gte('fecha', `${mesActual}-01`)
      .lte('fecha', today),
    supabase
      .from('animals')
      .select('id, species, sex, stage, birth_date, cattle_detail:cattle_details(birth_count, is_pregnant, expected_birth)')
      .eq('status', 'active'),
    supabase
      .from('litters')
      .select('born_alive, weaned_count')
      .gte('birth_date', inicioAno),
  ])

  // ── Leche del mes ──────────────────────────────────────────────────────────
  const litrosMes = (sessions ?? []).reduce((s, r) => s + Number(r.liters), 0)
  const diasConRegistro = new Set((sessions ?? []).map((r) => r.recorded_date)).size
  // Solo vacas en ordeño: adultas (ya parieron, o tienen 24+ meses si no hay partos
  // registrados) y no secas (secado 60 días antes del parto). Las terneras y
  // novillas no dan leche y bajaban el promedio.
  type ActiveAnimal = {
    id: string; species: string; sex: string; stage: string | null; birth_date: string | null
    cattle_detail: { birth_count: number; is_pregnant: boolean; expected_birth: string | null } | { birth_count: number; is_pregnant: boolean; expected_birth: string | null }[] | null
  }
  const activos = (vacas ?? []) as unknown as ActiveAnimal[]
  const detalle = (a: ActiveAnimal) => (Array.isArray(a.cattle_detail) ? a.cattle_detail[0] : a.cattle_detail) ?? null
  const hembrasBovinas = activos.filter((a) => a.species === 'cattle' && a.sex === 'female')
  const enOrdeno = hembrasBovinas.filter((a) => {
    const d = detalle(a)
    const adulta = (d?.birth_count ?? 0) > 0 ||
      (!!a.birth_date && daysFromToday(a.birth_date) <= -730)
    if (!adulta) return false
    if (!d) return true
    const seca = d.is_pregnant && !!d.expected_birth && daysFromToday(d.expected_birth) <= 60
    return !seca
  })
  // Si no hay partos registrados, se usa el total de hembras (como antes)
  const numVacas = enOrdeno.length || hembrasBovinas.length
  const litrosVacaDia = diasConRegistro > 0 && numVacas > 0
    ? Math.round((litrosMes / diasConRegistro / numVacas) * 10) / 10
    : null

  // ── ADG promedio de cerdos en engorde ──────────────────────────────────────
  const byAnimal = new Map<string, WeightRecord[]>()
  for (const w of allWeights) {
    const arr = byAnimal.get(w.animal_id) ?? []
    arr.push(w)
    byAnimal.set(w.animal_id, arr)
  }
  // Solo cerdos activos de ceba: no cerdas reproductoras ni animales vendidos
  const cerdosCeba = new Set(
    activos
      .filter((a) => a.species === 'pig' && a.stage !== 'reproduccion' && a.stage !== 'lactancia')
      .map((a) => a.id)
  )
  const adgs: number[] = []
  for (const [animalId, recs] of byAnimal.entries()) {
    if (!cerdosCeba.has(animalId)) continue
    const s = computeAdg(recs)
    if (s?.adg != null) adgs.push(s.adg)
  }
  const adgProm = adgs.length
    ? Math.round((adgs.reduce((s, a) => s + a, 0) / adgs.length) * 1000)
    : null

  // ── Costos unitarios ───────────────────────────────────────────────────────
  const gastosMes = (gastosMesData ?? []).reduce((s, g) => s + Number(g.monto), 0)
  const gastosAno = (gastosAnoData ?? []).reduce((s, g) => s + Number(g.monto), 0)

  const costoPorLitro = litrosMes > 0 ? gastosMes / litrosMes : null

  const ventasConCantidad = (ventasLeche ?? []).filter((v) => Number(v.cantidad) > 0)
  const totalVendido = ventasConCantidad.reduce((s, v) => s + Number(v.monto), 0)
  const litrosVendidos = ventasConCantidad.reduce((s, v) => s + Number(v.cantidad), 0)
  const precioVentaLitro = litrosVendidos > 0 ? totalVendido / litrosVendidos : null

  const margenPorLitro = costoPorLitro != null && precioVentaLitro != null
    ? precioVentaLitro - costoPorLitro
    : null

  const destetadosAno = (camadasAno ?? []).reduce(
    (s, l) => s + Number(l.weaned_count ?? l.born_alive ?? 0), 0
  )
  const costoPorLechon = destetadosAno > 0 ? gastosAno / destetadosAno : null

  // ── Metas con semáforo ─────────────────────────────────────────────────────
  const metas: Meta[] = [
    {
      key: 'litros-vaca',
      title: 'Litros por vaca al día',
      display: litrosVacaDia != null ? `${litrosVacaDia} L` : '—',
      metaLabel: 'meta: ≥ 8 L',
      level: litrosVacaDia == null ? 'nodata' : nivel(litrosVacaDia, v => v >= 8, v => v >= 5),
      hint: `Promedio del mes: ${Math.round(litrosMes)} L en ${diasConRegistro} día(s) entre ${numVacas} vaca(s).`
    },
    {
      key: 'dias-abiertos',
      title: 'Días abiertos (promedio)',
      display: repro.herd.promDiasAbiertos != null ? `${repro.herd.promDiasAbiertos} d` : '—',
      metaLabel: 'meta: ≤ 120 días',
      level: repro.herd.promDiasAbiertos == null ? 'nodata'
        : nivel(repro.herd.promDiasAbiertos, v => v <= 120, v => v <= 150),
      hint: 'Del último parto a la nueva preñez. Cada día de más es leche y ternero perdidos.'
    },
    {
      key: 'intervalo-partos',
      title: 'Intervalo entre partos',
      display: repro.herd.promIntervaloPartos != null ? `${repro.herd.promIntervaloPartos} d` : '—',
      metaLabel: 'meta: ≤ 400 días',
      level: repro.herd.promIntervaloPartos == null ? 'nodata'
        : nivel(repro.herd.promIntervaloPartos, v => v <= 400, v => v <= 430),
      hint: 'Un ternero por vaca al año.'
    },
    {
      key: 'servicios',
      title: 'Servicios por preñez',
      display: repro.herd.promServiciosPorConcepcion != null ? `${repro.herd.promServiciosPorConcepcion}` : '—',
      metaLabel: 'meta: ≤ 2',
      level: repro.herd.promServiciosPorConcepcion == null ? 'nodata'
        : nivel(repro.herd.promServiciosPorConcepcion, v => v <= 2, v => v <= 3),
      hint: 'Pajuelas gastadas por cada preñez lograda.'
    },
    {
      key: 'camadas-ano',
      title: 'Camadas por cerda al año',
      display: repro.herd.promCamadasPorAno != null ? `${repro.herd.promCamadasPorAno}` : '—',
      metaLabel: 'meta: ≥ 2.2',
      level: repro.herd.promCamadasPorAno == null ? 'nodata'
        : nivel(repro.herd.promCamadasPorAno, v => v >= 2.2, v => v >= 1.8),
      hint: 'Intervalo entre camadas de ~165 días o menos.'
    },
    {
      key: 'destetados-ano',
      title: 'Destetados por cerda al año',
      display: (() => {
        const vals = repro.sows.map(s => s.destetadosPorAno).filter((n): n is number => n != null)
        if (!vals.length) return '—'
        return `${Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10}`
      })(),
      metaLabel: 'meta: ≥ 22',
      level: (() => {
        const vals = repro.sows.map(s => s.destetadosPorAno).filter((n): n is number => n != null)
        if (!vals.length) return 'nodata' as const
        const prom = vals.reduce((s, v) => s + v, 0) / vals.length
        return nivel(prom, v => v >= 22, v => v >= 18)
      })(),
      hint: 'El indicador que más pesa en la rentabilidad porcina.'
    },
    {
      key: 'adg',
      title: 'Ganancia diaria en engorde',
      display: adgProm != null ? `${adgProm} g/día` : '—',
      metaLabel: 'meta: ≥ 600 g/día',
      level: adgProm == null ? 'nodata' : nivel(adgProm, v => v >= 600, v => v >= 400),
      hint: 'Promedio de los cerdos con dos o más pesajes.'
    },
  ]

  return {
    metas,
    costos: {
      mesLabel: mesActual,
      litrosMes: Math.round(litrosMes * 10) / 10,
      gastosMes,
      costoPorLitro,
      precioVentaLitro,
      margenPorLitro,
      gastosAno,
      destetadosAno,
      costoPorLechon,
    }
  }
}
