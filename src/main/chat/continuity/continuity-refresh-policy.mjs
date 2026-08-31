function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function shouldRefreshContinuityPacket({
  injectEveryRound = false,
  round = 1,
  existingPacketText = '',
  occupancyRatio = 0,
  driftViolationCount = 0,
  hasSelectionChange = false,
} = {}) {
  if (injectEveryRound) return true
  if (Number(round || 1) <= 1) return true
  if (!String(existingPacketText || '').trim()) return true
  if (toNumber(occupancyRatio, 0) >= 0.78) return true
  if (toNumber(driftViolationCount, 0) > 0) return true
  if (hasSelectionChange) return true
  return false
}

