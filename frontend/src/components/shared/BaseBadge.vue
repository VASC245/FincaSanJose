<script setup lang="ts">
type Variant =
  | 'green'
  | 'red'
  | 'yellow'
  | 'blue'
  | 'purple'
  | 'gray'
  | 'orange'
  | 'pink'

withDefaults(
  defineProps<{
    variant?: Variant
    dot?: boolean
  }>(),
  { variant: 'gray', dot: false }
)

const variantMap: Record<Variant, string> = {
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  blue: 'bg-blue-100 text-blue-800',
  purple: 'bg-purple-100 text-purple-800',
  gray: 'bg-gray-100 text-gray-700',
  orange: 'bg-orange-100 text-orange-800',
  pink: 'bg-pink-100 text-pink-800'
}

const dotMap: Record<Variant, string> = {
  green: 'bg-green-500',
  red: 'bg-red-500',
  yellow: 'bg-yellow-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  gray: 'bg-gray-400',
  orange: 'bg-orange-500',
  pink: 'bg-pink-500'
}
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
    :class="variantMap[variant]"
  >
    <span v-if="dot" class="w-1.5 h-1.5 rounded-full" :class="dotMap[variant]" />
    <slot />
  </span>
</template>
