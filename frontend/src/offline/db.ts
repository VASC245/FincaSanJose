// IndexedDB mínimo (sin dependencias) para la cola de escrituras offline.
// Store "queue": mutaciones pendientes de enviar, en orden de creación.
// Store "failed": mutaciones que el servidor rechazó al sincronizar.

const DB_NAME = 'finca-offline'
const DB_VERSION = 1

export interface QueuedMutation {
  seq?: number
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
  ts: string       // cuándo se capturó (hora local del teléfono)
  error?: string   // solo en "failed"
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('queue')) {
          db.createObjectStore('queue', { keyPath: 'seq', autoIncrement: true })
        }
        if (!db.objectStoreNames.contains('failed')) {
          db.createObjectStore('failed', { keyPath: 'seq', autoIncrement: true })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const r = fn(t.objectStore(store))
        r.onsuccess = () => resolve(r.result)
        r.onerror = () => reject(r.error)
      })
  )
}

export const queueAdd = (m: QueuedMutation) => tx('queue', 'readwrite', (s) => s.add(m))
export const queueAll = () => tx<QueuedMutation[]>('queue', 'readonly', (s) => s.getAll() as IDBRequest<QueuedMutation[]>)
export const queueDelete = (seq: number) => tx('queue', 'readwrite', (s) => s.delete(seq))
export const queueCount = () => tx<number>('queue', 'readonly', (s) => s.count())

export const failedAdd = (m: QueuedMutation) => {
  const { seq: _seq, ...rest } = m
  return tx('failed', 'readwrite', (s) => s.add(rest))
}
export const failedAll = () => tx<QueuedMutation[]>('failed', 'readonly', (s) => s.getAll() as IDBRequest<QueuedMutation[]>)
export const failedCount = () => tx<number>('failed', 'readonly', (s) => s.count())
export const failedClear = () => tx('failed', 'readwrite', (s) => s.clear())
