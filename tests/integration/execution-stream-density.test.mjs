import test from 'node:test'
import assert from 'node:assert/strict'

import { extractOpenRouterReasoningFromRawChunk } from '../../src/main/api-clients/ai-provider-openrouter-reasoning.mjs'
import { resolveExecutionCapabilityProfile } from '../../src/common/chat/execution-capabilities.mjs'
import { reduceCanonicalExecutionEvent } from '../../src/renderer/store/chat/live-execution-canonical-reducer.mjs'
import { mapActivityToCanonicalExecutionEvents } from '../../src/renderer/store/chat/live-execution-store-activity.mjs'
import { buildExecutionStreamItems } from '../../src/renderer/components/chat/live-execution-stream-items.mjs'
import {
  formatExecutionToolLabel,
  resolveExecutionToolLabelParts,
} from '../../src/renderer/components/chat/live-execution-stream-labels.mjs'
import { buildExecutionEvidenceSections, hasUsefulExecutionEvidence } from '../../src/renderer/components/chat/execution-evidence-view-model.mjs'
import {
  formatToolClusterSummary,
  projectExecutionStreamClusters,
} from '../../src/renderer/components/chat/live-execution-stream-clusters.mjs'

test('formatExecutionToolLabel puts short identity on L2 rows', () => {
  assert.equal(formatExecutionToolLabel({
    toolKind: 'file_read',
    state: 'succeeded',
    inputDetail: 'src/renderer/components/chat/CanonicalExecutionStream.jsx',
  }), 'Read CanonicalExecutionStream.jsx')
  assert.equal(formatExecutionToolLabel({
    toolKind: 'command',
    state: 'active',
    inputDetail: 'npm test',
  }), 'Running npm test')
  assert.equal(formatExecutionToolLabel({
    toolKind: 'file_read',
    state: 'succeeded',
    inputDetail: '',
  }), 'Read file')
  assert.equal(formatExecutionToolLabel({
    toolKind: 'file_read',
    state: 'succeeded',
    inputDetail: 'Collecting provider tool input...',
  }), 'Read file')
  assert.equal(formatExecutionToolLabel({
    toolKind: 'command',
    state: 'failed',
    inputDetail: 'npm test',
  }), 'Failed npm test')
})

test('resolveExecutionToolLabelParts splits verb and identity for gray hierarchy', () => {
  assert.deepEqual(resolveExecutionToolLabelParts({
    toolKind: 'command',
    state: 'succeeded',
    inputDetail: '"C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe" -Command \'node --test tests/integration/example.test.mjs\'',
  }), {
    label: 'Ran node --test tests/integration/example.test.mjs',
    verb: 'Ran',
    identity: 'node --test tests/integration/example.test.mjs',
  })
  assert.deepEqual(resolveExecutionToolLabelParts({
    toolKind: 'file_edit',
    state: 'succeeded',
    inputDetail: 'src/pdfa_checker.py',
  }), {
    label: 'Edited pdfa_checker.py',
    verb: 'Edited',
    identity: 'pdfa_checker.py',
  })
  assert.deepEqual(resolveExecutionToolLabelParts({
    toolKind: 'command',
    state: 'succeeded',
    inputDetail: 'python -m unittest -v',
  }), {
    label: 'Ran python -m unittest -v',
    verb: 'Ran',
    identity: 'python -m unittest -v',
  })
  assert.deepEqual(resolveExecutionToolLabelParts({
    toolKind: 'file_read',
    state: 'succeeded',
    inputDetail: '',
  }), {
    label: 'Read file',
    verb: 'Read file',
    identity: '',
  })
})

test('buildExecutionEvidenceSections curates command evidence', () => {
  const sections = buildExecutionEvidenceSections({
    toolKind: 'command',
    evidence: {
      input: 'npm test',
      result: 'exit 1',
      outputs: [{ eventId: 'o1', stream: 'stderr', detail: 'failed' }],
      exitCode: 1,
      durationMs: 1500,
      startedAt: 1000,
      completedAt: 2500,
    },
  })
  assert.deepEqual(sections.map((section) => section.label), ['Command', 'Stderr', 'Result', 'Exit code', 'Duration'])
  assert.equal(sections[0].value, 'npm test')
  assert.equal(sections.find((section) => section.key === 'exit-code')?.value, '1')
  assert.equal(hasUsefulExecutionEvidence(sections), true)
  assert.equal(hasUsefulExecutionEvidence(buildExecutionEvidenceSections({
    toolKind: 'file_read',
    evidence: { startedAt: 1, completedAt: 50 },
  })), false)
})

