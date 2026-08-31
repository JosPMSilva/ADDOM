export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

export function delay(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0) || 0)))
}

export function asTrimmedString(value = '') {
  return String(value || '').trim()
}

export function asOptionalNumber(value) {
  const normalized = Number(value)
  if (!Number.isFinite(normalized) || normalized <= 0) return 0
  return Math.round(normalized)
}

export function asOptionalObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

export function firstNonEmptyString(...values) {
  for (const value of values) {
    const normalized = asTrimmedString(value)
    if (normalized) return normalized
  }
  return ''
}
