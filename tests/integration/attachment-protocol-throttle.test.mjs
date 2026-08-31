import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createAttachmentPreviewRateLimiter,
  getAttachmentPreviewRequesterKey,
} from '../../src/main/attachments/attachment-preview-guard.mjs'

test('attachment preview rate limiter throttles burst traffic and refills over time', () => {
  let clock = 0
  const limiter = createAttachmentPreviewRateLimiter({
    capacity: 3,
    refillPerSecond: 1,
    now: () => clock,
  })

  assert.equal(limiter.consume('renderer-a').ok, true)
  assert.equal(limiter.consume('renderer-a').ok, true)
  assert.equal(limiter.consume('renderer-a').ok, true)

  const throttled = limiter.consume('renderer-a')
  assert.equal(throttled.ok, false)
  assert.ok(Number(throttled.retryAfterMs || 0) >= 1000)

  clock += 1000
  const recovered = limiter.consume('renderer-a')
  assert.equal(recovered.ok, true)
})

test('attachment preview rate limiter isolates budgets by requester key', () => {
  let clock = 0
  const limiter = createAttachmentPreviewRateLimiter({
    capacity: 1,
    refillPerSecond: 1,
    now: () => clock,
  })

  assert.equal(limiter.consume('renderer-a').ok, true)
  assert.equal(limiter.consume('renderer-a').ok, false)

  const independent = limiter.consume('renderer-b')
  assert.equal(independent.ok, true)

  clock += 1000
  assert.equal(limiter.consume('renderer-a').ok, true)
})

test('attachment preview requester key uses referrer/origin and falls back to global', () => {
  assert.equal(
    getAttachmentPreviewRequesterKey({ referrer: 'addom://renderer/main' }),
    'addom://renderer/main',
  )
  assert.equal(
    getAttachmentPreviewRequesterKey({ headers: { origin: 'https://example.test' } }),
    'https://example.test',
  )
  assert.equal(getAttachmentPreviewRequesterKey({}), 'global')
})
