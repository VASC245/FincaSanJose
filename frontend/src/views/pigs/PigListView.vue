<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Search } from 'lucide-vue-next'
import BaseTable from '@/components/shared/BaseTable.vue'
import BaseBadge from '@/components/shared/BaseBadge.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import PregnancyBadge from '@/components/cattle/PregnancyBadge.vue'
import { useAnimalsStore } from '@/stores/animals'
import { calcPigStage, pigAgeLabel, stageConfig } from '@/services/pigService'
import type { Animal } from '@/types'

const animalsStore = useAnimalsStore()
const router = useRouter()

const searchQuery = ref('')
const filterStatus = ref('')
const filterPregnant = ref('')
const filterStage = ref('')

onMounted(() => animalsStore.loadAnimals('pig'))

const filteredPigs = computed(() =>
  animalsStore.pigs.filter((a) => {
    const matchSearch =
      !searchQuery.value ||
      (a.ear_tag ?? '').toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      (a.name ?? '').toLowerCase().includes(searchQuery.value.toLowerCase())
    const matchStatus = !filterStatus.value || a.status === filterStatus.value
    const matchPregnant =
      !filterPregnant.value ||
      (filterPregnant.value === 'yes' && a.pig_detail?.is_pregnant) ||
      (filterPregnant.value === 'no' && !a.pig_detail?.is_pregnant)
    const matchStage = !filterStage.value || calcPigStage(a.birth_date) === filterStage.value
    return matchSearch && matchStatus && matchPregnant && matchStage
  })
)

const columns = [
  { key: 'ear_tag', label: 'Identificador' },
  { key: 'name', label: 'Nombre' },
  { key: 'sex', label: 'Sexo' },
  { key: 'stage', label: 'Etapa' },
  { key: 'status', label: 'Estado' },
  { key: 'pregnant', label: 'Preñez' }
]

const statusVariant: Record<string, 'green' | 'red' | 'gray' | 'blue'> = {
  active: 'green', sold: 'blue', deceased: 'red', culled: 'gray'
}
const statusLabel: Record<string, string> = {
  active: 'Activo', sold: 'Vendido', deceased: 'Fallecido', culled: 'Descartado'
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold text-gray-900">Porcinos</h1>
        <p class="text-sm text-gray-500">{{ animalsStore.pigs.length }} animales registrados</p>
      </div>
      <BaseButton @click="router.push('/pigs/new')">
        <Plus class="w-4 h-4" /> Nuevo porcino
      </BaseButton>
    </div>

    <div class="card flex flex-col sm:flex-row gap-3">
      <div class="relative flex-1">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input v-model="searchQuery" type="text" placeholder="Buscar..." class="form-input pl-9" />
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
      <select v-model="filterStage" class="form-select sm:w-40">
        <option value="">Todas las etapas</option>
        <option v-for="(cfg, key) in stageConfig" :key="key" :value="key">
          {{ cfg.label }}
        </option>
      </select>
    </div>

    <BaseTable
      :columns="columns"
      :rows="filteredPigs"
      :loading="animalsStore.loading"
      empty-message="No hay porcinos registrados."
      @row-click="(row) => router.push(`/pigs/${(row as Animal).id}`)"
    >
      <template #name="{ row }">{{ (row as Animal).name ?? '—' }}</template>

      <template #stage="{ row }">
        <template v-if="calcPigStage((row as Animal).birth_date)">
          <span
            class="text-xs px-2 py-0.5 rounded-full font-medium border"
            :class="stageConfig[calcPigStage((row as Animal).birth_date)!].class"
          >
            {{ stageConfig[calcPigStage((row as Animal).birth_date)!].label }}
          </span>
          <span v-if="pigAgeLabel((row as Animal).birth_date)" class="ml-1.5 text-xs text-gray-400">
            {{ pigAgeLabel((row as Animal).birth_date) }}
          </span>
        </template>
        <span v-else class="text-sm text-gray-400">—</span>
      </template>

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
          :is-pregnant="!!(row as Animal).pig_detail?.is_pregnant"
          :expected-date="(row as Animal).pig_detail?.expected_birth"
        />
      </template>

      <template #actions="{ row }">
        <button
          class="text-xs text-primary-600 hover:text-primary-800 font-medium"
          @click.stop="router.push(`/pigs/${(row as Animal).id}/edit`)"
        >
          Editar
        </button>
      </template>
    </BaseTable>
  </div>
</template>
