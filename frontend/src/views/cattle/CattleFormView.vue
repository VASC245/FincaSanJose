<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import AnimalForm from '@/components/animals/AnimalForm.vue'
import { useAnimalsStore } from '@/stores/animals'
import type { Animal, CattleDetail, PigDetail } from '@/types'

const router = useRouter()
const route = useRoute()
const animalsStore = useAnimalsStore()

const loading = ref(false)
const animalData = ref<Animal | null>(null)

const isEdit = computed(() => !!route.params.id)

onMounted(async () => {
  if (isEdit.value) {
    animalData.value = (await animalsStore.getAnimal(route.params.id as string)) ?? null
  }
})

async function handleSubmit(
  animal: Partial<Animal>,
  detail: Partial<CattleDetail> | Partial<PigDetail>
) {
  loading.value = true
  try {
    if (isEdit.value && animalData.value) {
      await animalsStore.editAnimal(animalData.value.id, animal, detail)
      router.push(`/cattle/${animalData.value.id}`)
    } else {
      const created = await animalsStore.addAnimal(
        { ...animal, species: 'cattle' } as any,
        detail as any
      )
      router.push(`/cattle/${created.id}`)
    }
  } catch (e) {
    alert('Error: ' + (e as Error).message)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-4">
    <div class="flex items-center gap-3">
      <button
        class="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
        @click="router.back()"
      >
        <ArrowLeft class="w-5 h-5" />
      </button>
      <h1 class="text-xl font-bold text-gray-900">
        {{ isEdit ? 'Editar Bovino' : 'Nuevo Bovino' }}
      </h1>
    </div>

    <div class="card">
      <AnimalForm
        species="cattle"
        :animal="animalData"
        :loading="loading"
        @submit="handleSubmit"
        @cancel="router.back()"
      />
    </div>
  </div>
</template>
