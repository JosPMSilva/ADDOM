import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-attachment-lifecycle-'))
const projectPathA = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-attachment-project-a-'))
const projectPathB = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-attachment-project-b-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { closeDb } = await import('../../src/main/memory/db.mjs')
const {
  registerProject,
  createThread,
  appendEvent,
  listTimeline,
  exportThread,
  importThread,
  deleteThread,
  removeProject,
  clearAllWorkspaceData,
} = await import('../../src/main/workspace/workspace-store.mjs')
const {
  stageAttachmentBatch,
  statCachedAttachment,
  resolveCachedAttachmentFilePath,
  getAttachmentCacheRoot,
} = await import('../../src/main/attachments/attachment-cache.mjs')
const {
  stageAttachmentFromLocalFile,
} = await import('../../src/main/attachments/attachment-local-file-staging.mjs')
const { hydrateHistoryAttachmentsForModel } = await import('../../src/main/chat/chat-attachment-parts.mjs')
const {
  prepareThreadAttachmentAgentMirror,
} = await import('../../src/main/attachments/attachment-agent-mirror.mjs')

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

function stageSampleAttachments(projectId, threadId) {
  return stageAttachmentBatch({
    projectId,
    threadId,
    attachments: [
      {
        kind: 'image',
        mediaType: 'image/png',
        fileName: 'screen.png',
        data: Buffer.from('image-bytes').toString('base64'),
      },
      {
        kind: 'file',
        mediaType: 'application/pdf',
        fileName: 'report.pdf',
        data: Buffer.from('pdf-bytes').toString('base64'),
      },
    ],
  })
}

