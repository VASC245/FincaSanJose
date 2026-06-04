<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Search } from 'lucide-vue-next'
import BaseTable from '@/components/shared/BaseTable.vue'
import BaseBadge from '@/components/shared/BaseBadge.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import PregnancyBadge from '@/components/cattle/PregnancyBadge.vue'
import { useAnimalsStore } from '@/stores/animals'
import type { Animal } from '@/types'

const animalsStore = useAnimalsStore()
const router = useRouter()

const searchQuery = ref('')
const filterStatus = ref('')
const filterPregnant = ref('')

onMounted(() => animalsStore.loadAnimals('cattle'))

const filteredCattle = computed(() => {
  return animalsStore.cattle.filter((a) => {
    const matchSearch =
      !searchQuery.value ||
      a.ear_tag.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      (a.name ?? '').toLowerCase().includes(searchQuery.value.toLowerCase())

    const matchStatus = !filterStatus.value || a.status === filterStatus.value

    const matchPregnant =
      !filterPregnant.value ||
      (filterPregnant.value === 'yes' && a.cattle_detail?.is_pregnant) ||
      (filterPregnant.value === 'no' && !a.cattle_detail?.is_pregnant)

    return matchSearch && matchStatus && matchPregnant
  })
})

const columns = [
  { key: 'ear_tag', label: 'Arete' },
  { key: 'name', label: 'Nombre' },
  { key: 'sex', label: 'Sexo' },
  { key: 'status', label: 'Estado' },
  { key: 'pregnant', label: 'Preñez' }
]

const statusVariant: Record<string, 'green' | 'red' | 'gray' | 'blue'> = {
  active: 'green',
  sold: 'blue',
  deceased: 'red',
  culled: 'gray'
}

const statusLabel: Record<string, string> = {
  active: 'Activo',
  sold: 'Vendido',
  deceased: 'Fallecido',
  culled: 'Descartado'
}

function goToDetail(row: Animal) {
  router.push(`/cattle/${row.id}`)
}

function formatBreed(b: string | null | undefined) {
  if (!b) return '—'
  return b.charAt(0).toUpperCase() + b.slice(1).replace('_', ' ')
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold text-gray-900">Bovinos</h1>
        <p class="text-sm text-gray-500">{{ animalsStore.cattle.length }} animales registrados</p>
      </div>
      <BaseButton @click="router.push('/cattle/new')">
        <Plus class="w-4 h-4" /> Nuevo bovino
      </BaseButton>
    </div>

    <!-- Filters -->
    <div class="card flex flex-col sm:flex-row gap-3">
      <div class="relative flex-1">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Buscar por arete o nombre..."
          class="form-input pl-9"
        />
      </div>
      <select v-model="filterStatus" class="form-select sm:w-40">
        <option value="">Todos los estados</option>
        <option value="active">Activo</option>
        <option value="sold">Vendido</option>
        <option value="deceased">Fallecido</option>
        <option value="culled">Descartado</option>
      </select>
      <select v-model="filterPregnant" class="form-select sm:w-36">
        <option value="">Preñez: todas</option>
        <option value="yes">Preñadas</option>
        <option value="no">No preñadas</option>
      </select>
    </div>

    <!-- Table -->
    <BaseTable
      :columns="columns"
      :rows="filteredCattle"
      :loading="animalsStore.loading"
      empty-message="No hay bovinos registrados."
      @row-click="goToDetail"
    >
      <template #sex="{ row }">
        <BaseBadge :variant="(row as Animal).sex === 'female' ? 'pink' : 'blue'">
          {{ (row as Animal).sex === 'female' ? 'Hembra' : 'Macho' }}
        </BaseBadge>
      </template>


      <template #status="{ row }">
        <BaseBadge :variant="statusVariant[(row as Animal).status]">
          {{ statusLabel[(row as Animal).status] }}
        </BaseBadge>
      </template>

      <template #pregnant="{ row }">
        <PregnancyBadge
          :is-pregnant="!!(row as Animal).cattle_detail?.is_pregnant"
          :expected-date="(row as Animal).cattle_detail?.expected_birth"
        />
      </template>

      <template #name="{ row }">
        {{ (row as Animal).name ?? '—' }}
      </template>

      <template #actions="{ row }">
        <div class="flex gap-2 justify-end">
          <button
            class="text-xs text-primary-600 hover:text-primary-800 font-medium"
            @click.stop="router.push(`/cattle/${(row as Animal).id}/edit`)"
          >
            Editar
          </button>
        </div>
      </template>
    </BaseTable>
  </div>
</template>
