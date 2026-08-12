// Sincronizador: reenvía la cola de escrituras offline cuando vuelve la señal.
// Reenvía en orden estricto (FIFO) para respetar dependencias entre registros.
// Usa fetch nativo (no el interceptor) para no re-encolar.

import { queueAll, queueDelete, queueCount, failedAdd, failedCount, failedClear } from './db'
import { offlineState } from './state'

let initialized = false

export async function initOfflineSync(): Promise<void> {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  offlineState.online = navigator.onLine
  offlineState.pending = await queueCount().catch(() => 0)
  offlineState.failed = await failedCount().catch(() => 0)

  window.addEventListener('online', () => {
    offlineState.online = true
    void syncNow()
  })
  window.addEventListener('offline', () => {
    offlineState.online = false
  })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && navigator.onLine && offlineState.pending > 0) void syncNow()
  })
  // Reintento periódico por si el evento "online" no llega (señal intermitente)
  window.setInterval(() => {
    if (navigator.onLine && offlineState.pending > 0 && !offlineState.syncing) void syncNow()
  }, 30_000)

  if (navigator.onLine && offlineState.pending > 0) void syncNow()
}

export async function syncNow(): Promise<void> {
  if (offlineState.syncing) return
  offlineState.syncing = true
  try {
    const items = (await queueAll()).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    let sent = 0

    for (const item of items) {
      let res: Response
      try {
        res = await fetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body ?? undefined
        })
      } catch {
        // Seguimos sin señal: parar aquí y conservar el orden de la cola
        offlineState.online = navigator.onLine
        return
      }

      if (res.ok || res.status === 409) {
        // 409 = ya estaba aplicado (id duplicado de un reintento) — darlo por hecho
        if (item.seq != null) await queueDelete(item.seq)
        sent++
      } else if (res.status >= 400 && res.status < 500) {
        // Rechazo definitivo del servidor: apartarlo para no trancar la cola
        const text = await res.text().catch(() => '')
        await failedAdd({ ...item, error: `HTTP ${res.status}: ${text.slice(0, 300)}` })
        if (item.seq != null) await queueDelete(item.seq)
        console.warn('[offline] Cambio rechazado por el servidor:', item.method, item.url, text)
      } else {
        // 5xx u otro error transitorio: reintentar en el próximo ciclo
        return
      }
      offlineState.pending = await queueCount()
    }

    offlineState.failed = await failedCount()
    if (sent > 0 && offlineState.pending === 0) {
      offlineState.justSynced = true
      setTimeout(() => { offlineState.justSynced = false }, 4000)
    }
  } finally {
    offlineState.pending = await queueCount().catch(() => offlineState.pending)
    offlineState.syncing = false
  }
}

export async function clearFailed(): Promise<void> {
  await failedClear()
  offlineState.failed = 0
}
