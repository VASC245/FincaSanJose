<script setup lang="ts">
import { computed } from 'vue'
import BaseBadge from '@/components/shared/BaseBadge.vue'
import { daysFromToday } from '@/lib/dates'

const props = defineProps<{
  isPregnant: boolean
  expectedDate?: string | null
}>()

// Días que faltan para el parto, contados en fecha local (no UTC)
const daysLeft = computed(() => (props.expectedDate ? daysFromToday(props.expectedDate) : null))
</script>

<template>
  <span>
    <BaseBadge v-if="isPregnant" :variant="daysLeft !== null && daysLeft <= 14 ? 'orange' : 'pink'" dot>
      Preñada
      <template v-if="daysLeft !== null">
        · {{ daysLeft > 0 ? `parto en ${daysLeft} d` : daysLeft === 0 ? 'parto hoy' : `parto pasado ${-daysLeft} d` }}
      </template>
    </BaseBadge>
    <BaseBadge v-else variant="gray">No preñada</BaseBadge>
  </span>
</template>
