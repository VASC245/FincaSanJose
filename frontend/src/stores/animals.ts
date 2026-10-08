import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Animal, AnimalFormData, CattleDetailFormData, PigDetailFormData, Species } from '@/types'
import * as animalService from '@/services/animalService'

export const useAnimalsStore = defineStore('animals', () => {
  const animals = ref<Animal[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const cattle = computed(() => animals.value.filter((a) => a.species === 'cattle'))
  const pigs = computed(() => animals.value.filter((a) => a.species === 'pig'))
  // Solo animales activos: una vaca vendida o muerta no cuenta como preñada del hato
  const pregnantCows = computed(
    () => cattle.value.filter((a) => a.status === 'active' && a.cattle_detail?.is_pregnant).length
  )
  const pregnantSows = computed(
    () => pigs.value.filter((a) => a.status === 'active' && a.pig_detail?.is_pregnant).length
  )

  async function loadAnimals(species?: Species) {
    loading.value = true
    error.value = null
    try {
      const fetched = await animalService.fetchAnimals(species)
      // Cargar una sola especie no debe borrar la otra de la lista compartida
      // (si no, los selectores de ventas, tareas o padres se quedan sin cerdos).
      animals.value = species
        ? [...animals.value.filter((a) => a.species !== species), ...fetched]
        : fetched
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function getAnimal(id: string): Promise<Animal | undefined> {
    const cached = animals.value.find((a) => a.id === id)
    if (cached) return cached
    try {
      return await animalService.fetchAnimalById(id)
    } catch (e) {
      error.value = (e as Error).message
      return undefined
    }
  }

  // Vuelve a leer un animal del servidor (ej. después de que un trigger lo cambió)
  async function refreshAnimal(id: string): Promise<Animal | undefined> {
    try {
      const fresh = await animalService.fetchAnimalById(id)
      const idx = animals.value.findIndex((a) => a.id === id)
      if (idx !== -1) animals.value[idx] = fresh
      return fresh
    } catch {
      return undefined
    }
  }

  async function addAnimal(
    animalData: AnimalFormData,
    detailData?: CattleDetailFormData | PigDetailFormData
  ): Promise<Animal> {
    const animal = await animalService.createAnimal(animalData)

    if (detailData) {
      if (animal.species === 'cattle') {
        const detail = await animalService.upsertCattleDetail(
          animal.id,
          detailData as CattleDetailFormData
        )
        animal.cattle_detail = detail
      } else {
        const detail = await animalService.upsertPigDetail(
          animal.id,
          detailData as PigDetailFormData
        )
        animal.pig_detail = detail
      }
    }

    animals.value.unshift(animal)
    return animal
  }

  async function editAnimal(
    id: string,
    animalData: Partial<AnimalFormData>,
    detailData?: Partial<CattleDetailFormData> | Partial<PigDetailFormData>
  ): Promise<Animal> {
    const animal = await animalService.updateAnimal(id, animalData)

    if (detailData) {
      if (animal.species === 'cattle') {
        const detail = await animalService.upsertCattleDetail(
          id,
          detailData as CattleDetailFormData
        )
        animal.cattle_detail = detail
      } else {
        const detail = await animalService.upsertPigDetail(id, detailData as PigDetailFormData)
        animal.pig_detail = detail
      }
    }

    // updateAnimal no trae los detalles: se conservan los que ya había
    const idx = animals.value.findIndex((a) => a.id === id)
    if (idx !== -1) {
      const merged = { ...animals.value[idx], ...animal }
      animals.value[idx] = merged
      return merged
    }
    return animal
  }

  async function removeAnimal(id: string): Promise<void> {
    await animalService.deleteAnimal(id)
    animals.value = animals.value.filter((a) => a.id !== id)
  }

  // ─── Batch helpers (reactive, no DB call) ───────────────────────────────────

  function removePigletsByLitter(motherid: string, birthDate: string) {
    animals.value = animals.value.filter(
      (a) => !(a.mother_id === motherid && a.birth_date === birthDate && a.species === 'pig')
    )
  }

  function updatePigletsBirthDateLocal(motherid: string, oldDate: string, newDate: string) {
    animals.value = animals.value.map((a) =>
      a.mother_id === motherid && a.birth_date === oldDate && a.species === 'pig'
        ? { ...a, birth_date: newDate }
        : a
    )
  }

  return {
    animals,
    loading,
    error,
    cattle,
    pigs,
    pregnantCows,
    pregnantSows,
    loadAnimals,
    getAnimal,
    addAnimal,
    editAnimal,
    refreshAnimal,
    removeAnimal,
    removePigletsByLitter,
    updatePigletsBirthDateLocal
  }
})
