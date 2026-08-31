import test from 'node:test'
import assert from 'node:assert/strict'

import { buildToolResultMessage } from '../../src/main/api-clients/ai-provider.mjs'
import { estimateHistoryTokens } from '../../src/main/chat/context-compaction.mjs'
import { pruneOldToolResultHistory } from '../../src/main/chat/tool-result-history-pruning.mjs'

const TEST_PROFILE = Object.freeze({
  id: 'test_prune_profile',
  oldToolResultPrune: 'aggressive',
  perTurnToolResultBudgetChars: 500,
  oldToolResultMinPruneChars: 200,
})

function toolResult(id, toolName, text, metadata = {}) {
  return buildToolResultMessage(id, toolName, text, metadata.isError === true, {
    decision: 'approved',
    ...metadata,
  })
}

function toolOutputText(message = {}) {
  return String(message?.content?.[0]?.output?.value || '')
}

function toolResultPart(message = {}) {
  return message?.content?.[0] || {}
}

function prune(history, overrides = {}) {
  return pruneOldToolResultHistory({
    history,
    promptBudgetProfile: TEST_PROFILE,
    ...overrides,
  })
}

test('old large read/search output is pruned to a placeholder', () => {
  const oldSearch = `old search result\n${'match old\n'.repeat(500)}`
  const history = [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'turn one' },
    toolResult('call_old', 'search_code', oldSearch),
    { role: 'user', content: 'turn two' },
    { role: 'assistant', content: 'ack' },
    { role: 'user', content: 'turn three' },
  ]

  const result = prune(history)
  const output = toolOutputText(result.history[2])
  const part = toolResultPart(result.history[2])

  assert.equal(result.diagnostics.applied, true)
  assert.equal(result.diagnostics.prunedCount, 1)
  assert.match(output, /\[Old tool result cleared for prompt budget\]/)
  assert.match(output, /tool: search_code/)
  assert.match(output, /reason: old_low_value_tool_output/)
  assert.match(output, /output_sha256:/)
  assert.doesNotMatch(output, /match old/)
  assert.doesNotMatch(output, /raw_timeline:/)
  assert.equal(part.toolResultHistoryPruned?.retentionClass, 'low_value_history')
  assert.equal(part.toolResultHistoryPruned?.placeholderVersion, 2)
})

test('recent tool output is preserved intact', () => {
  const recentRead = `recent read result\n${'important recent line\n'.repeat(200)}`
  const history = [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'turn one' },
    toolResult('call_old', 'search_code', `old search\n${'x'.repeat(2_000)}`),
    { role: 'user', content: 'turn two' },
    toolResult('call_recent', 'read_file', recentRead),
    { role: 'user', content: 'turn three' },
  ]

  const result = prune(history)

  assert.equal(result.diagnostics.prunedCount, 1)
  assert.equal(toolOutputText(result.history[4]), recentRead)
})

test('failed build/test command output is protected even when old', () => {
  const failedTest = `stdout:\n${'noise\n'.repeat(400)}\nFINAL ERROR: npm test failed`
  const history = [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'turn one' },
    toolResult('call_test', 'run_command', failedTest, { isError: true }),
    { role: 'user', content: 'turn two' },
    { role: 'assistant', content: 'ack' },
    { role: 'user', content: 'turn three' },
  ]

  const result = prune(history)

  assert.equal(result.diagnostics.prunedCount, 0)
  assert.equal(result.diagnostics.protectedCriticalCount, 1)
  assert.match(toolOutputText(result.history[2]), /FINAL ERROR: npm test failed/)
})

test('estimated prompt size decreases after pruning', () => {
  const oldRead = `file body\n${'export const value = 1\n'.repeat(1_000)}`
  const history = [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'turn one' },
    toolResult('call_read', 'read_file', oldRead),
    { role: 'user', content: 'turn two' },
    { role: 'assistant', content: 'ack' },
    { role: 'user', content: 'turn three' },
  ]

  const before = estimateHistoryTokens(history)
  const result = prune(history)
  const after = estimateHistoryTokens(result.history)

  assert.equal(result.diagnostics.prunedCount, 1)
  assert.ok(after < before)
  assert.ok(result.diagnostics.estimatedSavedToolResultTokens > 0)
})

test('pruning is deterministic for the same history and profile', () => {
  const history = [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'turn one' },
    toolResult('call_read', 'read_file', `old read\n${'same\n'.repeat(500)}`),
    { role: 'user', content: 'turn two' },
    { role: 'assistant', content: 'ack' },
    { role: 'user', content: 'turn three' },
  ]

  const first = prune(history)
  const second = prune(history)

  assert.deepEqual(first, second)
})

test('old command output stays protected ahead of newer low-value history when budget is tight', () => {
  const protectedCommand = `stdout\n${'keep this diagnostic output\n'.repeat(100)}`
  const prunedSearch = `old search\n${'match line\n'.repeat(160)}`
  const history = [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'turn one' },
    toolResult('call_command', 'run_command', protectedCommand),
    { role: 'assistant', content: 'ack' },
    toolResult('call_search', 'search_code', prunedSearch),
    { role: 'user', content: 'turn two' },
    { role: 'assistant', content: 'ack' },
    { role: 'user', content: 'turn three' },
  ]

  const result = prune(history, {
    recentToolResultBudgetChars: protectedCommand.length + 10,
  })

  assert.equal(toolOutputText(result.history[2]), protectedCommand)
  assert.match(toolOutputText(result.history[4]), /\[Old tool result cleared for prompt budget\]/)
  assert.match(toolOutputText(result.history[4]), /reason: old_low_value_tool_output/)
  assert.equal(result.diagnostics.protectedRetentionCounts.high_value_history, 1)
  assert.equal(result.diagnostics.prunedRetentionCounts.low_value_history, 1)
})
