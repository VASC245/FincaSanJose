<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Scale, TrendingUp, Wheat, RefreshCw, Info } from 'lucide-vue-next'
import StatCard from '@/components/shared/StatCard.vue'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/dates'
import { fetchAllWeightRecords, computeAdg, type AdgSummary } from '@/services/weightService'
import type { WeightRecord } from '@/types'

interface PigRow {
  id: string
  label: string
  stage: string | null
  summary: AdgSummary | null
  lastWeight: number | null
  records: number
}

const rows = ref<PigRow[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const feedCost = ref(0)
const feedPeriodStart = ref<string | null>(null)

const stageLabels: Record<string, string> = {
  lactancia: 'Lactancia',
  destete: 'Destete',
  iniciacion: 'Iniciación',
  crecimiento: 'Crecimiento',
  engorde: 'Engorde',
  reproduccion: 'Reproducción'
}

const totalGain = computed(() =>
  Math.round(rows.value.reduce((s, r) => s + (r.summary?.totalGain ?? 0), 0) * 10) / 10
)

const avgAdg = computed(() => {
  const adgs = rows.value.map((r) => r.summary?.adg).filter((a): a is number => a != null)
  if (!adgs.length) return null
  return Math.round((adgs.reduce((s, a) => s + a, 0) / adgs.length) * 1000)
})

const costPerKg = computed(() => {
  if (totalGain.value <= 0 || !feedCost.value) return null
  return feedCost.value / totalGain.value
})

function fmtCop(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const [{ data: pigs }, allWeights] = await Promise.all([
      supabase
        .from('animals')
        .select('id, ear_tag, name, stage')
        .eq('species', 'pig')
        .eq('status', 'active'),
      fetchAllWeightRecords()
    ])

    const byAnimal = new Map<string, WeightRecord[]>()
    for (const w of allWeights) {
      const arr = byAnimal.get(w.animal_id) ?? []
      arr.push(w)
      byAnimal.set(w.animal_id, arr)
    }

    const result: PigRow[] = []
    for (const p of (pigs ?? []) as { id: string; ear_tag: string | null; name: string | null; stage: string | null }[]) {
      const records = byAnimal.get(p.id) ?? []
      const enEngorde = ['iniciacion', 'crecimiento', 'engorde'].includes(p.stage ?? '')
      // Mostrar cerdos en etapas de ceba, o cualquiera que ya tenga pesajes
      if (!enEngorde && !records.length) continue
      const summary = computeAdg(records)
      result.push({
        id: p.id,
        label: p.ear_tag && p.name ? `${p.ear_tag} · ${p.name}` : (p.ear_tag ?? p.name ?? 'Sin arete'),
        stage: p.stage,
        summary,
        lastWeight: records.length ? Number(records[records.length - 1].weight_kg) : null,
        records: records.length
      })
    }
    // Peores ADG primero (los que necesitan atención); sin datos al final
    result.sort((a, b) => (a.summary?.adg ?? Infinity) - (b.summary?.adg ?? Infinity))
    rows.value = result

    // Gastos de alimentación desde el primer pesaje registrado (estimado global)
    const starts = result.map((r) => r.summary?.firstDate).filter((d): d is string => !!d)
    if (starts.length) {
      feedPeriodStart.value = starts.sort()[0]
      const { data: gastos } = await supabase
        .from('gastos')
        .select('monto')
        .eq('categoria', 'alimentacion')
        .gte('fecha', feedPeriodStart.value)
      feedCost.value = (gastos ?? []).reduce((s, g) => s + Number(g.monto), 0)
    } else {
      feedPeriodStart.value = null
      feedCost.value = 0
    }
  } catch (e: any) {
    error.value = e?.message ?? 'Error cargando datos de engorde'
  } finally {
    loading.value = false
  }
}

onMounted(load)

