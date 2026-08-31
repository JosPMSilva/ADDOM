export function normalizeWebFetchRequesterKey(value) {
  const key = String(value ?? '').trim()
  return key || ''
}

export function createWebFetchRateLimiter({
  capacity = 12,
  refillPerSecond = 0.5,
  staleAfterMs = 120_000,
  now = () => Date.now(),
} = {}) {
  const limit = Math.max(1, Number(capacity) || 1)
  const refillRate = Math.max(0, Number(refillPerSecond) || 0)
  const staleMs = Math.max(1_000, Number(staleAfterMs) || 120_000)
  const readNow = typeof now === 'function' ? now : () => Date.now()
  const buckets = new Map()

  function getBucket(key) {
    const bucketKey = normalizeWebFetchRequesterKey(key) || 'global'
    const rawNow = Number(readNow())
    const nowMs = Number.isFinite(rawNow) ? rawNow : Date.now()
    const existing = buckets.get(bucketKey)
    if (!existing || (nowMs - existing.lastSeenAt) > staleMs) {
      const resetBucket = { tokens: limit, updatedAt: nowMs, lastSeenAt: nowMs }
      buckets.set(bucketKey, resetBucket)
      return { key: bucketKey, bucket: resetBucket }
    }
    const elapsedMs = Math.max(0, nowMs - existing.updatedAt)
    if (elapsedMs > 0 && refillRate > 0) {
      existing.tokens = Math.min(limit, existing.tokens + ((elapsedMs / 1000) * refillRate))
      existing.updatedAt = nowMs
    }
    existing.lastSeenAt = nowMs
    return { key: bucketKey, bucket: existing }
  }

  return {
    consume(key) {
      const { key: bucketKey, bucket } = getBucket(key)
      if (bucket.tokens >= 1) {
        bucket.tokens -= 1
        return {
          ok: true,
          key: bucketKey,
          limit,
          remaining: Math.max(0, Math.floor(bucket.tokens)),
          retryAfterMs: 0,
        }
      }
      const deficit = 1 - bucket.tokens
      const retryAfterMs = refillRate > 0
        ? Math.max(1, Math.ceil((deficit / refillRate) * 1000))
        : staleMs
      return {
        ok: false,
        key: bucketKey,
        limit,
        remaining: 0,
        retryAfterMs,
      }
    },
  }
}
