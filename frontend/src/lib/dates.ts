// Local-date helpers — avoids the UTC-offset bug where toISOString() returns
// the wrong calendar date for timezones behind UTC (e.g. Colombia UTC-5).

export function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Returns local date offset by `days` from today (negative = past). */
export function localDateOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Adds `days` to a YYYY-MM-DD string and returns a YYYY-MM-DD string. */
export function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Days from today to a YYYY-MM-DD target (negative if past). */
export function daysFromToday(dateStr: string): number {
  const todayMidnight = new Date()
  todayMidnight.setHours(0, 0, 0, 0)
  const target = new Date(`${dateStr}T12:00:00`)
  return Math.round((target.getTime() - todayMidnight.getTime()) / 86_400_000)
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(`${d}T12:00:00`).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'long', year: 'numeric'
  })
}
