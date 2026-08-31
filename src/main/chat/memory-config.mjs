export function normalizeCompressionThreshold(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(5, Math.min(500, Math.round(n)))
}

export function normalizeCompressionCooldownMs(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(10_000, Math.min(86_400_000, Math.round(n)))
}

export function normalizeCompressionMaxPerHour(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(50, Math.round(n)))
}

export function normalizeCompressionMinNewLogs(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(500, Math.round(n)))
}
