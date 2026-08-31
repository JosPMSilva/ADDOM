import test from 'node:test'
import assert from 'node:assert/strict'
import dns from 'node:dns/promises'

import {
  createWebFetchRateLimiter,
  normalizeWebFetchRequesterKey,
} from '../../src/main/tools/web-fetch-rate-limit.mjs'
import { fetchPage } from '../../src/main/tools/web-fetch-tool.mjs'

function withPatchedNetwork({ lookup, fetchImpl }, run) {
  const originalLookup = dns.lookup
  const originalFetch = global.fetch
  dns.lookup = lookup
  global.fetch = fetchImpl
  return Promise.resolve()
    .then(run)
    .finally(() => {
      dns.lookup = originalLookup
      global.fetch = originalFetch
    })
}

test('normalizeWebFetchRequesterKey trims trusted requester keys', () => {
  assert.equal(normalizeWebFetchRequesterKey('  session-a  '), 'session-a')
  assert.equal(normalizeWebFetchRequesterKey(''), '')
})

test('createWebFetchRateLimiter enforces burst limits and refills over time', () => {
  let nowMs = 0
  const limiter = createWebFetchRateLimiter({
    capacity: 2,
    refillPerSecond: 0.5,
    staleAfterMs: 60_000,
    now: () => nowMs,
  })

  assert.equal(limiter.consume('alpha').ok, true)
  assert.equal(limiter.consume('alpha').ok, true)
  const blocked = limiter.consume('alpha')
  assert.equal(blocked.ok, false)
  assert.ok(blocked.retryAfterMs >= 2000)

  nowMs += 2_100
  const recovered = limiter.consume('alpha')
  assert.equal(recovered.ok, true)

  const isolated = limiter.consume('beta')
  assert.equal(isolated.ok, true)
  assert.equal(isolated.key, 'beta')
})

test('fetchPage rate limits before issuing network requests', async () => {
  let fetchCalls = 0
  await withPatchedNetwork({
    lookup: async (hostname) => {
      if (hostname === 'safe.example') return [{ address: '93.184.216.34', family: 4 }]
      throw new Error(`Unexpected hostname: ${hostname}`)
    },
    fetchImpl: async () => {
      fetchCalls += 1
      return new Response('ok', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    },
  }, async () => {
    const key = 'rate-limit-burst-test'
    for (let i = 0; i < 12; i += 1) {
      const output = await fetchPage('', { url: 'http://safe.example/page', reason: 'burst test' }, { webFetchRequesterKey: key })
      assert.match(output, /ok/i)
    }

    await assert.rejects(
      () => fetchPage('', { url: 'http://safe.example/page', reason: 'burst test blocked' }, { webFetchRequesterKey: key }),
      (err) => {
        assert.equal(err?.code, 'WEB_FETCH_RATE_LIMITED')
        assert.ok(Number(err?.retryAfterMs || 0) > 0)
        assert.match(String(err?.message || ''), /fetch_page rate limit exceeded/i)
        return true
      },
    )
  })

  assert.equal(fetchCalls, 12)
})
