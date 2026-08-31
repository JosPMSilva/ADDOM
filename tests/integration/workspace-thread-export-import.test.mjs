import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-workspace-'))
const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-workspace-project-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { closeDb } = await import('../../src/main/memory/db.mjs')
const {
  registerProject,
  appendEvent,
  appendCanonicalRootEvent,
  exportThread,
  importThread,
  listProjects,
  listTimeline,
} = await import('../../src/main/workspace/workspace-store.mjs')
const {
  MAX_IMPORTED_EVENT_FUTURE_SKEW_MS,
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

test('exportThread and importThread preserve timeline payloads', async (t) => {
  try {
    const opened = registerProject(projectPath)
    const sourceThreadId = String(opened?.activeThread?.id || '').trim()
    assert.ok(sourceThreadId)

    appendEvent(sourceThreadId, {
      turnId: 'turn_1',
      kind: 'user_message',
      role: 'user',
      content: 'Please refactor the handler.',
      meta: { lane: 'chat' },
    })
    appendEvent(sourceThreadId, {
      turnId: 'turn_1',
      kind: 'assistant_message',
      role: 'assistant',
      content: 'Starting refactor now.',
      meta: { lane: 'chat', ok: true },
    })

    const exported = await exportThread(sourceThreadId)
    assert.equal(exported.schema, 'addom.thread_export.v2')
    assert.equal(exported.eventCount, 2)
    assert.equal(exported.attachmentCount, 0)
    assert.equal(Array.isArray(exported.attachments), true)
    assert.equal(exported.thread.projectPath, '')

    const imported = await importThread(opened.project.id, exported)
    assert.equal(imported.importedEvents, 2)
    assert.ok(String(imported.thread?.id || '').trim())

    const importedTimeline = listTimeline(imported.thread.id, { limit: 50 })
    assert.equal(importedTimeline.length, 2)
    assert.equal(importedTimeline[0].kind, 'user_message')
    assert.equal(importedTimeline[1].kind, 'assistant_message')
    assert.equal(importedTimeline[1].meta.ok, true)

    const legacyPayload = {
      ...exported,
      schema: 'addom.thread_export.v1',
    }
    delete legacyPayload.attachments
    delete legacyPayload.attachmentCount
    const importedLegacy = await importThread(opened.project.id, legacyPayload)
    assert.equal(importedLegacy.importedEvents, 2)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('exportThread and importThread preserve canonical root event identity, sequence, and semantics', async (t) => {
  try {
    const opened = registerProject(path.join(projectPath, 'canonical-export'))
    const projectId = String(opened?.project?.id || '').trim()
    const sourceThreadId = String(opened?.activeThread?.id || '').trim()
    assert.ok(projectId)
    assert.ok(sourceThreadId)

    appendCanonicalRootEvent(sourceThreadId, {
      canonicalEventId: 'root_export_event_01',
      projectId,
      conversationId: sourceThreadId,
      turnId: 'turn_export_01',
      occurredAt: Date.now(),
      source: {
        providerId: 'openai',
        transport: 'http',
        runtime: 'responses',
        providerEventId: 'provider_export_event_01',
        providerCorrelationKey: 'openai:response_export_01',
      },
      actor: { kind: 'root', id: 'root', conversationId: sourceThreadId, runId: '' },
      semanticKind: 'final_message',
      phase: 'final_answer',
      lifecycle: 'succeeded',
      payload: { text: 'Durable answer.', artifactRefs: [{ id: 'artifact_01' }] },
      supportDecision: 'supported',
    })
    appendCanonicalRootEvent(sourceThreadId, {
      canonicalEventId: 'root_export_event_02',
      projectId,
      conversationId: sourceThreadId,
      turnId: 'turn_export_01',
      occurredAt: Date.now(),
      source: {
        providerId: 'openai',
        transport: 'http',
        runtime: 'responses',
        providerEventId: 'provider_export_event_02',
        providerCorrelationKey: 'openai:response_export_01',
      },
      actor: { kind: 'system', id: 'turn_finalizer', conversationId: '', runId: '' },
      semanticKind: 'turn_state',
      phase: 'lifecycle',
      lifecycle: 'succeeded',
      payload: { state: 'succeeded' },
      supportDecision: 'supported',
    })

    const exported = await exportThread(sourceThreadId)
    assert.equal(exported.events[0].canonical.canonicalEventId, 'root_export_event_01')
    assert.equal(exported.events[0].canonical.localSequence, 1)
    assert.equal(exported.events[1].canonical.localSequence, 2)

    const imported = await importThread(projectId, exported)
    const [restored, restoredTerminal] = listTimeline(imported.thread.id, { limit: 10 })
    assert.equal(restored.canonical.canonicalEventId, 'root_export_event_01')
    assert.equal(restored.canonical.projectId, projectId)
    assert.equal(restored.canonical.threadId, imported.thread.id)
    assert.equal(restored.canonical.conversationId, imported.thread.id)
    assert.equal(restored.canonical.localSequence, 1)
    assert.equal(restored.canonical.semanticKind, 'final_message')
    assert.equal(restored.canonical.phase, 'final_answer')
    assert.equal(restored.canonical.lifecycle, 'succeeded')
    assert.deepEqual(restored.canonical.payload.artifactRefs, [{ id: 'artifact_01' }])
    assert.equal(restoredTerminal.canonical.canonicalEventId, 'root_export_event_02')
    assert.equal(restoredTerminal.canonical.localSequence, 2)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('importThread clamps future event timestamps before promoting recency metadata', async (t) => {
  try {
    const opened = registerProject(path.join(projectPath, 'future-skew'))
    const projectId = String(opened?.project?.id || '').trim()
    assert.ok(projectId)

    const startedAt = Date.now()
    const imported = await importThread(projectId, {
      schema: 'addom.thread_export.v2',
      thread: {
        title: 'Future skew import',
      },
      events: [{
        turnId: 'turn_future',
        kind: 'assistant_message',
        role: 'assistant',
        content: 'Imported from a skewed clock.',
        createdAt: Date.now() + (365 * 24 * 60 * 60 * 1000),
      }],
    })

    const importedThreadId = String(imported?.thread?.id || '').trim()
    assert.ok(importedThreadId)

    const timeline = listTimeline(importedThreadId, { limit: 10 })
    assert.equal(timeline.length, 1)
    const maxExpectedTimestamp = startedAt + MAX_IMPORTED_EVENT_FUTURE_SKEW_MS + 1_000
    assert.equal(timeline[0].createdAt <= maxExpectedTimestamp, true)
    assert.equal(Number(imported.thread?.updatedAt || 0) <= maxExpectedTimestamp, true)

    const projects = listProjects()
    const importedProject = projects.find((row) => row.id === projectId)
    assert.ok(importedProject)
    assert.equal(Number(importedProject.lastWorkedAt || 0) <= maxExpectedTimestamp, true)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('importThread preserves long chat and error content while still trimming non-message payloads', async (t) => {
  try {
    const opened = registerProject(path.join(projectPath, 'long-import'))
    const projectId = String(opened?.project?.id || '').trim()
    assert.ok(projectId)

    const longUserContent = 'imported user '.repeat(MAX_EVENT_CONTENT_CHARS)
    const longAssistantContent = 'imported assistant '.repeat(MAX_EVENT_CONTENT_CHARS)
    const longErrorContent = 'imported error '.repeat(MAX_EVENT_CONTENT_CHARS)
    const longToolContent = 'imported tool '.repeat(MAX_EVENT_CONTENT_CHARS)

    const imported = await importThread(projectId, {
      schema: 'addom.thread_export.v2',
      thread: {
        title: 'Long import preservation',
      },
      events: [
        {
          turnId: 'turn_long_import',
          kind: 'user_message',
          role: 'user',
          content: longUserContent,
        },
        {
          turnId: 'turn_long_import',
          kind: 'assistant_message',
          role: 'assistant',
          content: longAssistantContent,
        },
        {
          turnId: 'turn_long_import',
          kind: 'chat_error',
          role: 'system',
          content: longErrorContent,
        },
        {
          turnId: 'turn_long_import',
          kind: 'tool_result',
          role: '',
          content: longToolContent,
        },
      ],
    })

    const importedThreadId = String(imported?.thread?.id || '').trim()
    assert.ok(importedThreadId)

    const timeline = listTimeline(importedThreadId, { limit: 10 })
    assert.equal(timeline.length, 4)
    assert.equal(timeline[0]?.content, longUserContent)
    assert.equal(timeline[1]?.content, longAssistantContent)
    assert.equal(timeline[2]?.content, longErrorContent)
    assert.match(String(timeline[3]?.content || ''), /\.\.\. \[truncated\]$/)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})
