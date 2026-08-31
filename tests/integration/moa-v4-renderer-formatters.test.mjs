import test from 'node:test'
import assert from 'node:assert/strict'

import {
  FANOUT_CONFIRM_DECISIONS,
  buildFanoutConfirmViewModel,
} from '../../src/renderer/components/agents/agent-fanout-confirm-view-model.mjs'
import { buildDelegationBadges } from '../../src/renderer/components/chat/moa-delegation-badges.mjs'

test('fanout confirm view-model exposes only count-based admission choices', () => {
  const viewModel = buildFanoutConfirmViewModel({
    requestId: 'req-1',
    requestedCount: 12,
    threshold: 5,
  })
  assert.deepEqual(viewModel, {
    requestId: 'req-1',
    requestedCount: 12,
    threshold: 5,
  })
  assert.deepEqual(FANOUT_CONFIRM_DECISIONS, {
    launchAll: 'launch_all',
    limit: 'limit',
    stopTurn: 'stop_turn',
  })
  assert.equal(buildFanoutConfirmViewModel({
    requestId: 'req-2',
    requestedCount: 5,
    threshold: 5,
  }), null)
})

test('delegation badges include planned-vs-actual tokens and usd badges', () => {
  const badges = buildDelegationBadges({
    isDelegationTool: true,
    type: 'result',
    taskCount: 3,
    requestedTaskCount: 5,
    plannedTaskCount: 3,
    executedTaskCount: 2,
    skippedTaskCount: 1,
    completed: 2,
    failed: 1,
    staged: 1,
    estimatedTokens: 1500,
    actualTokens: 900,
    estimatedUsd: 0.1234,
    actualUsd: 0.0678,
    riskTier: 'high',
    strategy: 'balanced',
    pattern: 'review_gate',
    parsedOk: true,
    durationMs: 4200,
    status: 'completed',
  })

  assert.ok(badges.includes('tasks 3'))
  assert.ok(badges.includes('req 5'))
  assert.ok(badges.includes('ran 2'))
  assert.ok(badges.includes('skip 1'))
  assert.ok(badges.includes('ok 2'))
  assert.ok(badges.includes('fail 1'))
  assert.ok(badges.includes('staged 1'))
  assert.ok(badges.includes('est 1500'))
  assert.ok(badges.includes('act 900'))
  assert.ok(badges.includes('est $0.12'))
  assert.ok(badges.includes('act $0.07'))
  assert.ok(badges.includes('high'))
  assert.ok(badges.includes('balanced'))
  assert.ok(badges.includes('review_gate'))
  assert.ok(badges.includes('parsed ok'))
  assert.ok(badges.includes('4s'))
  assert.ok(badges.includes('completed'))
})

test('delegation badges include cost-confidence and bounded synthesis metadata when present', () => {
  const badges = buildDelegationBadges({
    isDelegationTool: true,
    type: 'result',
    estimateConfidence: 'partial_request_fee',
    route: 'direct_fanout',
    initiator: 'user_direct',
    synthesisPayload: {
      agentOutputMode: 'bounded_excerpts',
      agentOutputsTruncated: true,
      agentOutputsIncluded: 2,
      agentOutputsChars: 1800,
    },
  })

  assert.ok(badges.includes('cost partial'))
  assert.ok(badges.includes('route fanout'))
  assert.ok(badges.includes('by user'))
  assert.ok(badges.includes('synth bounded_excerpts'))
  assert.ok(badges.includes('synth trunc'))
})

test('delegation badges fall back to total token badge when actual token count is unavailable', () => {
  const badges = buildDelegationBadges({
    isDelegationTool: true,
    type: 'result',
    totalTokens: 321,
  })
  assert.ok(badges.includes('ok 0'))
  assert.ok(badges.includes('fail 0'))
  assert.ok(badges.includes('321 tok'))
  assert.deepEqual(buildDelegationBadges({ isDelegationTool: false, type: 'result' }), [])
})

