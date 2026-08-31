import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildInterruptedReasoningSnapshot,
  emitReasoningDone,
  recordToolStepOutcome,
} from '../../src/main/chat/chat-turn-events.mjs'

function recordToolOutcome(overrides = {}) {
  const persisted = []
  const sent = []
  const turnToolResults = []

  recordToolStepOutcome({
    turnToolResults,
    history: [],
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    buildToolResultMessage: () => ({ role: 'tool', content: 'ok' }),
    trimText: (value) => String(value || ''),
    extractRunCommandMeta: () => ({}),
    approvalId: '',
    tc: { id: 'call_write', name: 'write_file' },
    toolInput: { filePath: 'src/app.js' },
    toolEventInput: { filePath: 'src/app.js' },
    result: 'ok',
    isError: false,
    decision: 'approved',
    denyReason: '',
    missingDependencySuspected: false,
    stepId: 'turn_artifact:step:1',
    sequence: 1,
    startedAt: 10,
    finishedAt: 20,
    durationMs: 10,
    threadId: 'thread_artifact',
    turnId: 'turn_artifact',
    ...overrides,
  })

  return { persisted, sent, turnToolResults }
}

test('buildInterruptedReasoningSnapshot joins unique reasoning segments and trailing buffer', () => {
  const snapshot = buildInterruptedReasoningSnapshot({
    turnReasoningSegments: [
      'First reasoning step.',
      'First reasoning step.',
      'Second reasoning step.',
    ],
    reasoningBuffer: 'Third reasoning step.',
  })

  assert.equal(
    snapshot,
    'First reasoning step.\n\n---\n\nSecond reasoning step.\n\n---\n\nThird reasoning step.',
  )
})

test('buildInterruptedReasoningSnapshot ignores an already-captured trailing buffer', () => {
  const snapshot = buildInterruptedReasoningSnapshot({
    turnReasoningSegments: ['Captured reasoning.'],
    reasoningBuffer: 'Captured reasoning.',
  })

  assert.equal(snapshot, 'Captured reasoning.')
})

test('recordToolStepOutcome persists tool context facts alongside tool results', () => {
  const persisted = []
  recordToolStepOutcome({
    turnToolResults: [],
    history: [],
    send: () => {},
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    buildToolResultMessage: () => ({ role: 'tool', content: 'ok' }),
    trimText: (value) => String(value || ''),
    extractRunCommandMeta: () => ({}),
    approvalId: '',
    tc: { id: 'call_1', name: 'read_file' },
    toolInput: { path: 'src/app.js' },
    toolEventInput: { path: 'src/app.js' },
    result: 'console.log("hello")',
    isError: false,
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
  })

  assert.equal(persisted.some((row) => row.kind === 'tool_result'), true)
  assert.equal(persisted.some((row) => row.kind === 'tool_context_fact'), true)
  const factEvent = persisted.find((row) => row.kind === 'tool_context_fact')
  assert.equal(factEvent?.payload?.meta?.fact?.kind, 'file_read')
  assert.equal(factEvent?.payload?.meta?.fact?.filePath, 'src/app.js')
})

test('recordToolStepOutcome persists and projects managed-plan lifecycle events independently of tool_result', () => {
  const { persisted, sent } = recordToolOutcome({
    tc: { id: 'call_plan_document', name: 'plan_document_write' },
    toolInput: { expected_revision: 2, content: '# Plan' },
    toolEventInput: { expected_revision: 2 },
    result: {
      plan: {
        planId: 'plan_1',
        project: 'C:\\repo',
        threadId: 'thread_artifact',
        revision: 3,
        lifecycle: 'ready_for_review',
      },
      document: {
        kind: 'managed_plan',
        planId: 'plan_1',
        filePath: 'C:\\user-data\\managed-plans\\plan_1.md',
        revision: 3,
      },
      event: {
        kind: 'plan_document_ready',
        planId: 'plan_1',
        revision: 3,
      },
    },
  })

  const persistedReady = persisted.find((row) => row.kind === 'plan_document_ready')
  assert.equal(persistedReady?.payload?.meta?.planId, 'plan_1')
  assert.equal(persistedReady?.payload?.meta?.projectRoot, 'C:\\repo')
  assert.equal(persistedReady?.payload?.meta?.threadId, 'thread_artifact')
  assert.equal(persistedReady?.payload?.meta?.document?.revision, 3)

  const projectedReady = sent.find((row) => row.channel === 'chat:plan-document-ready')
  assert.equal(projectedReady?.payload?.planId, 'plan_1')
  assert.equal(projectedReady?.payload?.revision, 3)
})

