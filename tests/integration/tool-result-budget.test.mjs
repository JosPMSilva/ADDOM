import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { budgetToolResultForModel } from '../../src/main/tools/tool-result-budget.mjs'
import {
  readToolResultSpillover,
  resolveToolResultSpilloverRoot,
} from '../../src/main/tools/tool-result-spillover.mjs'
import { recordToolStepOutcome } from '../../src/main/chat/chat-turn-events.mjs'

const TEST_PROFILE = Object.freeze({
  id: 'test_profile',
  perToolOutputPreviewChars: 1_200,
})
const ORIGINAL_ADDOM_USER_DATA_PATH = process.env.ADDOM_USER_DATA_PATH
const TEST_USER_DATA_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-tool-result-budget-'))
process.env.ADDOM_USER_DATA_PATH = TEST_USER_DATA_PATH

test.after(() => {
  try {
    fs.rmSync(TEST_USER_DATA_PATH, { recursive: true, force: true })
  } catch {
    // Best-effort cleanup only.
  }
  if (ORIGINAL_ADDOM_USER_DATA_PATH === undefined) {
    delete process.env.ADDOM_USER_DATA_PATH
    return
  }
  process.env.ADDOM_USER_DATA_PATH = ORIGINAL_ADDOM_USER_DATA_PATH
})

function budgetResult(overrides = {}) {
  return budgetToolResultForModel({
    providerId: 'anthropic',
    model: 'claude-sonnet-4-6',
    toolName: 'run_command',
    result: 'ok',
    isError: false,
    decision: 'approved',
    promptBudgetProfile: TEST_PROFILE,
    ...overrides,
  })
}

function readPersistedOutput(result = null) {
  return readToolResultSpillover(result?.truncationMetadata?.persistedOutputPath || '')
}

test('small tool result stays unchanged', () => {
  const result = budgetResult({
    result: 'stdout:\nok',
  })

  assert.equal(result.resultText, 'stdout:\nok')
  assert.equal(result.omittedChars, 0)
  assert.equal(result.previewDirection, 'none')
  assert.equal(result.truncationMetadata.truncated, false)
  assert.equal(result.truncationMetadata.persistence, 'disabled')
  assert.equal(result.truncationMetadata.persistedOutputPath, '')
})

test('huge successful command output uses a bounded head preview', () => {
  const raw = `stdout:\nSTART\n${'a'.repeat(5_000)}\nEND`
  const result = budgetResult({ result: raw, isError: false })
  const spillover = readPersistedOutput(result)

  assert.equal(result.truncationMetadata.truncated, true)
  assert.equal(result.previewDirection, 'head')
  assert.equal(result.truncationMetadata.previewDirection, 'head')
  assert.ok(result.resultText.length <= TEST_PROFILE.perToolOutputPreviewChars)
  assert.match(result.resultText, /full_output_persistence: enabled/)
  assert.match(result.resultText, /START/)
  assert.doesNotMatch(result.resultText, /END/)
  assert.ok(result.omittedChars > 0)
  assert.equal(result.truncationMetadata.persistence, 'enabled')
  assert.ok(result.truncationMetadata.persistedOutputPath.startsWith(resolveToolResultSpilloverRoot(TEST_USER_DATA_PATH)))
  assert.ok(result.truncationMetadata.persistedOutputSha256)
  assert.equal(spillover?.output, raw)
  assert.equal(spillover?.sha256, result.truncationMetadata.persistedOutputSha256)
})

test('huge failed command output uses a tail preview with final error lines', () => {
  const raw = `stdout:\nSTART\n${'a'.repeat(5_000)}\nFINAL ERROR: test failed`
  const result = budgetResult({ result: raw, isError: true })
  const spillover = readPersistedOutput(result)

  assert.equal(result.truncationMetadata.truncated, true)
  assert.equal(result.previewDirection, 'tail')
  assert.ok(result.resultText.length <= TEST_PROFILE.perToolOutputPreviewChars)
  assert.match(result.resultText, /full_output_persistence: enabled/)
  assert.match(result.resultText, /FINAL ERROR: test failed/)
  assert.doesNotMatch(result.resultText, /START/)
  assert.equal(spillover?.output, raw)
})

