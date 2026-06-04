<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { useInventoryStore } from '@/stores/inventory'
import { useRouter } from 'vue-router'

const inventoryStore = useInventoryStore()
const router = useRouter()

const alerts = computed(() => inventoryStore.lowStockItems)
</script>

<template>
  <div v-if="alerts.length" class="rounded-xl border border-yellow-200 bg-yellow-50 p-4 space-y-3">
    <div class="flex items-center gap-2">
      <AlertTriangle class="w-5 h-5 text-yellow-600 shrink-0" />
      <p class="text-sm font-semibold text-yellow-800">
        {{ alerts.length }} item{{ alerts.length > 1 ? 's' : '' }} con stock bajo
      </p>
    </div>

    <ul class="space-y-1">
      <li
        v-for="item in alerts"
        :key="item.id"
        class="text-xs text-yellow-700 flex items-center justify-between"
      >
        <span>{{ item.name }}</span>
        <span class="font-medium">
          {{ item.quantity }} / {{ item.min_quantity }} {{ item.unit }}
        </span>
      </li>
    </ul>

    <button
      class="text-xs text-yellow-700 underline hover:text-yellow-900"
      @click="router.push('/inventory')"
    >
      Ver inventario completo
    </button>
  </div>
</template>
