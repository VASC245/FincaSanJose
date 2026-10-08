<script setup lang="ts">
import type { Component } from 'vue'
import { ChevronRight } from 'lucide-vue-next'

// Cifra con etiqueta. Si recibe `to`, toda la tarjeta lleva a esa pantalla.
const props = withDefaults(
  defineProps<{
    title: string
    value: string | number
    subtitle?: string
    icon?: Component
    tone?: 'neutral' | 'positive' | 'negative'
    to?: string
  }>(),
  { tone: 'neutral' }
)

const valueTone = {
  neutral: 'text-gray-900',
  positive: 'text-emerald-700',
  negative: 'text-red-700'
}
</script>

<template>
  <component
    :is="props.to ? 'RouterLink' : 'div'"
    :to="props.to"
    :class="props.to ? 'card-link group' : 'card'"
    class="flex flex-col gap-1 min-w-0"
  >
    <p class="stat-label flex items-start gap-1.5">
      <component :is="icon" v-if="icon" class="w-4 h-4 shrink-0 text-gray-500" aria-hidden="true" />
      <span class="line-clamp-2 leading-4">{{ title }}</span>
      <ChevronRight
        v-if="props.to"
        class="w-3.5 h-3.5 ml-auto shrink-0 text-gray-400 transition-transform duration-150 group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </p>
    <p class="stat-value truncate" :class="valueTone[tone]">{{ value }}</p>
    <p v-if="subtitle" class="stat-sub">{{ subtitle }}</p>
  </component>
</template>
