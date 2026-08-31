import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildRootMutationSummary,
  commitProjectedTimelineEvent,
  createCanonicalRootEventWriter,
} from '../../src/main/chat/canonical-root-event-writer.mjs'

function committed(draft, overrides = {}) {
  return {
    inserted: true,
    advanced: false,
    event: {
      canonical: {
        ...draft,
        schemaVersion: 1,
      },
    },
    ...overrides,
  }
}

test('canonical root writer commits final and terminal rows atomically before live projection', () => {
  const order = []
  const captured = []
  const writer = createCanonicalRootEventWriter({
    projectId: 'project_01',
    threadId: 'thread_01',
    turnId: 'turn_01',
    assistantMessageId: 'assistant_01',
    providerId: 'openai',
    send: (channel, payload) => order.push({ type: 'send', channel, payload }),
    appendMany: (_threadId, drafts) => {
      order.push({ type: 'append_many' })
      captured.push(...drafts)
      return drafts.map((draft) => committed(draft))
    },
  })

  writer.commitFinalTurn({
    donePayload: {
      threadId: 'thread_01',
      turnId: 'turn_01',
      assistantMessageId: 'assistant_01',
      full: 'Durable final.',
    },
    assistantMeta: {
      assistantMessageId: 'assistant_01',
      stopReason: 'stop',
    },
    terminalPayload: { status: 'ok' },
  })

  assert.deepEqual(order.map((entry) => entry.type === 'send' ? `send:${entry.channel}` : entry.type), [
    'append_many',
    'send:chat:done',
    'send:chat:turn-state',
  ])
  assert.deepEqual(captured.map((draft) => draft.semanticKind), ['assistant_final', 'turn_state'])
  assert.deepEqual(captured.map((draft) => draft.lifecycle), ['completed', 'succeeded'])
  assert.equal(captured[0].payload.timeline.content, 'Durable final.')
  assert.equal(captured[1].canonicalEventId, 'root:turn_01:terminal')
})

test('canonical root writer never projects a failed or duplicate commit', () => {
  const sent = []
  const failedWriter = createCanonicalRootEventWriter({
    projectId: 'project_01',
    threadId: 'thread_01',
    turnId: 'turn_01',
    send: (channel) => sent.push(channel),
    appendOne: () => { throw new Error('ledger unavailable') },
  })
  assert.throws(() => failedWriter.commitTurnState('started'), /ledger unavailable/i)
  assert.deepEqual(sent, [])

  const duplicateWriter = createCanonicalRootEventWriter({
    projectId: 'project_01',
    threadId: 'thread_01',
    turnId: 'turn_01',
    send: (channel) => sent.push(channel),
    appendOne: (_threadId, draft) => committed(draft, { inserted: false }),
  })
  duplicateWriter.commitTurnState('completed', { status: 'ok' })
  assert.deepEqual(sent, [])
})

test('canonical root writer does not project a final when its atomic persistence fails', () => {
  const sent = []
  const writer = createCanonicalRootEventWriter({
    projectId: 'project_01',
    threadId: 'thread_01',
    turnId: 'turn_01',
    assistantMessageId: 'assistant_01',
    send: (channel) => sent.push(channel),
    appendMany: () => { throw new Error('atomic final unavailable') },
  })

  assert.throws(() => writer.commitFinalTurn({
    donePayload: {
      threadId: 'thread_01',
      turnId: 'turn_01',
      assistantMessageId: 'assistant_01',
      full: 'Must not be projected.',
    },
  }), /atomic final unavailable/i)
  assert.deepEqual(sent, [])
})

test('canonical root writer computes mutation evidence before committing calm failure semantics', () => {
  const order = []
  const captured = []
  const records = [
    {
      turnId: 'turn_01',
      kind: 'tool_result',
      meta: {
        decision: 'approved',
        isError: false,
        fileChanges: [{ filePath: 'src/app.mjs' }],
      },
    },
    {
      turnId: 'turn_01',
      kind: 'file_change',
      meta: { filePath: 'src/app.mjs' },
    },
  ]
  const writer = createCanonicalRootEventWriter({
    projectId: 'project_01',
    threadId: 'thread_01',
    turnId: 'turn_01',
    send: (channel, payload) => order.push({ type: 'send', channel, payload }),
    listRecords: () => records,
    appendMany: (_threadId, drafts) => {
      order.push({ type: 'append_many' })
      captured.push(...drafts)
      return drafts.map((draft) => committed(draft))
    },
  })

  const result = writer.commitFailureTurn({
    message: 'The provider connection ended unexpectedly.',
    reason: 'connection_lost',
  })

  assert.deepEqual(result.mutationSummary, {
    hasPreservedEffects: true,
    fileChangeCount: 1,
    toolEffectCount: 1,
    filePaths: ['src/app.mjs'],
  })
  assert.match(result.message, /file changes.*preserved/i)
  assert.doesNotMatch(result.message, /connection_lost/i)
  assert.equal(captured[0].payload.timeline.meta.mutationSummary.hasPreservedEffects, true)
  assert.deepEqual(order.map((entry) => entry.type === 'send' ? `send:${entry.channel}` : entry.type), [
    'append_many',
    'send:chat:error',
    'send:chat:turn-state',
  ])
})

test('buildRootMutationSummary distinguishes failed turns with no preserved effects', () => {
  assert.deepEqual(buildRootMutationSummary([], { turnId: 'turn_01' }), {
    hasPreservedEffects: false,
    fileChangeCount: 0,
    toolEffectCount: 0,
    filePaths: [],
  })
})

test('durable projection helper uses the canonical projector and preserves persist-first fallback order', () => {
  const canonicalCalls = []
  const canonicalPersist = () => assert.fail('legacy persistence must not run')
  canonicalPersist.commitAndProject = (...args) => canonicalCalls.push(args)
  commitProjectedTimelineEvent({
    persistTimelineEvent: canonicalPersist,
    send: () => assert.fail('legacy send must not run'),
    kind: 'provider_tool_status',
    options: { role: 'assistant', content: 'Running.' },
    channel: 'chat:provider-tool-status',
    payload: { status: 'running' },
  })
  assert.deepEqual(canonicalCalls, [[
    'provider_tool_status',
    { role: 'assistant', content: 'Running.' },
    { channel: 'chat:provider-tool-status', payload: { status: 'running' } },
  ]])

  const fallbackOrder = []
  commitProjectedTimelineEvent({
    persistTimelineEvent: (kind) => fallbackOrder.push(`persist:${kind}`),
    send: (channel) => fallbackOrder.push(`send:${channel}`),
    kind: 'provider_tool_status',
    channel: 'chat:provider-tool-status',
  })
  assert.deepEqual(fallbackOrder, [
    'persist:provider_tool_status',
    'send:chat:provider-tool-status',
  ])
})
