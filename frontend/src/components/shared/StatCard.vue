<script setup lang="ts">
import type { Component } from 'vue'

withDefaults(
  defineProps<{
    title: string
    value: string | number
    subtitle?: string
    icon?: Component
    iconClass?: string
    trend?: 'up' | 'down' | 'neutral'
    trendValue?: string
    color?: 'green' | 'blue' | 'yellow' | 'red' | 'purple' | 'orange'
  }>(),
  { color: 'green' }
)

const colorMap = {
  green: 'bg-primary-50 text-primary-600',
  blue: 'bg-blue-50 text-blue-600',
  yellow: 'bg-yellow-50 text-yellow-600',
  red: 'bg-red-50 text-red-600',
  purple: 'bg-purple-50 text-purple-600',
  orange: 'bg-orange-50 text-orange-600'
}
</script>

<template>
  <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
    <div
      v-if="icon"
      class="rounded-xl p-3 shrink-0"
      :class="colorMap[color]"
    >
      <component :is="icon" class="w-6 h-6" />
    </div>

    <div class="min-w-0 flex-1">
      <p class="text-sm text-gray-500 truncate">{{ title }}</p>
      <p class="text-2xl font-bold text-gray-900 mt-0.5">{{ value }}</p>
      <p v-if="subtitle" class="text-xs text-gray-400 mt-0.5">{{ subtitle }}</p>
    </div>
  </div>
</template>
