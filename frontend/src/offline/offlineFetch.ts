// Interceptor de red para el cliente de Supabase.
//
// Lecturas (GET): pasan directo — el service worker (NetworkFirst) ya sirve
// la última copia vista cuando no hay señal.
//
// Escrituras (POST/PATCH/DELETE a /rest/v1/): si la red falla, la operación
// se guarda en una cola local (IndexedDB) y se responde una respuesta
// sintética equivalente a la del servidor, para que la app siga funcionando
// como si hubiera señal. Para los INSERT se genera el id aquí mismo, así los
// registros encadenados (ej. animal → detalle) quedan consistentes y el
// reenvío es idempotente (si se repite, el servidor responde 409 y se descarta).

import { queueAdd, queueCount } from './db'
import { offlineState } from './state'

const REST_PATH = '/rest/v1/'
const TIMEOUT_MS = 10_000

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  // Respaldo para navegadores viejos
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function headersToObject(h: Headers): Record<string, string> {
  const o: Record<string, string> = {}
  h.forEach((v, k) => { o[k] = v })
  return o
}

/** Genera id en el cliente para inserts sin id (no aplica a upserts). */
function injectIds(bodyText: string): { body: string; injected: boolean } {
  try {
    const data = JSON.parse(bodyText)
    let injected = false
    const inject = (row: unknown) => {
      if (row && typeof row === 'object' && !Array.isArray(row) && !(row as Record<string, unknown>).id) {
        injected = true
        return { id: uuid(), ...(row as Record<string, unknown>) }
      }
      return row
    }
    const out = Array.isArray(data) ? data.map(inject) : inject(data)
    return injected ? { body: JSON.stringify(out), injected } : { body: bodyText, injected }
  } catch {
    return { body: bodyText, injected: false }
  }
}

/**
 * En inserts de varias filas postgrest-js añade ?columns="a","b" y PostgREST
 * ignora cualquier campo que no esté en esa lista — hay que agregar "id".
 */
function ensureIdColumn(url: string): string {
  try {
    const u = new URL(url)
    const cols = u.searchParams.get('columns')
    if (cols == null) return url
    const list = cols.split(',').map((c) => c.trim()).filter(Boolean)
    if (list.includes('"id"') || list.includes('id')) return url
    u.searchParams.set('columns', ['"id"', ...list].join(','))
    return u.toString()
  } catch {
    return url
  }
}

function idFromUrl(url: string): string | null {
  const m = url.match(/[?&]id=eq\.([^&]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

/** Imita la respuesta de PostgREST para que supabase-js no note la diferencia. */
function syntheticResponse(
  method: string,
  url: string,
  headers: Headers,
  bodyText: string | null
): Response {
  const prefer = headers.get('prefer') ?? ''
  const accept = headers.get('accept') ?? ''
  const wantsRepresentation = prefer.includes('return=representation')
  const wantsObject = accept.includes('vnd.pgrst.object')

  if (!wantsRepresentation) {
    return new Response(null, {
      status: method === 'POST' ? 201 : 204,
      headers: { 'x-finca-offline': '1' }
    })
  }

  let payload: unknown = null
  if (bodyText) {
    try { payload = JSON.parse(bodyText) } catch { payload = null }
  }
  const now = new Date().toISOString()
  const decorate = (row: unknown) => ({
    created_at: now,
    ...(row && typeof row === 'object' ? (row as Record<string, unknown>) : {})
  })

  let out: unknown
  if (method === 'POST') {
    out = Array.isArray(payload) ? payload.map(decorate) : decorate(payload)
  } else if (method === 'PATCH') {
    const id = idFromUrl(url)
    out = {
      ...(payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}),
      ...(id ? { id } : {})
    }
  } else {
    out = []
  }
  if (wantsObject && Array.isArray(out)) out = (out as unknown[])[0] ?? {}
  if (!wantsObject && !Array.isArray(out)) out = [out]

  return new Response(JSON.stringify(out), {
    status: method === 'POST' ? 201 : 200,
    headers: { 'content-type': 'application/json', 'x-finca-offline': '1' }
  })
}

async function fetchWithTimeout(req: Request): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(req, { signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function offlineFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const req = new Request(input, init)
  const method = req.method.toUpperCase()
  const isRestMutation =
    req.url.includes(REST_PATH) &&
    !req.url.includes(`${REST_PATH}rpc/`) &&
    (method === 'POST' || method === 'PATCH' || method === 'DELETE')

  if (!isRestMutation) return fetch(req)

  let bodyText: string | null = null
  try { bodyText = await req.clone().text() } catch { bodyText = null }
  if (bodyText === '') bodyText = null

  // Los INSERT llevan id generado aquí ANTES del primer intento: si el servidor
  // alcanza a guardar pero la respuesta se pierde (timeout), el reenvío desde la
  // cola choca con el mismo id (409) en vez de crear un duplicado.
  const isUpsert = (req.headers.get('prefer') ?? '').includes('resolution=')
  let finalBody = bodyText
  let finalUrl = req.url
  let sendReq = req
  if (method === 'POST' && bodyText && !isUpsert) {
    const { body, injected } = injectIds(bodyText)
    if (injected) {
      finalBody = body
      finalUrl = ensureIdColumn(req.url)
      sendReq = new Request(finalUrl, { method, headers: req.headers, body: finalBody })
    }
  }

  // Con señal (aparente): intentar contra el servidor
  if (offlineState.online) {
    try {
      return await fetchWithTimeout(sendReq.clone())
    } catch {
      // la red falló a mitad de uso — cae a la cola offline
      offlineState.online = navigator.onLine
    }
  }

  // Sin señal: encolar y responder como si hubiera funcionado
  try {
    await queueAdd({
      url: finalUrl,
      method,
      headers: headersToObject(req.headers),
      body: finalBody,
      ts: new Date().toISOString()
    })
    offlineState.pending = await queueCount()
  } catch {
    // Sin IndexedDB (modo privado, etc.): comportarse como antes del modo offline
    throw new TypeError('Sin conexión y sin almacenamiento local disponible')
  }

  return syntheticResponse(method, finalUrl, req.headers, finalBody)
}
