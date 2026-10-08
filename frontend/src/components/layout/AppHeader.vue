<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Menu, ScanLine } from 'lucide-vue-next'
import AlertsPanel from '@/components/shared/AlertsPanel.vue'
import NotificationBell from '@/components/shared/NotificationBell.vue'

const emit = defineEmits<{ toggleSidebar: [] }>()
const route = useRoute()
const title = computed(() => (route.meta?.title as string) ?? 'Finca')
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

    <div class="ml-auto flex items-center gap-2">
      <span class="text-sm text-gray-500 hidden sm:block">
        {{ new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }) }}
      </span>
      <!-- Escanear siempre a un toque, en cualquier pantalla -->
      <RouterLink
        v-if="route.name !== 'scan'"
        to="/scan"
        class="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 min-h-[40px] text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
        aria-label="Escanear animal"
      >
        <ScanLine class="w-4 h-4" aria-hidden="true" />
        <span class="hidden sm:inline">Escanear</span>
      </RouterLink>
      <NotificationBell />
      <AlertsPanel />
    </div>
  </header>
</template>
