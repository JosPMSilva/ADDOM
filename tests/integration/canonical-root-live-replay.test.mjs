import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-canonical-live-replay-'))
const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-canonical-live-replay-project-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { closeDb } = await import('../../src/main/memory/db.mjs')
const { createCanonicalRootEventWriter } = await import('../../src/main/chat/canonical-root-event-writer.mjs')
const { listTimeline, registerProject } = await import('../../src/main/workspace/workspace-store.mjs')
const { mapTimelineFromPersistedEvents } = await import('../../src/renderer/store/chat/timeline-hydration.mjs')

test.after(() => {
  try { closeDb() } catch { /* best-effort cleanup */ }
  try { fs.rmSync(projectPath, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
})

test('canonical root live projection and reload hydration resolve the same durable final', () => {
  const opened = registerProject(projectPath)
  const projectId = String(opened?.project?.id || '')
  const threadId = String(opened?.activeThread?.id || '')
  const turnId = 'turn_live_replay'
  const sent = []
  const writer = createCanonicalRootEventWriter({
    projectId,
    threadId,
    turnId,
    assistantMessageId: 'assistant_live_replay',
    providerId: 'openai',
    send: (channel, payload) => sent.push({ channel, payload }),
  })

  writer.persistTimelineEvent('user_message', {
    role: 'user',
    content: 'Persist this turn.',
    meta: { threadId, turnId, providerId: 'openai' },
  })
  writer.commitTurnState('started', { startedAt: 100 })
  writer.commitFinalTurn({
    donePayload: {
      threadId,
      turnId,
      assistantMessageId: 'assistant_live_replay',
      full: 'The durable final.',
      emittedAt: 111,
      finalDocument: {
        schemaVersion: 1,
        threadId,
        turnId,
        messageId: 'assistant_live_replay',
        ownership: 'final-document',
        text: 'The durable final.',
        parts: [],
      },
    },
    assistantMeta: {
      threadId,
      turnId,
      providerId: 'openai',
      assistantMessageId: 'assistant_live_replay',
      stopReason: 'stop',
    },
    terminalPayload: { status: 'ok', startedAt: 100, finishedAt: 200 },
  })

  assert.equal(closeDb(), true)
  const persisted = listTimeline(threadId, { limit: 50 })
  assert.equal(persisted.every((event) => event.canonical.schemaVersion === 1), true)
  assert.deepEqual(persisted.map((event) => event.kind), [
    'user_message',
    'turn_started',
    'assistant_message',
    'turn_completed',
  ])
  const hydrated = mapTimelineFromPersistedEvents(persisted)
  const liveFinal = sent.find((entry) => entry.channel === 'chat:done')?.payload
  const hydratedFinal = hydrated.messages.find((message) => message.role === 'assistant')
  assert.equal(hydratedFinal?.content, liveFinal?.full)
  assert.equal(hydratedFinal?.id, liveFinal?.assistantMessageId)
  assert.equal(hydratedFinal?.status, 'done')

  const sentBeforeRetry = sent.length
  writer.commitFinalTurn({
    donePayload: { ...liveFinal, emittedAt: 222 },
    assistantMeta: {
      threadId,
      turnId,
      providerId: 'openai',
      assistantMessageId: 'assistant_live_replay',
      stopReason: 'stop',
    },
    terminalPayload: { status: 'ok', startedAt: 100, finishedAt: 200 },
  })
  assert.equal(sent.length, sentBeforeRetry)
  assert.equal(listTimeline(threadId, { limit: 50 }).length, persisted.length)

  assert.throws(() => writer.commitFailureTurn({
    message: 'Late recovery packet.',
    reason: 'late_recovery',
  }), /identity collision/i)
  assert.equal(listTimeline(threadId, { limit: 50 }).length, persisted.length)
})

test('canonical failure survives storage reopen with calm preserved-effect language', () => {
  const opened = registerProject(projectPath)
  const projectId = String(opened?.project?.id || '')
  const threadId = String(opened?.activeThread?.id || '')
  const turnId = 'turn_failure_after_mutation'
  const sent = []
  const writer = createCanonicalRootEventWriter({
    projectId,
    threadId,
    turnId,
    providerId: 'anthropic',
    send: (channel, payload) => sent.push({ channel, payload }),
  })

  writer.persistTimelineEvent('file_change', {
    role: 'system',
    content: 'Changed src/preserved.mjs',
    meta: {
      threadId,
      turnId,
      filePath: 'src/preserved.mjs',
      operation: 'modify',
    },
  })
  const committed = writer.commitFailureTurn({
    message: 'The provider connection ended unexpectedly.',
    reason: 'provider_stream_failed',
  })

  assert.equal(committed.mutationSummary.hasPreservedEffects, true)
  assert.match(sent.find((entry) => entry.channel === 'chat:error')?.payload?.message || '', /file changes.*preserved/i)

  assert.equal(closeDb(), true)
  const persisted = listTimeline(threadId, { limit: 100 })
    .filter((event) => String(event.turnId || '') === turnId)
  const hydrated = mapTimelineFromPersistedEvents(persisted)
  const hydratedFailure = hydrated.messages.find((message) => message.status === 'error')
  assert.match(hydratedFailure?.content || '', /file changes.*preserved/i)
  assert.doesNotMatch(hydratedFailure?.content || '', /provider_stream_failed/i)
  assert.equal(persisted.at(-1)?.kind, 'turn_completed')
  assert.equal(persisted.at(-1)?.meta?.mutationSummary?.hasPreservedEffects, true)
})

test('one hundred progressive live updates occupy one durable ledger row', () => {
  const opened = registerProject(projectPath)
  const projectId = String(opened?.project?.id || '')
  const threadId = String(opened?.activeThread?.id || '')
  const turnId = 'turn_progressive_growth'
  const sent = []
  const writer = createCanonicalRootEventWriter({
    projectId,
    threadId,
    turnId,
    providerId: 'openai',
    send: (channel, payload) => sent.push({ channel, payload }),
  })

  for (let index = 1; index <= 100; index += 1) {
    const payload = { threadId, turnId, status: 'running', progress: index }
    writer.commitAndProject('provider_tool_status', {
      role: 'assistant',
      content: `Progress ${index}`,
      meta: payload,
      lifecycle: 'active',
      progressiveKey: 'provider_tool_status:round_1:call_1',
    }, { channel: 'chat:provider-tool-status', payload })
  }

  const rows = listTimeline(threadId, { limit: 500 })
    .filter((event) => String(event.turnId || '') === turnId)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].content, 'Progress 100')
  assert.equal(rows[0].canonical.localSequence, 1)
  assert.equal(sent.length, 100)
})
