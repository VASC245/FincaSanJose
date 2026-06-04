<script setup lang="ts">
import { useRoute } from 'vue-router'
import { Menu } from 'lucide-vue-next'

const emit = defineEmits<{ toggleSidebar: [] }>()
const route = useRoute()

const title = computed(() => (route.meta?.title as string) ?? 'Finca')

import { computed } from 'vue'
</script>

<template>
  <header class="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0">
    <button
      class="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
      @click="emit('toggleSidebar')"
    >
      <Menu class="w-5 h-5 text-gray-600" />
    </button>

    <h1 class="text-lg font-semibold text-gray-800">{{ title }}</h1>

    <div class="ml-auto flex items-center gap-3">
      <span class="text-sm text-gray-500 hidden sm:block">
        {{ new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }) }}
      </span>
    </div>
  </header>
</template>