test('failing terminal session snapshot also uses a tail preview', () => {
  const raw = `snapshot:\nSTART\n${'noise\n'.repeat(2_000)}\nFINAL ERROR: tui crashed`
  const result = budgetResult({
    toolName: 'terminal_session_read_snapshot',
    result: raw,
    isError: true,
  })

  assert.equal(result.truncationMetadata.truncated, true)
  assert.equal(result.previewDirection, 'tail')
  assert.ok(result.resultText.length <= TEST_PROFILE.perToolOutputPreviewChars)
  assert.match(result.resultText, /FINAL ERROR: tui crashed/)
  assert.doesNotMatch(result.resultText, /START/)
})

test('non-command large output uses a bounded head preview', () => {
  const raw = `match 1\n${'x'.repeat(5_000)}\nmatch final`
  const result = budgetResult({
    toolName: 'search_code',
    result: raw,
  })

  assert.equal(result.truncationMetadata.truncated, true)
  assert.equal(result.previewDirection, 'head')
  assert.ok(result.resultText.length <= TEST_PROFILE.perToolOutputPreviewChars)
  assert.match(result.resultText, /match 1/)
  assert.doesNotMatch(result.resultText, /match final/)
})

test('anthropic strict profile applies a tighter cap to low-value read results', () => {
  const raw = `line 1\n${'x'.repeat(20_000)}\nline final`
  const result = budgetToolResultForModel({
    providerId: 'anthropic',
    model: 'claude-sonnet-4-6',
    toolName: 'read_file',
    result: raw,
    isError: false,
    decision: 'approved',
    promptBudgetProfile: {
      id: 'anthropic_strict',
      perToolOutputPreviewChars: 32_000,
    },
  })

  assert.equal(result.truncationMetadata.truncated, true)
  assert.equal(result.previewDirection, 'head')
  assert.ok(result.resultText.length <= 4_500)
  assert.match(result.resultText, /line 1/)
  assert.doesNotMatch(result.resultText, /line final/)
})

test('anthropic learned moderate exploration mode relaxes low-value read caps conservatively', () => {
  const raw = `line 1\n${'x'.repeat(20_000)}\nline final`
  const result = budgetToolResultForModel({
    providerId: 'anthropic',
    model: 'claude-sonnet-4-6',
    toolName: 'read_file',
    result: raw,
    isError: false,
    decision: 'approved',
    promptBudgetProfile: {
      id: 'anthropic_strict',
      family: 'anthropic',
      explorationToolBudgetMode: 'moderate',
      perToolOutputPreviewChars: 32_000,
    },
  })

  assert.equal(result.truncationMetadata.truncated, true)
  assert.equal(result.previewDirection, 'head')
  assert.ok(result.resultText.length <= 8_000)
  assert.ok(result.resultText.length > 4_500)
  assert.match(result.resultText, /line 1/)
  assert.doesNotMatch(result.resultText, /line final/)
})

test('large write success output preserves change metadata instead of file body', () => {
  const raw = `Patch applied.\n${'full file body\n'.repeat(800)}`
  const result = budgetResult({
    toolName: 'apply_patch',
    result: raw,
    fileChanges: [{
      filePath: 'src/app.js',
      changeType: 'modified',
      addedLines: 3,
      removedLines: 1,
    }],
  })
  const spillover = readPersistedOutput(result)

  assert.equal(result.truncationMetadata.truncated, true)
  assert.equal(result.previewDirection, 'metadata')
  assert.ok(result.resultText.length <= TEST_PROFILE.perToolOutputPreviewChars)
  assert.match(result.resultText, /apply_patch completed/)
  assert.match(result.resultText, /src\/app\.js: modified \(\+3 \/ -1\)/)
  assert.doesNotMatch(result.resultText, /full file body/)
  assert.equal(result.truncationMetadata.persistence, 'enabled')
  assert.equal(spillover?.output, raw)
})

