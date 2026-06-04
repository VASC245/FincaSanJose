import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Litter, LitterFormData } from '@/types'
import { fetchLitters, createLitter, deleteLitter } from '@/services/vaccinationService'

export const usePigsStore = defineStore('pigs', () => {
  const litters = ref<Litter[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function loadLitters(motherId: string) {
    loading.value = true
    error.value = null
    try {
      litters.value = (await fetchLitters(motherId)) as Litter[]
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function addLitter(payload: LitterFormData): Promise<Litter> {
    const litter = (await createLitter(payload)) as Litter
    litters.value.unshift(litter)
    return litter
  }

  async function removeLitter(id: string): Promise<void> {
    await deleteLitter(id)
    litters.value = litters.value.filter((l) => l.id !== id)
  }

  function clearLitters() {
    litters.value = []
  }

  return {
    litters,
    loading,
    error,
    loadLitters,
    addLitter,
    removeLitter,
    clearLitters
  }
})