test('command result metadata survives activity mapping into expanded evidence', () => {
  const fullCommand = 'npm test -- --reporter spec\n# preserve this exact command evidence'
  const [event] = mapActivityToCanonicalExecutionEvents({
    id: 'provider_tool:turn-1:command-1',
    type: 'result',
    eventKind: 'provider_tool_output',
    threadId: 'thread-1',
    turnId: 'turn-1',
    stepId: 'command-1',
    toolName: 'run_command',
    toolInput: { command: fullCommand },
    detail: 'Tests passed.',
    output: { status: 'completed' },
    exitCode: 0,
    durationMs: 842,
    createdAt: 1000,
  })
  const state = reduceCanonicalExecutionEvent({ turnsById: {}, turnOrder: [] }, event)
  const [item] = buildExecutionStreamItems(state.turnsById['turn-1'], { tools: true })

  assert.equal(item.fullIdentity, fullCommand)
  assert.equal(item.expandedEvidence.input, fullCommand)
  assert.equal(item.expandedEvidence.exitCode, 0)
  assert.equal(item.expandedEvidence.durationMs, 842)
  assert.equal(item.evidenceSections.find((section) => section.key === 'exit-code')?.value, '0')
  assert.equal(item.evidenceSections.find((section) => section.key === 'duration')?.value, '842ms')
})

test('buildExecutionStreamItems keeps command summaries neutral and non-expandable', () => {
  const [event] = mapActivityToCanonicalExecutionEvents({
    id: 'openai_account_native:turn-summary:command_execution',
    type: 'result',
    eventKind: 'openai_account_native_command_execution',
    threadId: 'thread-summary',
    turnId: 'turn-summary',
    stepId: 'native-command-summary',
    toolName: 'command_summary',
    detail: '9 commands · 7 completed · 2 failed',
    isError: false,
    createdAt: 1000,
  })
  const state = reduceCanonicalExecutionEvent({ turnsById: {}, turnOrder: [] }, event)
  const [summary] = buildExecutionStreamItems(state.turnsById['turn-summary'], { tools: true })
  assert.equal(summary.label, '9 commands · 7 completed · 2 failed')
  assert.equal(summary.statusMark, '')
  assert.equal(summary.accessibleStatus, '')
  assert.equal(summary.expandable, false)
})

test('projectExecutionStreamClusters collapses settled contiguous tools and breaks on reasoning', () => {
  const items = [
    { id: 't1', kind: 'tool', toolKind: 'file_read', state: 'succeeded', label: 'Read a.js' },
    { id: 't2', kind: 'tool', toolKind: 'file_read', state: 'succeeded', label: 'Read b.js' },
    { id: 't3', kind: 'tool', toolKind: 'file_edit', state: 'succeeded', label: 'Edited c.js' },
    { id: 'r1', kind: 'commentary', label: 'Next step.' },
    { id: 't4', kind: 'tool', toolKind: 'file_write', state: 'succeeded', label: 'Wrote d.js' },
    { id: 't5', kind: 'tool', toolKind: 'file_write', state: 'succeeded', label: 'Wrote e.js' },
    { id: 't6', kind: 'tool', toolKind: 'command', state: 'succeeded', label: 'Ran npm test' },
  ]
  const projected = projectExecutionStreamClusters(items, { threshold: 3, collapseSettled: true })
  assert.equal(projected[0].kind, 'cluster')
  assert.match(projected[0].label, /Read 2 files/)
  assert.match(projected[0].label, /Edited 1 file/)
  assert.equal(projected[1].kind, 'commentary')
  assert.equal(projected[2].kind, 'cluster')
  assert.match(projected[2].label, /Wrote 2 files/)
  assert.match(formatToolClusterSummary(items.slice(0, 3)), /Read 2 files/)
  assert.match(formatToolClusterSummary([
    { toolKind: 'file_read', state: 'failed' },
    { toolKind: 'file_read', state: 'succeeded' },
    { toolKind: 'file_read', state: 'succeeded' },
  ]), /1 failed/)
})