test.after(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(projectPathA, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(projectPathB, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('attachment lifecycle covers stage/stat/hydrate/export/import with remapped IDs', { concurrency: false }, async (t) => {
  try {
    const opened = registerProject(projectPathA)
    const projectId = String(opened?.project?.id || '')
    const threadId = String(opened?.activeThread?.id || '')
    assert.ok(projectId)
    assert.ok(threadId)

    const staged = await stageSampleAttachments(projectId, threadId)
    assert.equal(staged.ok, true)
    assert.equal(staged.attachments.length, 2)

    const imageAttachment = staged.attachments.find((item) => item.kind === 'image')
    const fileAttachment = staged.attachments.find((item) => item.kind === 'file')
    assert.ok(imageAttachment?.attachmentId)
    assert.ok(fileAttachment?.attachmentId)
    assert.match(String(imageAttachment.previewUrl || ''), /^addom-attachment:\/\/attachment\//)
    assert.equal(String(fileAttachment.previewUrl || ''), '')

    const imageStat = await statCachedAttachment(imageAttachment.attachmentId)
    const fileStat = await statCachedAttachment(fileAttachment.attachmentId)
    assert.equal(imageStat.ok, true)
    assert.equal(fileStat.ok, true)

    const userContentParts = [
      {
        type: 'image',
        attachmentId: imageAttachment.attachmentId,
        mediaType: 'image/png',
        filename: 'screen.png',
      },
      {
        type: 'file',
        attachmentId: fileAttachment.attachmentId,
        mediaType: 'application/pdf',
        filename: 'report.pdf',
      },
    ]
    appendEvent(threadId, {
      turnId: 'turn_1',
      kind: 'user_message',
      role: 'user',
      content: 'Please inspect these attachments.',
      meta: { userContentParts },
    })

    const timeline = listTimeline(threadId, { limit: 50 })
    const userMessage = timeline.find((entry) => entry.kind === 'user_message')
    assert.ok(userMessage?.meta?.userContentParts)
    const hydrated = await hydrateHistoryAttachmentsForModel([{
      role: 'user',
      content: userMessage.meta.userContentParts,
    }])
    assert.equal(Array.isArray(hydrated[0]?.content), true)
    assert.equal(hydrated[0].content[0].type, 'image')
    assert.ok(String(hydrated[0].content[0].image || '').length > 0)
    assert.equal(hydrated[0].content[1].type, 'file')
    assert.ok(String(hydrated[0].content[1].data || '').length > 0)

    const localImageHydration = await hydrateHistoryAttachmentsForModel([{
      role: 'user',
      content: userMessage.meta.userContentParts,
    }], { preferLocalImagePaths: true })
    assert.equal(localImageHydration[0].content[0].type, 'image')
    assert.equal(
      localImageHydration[0].content[0].localPath,
      (await resolveCachedAttachmentFilePath(imageAttachment.attachmentId)).absolutePath,
    )
    assert.equal('image' in localImageHydration[0].content[0], false)
    assert.equal(localImageHydration[0].content[1].type, 'file')
    assert.ok(String(localImageHydration[0].content[1].data || '').length > 0)

    const exported = await exportThread(threadId)
    assert.equal(exported.schema, 'addom.thread_export.v2')
    assert.equal(exported.attachmentCount, 2)
    assert.equal(exported.attachments.length, 2)

    const imported = await importThread(projectId, exported)
    assert.equal(imported.importedEvents, 1)
    assert.ok(String(imported?.thread?.id || '').trim())

    const importedTimeline = listTimeline(imported.thread.id, { limit: 50 })
    const importedUserMessage = importedTimeline.find((entry) => entry.kind === 'user_message')
    const importedParts = Array.isArray(importedUserMessage?.meta?.userContentParts)
      ? importedUserMessage.meta.userContentParts
      : []
    assert.equal(importedParts.length, 2)

    const sourceAttachmentIds = new Set([imageAttachment.attachmentId, fileAttachment.attachmentId])
    for (const part of importedParts) {
      const nextId = String(part?.attachmentId || '')
      assert.ok(nextId)
      assert.equal(sourceAttachmentIds.has(nextId), false)
    }

    const hydratedImported = await hydrateHistoryAttachmentsForModel([{
      role: 'user',
      content: importedParts,
    }])
    assert.equal(Array.isArray(hydratedImported[0]?.content), true)
    assert.equal(hydratedImported[0].content[0].type, 'image')
    assert.equal(hydratedImported[0].content[1].type, 'file')
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('hydrateHistoryAttachmentsForModel degrades missing cached attachments to text placeholders', { concurrency: false }, async (t) => {
  try {
    const hydrated = await hydrateHistoryAttachmentsForModel([{
      role: 'user',
      content: [
        {
          type: 'image',
          attachmentId: 'att_missing_demo',
          mediaType: 'image/png',
          filename: 'missing.png',
        },
      ],
    }])
    assert.equal(hydrated.length, 1)
    assert.equal(typeof hydrated[0].content, 'string')
    assert.match(hydrated[0].content, /\[Attachment unavailable: missing\.png\]/)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('generated local image files can be copied into the durable scoped attachment cache', { concurrency: false }, async (t) => {
  try {
    const opened = registerProject(path.join(projectPathA, 'generated-artifact'))
    const projectId = String(opened?.project?.id || '')
    const threadId = String(opened?.activeThread?.id || '')
    const sourcePath = path.join(projectPathA, 'generated-source.png')
    fs.writeFileSync(sourcePath, Buffer.from('generated-image-bytes'))

    const staged = await stageAttachmentFromLocalFile({
      projectId,
      threadId,
      turnId: 'turn-generated',
      sourcePath,
      kind: 'image',
    })

    assert.equal(staged.ok, true)
    assert.equal(staged.descriptor.kind, 'image')
    assert.equal(staged.descriptor.mediaType, 'image/png')
    assert.equal(staged.descriptor.fileName, 'generated-source.png')
    assert.match(staged.descriptor.previewUrl, /^addom-attachment:\/\/attachment\//)
    const resolved = await resolveCachedAttachmentFilePath(staged.descriptor.attachmentId, {
      projectId,
      threadId,
    })
    assert.equal(resolved.ok, true)
    assert.notEqual(path.resolve(resolved.absolutePath), path.resolve(sourcePath))
    assert.deepEqual(fs.readFileSync(resolved.absolutePath), fs.readFileSync(sourcePath))
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('attachment scope checks deny cross-thread and cross-project access', { concurrency: false }, async (t) => {
  try {
    const openedA = registerProject(path.join(projectPathA, 'scope-a'))
    const projectAId = String(openedA?.project?.id || '')
    const threadAId = String(openedA?.activeThread?.id || '')
    assert.ok(projectAId)
    assert.ok(threadAId)

    const threadA2 = createThread(projectAId, 'Scope thread B')
    const threadA2Id = String(threadA2?.thread?.id || '')
    assert.ok(threadA2Id)

    const openedB = registerProject(path.join(projectPathA, 'scope-b'))
    const projectBId = String(openedB?.project?.id || '')
    const threadBId = String(openedB?.activeThread?.id || '')
    assert.ok(projectBId)
    assert.ok(threadBId)

    const staged = await stageSampleAttachments(projectAId, threadAId)
    const attachmentId = String(staged.attachments[0]?.attachmentId || '')
    assert.ok(attachmentId)

    const allowed = await statCachedAttachment(attachmentId, { projectId: projectAId, threadId: threadAId })
    assert.equal(allowed.ok, true)

    const deniedThread = await statCachedAttachment(attachmentId, { projectId: projectAId, threadId: threadA2Id })
    assert.equal(deniedThread.ok, false)
    assert.equal(deniedThread.error, 'attachment_scope_violation')

    const deniedProject = await resolveCachedAttachmentFilePath(attachmentId, { projectId: projectBId, threadId: threadBId })
    assert.equal(deniedProject.ok, false)
    assert.equal(deniedProject.error, 'attachment_scope_violation')
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('thread deletion and full reset remove attachment files and DB references', { concurrency: false }, async (t) => {
  try {
    const opened = registerProject(projectPathB)
    const projectId = String(opened?.project?.id || '')
    const threadId = String(opened?.activeThread?.id || '')
    assert.ok(projectId)
    assert.ok(threadId)

    const threadToDelete = createThread(projectId, 'Delete me')
    const deleteThreadId = String(threadToDelete?.thread?.id || '')
    const stagedDeleteThread = await stageSampleAttachments(projectId, deleteThreadId)
    const deleteAttachmentId = String(stagedDeleteThread.attachments[0]?.attachmentId || '')
    const deleteResolved = await resolveCachedAttachmentFilePath(deleteAttachmentId)
    assert.equal(deleteResolved.ok, true)
    const deleteMirror = await prepareThreadAttachmentAgentMirror({
      projectId,
      threadId: deleteThreadId,
    })
    assert.equal(deleteMirror.ok, true)
    assert.equal(fs.existsSync(deleteMirror.rootPath), true)

    const deleteThreadResult = await deleteThread(deleteThreadId)
    assert.equal(deleteThreadResult.ok, true)
    assert.ok(Number(deleteThreadResult.attachmentCleanup?.deletedRows || 0) >= 1)
    assert.equal(fs.existsSync(deleteResolved.absolutePath), false)
    assert.equal(fs.existsSync(deleteMirror.rootPath), false)

    const projectToRemove = registerProject(path.join(projectPathB, 'remove-project'))
    const removeProjectId = String(projectToRemove?.project?.id || '')
    const removeThreadId = String(projectToRemove?.activeThread?.id || '')
    const stagedProjectRemoval = await stageSampleAttachments(removeProjectId, removeThreadId)
    assert.equal(stagedProjectRemoval.ok, true)
    const projectMirror = await prepareThreadAttachmentAgentMirror({
      projectId: removeProjectId,
      threadId: removeThreadId,
    })
    assert.equal(projectMirror.ok, true)
    assert.equal(fs.existsSync(projectMirror.rootPath), true)
    const removeProjectResult = await removeProject(removeProjectId)
    assert.equal(removeProjectResult.ok, true)
    assert.equal(fs.existsSync(projectMirror.rootPath), false)

    const openedAfterThreadDelete = registerProject(path.join(projectPathB, 'subproject'))
    const projectIdAfter = String(openedAfterThreadDelete?.project?.id || '')
    const threadIdAfter = String(openedAfterThreadDelete?.activeThread?.id || '')
    const stagedAll = await stageSampleAttachments(projectIdAfter, threadIdAfter)
    const allAttachmentId = String(stagedAll.attachments[0]?.attachmentId || '')
    const allResolved = await resolveCachedAttachmentFilePath(allAttachmentId)
    assert.equal(allResolved.ok, true)
    const allMirror = await prepareThreadAttachmentAgentMirror({
      projectId: projectIdAfter,
      threadId: threadIdAfter,
    })
    assert.equal(allMirror.ok, true)
    assert.equal(fs.existsSync(allMirror.rootPath), true)

    const clearAllResult = await clearAllWorkspaceData()
    assert.equal(clearAllResult.ok, true)
    assert.ok(Number(clearAllResult.attachmentCleanup?.deletedRows || 0) >= 1)
    assert.equal(fs.existsSync(allResolved.absolutePath), false)
    assert.equal(fs.existsSync(allMirror.rootPath), false)
    assert.equal(fs.existsSync(getAttachmentCacheRoot()), false)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})
