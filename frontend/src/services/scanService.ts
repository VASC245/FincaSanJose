import QRCode from 'qrcode'
import type { Animal } from '@/types'

// Escaneo de animales: un QR de la app, un chip RFID o el número de arete
// escrito a mano llevan a la ficha del animal.
//
// El QR guarda una dirección como https://<app>/a/<id>. Así también funciona
// con la cámara normal del teléfono: abre la app directo en la ficha.

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export function animalPath(a: Pick<Animal, 'id' | 'species'>): string {
  return a.species === 'cattle' ? `/cattle/${a.id}` : `/pigs/${a.id}`
}

// Dirección pública de la app (la de Netlify). Si no está configurada se usa la
// actual; la app reconoce el QR igual, pero la cámara normal del teléfono solo
// lo abre si apunta a la dirección publicada.
const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.replace(/\/$/, '') || window.location.origin

export const isLocalOrigin = !import.meta.env.VITE_PUBLIC_URL && /localhost|127\.0\.0\.1/.test(window.location.hostname)

/** Dirección que va dentro del QR del animal. */
export function animalQrUrl(id: string): string {
  return `${PUBLIC_URL}/a/${id}`
}

/** Normaliza un número de chip: sin espacios, guiones ni puntos, en mayúsculas. */
export function normalizeRfid(code: string): string {
  return code.replace(/[\s\-._]/g, '').toUpperCase()
}

export type ScanResult =
  | { kind: 'id'; id: string }
  | { kind: 'code'; code: string }
  | { kind: 'empty' }

/** Interpreta lo leído: id de la app (QR) o un código (chip o arete). */
export function parseScan(raw: string): ScanResult {
  const text = raw.trim()
  if (!text) return { kind: 'empty' }
  // QR de la app: .../a/<id>, o un enlace a la ficha (/cattle/<id>, /pigs/<id>)
  const m = text.match(UUID_RE)
  if (m && (/\/(a|cattle|pigs)\//.test(text) || text.length === m[0].length)) {
    return { kind: 'id', id: m[0].toLowerCase() }
  }
  return { kind: 'code', code: text }
}

/**
 * Busca animales por chip RFID o por número de arete (exacto, sin importar
 * mayúsculas ni espacios). Primero el chip, que es único.
 */
export function findByCode(animals: Animal[], code: string): Animal[] {
  const norm = normalizeRfid(code)
  if (!norm) return []
  const byRfid = animals.filter((a) => a.rfid_tag && normalizeRfid(a.rfid_tag) === norm)
  if (byRfid.length) return byRfid
  // Algunos lectores dan el número con el código de país (982...) y el arete
  // visual lleva solo los últimos dígitos: se acepta si el chip termina igual.
  const bySuffix = norm.length >= 6
    ? animals.filter((a) => a.rfid_tag && normalizeRfid(a.rfid_tag).endsWith(norm))
    : []
  if (bySuffix.length === 1) return bySuffix
  return animals.filter((a) => a.ear_tag && normalizeRfid(a.ear_tag) === norm)
}

/** QR del animal como SVG (texto), listo para mostrar o imprimir. */
export function animalQrSvg(id: string): Promise<string> {
  return QRCode.toString(animalQrUrl(id), { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111827', light: '#ffffff' } })
}

/** QR del animal como imagen PNG (data URL), para descargar o compartir. */
export function animalQrPng(id: string): Promise<string> {
  return QRCode.toDataURL(animalQrUrl(id), { margin: 2, width: 600, errorCorrectionLevel: 'M' })
}
