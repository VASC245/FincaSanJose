<script setup lang="ts">
import { computed } from 'vue'
import { PackageX, ChevronRight } from 'lucide-vue-next'
import { useInventoryStore } from '@/stores/inventory'

const inventoryStore = useInventoryStore()

const alerts = computed(() => inventoryStore.lowStockItems)
</script>

<template>
  <section v-if="alerts.length" class="notice-warning space-y-3" aria-live="polite">
    <div class="flex items-center gap-2">
      <PackageX class="w-5 h-5 text-amber-700 shrink-0" aria-hidden="true" />
      <h2 class="text-sm font-semibold">
        {{ alerts.length }} {{ alerts.length > 1 ? 'productos' : 'producto' }} con stock bajo
      </h2>
    </div>

    <ul class="divide-y divide-amber-200/70">
      <li
        v-for="item in alerts"
        :key="item.id"
        class="text-sm flex items-center justify-between gap-3 py-1.5"
      >
        <span class="truncate">{{ item.name }}</span>
        <span class="font-semibold tabular-nums whitespace-nowrap">
          {{ item.quantity }} de {{ item.min_quantity }} {{ item.unit }}
        </span>
      </li>
    </ul>

    <RouterLink
      to="/inventory"
      class="inline-flex items-center gap-1 text-sm font-semibold text-amber-900 hover:underline"
    >
      Ver inventario <ChevronRight class="w-4 h-4" aria-hidden="true" />
    </RouterLink>
  </section>
</template>
