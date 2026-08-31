import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-memory-search-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { getDb, closeDb } = await import('../../src/main/memory/db.mjs')
const {
  addNode,
  deleteNode,
  listNodes,
  promoteNode,
  searchNodes,
  updateNode,
} = await import('../../src/main/memory/memory-store.mjs')

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

test('searchNodes keeps pinned nodes in results under candidate prefilter cap', async (t) => {
  try {
    const project = 'memory-prefilter-project'
    const pinnedId = await addNode({
      project,
      topic: 'Pinned baseline',
      content: 'Should survive strict threshold.',
      source: 'user',
    })
    await updateNode(pinnedId, { pinned: true })

    const db = getDb()
    db.prepare('UPDATE nodes SET updated_at = ?, last_accessed = ? WHERE id = ?')
      .run(Date.now() - (40 * 86_400_000), Date.now() - (40 * 86_400_000), pinnedId)

    for (let i = 0; i < 220; i += 1) {
      await addNode({
        project,
        topic: `Node ${i}`,
        content: i === 219 ? 'Contains NEEDLE token for keyword branch.' : 'No keyword here.',
        source: 'auto_log',
      })
    }

    const results = await searchNodes(project, 'NEEDLE', {
      topK: 30,
      threshold: 0.75,
      candidateCap: 120,
      includeCompressed: false,
    })
    assert.ok(results.some((row) => row.id === pinnedId), 'pinned node should always survive threshold')
    assert.ok(results.some((row) => /needle/i.test(String(row.content || ''))), 'keyword hit should be present')
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('terminal summary nodes remain searchable and expose parsed provenance', async (t) => {
  try {
    const project = 'memory-terminal-summary-project'
    const id = await addNode({
      project,
      topic: 'Terminal summary: bootstrap',
      content: 'Use pnpm through Corepack before running workspace installs.',
      source: 'validated_decision',
      tags: [
        'terminal_summary',
        'terminal_session',
        'terminal_session:term_memory_search_1',
        'terminal_thread:thread_memory_search_1',
        'terminal_accepted_at:1700000000000',
        'bootstrapping',
      ],
    })

    const listed = listNodes(project)
    const node = listed.find((entry) => entry.id === id)
    assert.equal(node?.source, 'terminal_summary')
    assert.equal(node?.provenance?.kind, 'terminal')
    assert.equal(node?.provenance?.sessionId, 'term_memory_search_1')
    assert.equal(node?.provenance?.threadId, 'thread_memory_search_1')
    assert.equal(node?.originThreadId, 'thread_memory_search_1')
    assert.equal(node?.provenance?.acceptedAt, 1700000000000)
    assert.deepEqual(node?.displayTags, ['bootstrapping'])

    const results = await searchNodes(project, 'Corepack workspace installs', {
      topK: 10,
      threshold: 0.05,
    })
    const resultNode = results.find((entry) => entry.id === id)
    assert.equal(Boolean(resultNode), true)
    assert.equal(resultNode?.source, 'terminal_summary')
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('searchNodes slightly de-prioritizes terminal summaries against equivalent user memory', async (t) => {
  try {
    const project = 'memory-terminal-weighting-project'
    const [userId, terminalId] = await Promise.all([
      addNode({
        project,
        topic: 'Bootstrap rule',
        content: 'Use Corepack before running workspace installs.',
        source: 'user_memory',
      }),
      addNode({
        project,
        topic: 'Terminal summary: bootstrap',
        content: 'Use Corepack before running workspace installs.',
        source: 'terminal_summary',
        tags: [
          'terminal_summary',
          'terminal_session',
          'terminal_session:term_memory_weight_1',
        ],
      }),
    ])

    const alignedTimestamp = Date.now() - (5 * 60 * 1000)
    const db = getDb()
    db.prepare('UPDATE nodes SET updated_at = ?, last_accessed = ?, access_count = 1 WHERE id IN (?, ?)')
      .run(alignedTimestamp, alignedTimestamp, userId, terminalId)

    const results = await searchNodes(project, 'Corepack workspace installs', {
      topK: 10,
      threshold: 0.01,
    })
    const userIndex = results.findIndex((entry) => entry.id === userId)
    const terminalIndex = results.findIndex((entry) => entry.id === terminalId)

    assert.notEqual(userIndex, -1)
    assert.notEqual(terminalIndex, -1)
    assert.ok(userIndex < terminalIndex, 'equivalent user-authored memory should rank above terminal summaries')
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('deleted Thread Memory stays out of ordinary list and search but remains recoverable', async (t) => {
  try {
    const project = 'memory-deleted-thread-visibility-project'
    const threadId = 'thread-deleted-visibility'
    const needle = 'DELETED_THREAD_MEMORY_NEEDLE'
    const id = await addNode({
      project,
      topic: 'Deleted thread finding',
      content: needle,
      source: 'validated_decision',
      scope: 'thread',
      threadId,
    })
    getDb().prepare(`
      UPDATE nodes
      SET origin_thread_state = 'deleted', origin_thread_deleted_at = ?
      WHERE id = ?
    `).run(1_700_000_000_000, id)

    assert.equal(listNodes(project, { scopeFilter: 'thread', threadId }).some((node) => node.id === id), false)
    assert.equal(listNodes(project, {
      includeDeletedThreads: true,
      scopeFilter: 'thread',
      threadId,
    }).some((node) => node.id === id), true)

    const ordinarySearch = await searchNodes(project, needle, {
      includeThread: true,
      scopeFilter: 'thread',
      threadId,
      threshold: 0,
    })
    const archivedSearch = await searchNodes(project, needle, {
      includeDeletedThreads: true,
      includeThread: true,
      scopeFilter: 'thread',
      threadId,
      threshold: 0,
    })
    assert.equal(ordinarySearch.some((node) => node.id === id), false)
    assert.equal(archivedSearch.some((node) => node.id === id), true)

    const promoted = promoteNode(id, { targetScope: 'project', project })
    assert.equal(promoted.scope, 'project')
    assert.equal(listNodes(project).some((node) => node.id === id), true)
    assert.equal(deleteNode(id), true)
    assert.equal(listNodes(project, { includeDeletedThreads: true }).some((node) => node.id === id), false)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})
