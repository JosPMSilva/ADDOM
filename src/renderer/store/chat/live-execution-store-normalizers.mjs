export function normalizeLiveExecutionId(value = '') {
  return String(value || '').trim()
}

export function normalizeLiveExecutionNumber(value = 0, fallback = 0) {
  const normalized = Number(value || 0) || 0
  return normalized > 0 ? normalized : fallback
}
