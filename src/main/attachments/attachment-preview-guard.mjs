function toFiniteNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function clampPositive(value, fallback) {
  return Math.max(1, toFiniteNumber(value, fallback))
}

function normalizeRequesterKey(value = '') {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return 'global'
  return raw.slice(0, 240)
}

export function getAttachmentPreviewRequesterKey(request = {}) {
  const input = request && typeof request === 'object' ? request : {}
  const headers = input.headers && typeof input.headers === 'object' ? input.headers : {}
  const candidates = [
    input.referrer,
    headers.referer,
    headers.referrer,
    headers.origin,
    input.initiator,
  ]
  for (const candidate of candidates) {
    const normalized = normalizeRequesterKey(candidate)
    if (normalized !== 'global') return normalized
  }
  return 'global'
}

export function createAttachmentPreviewRateLimiter({
  capacity = 180,
  refillPerSecond = 60,
  staleAfterMs = 120_000,
  now = () => Date.now(),
} = {}) {
  const bucketCapacity = clampPositive(capacity, 180)
  const refillRatePerSecond = clampPositive(refillPerSecond, 60)
  const staleAfter = clampPositive(staleAfterMs, 120_000)
  const refillPerMs = refillRatePerSecond / 1_000
  const buckets = new Map()

  function prune(ts = now()) {
    for (const [key, bucket] of buckets) {
      if (ts - Number(bucket.lastSeenAt || 0) > staleAfter) {
        buckets.delete(key)
      }
    }
  }

  function consume(requestOrKey = '') {
    const requesterKey = typeof requestOrKey === 'string'
      ? normalizeRequesterKey(requestOrKey)
      : getAttachmentPreviewRequesterKey(requestOrKey)
    const ts = Number(now() || 0)
    const existing = buckets.get(requesterKey)
    const bucket = existing
      ? {
          tokens: toFiniteNumber(existing.tokens, bucketCapacity),
          lastRefillAt: toFiniteNumber(existing.lastRefillAt, ts),
          lastSeenAt: toFiniteNumber(existing.lastSeenAt, ts),
        }
      : {
          tokens: bucketCapacity,
          lastRefillAt: ts,
          lastSeenAt: ts,
        }

    const elapsedMs = Math.max(0, ts - bucket.lastRefillAt)
    if (elapsedMs > 0) {
      const replenished = bucket.tokens + elapsedMs * refillPerMs
      bucket.tokens = Math.min(bucketCapacity, replenished)
      bucket.lastRefillAt = ts
    }
    bucket.lastSeenAt = ts

    if (bucket.tokens < 1) {
      const deficit = Math.max(0, 1 - bucket.tokens)
      const retryAfterMs = Math.max(1, Math.ceil(deficit / refillPerMs))
      buckets.set(requesterKey, bucket)
      prune(ts)
      return {
        ok: false,
        key: requesterKey,
        limit: bucketCapacity,
        remaining: 0,
        retryAfterMs,
      }
    }

    bucket.tokens -= 1
    buckets.set(requesterKey, bucket)
    prune(ts)
    return {
      ok: true,
      key: requesterKey,
      limit: bucketCapacity,
      remaining: Math.max(0, Math.floor(bucket.tokens)),
      retryAfterMs: 0,
    }
  }

  function reset() {
    buckets.clear()
  }

  function snapshot() {
    return [...buckets.entries()].map(([key, bucket]) => ({
      key,
      tokens: toFiniteNumber(bucket.tokens, 0),
      lastRefillAt: toFiniteNumber(bucket.lastRefillAt, 0),
      lastSeenAt: toFiniteNumber(bucket.lastSeenAt, 0),
    }))
  }

  return {
    consume,
    reset,
    snapshot,
  }
}
