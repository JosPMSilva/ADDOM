import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-auto-logger-thread-scope-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { closeDb } = await import('../../src/main/memory/db.mjs')
const { listNodes } = await import('../../src/main/memory/memory-store.mjs')
const { autoLogTurn } = await import('../../src/main/memory/auto-logger.mjs')
const { runPostTurnTasks } = await import('../../src/main/chat/chat-post-turn-tasks.mjs')

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

function waitForEvent(events = [], channel = '', timeoutMs = 1000) {
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (events.some((entry) => entry.channel === channel)) {
        resolve()
        return
      }
      if ((Date.now() - startedAt) >= timeoutMs) {
        reject(new Error(`Timed out waiting for ${channel}`))
        return
      }
      setTimeout(poll, 10)
    }
    poll()
  })
}

test.after(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('autoLogTurn writes workspace_event and validated_decision nodes to thread scope when activeThreadId is present', async (t) => {
  try {
    const project = 'auto-log-thread-project'
    const activeThreadId = 'thread_auto_log_1'

    const ids = await autoLogTurn({
      project,
      assistantText: 'I fixed the failing build by updating the bundler entrypoint and normalizing the import path.',
      toolResults: [
        {
          toolName: 'write_file',
          decision: 'approved',
          input: { path: 'src/app.js' },
          result: 'Wrote src/app.js successfully.',
        },
      ],
      activeThreadId,
    })

    assert.equal(ids.length, 2)

    const byId = new Map(
      listNodes(project, {
        includeCompressed: true,
        includeProject: false,
        threadId: activeThreadId,
      })
        .filter((node) => ids.includes(node.id))
        .map((node) => [node.id, node]),
    )

    for (const id of ids) {
      const node = byId.get(id)
      assert.equal(node?.scope, 'thread')
      assert.equal(node?.threadId, activeThreadId)
      assert.equal(node?.originThreadId, activeThreadId)
    }

    const workspaceEvent = Array.from(byId.values()).find((node) => node?.source === 'workspace_event')
    const validatedDecision = Array.from(byId.values()).find((node) => node?.source === 'validated_decision')
    assert.equal(Boolean(workspaceEvent), true)
    assert.equal(Boolean(validatedDecision), true)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('autoLogTurn preserves project-scoped durable writes when no thread id is provided', async (t) => {
  try {
    const project = 'auto-log-project-fallback'

    const ids = await autoLogTurn({
      project,
      assistantText: 'I updated the config to remove the duplicate resolver alias and fixed the startup failure.',
      toolResults: [
        {
          toolName: 'edit_file',
          decision: 'approved',
          input: { path: 'vite.config.mjs' },
          result: 'Edited vite.config.mjs successfully.',
        },
      ],
    })

    assert.equal(ids.length, 2)

    const nodes = listNodes(project, { includeCompressed: true })
      .filter((node) => ids.includes(node.id))

    assert.equal(nodes.length, 2)
    for (const node of nodes) {
      assert.equal(node.scope, 'project')
      assert.equal(node.threadId, null)
      assert.equal(node.originThreadId, null)
    }
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('autoLogTurn records Cursor-owned create, edit, and delete events without ADDOM approval', async (t) => {
  try {
    const project = 'cursor-auto-log-project'
    const activeThreadId = 'thread_cursor_auto_log'
    const ids = await autoLogTurn({
      project,
      assistantText: 'Cursor completed the requested workspace changes.',
      toolResults: [
        { toolName: 'write', decision: 'provider_owned', providerOwned: true, executionOwner: 'cursor', source: 'cursor_agent', input: { path: 'src/new.js' }, fileChange: { changeType: 'created', filePath: 'src/new.js' } },
        { toolName: 'edit', decision: 'provider_owned', providerOwned: true, executionOwner: 'cursor', source: 'cursor_agent', input: { path: 'src/app.js' }, fileChange: { changeType: 'modified', filePath: 'src/app.js' } },
        { toolName: 'delete', decision: 'provider_owned', providerOwned: true, executionOwner: 'cursor', source: 'cursor_agent', input: { path: 'src/old.js' }, fileChange: { changeType: 'deleted', filePath: 'src/old.js' } },
      ],
      captureSuggestions: false,
      activeThreadId,
    })

    assert.equal(ids.length, 3)
    const nodes = listNodes(project, { includeCompressed: true, includeProject: false, threadId: activeThreadId })
      .filter((node) => ids.includes(node.id))
    assert.deepEqual(nodes.map((node) => node.topic).sort(), [
      'File created: src/new.js',
      'File deleted: src/old.js',
      'File edited: src/app.js',
    ])
    assert.equal(nodes.every((node) => node.tags.includes('cursor_agent')), true)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('runPostTurnTasks forwards activeThreadId so automatic memory writes stop landing in shared project scope', async (t) => {
  try {
    await autoLogTurn({
      project: 'post-turn-thread-scope-probe',
      assistantText: 'I fixed the probe path by normalizing the build input and removing the duplicate alias.',
      toolResults: [
        {
          toolName: 'write_file',
          decision: 'approved',
          input: { path: 'probe.js' },
          result: 'Wrote probe.js successfully.',
        },
      ],
      activeThreadId: 'thread_probe',
    })

    const project = 'post-turn-thread-scope-project'
    const activeThreadId = 'thread_post_turn_1'
    const sentEvents = []

    runPostTurnTasks({
      projectFolder: project,
      userMessage: 'Fix the bundler issue.',
      assistantText: 'I updated the bundler config and fixed the bad alias that was breaking the build.',
      turnToolResults: [
        {
          toolName: 'write_file',
          decision: 'approved',
          input: { path: 'config/build.mjs' },
          result: 'Wrote config/build.mjs successfully.',
        },
      ],
      activeThreadId,
      send: (channel, payload) => {
        sentEvents.push({ channel, payload })
      },
      persistTimelineEvent: () => {},
      memoryCompressionEnabled: false,
    })

    await waitForEvent(sentEvents, 'memory:updated')

    const nodes = listNodes(project, {
      includeCompressed: true,
      includeProject: false,
      threadId: activeThreadId,
    })
      .filter((node) => (
        node.source === 'workspace_event'
        || node.source === 'validated_decision'
      ))

    assert.equal(nodes.length, 2)
    for (const node of nodes) {
      assert.equal(node.scope, 'thread')
      assert.equal(node.threadId, activeThreadId)
      assert.equal(node.originThreadId, activeThreadId)
    }
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})
