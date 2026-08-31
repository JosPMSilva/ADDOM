import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldRefreshContinuityPacket } from '../../src/main/chat/continuity/continuity-refresh-policy.mjs'

test('shouldRefreshContinuityPacket honors injectEveryRound profile flag', () => {
  const refresh = shouldRefreshContinuityPacket({
    injectEveryRound: true,
    round: 4,
    existingPacketText: '[ADDOM Continuity Packet]\n## decisions\n- x',
    occupancyRatio: 0.1,
    driftViolationCount: 0,
    hasSelectionChange: false,
  })
  assert.equal(refresh, true)
})

test('shouldRefreshContinuityPacket reuses packet on stable balanced/economy rounds', () => {
  const refresh = shouldRefreshContinuityPacket({
    injectEveryRound: false,
    round: 3,
    existingPacketText: '[ADDOM Continuity Packet]\n## decisions\n- x',
    occupancyRatio: 0.3,
    driftViolationCount: 0,
    hasSelectionChange: false,
  })
  assert.equal(refresh, false)
})

test('shouldRefreshContinuityPacket refreshes on deterministic triggers', () => {
  assert.equal(shouldRefreshContinuityPacket({
    injectEveryRound: false,
    round: 1,
    existingPacketText: '[ADDOM Continuity Packet]',
  }), true)

  assert.equal(shouldRefreshContinuityPacket({
    injectEveryRound: false,
    round: 2,
    existingPacketText: '',
  }), true)

  assert.equal(shouldRefreshContinuityPacket({
    injectEveryRound: false,
    round: 2,
    existingPacketText: '[ADDOM Continuity Packet]',
    occupancyRatio: 0.79,
  }), true)

  assert.equal(shouldRefreshContinuityPacket({
    injectEveryRound: false,
    round: 2,
    existingPacketText: '[ADDOM Continuity Packet]',
    driftViolationCount: 1,
  }), true)

  assert.equal(shouldRefreshContinuityPacket({
    injectEveryRound: false,
    round: 2,
    existingPacketText: '[ADDOM Continuity Packet]',
    hasSelectionChange: true,
  }), true)
})