test('recordToolStepOutcome preserves structured question_user payload for renderer cards', () => {
  const { persisted, sent, turnToolResults } = recordToolOutcome({
    tc: { id: 'call_question', name: 'question_user' },
    toolInput: {
      header: 'Website Type',
      question: 'What kind of website do you want to build?',
      options: [
        {
          id: 'marketing',
          label: 'Marketing site',
          description: 'Landing page or product site.',
          recommended: true,
        },
      ],
    },
    toolEventInput: {
      header: 'Website Type',
      question: 'What kind of website do you want to build?',
      options: [
        {
          id: 'marketing',
          label: 'Marketing site',
          description: 'Landing page or product site.',
          recommended: true,
        },
      ],
    },
    result: {
      status: 'awaiting_user_response',
      header: 'Website Type',
      question: 'What kind of website do you want to build?',
      options: [
        {
          id: 'marketing',
          label: 'Marketing site',
          description: 'Landing page or product site.',
          recommended: true,
        },
      ],
    },
  })

  const toolResult = sent.find((row) => row.channel === 'chat:tool-result')
  assert.equal(toolResult?.payload?.result.includes('What kind of website'), true)
  assert.equal(toolResult?.payload?.questionUser?.header, 'Website Type')
  assert.equal(toolResult?.payload?.questionUser?.options?.[0]?.id, 'marketing')

  const persistedToolResult = persisted.find((row) => row.kind === 'tool_result')
  assert.equal(persistedToolResult?.payload?.meta?.questionUser?.question, 'What kind of website do you want to build?')
  assert.equal(turnToolResults[0]?.questionUser?.answerMode, 'new_user_turn')
})

test('emitReasoningDone persists token-only reasoning fallback for hydration', () => {
  const sent = []
  const persisted = []
  const turnReasoningSegments = []

  emitReasoningDone({
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    reasoningBuffer: '',
    usageReasoningTokens: 82,
    threadId: 'thread_token_reasoning',
    turnId: 'turn_token_reasoning',
    round: 2,
    providerId: 'openrouter',
    model: 'openai/gpt-5.4',
    turnReasoningSegments,
  })

  assert.equal(sent.length, 1)
  assert.equal(sent[0]?.channel, 'chat:reasoning-done')
  assert.equal(sent[0]?.payload?.reasoningTokens, 82)
  assert.deepEqual(turnReasoningSegments, [])

  assert.equal(persisted.length, 1)
  assert.equal(persisted[0]?.kind, 'reasoning_done')
  assert.equal(String(persisted[0]?.payload?.content || ''), '')
  assert.equal(persisted[0]?.payload?.meta?.reasoningTokens, 82)
  assert.equal(persisted[0]?.payload?.meta?.providerId, 'openrouter')
  assert.equal(persisted[0]?.payload?.meta?.model, 'openai/gpt-5.4')
})

test('emitReasoningDone exposes the authoritative current round and cumulative turn reasoning', () => {
  const sent = []
  const persisted = []
  const turnReasoningSegments = []

  emitReasoningDone({
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    reasoningBuffer: 'Plan the inspection.',
    threadId: 'thread_reasoning_rounds',
    turnId: 'turn_reasoning_rounds',
    round: 1,
    assistantMessageId: 'assistant_reasoning_rounds',
    turnReasoningSegments,
  })
  emitReasoningDone({
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    reasoningBuffer: 'Confirm the result.',
    threadId: 'thread_reasoning_rounds',
    turnId: 'turn_reasoning_rounds',
    round: 2,
    assistantMessageId: 'assistant_reasoning_rounds',
    turnReasoningSegments,
  })

  assert.deepEqual(turnReasoningSegments, ['Plan the inspection.', 'Confirm the result.'])
  assert.equal(sent[0]?.payload?.current, 'Plan the inspection.')
  assert.equal(sent[0]?.payload?.full, 'Plan the inspection.')
  assert.equal(sent[1]?.payload?.current, 'Confirm the result.')
  assert.equal(sent[1]?.payload?.full, 'Plan the inspection.\n\n---\n\nConfirm the result.')
  assert.equal(sent[1]?.payload?.assistantMessageId, 'assistant_reasoning_rounds')
  assert.equal(persisted[1]?.payload?.meta?.current, 'Confirm the result.')
  assert.equal(persisted[1]?.payload?.meta?.full, 'Plan the inspection.\n\n---\n\nConfirm the result.')
  assert.equal(persisted[1]?.payload?.meta?.assistantMessageId, 'assistant_reasoning_rounds')
})

