import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calculateAgentUsageRollups,
} from '../../src/main/agents/agent-usage-accounting.mjs'
import {
  addUsage as addLegacyUsage,
  createUsage as createLegacyUsage,
  normalizeUsage as normalizeLegacyUsage,
} from '../../src/main/moa/usage-math.mjs'
import { makeAgentAttempt, makeAgentNode, makeAgentUsage } from '../helpers/agent-runtime-fixtures.mjs'

test('usage rollups count retries, avoid provider-inclusive double counting, and isolate unknown scope', () => {
  const nodes = [
    makeAgentNode({ id: 'agent_root', status: 'running', exclusiveUsage: null, inclusiveUsage: null }),
    makeAgentNode({ id: 'agent_a', parentNodeId: 'agent_root', exclusiveUsage: null, inclusiveUsage: null }),
    makeAgentNode({
      id: 'agent_a_child',
      parentNodeId: 'agent_a',
      depth: 2,
      generation: 2,
      branchPath: ['agent_root', 'agent_a', 'agent_a_child'],
      exclusiveUsage: null,
      inclusiveUsage: null,
    }),
    makeAgentNode({ id: 'agent_b', parentNodeId: 'agent_root', exclusiveUsage: null, inclusiveUsage: null }),
    makeAgentNode({ id: 'agent_unknown', parentNodeId: 'agent_root', exclusiveUsage: null, inclusiveUsage: null }),
  ]
  const attempts = [
    makeAgentAttempt('agent_a', {
      id: 'attempt_agent_a_1',
      usage: makeAgentUsage('exclusive', {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        costUsd: 0.01,
        rawProviderUsage: { request: 1 },
      }),
    }),
    makeAgentAttempt('agent_a', {
      id: 'attempt_agent_a_2',
      attemptNumber: 2,
      recoveryOfAttemptId: 'attempt_agent_a_1',
      usage: makeAgentUsage('exclusive', {
        inputTokens: 20,
        outputTokens: 10,
        totalTokens: 30,
        costUsd: 0.02,
        rawProviderUsage: { request: 2 },
      }),
    }),
    makeAgentAttempt('agent_a_child', {
      usage: makeAgentUsage('exclusive', {
        inputTokens: 5,
        outputTokens: 5,
        totalTokens: 10,
        costUsd: 0.005,
      }),
    }),
    makeAgentAttempt('agent_b', {
      usage: makeAgentUsage('inclusive', {
        inputTokens: 50,
        outputTokens: 20,
        totalTokens: 70,
        costUsd: 0.05,
        rawProviderUsage: { includes_descendants: true },
      }),
    }),
    makeAgentAttempt('agent_unknown', {
      usage: makeAgentUsage('unknown_scope', {
        inputTokens: 1_000,
        outputTokens: 1_000,
        totalTokens: 2_000,
        costUsd: 9,
        rawProviderUsage: { scope: 'unspecified' },
      }),
    }),
  ]

  const rollup = calculateAgentUsageRollups({ nodes, attempts, rootNodeId: 'agent_root' })

  assert.equal(rollup.byNode.agent_a.exclusive.totalTokens, 45)
  assert.equal(rollup.byNode.agent_a.inclusive.totalTokens, 55)
  assert.equal(rollup.byNode.agent_b.inclusive.totalTokens, 70)
  assert.equal(rollup.run.inclusive.totalTokens, 125)
  assert.equal(rollup.run.inclusive.costUsd, 0.085)
  assert.equal(rollup.run.unknown.totalTokens, 2_000)
  assert.equal(rollup.run.authoritativeCostUsd, 0.085)
  assert.deepEqual(
    rollup.rawProviderUsage.map((entry) => entry.attemptId),
    [
      'attempt_agent_a_1',
      'attempt_agent_a_2',
      'attempt_agent_a_child_1',
      'attempt_agent_b_1',
      'attempt_agent_unknown_1',
    ],
  )
})

test('legacy MoA aggregation preserves scoped provenance and excludes unknown totals', () => {
  const total = createLegacyUsage()
  const unknown = normalizeLegacyUsage({
    scope: 'unknown_scope',
    inputTokens: 1_000,
    outputTokens: 500,
    totalTokens: 1_500,
    costUsd: 9,
    rawProviderUsage: { vendor_total: 1_500 },
  })
  addLegacyUsage(total, unknown)

  assert.equal(unknown.scope, 'unknown_scope')
  assert.deepEqual(unknown.rawProviderUsage, { vendor_total: 1_500 })
  assert.deepEqual(total, {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  })
})
