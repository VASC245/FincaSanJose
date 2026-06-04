<script setup lang="ts">
import BaseBadge from '@/components/shared/BaseBadge.vue'

const props = defineProps<{
  isPregnant: boolean
  expectedDate?: string | null
}>()

function daysUntil(date: string): number {
  const diff = new Date(date).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}
</script>

<template>
  <span>
    <BaseBadge v-if="isPregnant" variant="pink" dot>
      Preñada
      <template v-if="expectedDate">
        · {{ daysUntil(expectedDate) }}d
      </template>
    </BaseBadge>
    <BaseBadge v-else variant="gray">No preñada</BaseBadge>
  </span>
</template>
