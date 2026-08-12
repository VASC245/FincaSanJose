import { reactive } from 'vue'

// Estado reactivo del modo offline, compartido entre el interceptor
// de red, el sincronizador y la interfaz.

export const offlineState = reactive({
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  pending: 0,      // mutaciones en cola esperando señal
  failed: 0,       // mutaciones rechazadas por el servidor al sincronizar
  syncing: false,
  justSynced: false, // true por unos segundos tras vaciar la cola
})