function adgChip(adg: number) {
  return adg >= 0.6
    ? 'bg-green-100 text-green-700'
    : adg >= 0.4
      ? 'bg-amber-100 text-amber-700'
      : 'bg-red-100 text-red-700'
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-2">
      <div>
        <h1 class="text-xl font-bold text-gray-800">Engorde</h1>
        <p class="text-sm text-gray-500">Pesos, ganancia diaria y costo del alimento por kilo ganado</p>
      </div>
      <button class="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors" title="Actualizar" @click="load">
        <RefreshCw class="w-4 h-4" :class="loading ? 'animate-spin' : ''" />
      </button>
    </div>

    <div v-if="loading" class="text-center py-12 text-sm text-gray-400">Cargando...</div>
    <div v-else-if="error" class="card text-center py-8 text-sm text-red-600">{{ error }}</div>

    <template v-else>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Cerdos en ceba"
          :value="rows.length"
          :icon="Scale"
          color="orange"
        />
        <StatCard
          title="Kg ganados"
          :value="totalGain > 0 ? `+${totalGain}` : totalGain"
          :icon="TrendingUp"
          color="green"
          subtitle="entre pesajes"
        />
        <StatCard
          title="Ganancia diaria prom."
          :value="avgAdg != null ? `${avgAdg} g` : '—'"
          :icon="TrendingUp"
          color="blue"
          subtitle="meta: ≥ 600 g/día"
        />
        <StatCard
          title="Alimento por kg ganado"
          :value="costPerKg != null ? fmtCop(costPerKg) : '—'"
          :icon="Wheat"
          color="yellow"
          :subtitle="feedPeriodStart ? `desde ${formatDate(feedPeriodStart)}` : 'sin datos'"
        />
      </div>

      <div class="card space-y-3">
        <h2 class="text-sm font-semibold text-gray-700">Cerdos</h2>
        <p v-if="!rows.length" class="text-sm text-gray-400 py-4 text-center">
          No hay cerdos en etapas de ceba ni pesajes registrados. Registra pesos desde la ficha de cada cerdo.
        </p>
        <div v-else class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-100 text-sm">
            <thead>
              <tr class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th class="px-3 py-2">Cerdo</th>
                <th class="px-3 py-2">Etapa</th>
                <th class="px-3 py-2 text-right">Peso actual</th>
                <th class="px-3 py-2 text-right">Ganancia total</th>
                <th class="px-3 py-2 text-right">Ganancia/día</th>
                <th class="px-3 py-2 text-right">Pesajes</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="r in rows" :key="r.id" class="hover:bg-gray-50">
                <td class="px-3 py-2">
                  <RouterLink :to="`/pigs/${r.id}`" class="font-medium text-gray-800 hover:text-primary-600">
                    {{ r.label }}
                  </RouterLink>
                </td>
                <td class="px-3 py-2 text-gray-600">{{ r.stage ? stageLabels[r.stage] ?? r.stage : '—' }}</td>
                <td class="px-3 py-2 text-right font-semibold text-orange-700">
                  {{ r.lastWeight != null ? `${r.lastWeight} kg` : '—' }}
                </td>
                <td class="px-3 py-2 text-right text-gray-600">
                  <template v-if="r.summary">
                    {{ r.summary.totalGain >= 0 ? '+' : '' }}{{ r.summary.totalGain }} kg
                    <span class="text-xs text-gray-400">/ {{ r.summary.days }} d</span>
                  </template>
                  <template v-else>—</template>
                </td>
                <td class="px-3 py-2 text-right">
                  <span
                    v-if="r.summary?.adg != null"
                    class="text-[11px] font-medium rounded-full px-2 py-0.5"
                    :class="adgChip(r.summary.adg)"
                  >
                    {{ (r.summary.adg * 1000).toFixed(0) }} g/día
                  </span>
                  <span v-else class="text-gray-400 text-xs">necesita 2+ pesajes</span>
                </td>
                <td class="px-3 py-2 text-right text-gray-500">{{ r.records }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-2">
        <div class="flex items-center gap-2">
          <Info class="w-4 h-4 text-blue-600 shrink-0" />
          <p class="text-sm font-semibold text-blue-800">Cómo leer estos números</p>
        </div>
        <ul class="text-xs text-blue-700 space-y-1 list-disc list-inside">
          <li><span class="font-medium">Ganancia diaria (ADG):</span> un cerdo de engorde sano gana 600–900 g/día. Menos de 400 g/día indica revisar alimento, parásitos o enfermedad.</li>
          <li><span class="font-medium">Alimento por kg ganado:</span> es el total gastado en alimentación (categoría "Alimentación" de Gastos) dividido entre los kilos que ganaron todos los cerdos pesados. Es un estimado global: incluye el alimento de todos los animales de la finca.</li>
          <li>Pésalos siempre en ayunas o a la misma hora para que la comparación sea justa.</li>
        </ul>
      </div>
    </template>
  </div>
</template>