test('recordToolStepOutcome keeps suppressed shell hydration diagnostics on the command row without emitting file_change events', () => {
  const sent = []
  const persisted = []

  recordToolStepOutcome({
    turnToolResults: [],
    history: [],
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    buildToolResultMessage: () => ({ role: 'tool', content: 'ok' }),
    trimText: (value) => String(value || ''),
    extractRunCommandMeta: () => ({ command: 'npm install lodash' }),
    approvalId: '',
    tc: { id: 'call_shell_1', name: 'run_command' },
    toolInput: { command: 'npm install lodash' },
    toolEventInput: { command: 'npm install lodash' },
    result: 'stdout:\ninstalled',
    isError: false,
    decision: 'approved',
    denyReason: '',
    missingDependencySuspected: false,
    stepId: 'turn_shell:step:1',
    sequence: 1,
    startedAt: 10,
    finishedAt: 20,
    durationMs: 10,
    threadId: 'thread_shell',
    turnId: 'turn_shell',
    writeArtifactChanges: [],
    shellWriteDiagnostics: {
      status: 'suppressed',
      reasonCodes: ['broad_command'],
      changedPathCount: 1,
      candidatePathCount: 0,
    },
  })

  assert.equal(persisted.some((row) => row.kind === 'tool_result'), true)
  assert.equal(persisted.some((row) => row.kind === 'file_change'), false)
  assert.equal(persisted.some((row) => row.kind === 'artifact_tracking'), true)
  const toolResult = persisted.find((row) => row.kind === 'tool_result')
  assert.deepEqual(toolResult?.payload?.meta?.shellWriteHydration?.reasonCodes, ['broad_command'])
  assert.equal(toolResult?.payload?.meta?.artifactTracking?.status, 'untracked')
  assert.equal(toolResult?.payload?.meta?.artifactTracking?.reasonCode, 'shell_write_hydration_suppressed')
  const artifactTrackingEvent = sent.find((row) => row.channel === 'chat:artifact-tracking')
  assert.equal(artifactTrackingEvent?.payload?.status, 'untracked')
  assert.equal(artifactTrackingEvent?.payload?.reasonCode, 'shell_write_hydration_suppressed')
})

test('recordToolStepOutcome keeps read-only shell commands command-only when no file changes landed', () => {
  const sent = []
  const persisted = []
  const turnToolResults = []

  recordToolStepOutcome({
    turnToolResults,
    history: [],
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    buildToolResultMessage: () => ({ role: 'tool', content: 'ok' }),
    trimText: (value) => String(value || ''),
    extractRunCommandMeta: () => ({ command: 'git status' }),
    approvalId: '',
    tc: { id: 'call_shell_read_only', name: 'run_command' },
    toolInput: { command: 'git status' },
    toolEventInput: { command: 'git status' },
    result: 'On branch main',
    isError: false,
    decision: 'approved',
    denyReason: '',
    missingDependencySuspected: false,
    stepId: 'turn_shell:step:read_only',
    sequence: 2,
    startedAt: 10,
    finishedAt: 20,
    durationMs: 10,
    threadId: 'thread_shell',
    turnId: 'turn_shell',
    writeArtifactChanges: [],
    shellWriteDiagnostics: {
      status: 'non_file',
      reasonCodes: [],
      changedPathCount: 0,
      candidatePathCount: 0,
    },
  })

  assert.equal(persisted.some((row) => row.kind === 'artifact_tracking'), false)
  assert.equal(sent.some((row) => row.channel === 'chat:artifact-tracking'), false)
  assert.equal(turnToolResults[0]?.artifactTracking ?? null, null)
})

test('recordToolStepOutcome fails closed for shell file changes without provable hydration metadata', () => {
  const sent = []
  const persisted = []

  recordToolStepOutcome({
    turnToolResults: [],
    history: [],
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    buildToolResultMessage: () => ({ role: 'tool', content: 'ok' }),
    trimText: (value) => String(value || ''),
    extractRunCommandMeta: () => ({ command: 'Set-Content -Path "file.txt" -Value "x"' }),
    approvalId: '',
    tc: { id: 'call_shell_2', name: 'run_command' },
    toolInput: { command: 'Set-Content -Path "file.txt" -Value "x"' },
    toolEventInput: { command: 'Set-Content -Path "file.txt" -Value "x"' },
    result: 'stdout:\nwritten',
    isError: false,
    decision: 'approved',
    denyReason: '',
    missingDependencySuspected: false,
    stepId: 'turn_shell:step:2',
    sequence: 2,
    startedAt: 10,
    finishedAt: 20,
    durationMs: 10,
    threadId: 'thread_shell',
    turnId: 'turn_shell',
    writeArtifactChanges: [{
      filePath: 'file.txt',
      source: 'run_command',
      changeType: 'created',
      addedLines: 0,
      removedLines: 0,
    }],
  })

  assert.equal(persisted.some((row) => row.kind === 'file_change'), false)
  const artifactTrackingEvent = persisted.find((row) => row.kind === 'artifact_tracking')
  assert.equal(artifactTrackingEvent?.payload?.meta?.status, 'untracked')
  assert.equal(artifactTrackingEvent?.payload?.meta?.reasonCode, 'shell_write_hydration_suppressed')
  assert.equal(sent.some((row) => row.channel === 'chat:artifact-tracking'), true)
})