test('truncated tool results expose degraded spillover cleanup metadata without failing budgeting', () => {
  const spilloverRoot = resolveToolResultSpilloverRoot(TEST_USER_DATA_PATH)
  fs.mkdirSync(spilloverRoot, { recursive: true })

  const originalReaddirSync = fs.readdirSync
  fs.readdirSync = () => {
    const error = new Error('spillover scan blocked')
    error.code = 'EACCES'
    throw error
  }

  try {
    const raw = `stdout:\nSTART\n${'a'.repeat(5_000)}\nEND`
    const result = budgetResult({ result: raw, isError: false })
    const spillover = readPersistedOutput(result)

    assert.equal(result.truncationMetadata.persistence, 'enabled')
    assert.equal(result.truncationMetadata.spilloverPersistenceState, 'persisted_with_cleanup_degraded')
    assert.equal(result.truncationMetadata.spilloverCleanupState, 'failed')
    assert.equal(result.truncationMetadata.spilloverDegraded, true)
    assert.match(result.resultText, /spillover_persistence_state: persisted_with_cleanup_degraded/)
    assert.match(result.resultText, /spillover_cleanup_state: failed/)
    assert.ok(result.truncationMetadata.spilloverFailureReasons.some((value) => String(value).startsWith('scan_failed:')))
    assert.equal(spillover?.output, raw)
  } finally {
    fs.readdirSync = originalReaddirSync
  }
})

test('recordToolStepOutcome bounds the model-bound tool result and leaves UI emission on display text', () => {
  const history = []
  const turnToolResults = []
  const sent = []
  const timelineEvents = []
  const raw = `stdout:\nSTART\n${'a'.repeat(5_000)}\nFINAL ERROR: test failed`

  recordToolStepOutcome({
    turnToolResults,
    history,
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => timelineEvents.push({ kind, payload }),
    buildToolResultMessage: (_id, toolName, toolResult, isError, metadata) => ({
      role: 'tool',
      content: [{ type: 'tool-result', toolName, output: { type: isError ? 'error-text' : 'text', value: toolResult }, ...metadata }],
    }),
    trimText: (value) => String(value || ''),
    extractRunCommandMeta: () => ({}),
    providerId: 'anthropic',
    model: 'claude-sonnet-4-6',
    promptBudgetProfile: TEST_PROFILE,
    approvalId: '',
    tc: { id: 'call_1', name: 'run_command' },
    toolInput: { command: 'npm test' },
    toolEventInput: { command: 'npm test' },
    result: raw,
    isError: true,
    decision: 'approved',
    denyReason: '',
    missingDependencySuspected: false,
    stepId: 'turn_1:step:1',
    sequence: 1,
    startedAt: 10,
    finishedAt: 20,
    durationMs: 10,
    threadId: 'thread_1',
    turnId: 'turn_1',
    errorDiagnostics: {},
  })

  const modelValue = history[0]?.content?.[0]?.output?.value || ''
  const uiResult = sent.find((row) => row.channel === 'chat:tool-result')?.payload?.result || ''
  const toolResultEvent = timelineEvents.find((event) => event.kind === 'tool_result')
  const spilloverPath = turnToolResults[0]?.toolResultBudget?.persistedOutputPath || ''
  const spillover = readToolResultSpillover(spilloverPath)

  assert.ok(modelValue.length <= TEST_PROFILE.perToolOutputPreviewChars)
  assert.match(modelValue, /FINAL ERROR: test failed/)
  assert.equal(turnToolResults[0]?.toolResultBudget?.truncated, true)
  assert.equal(turnToolResults[0]?.toolResultBudget?.previewDirection, 'tail')
  assert.ok(spilloverPath)
  assert.equal(turnToolResults[0]?.toolResultBudget?.persistence, 'enabled')
  assert.equal(toolResultEvent?.payload?.meta?.toolResultBudget?.persistedOutputPath, spilloverPath)
  assert.equal(spillover?.output, raw)
  assert.match(uiResult, /START/)
  assert.match(uiResult, /FINAL ERROR: test failed/)
})
