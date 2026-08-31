import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-attachment-agent-mirror-'))
const projectPathA = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-attachment-agent-project-a-'))
const projectPathB = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-attachment-agent-project-b-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { closeDb } = await import('../../src/main/memory/db.mjs')
const {
  registerProject,
  createThread,
} = await import('../../src/main/workspace/workspace-store.mjs')
const attachmentCache = await import('../../src/main/attachments/attachment-cache.mjs')
const attachmentRecords = await import('../../src/main/attachments/attachment-cache-records.mjs')
const attachmentMirror = await import('../../src/main/attachments/attachment-agent-mirror.mjs').catch(() => ({}))

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

async function stageFile({ projectId, threadId, fileName, content, turnId = '' }) {
  const result = await attachmentCache.stageAttachmentFromBytes({
    projectId,
    threadId,
    turnId,
    kind: 'file',
    mediaType: 'text/plain',
    fileName,
    bytes: Buffer.from(content),
  })
  assert.equal(result.ok, true)
  return result.descriptor
}

test.after(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
  for (const target of [projectPathA, projectPathB, userDataPath]) {
    try { fs.rmSync(target, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})

test('scoped attachment listing returns only the requested project and thread in creation order', { concurrency: false }, async (t) => {
  try {
    const openedA = registerProject(projectPathA)
    const projectAId = String(openedA?.project?.id || '')
    const threadAId = String(openedA?.activeThread?.id || '')
    const threadA2Id = String(createThread(projectAId, 'Other thread')?.thread?.id || '')
    const openedB = registerProject(projectPathB)
    const projectBId = String(openedB?.project?.id || '')
    const threadBId = String(openedB?.activeThread?.id || '')

    const first = await stageFile({
      projectId: projectAId,
      threadId: threadAId,
      turnId: 'turn-1',
      fileName: 'first.txt',
      content: 'first',
    })
    await new Promise((resolve) => setTimeout(resolve, 2))
    const second = await stageFile({
      projectId: projectAId,
      threadId: threadAId,
      turnId: 'turn-2',
      fileName: 'second.txt',
      content: 'second',
    })
    await stageFile({
      projectId: projectAId,
      threadId: threadA2Id,
      fileName: 'foreign-thread.txt',
      content: 'foreign thread',
    })
    await stageFile({
      projectId: projectBId,
      threadId: threadBId,
      fileName: 'foreign-project.txt',
      content: 'foreign project',
    })

    const listed = await attachmentRecords.listCachedAttachmentsForThread({
      projectId: projectAId,
      threadId: threadAId,
    })

    assert.equal(listed.ok, true)
    assert.deepEqual(
      listed.attachments.map((entry) => entry.attachmentId),
      [first.attachmentId, second.attachmentId],
    )
    assert.deepEqual(
      listed.attachments.map((entry) => entry.fileName),
      ['first.txt', 'second.txt'],
    )
    assert.equal(listed.errors.length, 0)
    for (const entry of listed.attachments) {
      assert.equal(path.isAbsolute(entry.absolutePath), true)
      assert.equal(fs.existsSync(entry.absolutePath), true)
      assert.match(entry.sha256, /^[a-f0-9]{64}$/)
    }
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('agent mirror copies the full thread set and repairs tampering before the next turn', { concurrency: false }, async (t) => {
  try {
    const opened = registerProject(path.join(projectPathA, 'mirror-repair'))
    const projectId = String(opened?.project?.id || '')
    const threadId = String(opened?.activeThread?.id || '')
    const first = await stageFile({
      projectId,
      threadId,
      fileName: 'same-name.txt',
      content: 'canonical first',
    })
    const second = await stageFile({
      projectId,
      threadId,
      fileName: 'same-name.txt',
      content: 'canonical second',
    })

    const prepared = await attachmentMirror.prepareThreadAttachmentAgentMirror({ projectId, threadId })
    assert.equal(prepared.ok, true)
    assert.equal(prepared.errors.length, 0)
    assert.equal(prepared.attachments.length, 2)
    assert.notEqual(prepared.attachments[0].absolutePath, prepared.attachments[1].absolutePath)
    assert.deepEqual(
      new Set(prepared.attachments.map((entry) => entry.attachmentId)),
      new Set([first.attachmentId, second.attachmentId]),
    )
    assert.equal(fs.readFileSync(prepared.attachments[0].absolutePath, 'utf8'), 'canonical first')
    assert.equal(fs.readFileSync(prepared.attachments[1].absolutePath, 'utf8'), 'canonical second')

    fs.writeFileSync(prepared.attachments[0].absolutePath, 'tampered')
    const unexpectedPath = path.join(prepared.rootPath, 'unexpected.txt')
    fs.writeFileSync(unexpectedPath, 'remove me')

    const repaired = await attachmentMirror.prepareThreadAttachmentAgentMirror({ projectId, threadId })
    assert.equal(repaired.ok, true)
    assert.equal(fs.readFileSync(repaired.attachments[0].absolutePath, 'utf8'), 'canonical first')
    assert.equal(fs.existsSync(unexpectedPath), false)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('missing canonical bytes are reported and stale mirror content is never reused', { concurrency: false }, async (t) => {
  try {
    const opened = registerProject(path.join(projectPathA, 'mirror-missing'))
    const projectId = String(opened?.project?.id || '')
    const threadId = String(opened?.activeThread?.id || '')
    const staged = await stageFile({
      projectId,
      threadId,
      fileName: 'missing.txt',
      content: 'canonical content',
    })
    const prepared = await attachmentMirror.prepareThreadAttachmentAgentMirror({ projectId, threadId })
    assert.equal(prepared.ok, true)
    assert.equal(prepared.attachments.length, 1)
    const mirrorPath = prepared.attachments[0].absolutePath
    const canonical = await attachmentCache.resolveCachedAttachmentFilePath(staged.attachmentId, {
      projectId,
      threadId,
    })
    assert.equal(canonical.ok, true)
    fs.rmSync(canonical.absolutePath, { force: true })
    fs.writeFileSync(mirrorPath, 'stale content')

    const next = await attachmentMirror.prepareThreadAttachmentAgentMirror({ projectId, threadId })
    assert.equal(next.ok, true)
    assert.equal(next.attachments.length, 0)
    assert.deepEqual(next.errors, [{
      attachmentId: staged.attachmentId,
      fileName: 'missing.txt',
      error: 'attachment_missing',
    }])
    assert.equal(fs.existsSync(mirrorPath), false)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('mirror orphan cleanup removes dead scopes and preserves live thread mirrors', { concurrency: false }, async (t) => {
  try {
    const opened = registerProject(path.join(projectPathA, 'mirror-orphans'))
    const projectId = String(opened?.project?.id || '')
    const threadId = String(opened?.activeThread?.id || '')
    await stageFile({
      projectId,
      threadId,
      fileName: 'live.txt',
      content: 'live content',
    })
    const live = await attachmentMirror.prepareThreadAttachmentAgentMirror({ projectId, threadId })
    assert.equal(live.ok, true)

    const mirrorRoot = attachmentMirror.getAttachmentAgentMirrorRoot()
    const orphanFiles = path.join(
      mirrorRoot,
      'projects',
      'orphan-project',
      'threads',
      'orphan-thread',
      'files',
    )
    fs.mkdirSync(orphanFiles, { recursive: true })
    fs.writeFileSync(path.join(orphanFiles, 'orphan.txt'), 'orphan')

    const cleaned = await attachmentMirror.cleanupAttachmentAgentMirrorOrphans()

    assert.equal(cleaned.ok, true)
    assert.ok(cleaned.deletedDirs >= 1)
    assert.equal(fs.existsSync(orphanFiles), false)
    assert.equal(fs.existsSync(live.rootPath), true)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})
