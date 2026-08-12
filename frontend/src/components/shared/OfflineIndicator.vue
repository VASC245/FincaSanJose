<script setup lang="ts">
import { WifiOff, RefreshCw, CheckCircle2, AlertTriangle, X } from 'lucide-vue-next'
import { offlineState } from '@/offline/state'
import { syncNow, clearFailed } from '@/offline/syncManager'
</script>

<template>
  <!-- Sin señal -->
  <div
    v-if="!offlineState.online"
    class="bg-amber-500 text-white px-4 py-2 text-sm flex items-center gap-2 flex-wrap"
  >
    <WifiOff class="w-4 h-4 shrink-0" />
    <span class="font-medium">Sin señal</span>
    <span class="text-amber-100">
      — puedes seguir trabajando; todo se guarda en el teléfono
      <template v-if="offlineState.pending > 0">
        ({{ offlineState.pending }} cambio{{ offlineState.pending !== 1 ? 's' : '' }} por enviar)
      </template>
      y se enviará cuando vuelva la señal.
    </span>
  </div>

  <!-- Con señal pero con cola pendiente -->
  <div
    v-else-if="offlineState.syncing"
    class="bg-blue-500 text-white px-4 py-2 text-sm flex items-center gap-2"
  >
    <RefreshCw class="w-4 h-4 animate-spin shrink-0" />
    <span>Enviando {{ offlineState.pending }} cambio{{ offlineState.pending !== 1 ? 's' : '' }} guardado{{ offlineState.pending !== 1 ? 's' : '' }}...</span>
  </div>
  <div
    v-else-if="offlineState.pending > 0"
    class="bg-blue-500 text-white px-4 py-2 text-sm flex items-center gap-2 flex-wrap"
  >
    <RefreshCw class="w-4 h-4 shrink-0" />
    <span>{{ offlineState.pending }} cambio{{ offlineState.pending !== 1 ? 's' : '' }} pendiente{{ offlineState.pending !== 1 ? 's' : '' }} de enviar.</span>
    <button
      class="ml-auto bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1 text-xs font-semibold transition-colors"
      @click="syncNow()"
    >
      Enviar ahora
    </button>
  </div>

  <!-- Sincronización recién completada -->
  <div
    v-else-if="offlineState.justSynced"
    class="bg-green-600 text-white px-4 py-2 text-sm flex items-center gap-2"
  >
    <CheckCircle2 class="w-4 h-4 shrink-0" />
    <span>Cambios enviados — todo sincronizado.</span>
  </div>

  <!-- Cambios rechazados por el servidor -->
  <div
    v-if="offlineState.failed > 0"
    class="bg-red-600 text-white px-4 py-2 text-sm flex items-center gap-2 flex-wrap"
  >
    <AlertTriangle class="w-4 h-4 shrink-0" />
    <span>
      {{ offlineState.failed }} cambio{{ offlineState.failed !== 1 ? 's' : '' }} no se pudo{{ offlineState.failed !== 1 ? 'ieron' : '' }} aplicar
      — revisa que el dato no esté repetido o regístralo de nuevo.
    </span>
    <button
      class="ml-auto bg-white/20 hover:bg-white/30 rounded-lg px-2 py-1 transition-colors"
      title="Descartar"
      @click="clearFailed()"
    >
      <X class="w-3.5 h-3.5" />
    </button>
  </div>
</template>
