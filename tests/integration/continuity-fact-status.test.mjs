import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeContinuityFactStatus } from '../../src/main/chat/continuity/fact-status.mjs'

test('normalizeContinuityFactStatus preserves resolved status for closed open-loop updates', () => {
  assert.equal(normalizeContinuityFactStatus('resolved'), 'resolved')
  assert.equal(normalizeContinuityFactStatus(' RESOLVED '), 'resolved')
})

test('normalizeContinuityFactStatus maps legacy closed status to resolved', () => {
  assert.equal(normalizeContinuityFactStatus('closed'), 'resolved')
  assert.equal(normalizeContinuityFactStatus(''), 'active')
})
