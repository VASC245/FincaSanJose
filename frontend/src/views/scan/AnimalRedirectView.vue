<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAnimalsStore } from '@/stores/animals'
import { animalPath } from '@/services/scanService'

// Destino del QR del animal (/a/<id>): averigua si es vaca o cerdo y abre su ficha.
const route = useRoute()
const router = useRouter()
const animalsStore = useAnimalsStore()
const missing = ref(false)

onMounted(async () => {
  const a = await animalsStore.getAnimal(route.params.id as string)
  if (a) router.replace(animalPath(a))
  else missing.value = true
})
</script>

<template>
  <div class="max-w-lg mx-auto">
    <div v-if="!missing" class="card-empty">Abriendo la ficha del animal...</div>
    <div v-else class="card-empty space-y-3">
      <p>Este código no corresponde a ningún animal registrado. Puede que el animal se haya borrado.</p>
      <RouterLink to="/scan" class="inline-block font-medium text-primary-700 hover:underline">Escanear otro</RouterLink>
    </div>
  </div>
</template>
