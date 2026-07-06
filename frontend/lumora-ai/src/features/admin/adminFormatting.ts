export function formatDateTime(value?: string | Date | null) {
  if (!value) return 'Never'

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'Invalid date'

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value)
}

export function formatFileSize(bytes?: number) {
  if (!bytes || bytes <= 0) return '—'

  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`
}

export function toRangeStartIso(dateValue?: string) {
  if (!dateValue) return undefined
  return new Date(`${dateValue}T00:00:00.000Z`).toISOString()
}

export function toRangeEndIso(dateValue?: string) {
  if (!dateValue) return undefined
  return new Date(`${dateValue}T23:59:59.999Z`).toISOString()
}
