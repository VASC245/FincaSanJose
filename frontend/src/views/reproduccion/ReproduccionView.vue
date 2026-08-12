<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { HeartHandshake, CalendarRange, Syringe, Baby, RefreshCw, Info } from 'lucide-vue-next'
import StatCard from '@/components/shared/StatCard.vue'
import { formatDate } from '@/lib/dates'
import {
  fetchReproductionData,
  nivelDiasAbiertos,
  nivelIntervaloPartos,
  nivelServicios,
  nivelIntervaloCamadas,
  nivelDestetadosPorAno,
  type ReproductionData,
  type IndicatorLevel
} from '@/services/reproductionService'

const data = ref<ReproductionData | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    data.value = await fetchReproductionData()
  } catch (e: any) {
    error.value = e?.message ?? 'Error cargando indicadores'
  } finally {
    loading.value = false
  }
}

onMounted(load)

function chip(level: IndicatorLevel) {
  return {
    good: 'bg-green-100 text-green-700',
    warn: 'bg-amber-100 text-amber-700',
    bad: 'bg-red-100 text-red-700'
  }[level]
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between flex-wrap gap-2">
      <div>
        <h1 class="text-xl font-bold text-gray-800">Reproducción</h1>
        <p class="text-sm text-gray-500">Indicadores calculados con los partos, servicios y camadas registrados</p>
      </div>
      <button
        class="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
        title="Actualizar"
        @click="load"
      >
        <RefreshCw class="w-4 h-4" :class="loading ? 'animate-spin' : ''" />
      </button>
    </div>

    <div v-if="loading" class="text-center py-12 text-sm text-gray-400">
      Calculando indicadores...
    </div>
    <div v-else-if="error" class="card text-center py-8 text-sm text-red-600">
      {{ error }}
    </div>

    <template v-else-if="data">
      <!-- Promedios del hato -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Días abiertos (prom.)"
          :value="data.herd.promDiasAbiertos ?? '—'"
          :icon="CalendarRange"
          color="blue"
          subtitle="meta: ≤ 120"
        />
        <StatCard
          title="Intervalo entre partos"
          :value="data.herd.promIntervaloPartos ? `${data.herd.promIntervaloPartos} d` : '—'"
          :icon="Baby"
          color="green"
          subtitle="meta: ≤ 400 días"
        />
        <StatCard
          title="Servicios por preñez"
          :value="data.herd.promServiciosPorConcepcion ?? '—'"
          :icon="Syringe"
          color="purple"
          subtitle="meta: ≤ 2"
        />
        <StatCard
          title="Camadas por cerda/año"
          :value="data.herd.promCamadasPorAno ?? '—'"
          :icon="HeartHandshake"
          color="pink"
          subtitle="meta: ≥ 2.2"
        />
      </div>

      <!-- Vacas -->
      <div class="card space-y-3">
        <h2 class="text-sm font-semibold text-gray-700">Vacas</h2>
        <p v-if="!data.cows.length" class="text-sm text-gray-400 py-4 text-center">
          Aún no hay partos ni servicios registrados en bovinos.
        </p>
        <div v-else class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-100 text-sm">
            <thead>
              <tr class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th class="px-3 py-2">Vaca</th>
                <th class="px-3 py-2">Estado</th>
                <th class="px-3 py-2">Último parto</th>
                <th class="px-3 py-2">Días abiertos</th>
                <th class="px-3 py-2">Intervalo partos</th>
                <th class="px-3 py-2">Servicios</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="c in data.cows" :key="c.animalId" class="hover:bg-gray-50">
                <td class="px-3 py-2">
                  <RouterLink :to="`/cattle/${c.animalId}`" class="font-medium text-gray-800 hover:text-primary-600">
                    {{ c.label }}
                  </RouterLink>
                </td>
                <td class="px-3 py-2">
                  <span
                    class="text-[11px] font-medium rounded-full px-2 py-0.5"
                    :class="c.isPregnant ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-600'"
                  >
                    {{ c.isPregnant ? 'Preñada' : 'Vacía' }}
                  </span>
                </td>
                <td class="px-3 py-2 text-gray-600 whitespace-nowrap">
                  {{ c.lastBirth ? formatDate(c.lastBirth) : '—' }}
                  <span v-if="c.birthCount" class="text-xs text-gray-400">({{ c.birthCount }} parto{{ c.birthCount !== 1 ? 's' : '' }})</span>
                </td>
                <td class="px-3 py-2">
                  <span
                    v-if="c.diasAbiertos != null"
                    class="text-[11px] font-medium rounded-full px-2 py-0.5 whitespace-nowrap"
                    :class="chip(nivelDiasAbiertos(c.diasAbiertos))"
                  >
                    {{ c.diasAbiertos }} d{{ c.diasAbiertosEnCurso ? ' y contando' : '' }}
                  </span>
                  <span v-else class="text-gray-400">—</span>
                </td>
                <td class="px-3 py-2">
                  <span
                    v-if="c.intervaloPartos != null"
                    class="text-[11px] font-medium rounded-full px-2 py-0.5"
                    :class="chip(nivelIntervaloPartos(c.intervaloPartos))"
                  >
                    {{ c.intervaloPartos }} d
                  </span>
                  <span v-else class="text-gray-400">—</span>
                </td>
                <td class="px-3 py-2">
                  <span
                    v-if="c.servicios != null"
                    class="text-[11px] font-medium rounded-full px-2 py-0.5"
                    :class="chip(nivelServicios(c.servicios))"
                  >
                    {{ c.servicios }}
                  </span>
                  <span v-else class="text-gray-400">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Cerdas: ranking de madres -->
      <div class="card space-y-3">
        <div class="flex items-center justify-between flex-wrap gap-1">
          <h2 class="text-sm font-semibold text-gray-700">Cerdas reproductoras — ranking de madres</h2>
          <p class="text-xs text-gray-400">Ordenadas de mejor a peor por destetados/año</p>
        </div>
        <p v-if="!data.sows.length" class="text-sm text-gray-400 py-4 text-center">
          Aún no hay camadas registradas en cerdas reproductoras.
        </p>
        <div v-else class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-100 text-sm">
            <thead>
              <tr class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th class="px-3 py-2">Cerda</th>
                <th class="px-3 py-2">Estado</th>
                <th class="px-3 py-2">Última camada</th>
                <th class="px-3 py-2">Intervalo camadas</th>
                <th class="px-3 py-2">Camadas/año</th>
                <th class="px-3 py-2">Vivos/camada</th>
                <th class="px-3 py-2">Destetados/camada</th>
                <th class="px-3 py-2">Destetados/año</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="s in data.sows" :key="s.animalId" class="hover:bg-gray-50">
                <td class="px-3 py-2">
                  <RouterLink :to="`/pigs/${s.animalId}`" class="font-medium text-gray-800 hover:text-primary-600">
                    {{ s.label }}
                  </RouterLink>
                </td>
                <td class="px-3 py-2">
                  <span
                    class="text-[11px] font-medium rounded-full px-2 py-0.5"
                    :class="s.isPregnant ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-600'"
                  >
                    {{ s.isPregnant ? 'Preñada' : 'Vacía' }}
                  </span>
                </td>
                <td class="px-3 py-2 text-gray-600 whitespace-nowrap">
                  {{ s.lastLitter ? formatDate(s.lastLitter) : '—' }}
                  <span v-if="s.litterCount" class="text-xs text-gray-400">({{ s.litterCount }})</span>
                </td>
                <td class="px-3 py-2">
                  <span
                    v-if="s.intervaloCamadas != null"
                    class="text-[11px] font-medium rounded-full px-2 py-0.5"
                    :class="chip(nivelIntervaloCamadas(s.intervaloCamadas))"
                  >
                    {{ s.intervaloCamadas }} d
                  </span>
                  <span v-else class="text-gray-400">—</span>
                </td>
                <td class="px-3 py-2 text-gray-600">
                  {{ s.camadasPorAno ?? '—' }}
                </td>
                <td class="px-3 py-2 text-gray-600">
                  {{ s.nacidosVivosProm ?? '—' }}
                </td>
                <td class="px-3 py-2 text-gray-600">
                  <template v-if="s.destetadosProm != null">
                    {{ s.destetadosProm }}<span v-if="s.destetadosEstimados" class="text-amber-500" title="Estimado: falta el dato de destete en alguna camada">*</span>
                  </template>
                  <template v-else>—</template>
                </td>
                <td class="px-3 py-2">
                  <span
                    v-if="s.destetadosPorAno != null"
                    class="text-[11px] font-medium rounded-full px-2 py-0.5"
                    :class="chip(nivelDestetadosPorAno(s.destetadosPorAno))"
                  >
                    {{ s.destetadosPorAno }}
                  </span>
                  <span v-else class="text-gray-400">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="data.sows.some(s => s.destetadosEstimados)" class="text-xs text-amber-600">
          * Estimado con nacidos vivos — registra los destetados editando la camada (Camadas → lápiz) para el dato real.
        </p>
      </div>

      <!-- Ranking de sementales -->
      <div class="card space-y-3">
        <h2 class="text-sm font-semibold text-gray-700">Ranking de sementales (toros y verracos)</h2>
        <p v-if="!data.sires.length" class="text-sm text-gray-400 py-4 text-center">
          Aún no hay inseminaciones con nombre de semental registrado.
        </p>
        <div v-else class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-100 text-sm">
            <thead>
              <tr class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th class="px-3 py-2">Semental</th>
                <th class="px-3 py-2 text-right">Servicios</th>
                <th class="px-3 py-2 text-right">Preñeces</th>
                <th class="px-3 py-2 text-right">Fallidos</th>
                <th class="px-3 py-2 text-right">Pendientes</th>
                <th class="px-3 py-2 text-right">Efectividad</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="r in data.sires" :key="r.name" class="hover:bg-gray-50">
                <td class="px-3 py-2 font-medium text-gray-800">{{ r.name }}</td>
                <td class="px-3 py-2 text-right text-gray-600">{{ r.servicios }}</td>
                <td class="px-3 py-2 text-right text-green-700 font-medium">{{ r.prenadas }}</td>
                <td class="px-3 py-2 text-right text-red-600">{{ r.fallidas }}</td>
                <td class="px-3 py-2 text-right text-gray-500">{{ r.pendientes }}</td>
                <td class="px-3 py-2 text-right">
                  <span
                    v-if="r.tasa != null"
                    class="text-[11px] font-medium rounded-full px-2 py-0.5"
                    :class="r.tasa >= 60 ? 'bg-green-100 text-green-700' : r.tasa >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'"
                  >
                    {{ r.tasa }}%
                  </span>
                  <span v-else class="text-gray-400 text-xs">sin resultados</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Explicación -->
      <div class="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-2">
        <div class="flex items-center gap-2">
          <Info class="w-4 h-4 text-blue-600 shrink-0" />
          <p class="text-sm font-semibold text-blue-800">Qué significa cada indicador</p>
        </div>
        <ul class="text-xs text-blue-700 space-y-1 list-disc list-inside">
          <li><span class="font-medium">Días abiertos:</span> días desde el último parto hasta que la vaca vuelve a quedar preñada. Menos de 120 está bien; más de 150 es plata perdida en leche y terneros.</li>
          <li><span class="font-medium">Intervalo entre partos:</span> días entre un parto y el siguiente. La meta es un ternero por vaca al año (365–400 días).</li>
          <li><span class="font-medium">Servicios por preñez:</span> cuántas inseminaciones se necesitaron para preñar. Más de 2 seguidas indica revisar la vaca, el semen o el momento del servicio.</li>
          <li><span class="font-medium">Camadas por cerda/año:</span> una buena cerda logra 2.2 o más camadas al año (intervalo de ~165 días o menos).</li>
          <li><span class="font-medium">Destetados por cerda/año:</span> el indicador más importante de una cerda. Meta: 22 o más; menos de 18 constante es señal de descartar esa madre.</li>
          <li><span class="font-medium">Efectividad del semental:</span> preñeces logradas sobre servicios con resultado conocido. Menos del 40% seguido indica cambiar de pajuela o revisar el manejo del celo.</li>
        </ul>
      </div>
    </template>
  </div>
</template>
