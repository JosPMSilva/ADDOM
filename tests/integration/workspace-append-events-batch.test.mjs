import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-workspace-batch-'))
const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-workspace-batch-project-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { closeDb } = await import('../../src/main/memory/db.mjs')
const {
  registerProject,
  createThread,
  appendEvents,
  listTimeline,
  listThreads,
  listProjects,
} = await import('../../src/main/workspace/workspace-store.mjs')
const {
  MAX_EVENT_CONTENT_CHARS,
} = await import('../../src/main/workspace/workspace-store-utils.mjs')

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

test.after(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(projectPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('appendEvents batches writes in order and updates thread/project timestamps once per batch', { concurrency: false }, (t) => {
  try {
    const opened = registerProject(projectPath)
    const projectId = String(opened?.project?.id || '').trim()
    const threadId = String(opened?.activeThread?.id || '').trim()
    assert.ok(projectId)
    assert.ok(threadId)

    const baseTime = Date.now() + 1_000
    const inserted = appendEvents(threadId, [
      {
        turnId: 'turn_1',
        kind: 'user_message',
        role: 'user',
        content: 'Batch hello.',
        meta: { lane: 'chat', seq: 1 },
        createdAt: baseTime,
      },
      {
        turnId: 'turn_1',
        kind: 'assistant_message',
        role: 'assistant',
        content: 'Batch acknowledged.',
        meta: { lane: 'chat', seq: 2 },
        createdAt: baseTime + 10,
      },
      {
        turnId: 'turn_1',
        kind: 'tool_result',
        role: '',
        content: 'Tool completed.',
        meta: { lane: 'tool', seq: 3 },
        createdAt: baseTime + 20,
      },
    ])

    assert.equal(inserted.length, 3)
    assert.deepEqual(inserted.map((row) => row.kind), ['user_message', 'assistant_message', 'tool_result'])
    assert.deepEqual(inserted.map((row) => row.meta.seq), [1, 2, 3])

    const timeline = listTimeline(threadId, { limit: 10 })
    assert.equal(timeline.length, 3)
    assert.deepEqual(timeline.map((row) => row.kind), ['user_message', 'assistant_message', 'tool_result'])
    assert.ok(timeline[0].eventId < timeline[1].eventId)
    assert.ok(timeline[1].eventId < timeline[2].eventId)

    const thread = listThreads(projectId).find((row) => row.id === threadId)
    assert.equal(thread?.updatedAt, baseTime + 20)

    const project = listProjects().find((row) => row.id === projectId)
    assert.equal(project?.lastWorkedAt, baseTime + 20)
    assert.equal(project?.lastOpenedAt, baseTime + 20)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('appendEvents is atomic when batch validation fails', { concurrency: false }, (t) => {
  try {
    const opened = registerProject(path.join(projectPath, 'atomicity'))
    const projectId = String(opened?.project?.id || '').trim()
    assert.ok(projectId)

    const created = createThread(projectId, 'Atomic batch')
    const threadId = String(created?.thread?.id || '').trim()
    assert.ok(threadId)

    assert.throws(() => appendEvents(threadId, [
      {
        turnId: 'turn_fail',
        kind: 'user_message',
        role: 'user',
        content: 'First event should not stick.',
      },
      {
        turnId: 'turn_fail',
        kind: '',
        role: 'assistant',
        content: 'Invalid batch item.',
      },
    ]), /event\.kind is required\./)

    assert.equal(listTimeline(threadId, { limit: 10 }).length, 0)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('appendEvents preserves long chat and error content while still trimming non-message event payloads', { concurrency: false }, (t) => {
  try {
    const opened = registerProject(path.join(projectPath, 'message-preservation'))
    const threadId = String(opened?.activeThread?.id || '').trim()
    assert.ok(threadId)

    const longUserContent = 'user '.repeat(MAX_EVENT_CONTENT_CHARS)
    const longAssistantContent = 'assistant '.repeat(MAX_EVENT_CONTENT_CHARS)
    const longErrorContent = 'error '.repeat(MAX_EVENT_CONTENT_CHARS)
    const longToolContent = 'tool '.repeat(MAX_EVENT_CONTENT_CHARS)

    appendEvents(threadId, [
      {
        turnId: 'turn_long',
        kind: 'user_message',
        role: 'user',
        content: longUserContent,
      },
      {
        turnId: 'turn_long',
        kind: 'assistant_message',
        role: 'assistant',
        content: longAssistantContent,
      },
      {
        turnId: 'turn_long',
        kind: 'chat_error',
        role: 'system',
        content: longErrorContent,
      },
      {
        turnId: 'turn_long',
        kind: 'tool_result',
        role: '',
        content: longToolContent,
      },
    ])

    const timeline = listTimeline(threadId, { limit: 10 })
    assert.equal(timeline.length, 4)
    assert.equal(timeline[0]?.content, longUserContent)
    assert.equal(timeline[1]?.content, longAssistantContent)
    assert.equal(timeline[2]?.content, longErrorContent)
    assert.match(String(timeline[3]?.content || ''), /\.\.\. \[truncated\]$/)
    assert.equal(String(timeline[3]?.content || '').length <= (longToolContent.length + 16), true)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})