test('projectExecutionStreamClusters keeps a durable cluster identity as settled tools append', () => {
  const settledTools = [
    { id: 't1', kind: 'tool', toolKind: 'file_read', state: 'succeeded', label: 'Read a.js' },
    { id: 't2', kind: 'tool', toolKind: 'file_read', state: 'succeeded', label: 'Read b.js' },
    { id: 't3', kind: 'tool', toolKind: 'file_edit', state: 'succeeded', label: 'Edited c.js' },
    { id: 't4', kind: 'tool', toolKind: 'command', state: 'succeeded', label: 'Ran npm test' },
  ]

  const initialProjection = projectExecutionStreamClusters(settledTools.slice(0, 3), {
    threshold: 3,
    collapseSettled: true,
  })
  const appendedProjection = projectExecutionStreamClusters(settledTools, {
    threshold: 3,
    collapseSettled: true,
  })

  assert.equal(initialProjection[0].kind, 'cluster')
  assert.equal(appendedProjection[0].kind, 'cluster')
  assert.equal(appendedProjection[0].id, initialProjection[0].id)
  assert.equal(appendedProjection[0].items.length, 4)
})

test('formatToolClusterSummary ignores empty interrupted ghost failures', () => {
  const summary = formatToolClusterSummary([
    { toolKind: 'file_read', state: 'succeeded', identity: 'pdfa_checker.py', inputDetail: 'pdfa_checker.py' },
    { toolKind: 'file_read', state: 'interrupted', identity: '', inputDetail: '' },
    { toolKind: 'file_edit', state: 'succeeded', identity: 'test_pdfa_checker.py', inputDetail: 'test_pdfa_checker.py' },
    { toolKind: 'command', state: 'interrupted', identity: '', inputDetail: '' },
  ])
  assert.match(summary, /Read pdfa_checker\.py/)
  assert.match(summary, /Edited test_pdfa_checker\.py/)
  assert.doesNotMatch(summary, /failed/)
})

test('formatToolClusterSummary enriches small clusters with short identities', () => {
  const summary = formatToolClusterSummary([
    { toolKind: 'file_edit', state: 'succeeded', identity: 'pdfa_checker.py', inputDetail: 'src/pdfa_checker.py' },
    { toolKind: 'file_read', state: 'succeeded', identity: 'a.js', inputDetail: 'src/a.js' },
    { toolKind: 'file_read', state: 'succeeded', identity: 'b.js', inputDetail: 'src/b.js' },
  ])
  assert.match(summary, /Edited pdfa_checker\.py/)
  assert.match(summary, /Read 2 files/)
  assert.doesNotMatch(summary, /Edited 1 file/)
})

test('formatToolClusterSummary keeps count-only labels for larger clusters', () => {
  const summary = formatToolClusterSummary([
    { toolKind: 'file_read', state: 'succeeded', identity: 'a.js', inputDetail: 'a.js' },
    { toolKind: 'file_read', state: 'succeeded', identity: 'b.js', inputDetail: 'b.js' },
    { toolKind: 'file_read', state: 'succeeded', identity: 'c.js', inputDetail: 'c.js' },
    { toolKind: 'file_edit', state: 'succeeded', identity: 'd.js', inputDetail: 'd.js' },
  ])
  assert.match(summary, /Read 3 files/)
  assert.match(summary, /Edited 1 file/)
  assert.doesNotMatch(summary, /Edited d\.js/)
  assert.doesNotMatch(summary, /Read a\.js/)
})

test('formatToolClusterSummary enriches small clusters while keeping real failures', () => {
  const summary = formatToolClusterSummary([
    { toolKind: 'file_edit', state: 'succeeded', identity: 'foo.py', inputDetail: 'src/foo.py' },
    { toolKind: 'file_read', state: 'failed', identity: 'missing.py', inputDetail: 'src/missing.py' },
  ])
  assert.match(summary, /Edited foo\.py/)
  assert.match(summary, /1 failed/)
  assert.doesNotMatch(summary, /Edited 1 file/)
})

