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
  if (d <= 0) return 'hoy es el último día'
  return d === 1 ? 'termina mañana' : `faltan ${d + 1} días`
}
</script>

<template>
  <section v-if="withdrawals.length" class="notice-danger space-y-3" aria-live="polite">
    <div class="flex items-center gap-2">
      <MilkOff class="w-5 h-5 text-red-700 shrink-0" aria-hidden="true" />
      <h2 class="text-sm font-semibold">Leche en retiro: no vender</h2>
    </div>

    <ul class="divide-y divide-red-200/70">
      <li
        v-for="w in withdrawals"
        :key="w.animal_id"
        class="py-1.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-x-3"
      >
        <RouterLink :to="`/cattle/${w.animal_id}`" class="text-sm font-semibold truncate hover:underline">
          {{ label(w) }}<span v-if="w.item_name" class="font-normal text-red-800"> · {{ w.item_name }}</span>
        </RouterLink>
        <span class="text-sm text-red-800 whitespace-nowrap">
          hasta el {{ formatDate(w.until) }}, {{ diasRestantes(w.until) }}
        </span>
      </li>
    </ul>
  </section>
</template>
