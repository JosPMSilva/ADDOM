import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeResults, formatDelegationText } from '../../src/main/moa/delegation-summary.mjs'

test('delegation summary counts rate-limited agents separately from generic failures', () => {
  const summary = summarizeResults([
    { status: 'rate_limited', stagedChanges: [] },
    { status: 'failed', stagedChanges: [] },
    { status: 'completed', stagedChanges: [] },
  ])

  assert.equal(summary.rateLimited, 1)
  assert.equal(summary.failed, 1)
  assert.equal(summary.completed, 1)
})

test('delegation text includes rate-limited summary counts and per-agent status', () => {
  const text = formatDelegationText({
    status: 'completed_with_errors',
    pattern: 'review_gate',
    taskCount: 1,
    requestedTaskCount: 3,
    plannedTaskCount: 1,
    executedTaskCount: 1,
    durationMs: 1000,
    usage: { totalTokens: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
    summary: {
      completed: 0,
      failed: 0,
      rateLimited: 1,
      notFound: 0,
      missingApiKey: 0,
      stagedWrites: 0,
    },
    agents: [{
      taskId: 'task_1',
      role: 'Gemini Reviewer',
      roleId: 'role_gem',
      status: 'rate_limited',
      error: 'Provider quota exceeded. Retry after about 47s.',
      stagedChanges: [],
    }],
  })

  assert.match(text, /Rate limited:\s*1/i)
  assert.match(text, /Pattern:\s*review_gate/i)
  assert.match(text, /Requested tasks:\s*3/i)
  assert.match(text, /Planned tasks:\s*1/i)
  assert.match(text, /Executed tasks:\s*1/i)
  assert.match(text, /Status:\s*rate_limited/i)
  assert.match(text, /Retry after about 47s/i)
})
