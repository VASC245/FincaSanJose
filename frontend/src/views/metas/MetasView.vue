<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Target, RefreshCw, Info, Milk, PiggyBank, Wallet } from 'lucide-vue-next'
import { fetchMetas, type MetasData } from '@/services/metasService'

const data = ref<MetasData | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    data.value = await fetchMetas()
  } catch (e: any) {
    error.value = e?.message ?? 'Error cargando metas'
  } finally {
    loading.value = false
  }
}

onMounted(load)

const levelStyles: Record<string, { card: string; dot: string; label: string }> = {
  good:   { card: 'border-green-200 bg-green-50',  dot: 'bg-green-500',  label: 'En meta' },
  warn:   { card: 'border-amber-200 bg-amber-50',  dot: 'bg-amber-500',  label: 'Atención' },
  bad:    { card: 'border-red-200 bg-red-50',      dot: 'bg-red-500',    label: 'Fuera de meta' },
  nodata: { card: 'border-gray-200 bg-gray-50',    dot: 'bg-gray-300',   label: 'Sin datos' }
}

function fmtCop(n: number) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(n)
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-2">
      <div>
        <h1 class="text-xl font-bold text-gray-800 flex items-center gap-2">
          <Target class="w-5 h-5 text-primary-600" /> Metas de la finca
        </h1>
        <p class="text-sm text-gray-500">Cómo va la finca frente a las metas de referencia</p>
      </div>
      <button class="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors" title="Actualizar" @click="load">
        <RefreshCw class="w-4 h-4" :class="loading ? 'animate-spin' : ''" />
      </button>
    </div>

    <div v-if="loading" class="text-center py-12 text-sm text-gray-500">Calculando metas...</div>
    <div v-else-if="error" class="card-error">{{ error }}</div>

    <template v-else-if="data">
      <!-- Semáforo de metas -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="m in data.metas"
          :key="m.key"
          class="rounded-xl border p-4 space-y-2"
          :class="levelStyles[m.level].card"
        >
          <div class="flex items-center justify-between gap-2">
            <p class="text-sm font-semibold text-gray-700">{{ m.title }}</p>
            <span class="flex items-center gap-1.5 text-xs font-medium text-gray-600 whitespace-nowrap">
              <span class="w-2.5 h-2.5 rounded-full" :class="levelStyles[m.level].dot" />
              {{ levelStyles[m.level].label }}
            </span>
          </div>
          <div class="flex items-baseline gap-2">
            <p class="text-2xl font-bold text-gray-900">{{ m.display }}</p>
            <p class="text-xs text-gray-500">{{ m.metaLabel }}</p>
          </div>
          <p class="text-xs text-gray-500">{{ m.hint }}</p>
        </div>
      </div>

      <!-- Costos unitarios -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Leche -->
        <div class="card space-y-3">
          <h2 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Milk class="w-4 h-4 text-blue-500" /> Costo por litro (mes actual)
          </h2>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="rounded-lg bg-gray-50 border border-gray-100 px-2 py-3">
              <p class="text-xs text-gray-500">Costo/litro</p>
              <p class="text-base font-bold text-gray-900">
                {{ data.costos.costoPorLitro != null ? fmtCop(data.costos.costoPorLitro) : '—' }}
              </p>
            </div>
            <div class="rounded-lg bg-gray-50 border border-gray-100 px-2 py-3">
              <p class="text-xs text-gray-500">Venta/litro</p>
              <p class="text-base font-bold text-gray-900">
                {{ data.costos.precioVentaLitro != null ? fmtCop(data.costos.precioVentaLitro) : '—' }}
              </p>
            </div>
            <div
              class="rounded-lg px-2 py-3 border"
              :class="data.costos.margenPorLitro == null ? 'bg-gray-50 border-gray-100'
                : data.costos.margenPorLitro >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'"
            >
              <p class="text-xs text-gray-500">Margen/litro</p>
              <p class="text-base font-bold"
                :class="data.costos.margenPorLitro == null ? 'text-gray-900'
                  : data.costos.margenPorLitro >= 0 ? 'text-green-700' : 'text-red-600'">
                {{ data.costos.margenPorLitro != null ? fmtCop(data.costos.margenPorLitro) : '—' }}
              </p>
            </div>
          </div>
          <p class="text-xs text-gray-500">
            {{ data.costos.litrosMes }} L producidos y {{ fmtCop(data.costos.gastosMes) }} en gastos este mes.
            El costo incluye TODOS los gastos de la finca — es un estimado global.
          </p>
        </div>

        <!-- Lechones -->
        <div class="card space-y-3">
          <h2 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <PiggyBank class="w-4 h-4 text-pink-500" /> Costo por lechón (año corrido)
          </h2>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="rounded-lg bg-gray-50 border border-gray-100 px-2 py-3">
              <p class="text-xs text-gray-500">Costo/lechón</p>
              <p class="text-base font-bold text-gray-900">
                {{ data.costos.costoPorLechon != null ? fmtCop(data.costos.costoPorLechon) : '—' }}
              </p>
            </div>
            <div class="rounded-lg bg-gray-50 border border-gray-100 px-2 py-3">
              <p class="text-xs text-gray-500">Destetados</p>
              <p class="text-base font-bold text-gray-900">{{ data.costos.destetadosAno }}</p>
            </div>
            <div class="rounded-lg bg-gray-50 border border-gray-100 px-2 py-3">
              <p class="text-xs text-gray-500">Gastos año</p>
              <p class="text-base font-bold text-gray-900">{{ fmtCop(data.costos.gastosAno) }}</p>
            </div>
          </div>
          <p class="text-xs text-gray-500">
            Gastos totales del año divididos entre los lechones destetados (o nacidos vivos si falta el dato de destete).
          </p>
        </div>
      </div>

      <div class="notice-info space-y-2">
        <div class="flex items-center gap-2">
          <Info class="w-4 h-4 text-blue-600 shrink-0" />
          <p class="text-sm font-semibold text-blue-800">Sobre estas metas</p>
        </div>
        <p class="text-xs text-blue-700">
          Las metas son valores de referencia para una finca lechera con cerdos. Verde = en meta,
          ámbar = atención, rojo = fuera de meta. Los costos por litro y por lechón mezclan todos los
          gastos de la finca (no separan leche de cerdos), así que sirven para ver la tendencia mes a
          mes más que como costo exacto. Entre más completos los registros de gastos, ventas, leche,
          destetes y pesos, más confiables estos números.
        </p>
      </div>
    </template>
  </div>
</template>
