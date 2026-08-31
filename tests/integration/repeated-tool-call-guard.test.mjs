import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildExplorationToolCallBatchSignature,
  buildRepeatedToolCallBatchSignature,
  recordRepeatedToolCallBatch,
} from '../../src/main/chat/repeated-tool-call-guard.mjs'

test('repeated tool call batch signature is stable across key order differences', () => {
  const a = buildRepeatedToolCallBatchSignature([{
    name: 'run_command',
    input: {
      cwd: 'C:/repo',
      command: 'npm test',
    },
  }])
  const b = buildRepeatedToolCallBatchSignature([{
    name: 'run_command',
    input: {
      command: 'npm test',
      cwd: 'C:/repo',
    },
  }])

  assert.equal(a, b)
})

test('repeated tool call guard blocks after three identical rounds', () => {
  const state = {}
  const toolCalls = [{
    name: 'read_file',
    input: { path: 'src/app.js' },
  }]

  const first = recordRepeatedToolCallBatch({ state, toolCalls })
  const second = recordRepeatedToolCallBatch({ state, toolCalls })
  const third = recordRepeatedToolCallBatch({ state, toolCalls })

  assert.equal(first.repeatedCount, 1)
  assert.equal(first.blocked, false)
  assert.equal(second.repeatedCount, 2)
  assert.equal(second.blocked, false)
  assert.equal(third.repeatedCount, 3)
  assert.equal(third.blocked, true)
})

test('repeated tool call guard resets when the batch changes', () => {
  const state = {}

  recordRepeatedToolCallBatch({
    state,
    toolCalls: [{ name: 'read_file', input: { path: 'src/a.js' } }],
  })
  recordRepeatedToolCallBatch({
    state,
    toolCalls: [{ name: 'read_file', input: { path: 'src/a.js' } }],
  })

  const changed = recordRepeatedToolCallBatch({
    state,
    toolCalls: [{ name: 'read_file', input: { path: 'src/b.js' } }],
  })

  assert.equal(changed.repeatedCount, 1)
  assert.equal(changed.blocked, false)
})

test('exploration signature treats overlapping file ranges as the same exploration family', () => {
  const a = buildExplorationToolCallBatchSignature([{
    name: 'view_file_range',
    input: { path: 'src/app.js', start_line: 1, end_line: 500 },
  }])
  const b = buildExplorationToolCallBatchSignature([{
    name: 'view_file_range',
    input: { path: 'src\\app.js', start_line: 50, end_line: 550 },
  }])

  assert.equal(a, b)
})

test('exploration guard blocks after repeated near-duplicate search rounds', () => {
  const state = {}
  const first = recordRepeatedToolCallBatch({
    state,
    toolCalls: [{
      name: 'search_code',
      input: { query: 'Auth Session', path: 'src' },
    }],
    maxConsecutiveIdenticalRounds: 4,
    signatureBuilder: buildExplorationToolCallBatchSignature,
  })
  const second = recordRepeatedToolCallBatch({
    state,
    toolCalls: [{
      name: 'search_code',
      input: { query: '  auth   session ', path: 'src/' },
    }],
    maxConsecutiveIdenticalRounds: 4,
    signatureBuilder: buildExplorationToolCallBatchSignature,
  })
  const third = recordRepeatedToolCallBatch({
    state,
    toolCalls: [{
      name: 'search_code',
      input: { query: 'auth session', path: 'src' },
    }],
    maxConsecutiveIdenticalRounds: 4,
    signatureBuilder: buildExplorationToolCallBatchSignature,
  })
  const fourth = recordRepeatedToolCallBatch({
    state,
    toolCalls: [{
      name: 'search_code',
      input: { query: 'auth session', path: 'src', limit: 10 },
    }],
    maxConsecutiveIdenticalRounds: 4,
    signatureBuilder: buildExplorationToolCallBatchSignature,
  })

  assert.equal(first.blocked, false)
  assert.equal(second.blocked, false)
  assert.equal(third.blocked, false)
  assert.equal(fourth.repeatedCount, 4)
  assert.equal(fourth.blocked, true)
})
