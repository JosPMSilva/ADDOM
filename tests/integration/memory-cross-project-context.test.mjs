import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-memory-global-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { closeDb } = await import('../../src/main/memory/db.mjs')
const {
  addNode,
  listNodes,
  searchNodes,
  buildContextBlock,
  buildScopedContextPayload,
  invalidateNode,
} = await import('../../src/main/memory/memory-store.mjs')
const { getDb } = await import('../../src/main/memory/db.mjs')

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
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('memory store supports project + global scope listing, search, and context injection', async (t) => {
  try {
    const projectA = 'project-a'
    const projectB = 'project-b'
    const globalNeedle = 'GLOBAL_MEMORY_NEEDLE_42'

    const projectNodeId = await addNode({
      project: projectA,
      topic: 'Project note',
      content: 'Only relevant to project A.',
      source: 'user',
    })
    await addNode({
      project: projectB,
      topic: 'Other project note',
      content: 'Only relevant to project B.',
      source: 'user',
    })
    const globalNodeId = await addNode({
      project: projectA,
      isGlobal: true,
      topic: 'Global note',
      content: `Shared memory contains ${globalNeedle}.`,
      source: 'user',
    })

    const projectOnly = listNodes(projectA, { includeCompressed: true })
    assert.ok(projectOnly.some((row) => row.id === projectNodeId))
    assert.ok(projectOnly.every((row) => row.id !== globalNodeId), 'project-only list should not include global nodes')
    assert.ok(projectOnly.every((row) => row.scope === 'project'), 'project-only list should expose project scope')

    const withGlobal = listNodes(projectA, { includeCompressed: true, includeGlobal: true })
    assert.ok(withGlobal.some((row) => row.id === projectNodeId))
    assert.ok(withGlobal.some((row) => row.id === globalNodeId), 'includeGlobal list should include global nodes')
    assert.equal(withGlobal.find((row) => row.id === globalNodeId)?.scope, 'global')

    const projectSearch = await searchNodes(projectA, globalNeedle, {
      includeGlobal: false,
      includeCompressed: false,
      threshold: 0.6,
      topK: 10,
    })
    assert.ok(projectSearch.every((row) => row.id !== globalNodeId), 'project-only search should not include global nodes')

    const mergedSearch = await searchNodes(projectA, globalNeedle, {
      includeGlobal: true,
      includeCompressed: false,
      threshold: 0.6,
      topK: 10,
    })
    assert.ok(mergedSearch.some((row) => row.id === globalNodeId), 'includeGlobal search should include global keyword matches')

    const projectContext = await buildContextBlock(projectA, globalNeedle, 8, { includeGlobal: false })
    assert.equal(projectContext.includes(globalNeedle), false)

    const mergedContext = await buildContextBlock(projectA, globalNeedle, 8, { includeGlobal: true })
    assert.equal(mergedContext.includes(globalNeedle), true)
    assert.equal(mergedContext.includes('Global #'), true)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('buildScopedContextPayload prioritizes thread memory, enforces lane quotas, and deduplicates later lanes', async (t) => {
  try {
    const project = 'project-thread-first'
    const query = 'THREAD_FIRST_RETRIEVAL_NEEDLE'

    for (let index = 0; index < 5; index += 1) {
      await addNode({
        project,
        topic: `Thread note ${index + 1}`,
        content: `${query} thread-hit-${index + 1}`,
        source: 'validated_decision',
        scope: 'thread',
        threadId: 'thread-alpha',
      })
    }
    await addNode({
      project,
      topic: 'Thread note 5',
      content: `${query} thread-hit-5`,
      source: 'reference_note',
      scope: 'project',
    })
    await addNode({
      project,
      topic: 'Project unique',
      content: `${query} project-hit-1`,
      source: 'reference_note',
      scope: 'project',
    })
    await addNode({
      project,
      topic: 'Global unique',
      content: `${query} global-hit-1`,
      source: 'user_memory',
      scope: 'global',
    })

    const payload = await buildScopedContextPayload({
      project,
      threadId: 'thread-alpha',
      queryText: query,
      quotas: { thread: 4, project: 2, global: 1 },
      includeGlobal: true,
    })

    assert.equal(payload.nodes.length, 6)
    assert.deepEqual(payload.nodes.map((node) => node.scope), [
      'thread',
      'thread',
      'thread',
      'thread',
      'project',
      'global',
    ])
    assert.equal(payload.text.includes('project-hit-1'), true)
    assert.equal(payload.text.includes('global-hit-1'), true)
    assert.equal(payload.text.includes('thread-hit-5'), true)
    assert.equal(payload.diagnostics.laneNodeCounts.thread, 4)
    assert.equal(payload.diagnostics.laneNodeCounts.project, 1)
    assert.equal(payload.diagnostics.laneNodeCounts.global, 1)
    assert.equal(payload.diagnostics.nodeCount, 6)
    assert.ok(payload.diagnostics.laneEstimatedTokens.thread > payload.diagnostics.laneEstimatedTokens.project)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('buildScopedContextPayload isolates thread lane retrieval inside one project', async (t) => {
  try {
    const project = 'project-thread-isolation'
    const query = 'THREAD_ISOLATION_RETRIEVAL_NEEDLE'

    await addNode({
      project,
      topic: 'Thread A note',
      content: `${query} thread-a-only`,
      source: 'validated_decision',
      scope: 'thread',
      threadId: 'thread-a',
    })
    await addNode({
      project,
      topic: 'Thread B note',
      content: `${query} thread-b-only`,
      source: 'validated_decision',
      scope: 'thread',
      threadId: 'thread-b',
    })
    await addNode({
      project,
      topic: 'Shared project note',
      content: `${query} project-shared`,
      source: 'reference_note',
      scope: 'project',
    })

    const threadA = await buildScopedContextPayload({
      project,
      threadId: 'thread-a',
      queryText: query,
      quotas: { thread: 4, project: 2, global: 0 },
      includeGlobal: false,
    })
    const threadB = await buildScopedContextPayload({
      project,
      threadId: 'thread-b',
      queryText: query,
      quotas: { thread: 4, project: 2, global: 0 },
      includeGlobal: false,
    })

    assert.equal(threadA.text.includes('thread-a-only'), true)
    assert.equal(threadA.text.includes('thread-b-only'), false)
    assert.equal(threadA.text.includes('project-shared'), true)
    assert.equal(threadA.diagnostics.laneNodeCounts.thread, 1)
    assert.equal(threadA.diagnostics.laneNodeCounts.project, 1)

    assert.equal(threadB.text.includes('thread-b-only'), true)
    assert.equal(threadB.text.includes('thread-a-only'), false)
    assert.equal(threadB.text.includes('project-shared'), true)
    assert.equal(threadB.diagnostics.laneNodeCounts.thread, 1)
    assert.equal(threadB.diagnostics.laneNodeCounts.project, 1)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('buildScopedContextPayload excludes invalidated or superseded nodes and reports promoted lane counts', async (t) => {
  try {
    const project = 'project-thread-hardening'
    const query = 'THREAD_HARDENING_NEEDLE'
    getDb().prepare('DELETE FROM nodes').run()

    await addNode({
      project,
      topic: 'Thread winner',
      content: `${query} active-thread`,
      source: 'validated_decision',
      scope: 'thread',
      threadId: 'thread-hardening',
    })
    await addNode({
      project,
      topic: 'Promoted project winner',
      content: `${query} promoted-project`,
      source: 'reference_note',
      scope: 'project',
      originThreadId: 'thread-hardening',
      promotedAt: Date.now(),
    })
    const invalidatedId = await addNode({
      project,
      topic: 'Old thread fact',
      content: `${query} invalidated-thread`,
      source: 'validated_decision',
      scope: 'thread',
      threadId: 'thread-hardening',
    })
    const supersededOnlyId = await addNode({
      project,
      topic: 'Old global fact',
      content: `${query} superseded-global`,
      source: 'user_memory',
      scope: 'global',
    })

    invalidateNode(invalidatedId, { supersededBy: 'replacement-node' })
    getDb().prepare('UPDATE nodes SET superseded_by = ? WHERE id = ?').run('replacement-node', supersededOnlyId)

    const payload = await buildScopedContextPayload({
      project,
      threadId: 'thread-hardening',
      queryText: query,
      quotas: { thread: 4, project: 2, global: 1 },
      includeGlobal: true,
    })

    assert.equal(payload.text.includes('active-thread'), true)
    assert.equal(payload.text.includes('promoted-project'), true)
    assert.equal(payload.text.includes('invalidated-thread'), false)
    assert.equal(payload.text.includes('superseded-global'), false)
    assert.deepEqual(payload.diagnostics.laneNodeCounts, { thread: 1, project: 1, global: 0 })
    assert.deepEqual(payload.diagnostics.promotionCounts, { thread: 0, project: 1, global: 0 })
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('deleted Thread Memory cannot enter prompt context while promoted Memory stays active', async (t) => {
  try {
    const project = 'project-deleted-thread-context'
    const threadId = 'thread-deleted-context'
    const query = 'DELETED_THREAD_CONTEXT_NEEDLE'
    const deletedThreadId = await addNode({
      project,
      topic: 'Deleted local instruction',
      content: `${query} thread-only-secret`,
      source: 'validated_decision',
      scope: 'thread',
      threadId,
    })
    const promotedId = await addNode({
      project,
      topic: 'Promoted durable instruction',
      content: `${query} promoted-project-rule`,
      source: 'reference_note',
      scope: 'project',
      originThreadId: threadId,
      promotedAt: Date.now(),
    })
    getDb().prepare(`
      UPDATE nodes
      SET origin_thread_state = 'deleted', origin_thread_deleted_at = ?
      WHERE id IN (?, ?)
    `).run(1_700_000_000_000, deletedThreadId, promotedId)

    const payload = await buildScopedContextPayload({
      project,
      threadId,
      queryText: query,
      quotas: { thread: 4, project: 4, global: 0 },
      includeGlobal: false,
    })

    assert.equal(payload.text.includes('thread-only-secret'), false)
    assert.equal(payload.text.includes('promoted-project-rule'), true)
    assert.equal(payload.nodes.some((node) => node.id === deletedThreadId), false)
    assert.equal(payload.nodes.some((node) => node.id === promotedId), true)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})
