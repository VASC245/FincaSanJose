<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { MilkOff } from 'lucide-vue-next'
import { formatDate, daysFromToday } from '@/lib/dates'
import { fetchActiveMilkWithdrawals, type ActiveMilkWithdrawal } from '@/services/vaccinationService'

const withdrawals = ref<ActiveMilkWithdrawal[]>([])

onMounted(async () => {
  try {
    withdrawals.value = await fetchActiveMilkWithdrawals()
  } catch {
    // sin datos no se muestra nada
  }
})

function label(w: ActiveMilkWithdrawal) {
  const a = w.animal
  if (!a) return 'Animal'
  return a.ear_tag ? `${a.ear_tag}${a.name ? ` · ${a.name}` : ''}` : (a.name ?? 'Animal')
}

function diasRestantes(until: string) {
  const d = daysFromToday(until)
  return d <= 0 ? 'último día' : `${d + 1} día(s) más`
}
</script>

<template>
  <div v-if="withdrawals.length" class="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
    <div class="flex items-center gap-2">
      <MilkOff class="w-5 h-5 text-red-600 shrink-0" />
      <p class="text-sm font-semibold text-red-800">
        Leche en retiro — NO vender
      </p>
    </div>

    <ul class="space-y-1">
      <li
        v-for="w in withdrawals"
        :key="w.animal_id"
        class="text-xs text-red-700 flex items-center justify-between gap-2"
      >
        <span class="truncate">
          {{ label(w) }}<span v-if="w.item_name" class="text-red-400"> · {{ w.item_name }}</span>
        </span>
        <span class="font-medium whitespace-nowrap">
          hasta el {{ formatDate(w.until) }} ({{ diasRestantes(w.until) }})
        </span>
      </li>
    </ul>
  </div>
</template>
