import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Gasto, GastoFormData, GastoCategoria } from '@/types'
import * as gastosService from '@/services/gastosService'

export const useGastosStore = defineStore('gastos', () => {
  const gastos = ref<Gasto[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const total = computed(() =>
    gastos.value.reduce((sum, g) => sum + Number(g.monto), 0)
  )

  function porCategoria(cat: GastoCategoria) {
    return gastos.value.filter((g) => g.categoria === cat)
  }

  async function loadGastos() {
    loading.value = true
    error.value = null
    try {
      gastos.value = await gastosService.fetchGastos()
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function addGasto(payload: GastoFormData, foto?: File): Promise<Gasto> {
    let foto_url: string | undefined
    if (foto) foto_url = await gastosService.uploadFactura(foto)
    const gasto = await gastosService.createGasto({ ...payload, foto_url })
    gastos.value.unshift(gasto)
    return gasto
  }

  async function editGasto(id: string, payload: Partial<GastoFormData>, foto?: File): Promise<Gasto> {
    let foto_url = payload.foto_url
    if (foto) {
      const old = gastos.value.find((g) => g.id === id)
      if (old?.foto_url) await gastosService.deleteFactura(old.foto_url)
      foto_url = await gastosService.uploadFactura(foto)
    }
    const updated = await gastosService.updateGasto(id, { ...payload, foto_url })
    const idx = gastos.value.findIndex((g) => g.id === id)
    if (idx !== -1) gastos.value[idx] = updated
    return updated
  }

  async function removeGasto(id: string): Promise<void> {
    const gasto = gastos.value.find((g) => g.id === id)
    if (gasto?.foto_url) await gastosService.deleteFactura(gasto.foto_url)
    await gastosService.deleteGasto(id)
    gastos.value = gastos.value.filter((g) => g.id !== id)
  }

  return { gastos, loading, error, total, porCategoria, loadGastos, addGasto, editGasto, removeGasto }
})
