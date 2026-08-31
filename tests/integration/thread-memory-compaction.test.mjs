import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-thread-memory-compaction-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { getDb, closeDb } = await import('../../src/main/memory/db.mjs')
const { addNode, getNode } = await import('../../src/main/memory/memory-store.mjs')
const { compressProjectAutoLogs } = await import('../../src/main/memory/memory-compression.mjs')

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

async function addCompressibleNode({
  project,
  topic,
  content,
  scope = 'project',
  threadId = null,
}) {
  return addNode({
    project,
    topic,
    content,
    source: 'validated_decision',
    scope,
    threadId,
    originThreadId: scope === 'thread' ? threadId : null,
  })
}

test.after(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('thread compaction only archives nodes from the targeted thread and emits a thread-scoped summary', async (t) => {
  try {
    const project = 'memory-compaction-thread-scope'
    const threadAIds = []
    const threadBIds = []
    const projectIds = []

    for (let index = 0; index < 5; index += 1) {
      threadAIds.push(await addCompressibleNode({
        project,
        scope: 'thread',
        threadId: 'thread-a',
        topic: `Thread A ${index + 1}`,
        content: `Thread A content ${index + 1}`,
      }))
    }
    for (let index = 0; index < 2; index += 1) {
      threadBIds.push(await addCompressibleNode({
        project,
        scope: 'thread',
        threadId: 'thread-b',
        topic: `Thread B ${index + 1}`,
        content: `Thread B content ${index + 1}`,
      }))
      projectIds.push(await addCompressibleNode({
        project,
        scope: 'project',
        topic: `Project ${index + 1}`,
        content: `Project content ${index + 1}`,
      }))
    }

    const result = await compressProjectAutoLogs({
      project,
      threadId: 'thread-a',
      threshold: 5,
      minNewLogs: 1,
      model: '',
    })

    assert.equal(result?.status, 'completed')
    assert.equal(result?.scope, 'thread')
    assert.equal(result?.threadId, 'thread-a')

    const summaryNode = getNode(result.summaryNodeId)
    assert.equal(summaryNode?.scope, 'thread')
    assert.equal(summaryNode?.threadId, 'thread-a')
    assert.equal(summaryNode?.originThreadId, 'thread-a')

    const db = getDb()
    const rows = db.prepare(`
      SELECT id, compressed, compressed_into
      FROM nodes
      WHERE id IN (${[...threadAIds, ...threadBIds, ...projectIds].map(() => '?').join(', ')})
      ORDER BY id ASC
    `).all(...[...threadAIds, ...threadBIds, ...projectIds])
    const byId = new Map(rows.map((row) => [String(row.id), row]))

    for (const nodeId of threadAIds) {
      assert.equal(byId.get(nodeId)?.compressed, 1)
      assert.equal(byId.get(nodeId)?.compressed_into, result.summaryNodeId)
    }
    for (const nodeId of [...threadBIds, ...projectIds]) {
      assert.equal(byId.get(nodeId)?.compressed, 0)
      assert.equal(byId.get(nodeId)?.compressed_into, null)
    }
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }
})

test('project compaction only archives project-scoped nodes and leaves thread lanes untouched', async (t) => {
  try {
    const project = 'memory-compaction-project-scope'
    const projectIds = []
    const threadIds = []

    for (let index = 0; index < 5; index += 1) {
      projectIds.push(await addCompressibleNode({
        project,
        scope: 'project',
        topic: `Project scoped ${index + 1}`,
        content: `Project scoped content ${index + 1}`,
      }))
      threadIds.push(await addCompressibleNode({
        project,
        scope: 'thread',
        threadId: 'thread-project-isolation',
        topic: `Thread scoped ${index + 1}`,
        content: `Thread scoped content ${index + 1}`,
      }))
    }

    const result = await compressProjectAutoLogs({
      project,
      threshold: 5,
      minNewLogs: 1,
      model: '',
    })

    assert.equal(result?.status, 'completed')
    assert.equal(result?.scope, 'project')
    assert.equal(result?.threadId, '')

    const summaryNode = getNode(result.summaryNodeId)
    assert.equal(summaryNode?.scope, 'project')
    assert.equal(summaryNode?.threadId, null)

    const db = getDb()
    const rows = db.prepare(`
      SELECT id, compressed, compressed_into
      FROM nodes
      WHERE id IN (${[...projectIds, ...threadIds].map(() => '?').join(', ')})
      ORDER BY id ASC
    `).all(...[...projectIds, ...threadIds])
    const byId = new Map(rows.map((row) => [String(row.id), row]))

    for (const nodeId of projectIds) {
      assert.equal(byId.get(nodeId)?.compressed, 1)
      assert.equal(byId.get(nodeId)?.compressed_into, result.summaryNodeId)
    }
    for (const nodeId of threadIds) {
      assert.equal(byId.get(nodeId)?.compressed, 0)
      assert.equal(byId.get(nodeId)?.compressed_into, null)
    }
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }
})

test('compaction skips invalidated or superseded candidates within the targeted lane', async (t) => {
  try {
    const project = 'memory-compaction-supersession-skip'
    const activeIds = []

    for (let index = 0; index < 5; index += 1) {
      activeIds.push(await addCompressibleNode({
        project,
        scope: 'thread',
        threadId: 'thread-skip',
        topic: `Active thread ${index + 1}`,
        content: `Active thread content ${index + 1}`,
      }))
    }
    const invalidatedId = await addCompressibleNode({
      project,
      scope: 'thread',
      threadId: 'thread-skip',
      topic: 'Invalidated thread fact',
      content: 'This stale fact should never be compacted.',
    })
    const supersededOnlyId = await addCompressibleNode({
      project,
      scope: 'thread',
      threadId: 'thread-skip',
      topic: 'Superseded thread fact',
      content: 'This superseded fact should never be compacted.',
    })

    const db = getDb()
    db.prepare('UPDATE nodes SET invalidated_at = ?, superseded_by = ? WHERE id = ?')
      .run(Date.now(), 'replacement-thread-node', invalidatedId)
    db.prepare('UPDATE nodes SET superseded_by = ? WHERE id = ?')
      .run('replacement-thread-node', supersededOnlyId)

    const result = await compressProjectAutoLogs({
      project,
      threadId: 'thread-skip',
      threshold: 5,
      minNewLogs: 1,
      model: '',
    })

    assert.equal(result?.status, 'completed')
    assert.equal(result?.archivedCount, 5)

    const rows = db.prepare(`
      SELECT id, compressed, compressed_into
      FROM nodes
      WHERE id IN (${[...activeIds, invalidatedId, supersededOnlyId].map(() => '?').join(', ')})
      ORDER BY id ASC
    `).all(...[...activeIds, invalidatedId, supersededOnlyId])
    const byId = new Map(rows.map((row) => [String(row.id), row]))

    for (const nodeId of activeIds) {
      assert.equal(byId.get(nodeId)?.compressed, 1)
      assert.equal(byId.get(nodeId)?.compressed_into, result.summaryNodeId)
    }
    assert.equal(byId.get(invalidatedId)?.compressed, 0)
    assert.equal(byId.get(invalidatedId)?.compressed_into, null)
    assert.equal(byId.get(supersededOnlyId)?.compressed, 0)
    assert.equal(byId.get(supersededOnlyId)?.compressed_into, null)
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }
})
