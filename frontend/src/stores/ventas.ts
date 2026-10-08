import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Venta, VentaFormData, VentaTipo } from '@/types'
import * as ventasService from '@/services/ventasService'

export const useVentasStore = defineStore('ventas', () => {
  const ventas = ref<Venta[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const total = computed(() =>
    ventas.value.reduce((sum, v) => sum + Number(v.monto), 0)
  )

  function porTipo(tipo: VentaTipo) {
    return ventas.value.filter((v) => v.tipo === tipo)
  }

  async function loadVentas() {
    loading.value = true
    error.value = null
    try {
      ventas.value = await ventasService.fetchVentas()
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function addVenta(payload: VentaFormData): Promise<Venta> {
    const venta = await ventasService.createVenta(payload)
    ventas.value.unshift(venta)
    return venta
  }

  async function editVenta(id: string, payload: Partial<VentaFormData>): Promise<Venta> {
    const updated = await ventasService.updateVenta(id, payload)
    const idx = ventas.value.findIndex((v) => v.id === id)
    if (idx !== -1) {
      // Fusionar: la respuesta offline (sintética) solo trae los campos cambiados
      ventas.value[idx] = { ...ventas.value[idx], ...updated }
      return ventas.value[idx]
    }
    return updated
  }

  async function removeVenta(id: string): Promise<void> {
    await ventasService.deleteVenta(id)
    ventas.value = ventas.value.filter((v) => v.id !== id)
  }

  return { ventas, loading, error, total, porTipo, loadVentas, addVenta, editVenta, removeVenta }
})