test('openrouter-style reasoning_details text interleaves with tools in canonical projection', () => {
  const first = extractOpenRouterReasoningFromRawChunk({
    choices: [{
      delta: {
        reasoning_details: [{ type: 'reasoning.text', text: 'Inspect the workspace first.' }],
      },
    }],
  })
  const second = extractOpenRouterReasoningFromRawChunk({
    choices: [{
      delta: {
        reasoning_details: [{ type: 'reasoning.text', text: 'Then edit the target.' }],
      },
    }],
  })
  assert.equal(first, 'Inspect the workspace first.')
  assert.equal(second, 'Then edit the target.')

  const events = [
    {
      kind: 'reasoning_chunk',
      turnId: 'turn-or',
      eventId: 'r1',
      messageId: 'message-1',
      reasoningRole: 'commentary',
      detail: first,
      emittedAt: 10,
    },
    {
      kind: 'tool_started',
      turnId: 'turn-or',
      eventId: 's1',
      sessionId: 'session-1',
      toolKind: 'file_read',
      state: 'active',
      detail: 'src/app.mjs',
      emittedAt: 20,
    },
    {
      kind: 'tool_result',
      turnId: 'turn-or',
      eventId: 'd1',
      sessionId: 'session-1',
      toolKind: 'file_read',
      state: 'succeeded',
      detail: 'ok',
      emittedAt: 30,
    },
    {
      kind: 'reasoning_chunk',
      turnId: 'turn-or',
      eventId: 'r2',
      messageId: 'message-2',
      reasoningRole: 'commentary',
      detail: second,
      emittedAt: 40,
    },
    {
      kind: 'turn_state',
      turnId: 'turn-or',
      eventId: 'done',
      state: 'succeeded',
      terminal: true,
      emittedAt: 50,
    },
  ]
  const state = events.reduce(
    (current, event) => reduceCanonicalExecutionEvent(current, event),
    { turnsById: {}, turnOrder: [] },
  )
  state.turnsById['turn-or'].providerId = 'openrouter'
  const items = buildExecutionStreamItems(
    state.turnsById['turn-or'],
    resolveExecutionCapabilityProfile({ providerId: 'openrouter' }),
  )
  assert.deepEqual(items.map(({ kind, label }) => ({ kind, label })), [
    { kind: 'commentary', label: 'Inspect the workspace first.' },
    { kind: 'tool', label: 'Read app.mjs' },
    { kind: 'commentary', label: 'Then edit the target.' },
  ])
})

test('live turns still cluster settled contiguous tools while keeping active tools visible', () => {
  const items = buildExecutionStreamItems({
    status: 'active',
    itemOrder: ['tool:1', 'tool:2', 'tool:3', 'tool:4'],
    sessionsById: {
      1: { id: '1', toolKind: 'file_read', state: 'succeeded', inputDetail: 'a.js' },
      2: { id: '2', toolKind: 'file_read', state: 'succeeded', inputDetail: 'b.js' },
      3: { id: '3', toolKind: 'file_read', state: 'succeeded', inputDetail: 'c.js' },
      4: { id: '4', toolKind: 'file_edit', state: 'active', inputDetail: 'd.js' },
    },
  }, resolveExecutionCapabilityProfile({ providerId: 'openrouter' }))
  assert.equal(items[0].kind, 'cluster')
  assert.match(items[0].label, /Read 3 files/)
  assert.equal(items[1].kind, 'tool')
  assert.equal(items[1].label, 'Editing d.js')
})

test('unnamed generic tool sessions are omitted from the stream', () => {
  const items = buildExecutionStreamItems({
    status: 'done',
    itemOrder: ['tool:1', 'tool:2'],
    sessionsById: {
      1: { id: '1', toolKind: 'tool', state: 'failed', inputDetail: '' },
      2: { id: '2', toolKind: 'file_read', state: 'succeeded', inputDetail: 'index.html' },
    },
  }, resolveExecutionCapabilityProfile({ providerId: 'openrouter' }))
  assert.deepEqual(items.map((item) => item.label), ['Read index.html'])
})