test('recordToolStepOutcome emits provable shell file changes', () => {
  const sent = []
  const persisted = []
  const turnToolResults = []

  recordToolStepOutcome({
    turnToolResults,
    history: [],
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    buildToolResultMessage: () => ({ role: 'tool', content: 'ok' }),
    trimText: (value) => String(value || ''),
    extractRunCommandMeta: () => ({ command: 'Set-Content -Path "file.txt" -Value "x"' }),
    approvalId: '',
    tc: { id: 'call_shell_3', name: 'run_command' },
    toolInput: { command: 'Set-Content -Path "file.txt" -Value "x"' },
    toolEventInput: { command: 'Set-Content -Path "file.txt" -Value "x"' },
    result: 'stdout:\nwritten',
    isError: false,
    decision: 'approved',
    denyReason: '',
    missingDependencySuspected: false,
    stepId: 'turn_shell:step:3',
    sequence: 3,
    startedAt: 10,
    finishedAt: 20,
    durationMs: 10,
    threadId: 'thread_shell',
    turnId: 'turn_shell',
    writeArtifactChanges: [{
      filePath: 'file.txt',
      source: 'run_command',
      changeType: 'created',
      addedLines: 1,
      removedLines: 0,
      diffText: '@@ -1,0 +1,1 @@\n+hello',
      hydrationProven: true,
      newRevId: 'rev_1',
    }],
  })

  const fileChangeEvent = persisted.find((row) => row.kind === 'file_change')
  assert.equal(Boolean(fileChangeEvent), true)
  assert.equal(fileChangeEvent?.payload?.meta?.filePath, 'file.txt')
  assert.equal(persisted.some((row) => row.kind === 'artifact_tracking'), false)
  assert.equal(sent.some((row) => row.channel === 'chat:artifact-tracking'), false)
  assert.equal(turnToolResults[0]?.artifactTracking?.status, 'tracked')
})

test('recordToolStepOutcome warns when a successful write tool completes without artifact metadata', () => {
  const { persisted, sent, turnToolResults } = recordToolOutcome({
    tc: { id: 'call_write_no_artifact', name: 'write_file' },
    toolInput: { filePath: 'src/untracked.js' },
    toolEventInput: { filePath: 'src/untracked.js' },
  })

  const artifactTracking = persisted.find((row) => row.kind === 'artifact_tracking')
  assert.equal(artifactTracking?.payload?.meta?.status, 'untracked')
  assert.equal(artifactTracking?.payload?.meta?.reasonCode, 'artifact_metadata_missing')
  assert.match(artifactTracking?.payload?.content || '', /Artifact tracking untracked/)

  const toolResult = persisted.find((row) => row.kind === 'tool_result')
  assert.equal(toolResult?.payload?.meta?.artifactTracking?.reasonCode, 'artifact_metadata_missing')
  assert.equal(turnToolResults[0]?.artifactTracking?.reasonCode, 'artifact_metadata_missing')

  const sentWarning = sent.find((row) => row.channel === 'chat:artifact-tracking')
  assert.equal(sentWarning?.payload?.status, 'untracked')
  assert.equal(sentWarning?.payload?.toolName, 'write_file')
})

test('recordToolStepOutcome warns when visible file changes lack artifact revision ids', () => {
  const { persisted, sent } = recordToolOutcome({
    tc: { id: 'call_write_missing_revision', name: 'write_file' },
    writeArtifactMeta: {
      filePath: 'src/no-revision.js',
      source: 'write_file',
      changeType: 'modified',
      addedLines: 2,
      removedLines: 1,
    },
  })

  const fileChangeEvent = persisted.find((row) => row.kind === 'file_change')
  assert.equal(fileChangeEvent?.payload?.meta?.filePath, 'src/no-revision.js')

  const artifactTracking = persisted.find((row) => row.kind === 'artifact_tracking')
  assert.equal(artifactTracking?.payload?.meta?.status, 'untracked')
  assert.equal(artifactTracking?.payload?.meta?.reasonCode, 'missing_revision_metadata')
  assert.equal(artifactTracking?.payload?.meta?.untrackedCount, 1)
  assert.equal(sent.some((row) => (
    row.channel === 'chat:artifact-tracking'
    && row.payload?.reasonCode === 'missing_revision_metadata'
  )), true)
})
