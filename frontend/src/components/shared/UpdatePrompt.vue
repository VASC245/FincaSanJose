<script setup lang="ts">
import { ref } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { RefreshCw, X } from 'lucide-vue-next'

const { needRefresh, updateServiceWorker } = useRegisterSW()
const dismissed = ref(false)

function update() { updateServiceWorker(true) }
function dismiss() { dismissed.value = true }
</script>

<template>
  <Transition name="slide-up">
    <div
      v-if="needRefresh && !dismissed"
      class="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 text-sm max-w-[calc(100vw-2rem)]"
    >
      <RefreshCw class="w-4 h-4 text-emerald-400 shrink-0" />
      <span>Nueva versión disponible</span>
      <button
        class="bg-emerald-500 hover:bg-emerald-600 transition-colors px-3 py-1 rounded-lg font-medium text-xs"
        @click="update"
      >
        Actualizar
      </button>
      <button class="p-1 hover:bg-white/10 rounded-lg transition-colors" @click="dismiss">
        <X class="w-3.5 h-3.5" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active { transition: opacity 0.3s, transform 0.3s }
.slide-up-enter-from, .slide-up-leave-to       { opacity: 0; transform: translateX(-50%) translateY(12px) }
</style>
