import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-assets-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const {
  __resetOpenAIAssetClientFactoryForTests,
  __setOpenAIAssetClientFactoryForTests,
  attachFilesToOpenAIProjectVectorStore,
  clearOpenAIThreadAssetAssociations,
  deleteAllOpenAIWorkspaceAssets,
  deleteOpenAIProjectAssets,
  deleteOpenAIProjectVectorStore,
  ensureOpenAIProjectVectorStore,
  listOpenAIProjectAssets,
  removeOpenAIProjectAsset,
  syncOpenAIProjectAssets,
  uploadOpenAIFiles,
} = await import('../../src/main/api-clients/openai-asset-service.mjs')
const { setSettingsPatch } = await import('../../src/main/settings.mjs')
const {
  getOpenAIThreadState,
  upsertOpenAIThreadState,
  invalidateOpenAIThreadState,
  resolveOpenAIThreadContinuation,
} = await import('../../src/main/api-clients/openai-thread-state-service.mjs')
const {
  stageAttachmentBatch,
} = await import('../../src/main/attachments/attachment-cache.mjs')

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

function createMockClient() {
  const state = {
    files: new Map(),
    vectorStores: new Map(),
    vectorStoreFiles: new Map(),
    deletedFiles: [],
    deletedVectorStores: [],
  }
  let fileCounter = 0
  let vectorStoreCounter = 0
  let vectorStoreFileCounter = 0

  const client = {
    files: {
      async create() {
        fileCounter += 1
        const file = {
          id: `file_${fileCounter}`,
          filename: `upload_${fileCounter}.txt`,
          bytes: 12,
          purpose: 'user_data',
          status: 'uploaded',
        }
        state.files.set(file.id, file)
        return file
      },
      async retrieve(fileId) {
        const file = state.files.get(String(fileId || ''))
        if (!file) {
          const error = new Error('not found')
          error.status = 404
          throw error
        }
        return file
      },
      async delete(fileId) {
        state.files.delete(String(fileId || ''))
        state.deletedFiles.push(String(fileId || ''))
        return { id: String(fileId || ''), deleted: true }
      },
    },
    uploads: {
      async create(body) {
        return { id: `upload_${Date.now()}`, ...body }
      },
      async cancel() {
        return { ok: true }
      },
      async complete(_uploadId, body) {
        fileCounter += 1
        const file = {
          id: `file_${fileCounter}`,
          filename: `multipart_${body.part_ids.length}.bin`,
          bytes: 12,
          purpose: 'user_data',
          status: 'uploaded',
        }
        state.files.set(file.id, file)
        return { id: 'upload_complete', file }
      },
      parts: {
        async create() {
          return { id: `part_${Math.random().toString(36).slice(2, 10)}` }
        },
      },
    },
    vectorStores: {
      async create(body) {
        vectorStoreCounter += 1
        const vectorStore = {
          id: `vs_${vectorStoreCounter}`,
          name: body.name,
          status: 'completed',
          file_counts: { total: 0, completed: 0, failed: 0, cancelled: 0, in_progress: 0 },
        }
        state.vectorStores.set(vectorStore.id, vectorStore)
        return vectorStore
      },
      async retrieve(vectorStoreId) {
        const vectorStore = state.vectorStores.get(String(vectorStoreId || ''))
        if (!vectorStore) {
          const error = new Error('not found')
          error.status = 404
          throw error
        }
        return vectorStore
      },
      async delete(vectorStoreId) {
        state.vectorStores.delete(String(vectorStoreId || ''))
        state.deletedVectorStores.push(String(vectorStoreId || ''))
        return { id: String(vectorStoreId || ''), deleted: true }
      },
      files: {
        async createAndPoll(vectorStoreId, body) {
          vectorStoreFileCounter += 1
          const vectorStoreFile = {
            id: `vsf_${vectorStoreFileCounter}`,
            vector_store_id: String(vectorStoreId || ''),
            file_id: String(body.file_id || ''),
            status: 'completed',
            attributes: body.attributes || {},
          }
          state.vectorStoreFiles.set(vectorStoreFile.id, vectorStoreFile)
          return vectorStoreFile
        },
        async retrieve(vectorStoreFileId) {
          const link = state.vectorStoreFiles.get(String(vectorStoreFileId || ''))
          if (!link) {
            const error = new Error('not found')
            error.status = 404
            throw error
          }
          return link
        },
      },
    },
  }

  return { client, state }
}

test.beforeEach(() => {
  __resetOpenAIAssetClientFactoryForTests()
})

test.after(() => {
  __resetOpenAIAssetClientFactoryForTests()
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('openai asset service creates vector stores, uploads reusable files, and attaches them to file_search storage', async (t) => {
  try {
    const tempFile = path.join(userDataPath, 'fixture.txt')
    fs.writeFileSync(tempFile, 'hello openai', 'utf8')
    const { client, state } = createMockClient()
    __setOpenAIAssetClientFactoryForTests(() => client)

    const vectorStore = await ensureOpenAIProjectVectorStore('project-1')
    assert.equal(vectorStore.projectId, 'project-1')
    assert.match(vectorStore.remoteVectorStoreId, /^vs_/)

    const uploaded = await uploadOpenAIFiles({
      projectId: 'project-1',
      files: [{ path: tempFile }],
    })
    assert.equal(uploaded.length, 1)
    assert.match(uploaded[0].remoteFileId, /^file_/)

    const reused = await uploadOpenAIFiles({
      projectId: 'project-1',
      files: [{ path: tempFile }],
    })
    assert.equal(reused.length, 1)
    assert.equal(reused[0].remoteFileId, uploaded[0].remoteFileId)
    assert.equal(state.files.size, 1)

    const attachmentResult = await attachFilesToOpenAIProjectVectorStore({
      projectId: 'project-1',
      assetIds: [uploaded[0].id],
    })
    assert.equal(attachmentResult.attachedFiles.length, 1)
    assert.match(attachmentResult.attachedFiles[0].remoteVectorStoreFileId, /^vsf_/)

    const synced = await syncOpenAIProjectAssets('project-1')
    assert.equal(synced.files.length, 1)
    assert.equal(synced.vectorStoreFiles.length, 1)
    assert.equal(synced.vectorStore?.remoteVectorStoreId, vectorStore.remoteVectorStoreId)

    const snapshot = listOpenAIProjectAssets('project-1')
    assert.equal(snapshot.files.length, 1)
    assert.equal(snapshot.vectorStoreFiles.length, 1)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('openai asset service ignores per-request apiKey overrides and resolves auth from settings', async (t) => {
  try {
    await setSettingsPatch({
      providerAuthSettings: {
        openai: {
          authMethod: 'api_key',
        },
      },
    })

    const tempFile = path.join(userDataPath, 'fixture-auth-override.txt')
    fs.writeFileSync(tempFile, 'auth override', 'utf8')
    const calls = []
    const { client } = createMockClient()
    __setOpenAIAssetClientFactoryForTests((options = {}) => {
      calls.push(options)
      return client
    })

    await uploadOpenAIFiles({
      projectId: 'project-override',
      apiKey: 'sk-should-be-ignored',
      files: [{ path: tempFile }],
    })
    await attachFilesToOpenAIProjectVectorStore({
      projectId: 'project-override',
      apiKey: 'sk-should-be-ignored',
      assetIds: listOpenAIProjectAssets('project-override').files.map((row) => row.id),
    })

    assert.equal(calls.length >= 2, true)
    assert.equal(calls.every((row) => String(row?.apiKey || '') === ''), true)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('openai asset service removes remote files and vector stores from local state', async (t) => {
  try {
    const tempFile = path.join(userDataPath, 'fixture-remove.txt')
    fs.writeFileSync(tempFile, 'delete me', 'utf8')
    const { client, state } = createMockClient()
    __setOpenAIAssetClientFactoryForTests(() => client)

    await ensureOpenAIProjectVectorStore('project-2')
    const [uploaded] = await uploadOpenAIFiles({
      projectId: 'project-2',
      files: [{ path: tempFile }],
    })
    await attachFilesToOpenAIProjectVectorStore({
      projectId: 'project-2',
      assetIds: [uploaded.id],
    })

    assert.equal(await removeOpenAIProjectAsset(uploaded.id), true)
    assert.deepEqual(state.deletedFiles, [uploaded.remoteFileId])
    assert.equal(listOpenAIProjectAssets('project-2').files.length, 0)

    assert.equal(await deleteOpenAIProjectVectorStore('project-2'), true)
    assert.equal(state.deletedVectorStores.length, 1)
    assert.equal(listOpenAIProjectAssets('project-2').vectorStore, null)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('openai asset service clears thread ownership without deleting project-scoped assets', async (t) => {
  try {
    const staged = await stageAttachmentBatch({
      projectId: 'project-thread-cleanup',
      threadId: 'thread-cleanup',
      attachments: [{
        kind: 'file',
        mediaType: 'text/plain',
        fileName: 'thread-owned.txt',
        dataUrl: 'data:text/plain;base64,dGhyZWFkLW93bmVk',
      }],
    })
    const attachmentId = String(staged.attachments?.[0]?.attachmentId || '')
    assert.ok(attachmentId)

    const { client } = createMockClient()
    __setOpenAIAssetClientFactoryForTests(() => client)

    const [uploaded] = await uploadOpenAIFiles({
      projectId: 'project-thread-cleanup',
      files: [{
        attachmentId,
        threadId: 'thread-cleanup',
      }],
    })
    assert.equal(uploaded.threadId, 'thread-cleanup')
    assert.equal(uploaded.attachmentId, attachmentId)

    const cleanup = clearOpenAIThreadAssetAssociations('thread-cleanup')
    assert.equal(cleanup.ok, true)
    assert.equal(cleanup.updatedFiles, 1)

    const snapshot = listOpenAIProjectAssets('project-thread-cleanup')
    assert.equal(snapshot.files.length, 1)
    assert.equal(snapshot.files[0].id, uploaded.id)
    assert.equal(snapshot.files[0].threadId, '')
    assert.equal(snapshot.files[0].attachmentId, '')
    assert.equal(snapshot.files[0].remoteFileId, uploaded.remoteFileId)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('openai asset service project and workspace cleanup delete remote/local asset state', async (t) => {
  try {
    const tempFileA = path.join(userDataPath, 'fixture-project-cleanup-a.txt')
    const tempFileB = path.join(userDataPath, 'fixture-project-cleanup-b.txt')
    fs.writeFileSync(tempFileA, 'cleanup a', 'utf8')
    fs.writeFileSync(tempFileB, 'cleanup b', 'utf8')

    const { client, state } = createMockClient()
    __setOpenAIAssetClientFactoryForTests(() => client)

    await ensureOpenAIProjectVectorStore('project-cleanup-a')
    const [uploadedA] = await uploadOpenAIFiles({
      projectId: 'project-cleanup-a',
      files: [{ path: tempFileA }],
    })
    await attachFilesToOpenAIProjectVectorStore({
      projectId: 'project-cleanup-a',
      assetIds: [uploadedA.id],
    })

    await ensureOpenAIProjectVectorStore('project-cleanup-b')
    const [uploadedB] = await uploadOpenAIFiles({
      projectId: 'project-cleanup-b',
      files: [{ path: tempFileB }],
    })
    await attachFilesToOpenAIProjectVectorStore({
      projectId: 'project-cleanup-b',
      assetIds: [uploadedB.id],
    })

    const projectCleanup = await deleteOpenAIProjectAssets('project-cleanup-a')
    assert.equal(projectCleanup.ok, true)
    assert.equal(projectCleanup.deletedRemoteVectorStore, true)
    assert.equal(projectCleanup.deletedRemoteFiles, 1)
    assert.equal(listOpenAIProjectAssets('project-cleanup-a').files.length, 0)
    assert.equal(listOpenAIProjectAssets('project-cleanup-a').vectorStore, null)

    const workspaceCleanup = await deleteAllOpenAIWorkspaceAssets()
    assert.equal(workspaceCleanup.ok, true)
    assert.equal(workspaceCleanup.deletedRemoteVectorStores >= 1, true)
    assert.equal(workspaceCleanup.deletedRemoteFiles >= 1, true)
    assert.equal(listOpenAIProjectAssets('project-cleanup-b').files.length, 0)
    assert.equal(listOpenAIProjectAssets('project-cleanup-b').vectorStore, null)
    const deletedFileIds = new Set(state.deletedFiles)
    assert.equal(deletedFileIds.has(uploadedA.remoteFileId), true)
    assert.equal(deletedFileIds.has(uploadedB.remoteFileId), true)
    assert.equal(state.deletedVectorStores.length >= 2, true)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('openai thread state service resolves continuation only for compatible chains', (t) => {
  try {
    const saved = upsertOpenAIThreadState({
      threadId: 'thread-1',
      projectId: 'project-1',
      model: 'gpt-5.2',
      lastResponseId: 'resp_123',
      toolsetHash: 'toolhash',
      systemPromptHash: 'prompthash',
      continuitySignature: 'sig_1',
      chainValid: true,
    })

    assert.equal(saved.threadId, 'thread-1')
    assert.equal(saved.lastResponseId, 'resp_123')

    const valid = resolveOpenAIThreadContinuation({
      threadId: 'thread-1',
      model: 'gpt-5.2',
      toolsetHash: 'toolhash',
      systemPromptHash: 'prompthash',
      continuitySignature: 'sig_1',
      usePreviousResponseId: true,
    })
    assert.equal(valid.chainValid, true)
    assert.equal(valid.previousResponseId, 'resp_123')

    const invalid = resolveOpenAIThreadContinuation({
      threadId: 'thread-1',
      model: 'gpt-5.2',
      toolsetHash: 'different',
      systemPromptHash: 'prompthash',
      continuitySignature: 'sig_1',
      usePreviousResponseId: true,
    })
    assert.equal(invalid.chainValid, false)
    assert.equal(invalid.invalidReason, 'toolset_changed')
    assert.equal(getOpenAIThreadState('thread-1')?.chainValid, false)

    invalidateOpenAIThreadState('thread-1', 'manual_reset')
    assert.equal(getOpenAIThreadState('thread-1')?.chainInvalidReason, 'manual_reset')
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('openai asset service can upload a staged attachment by attachmentId and preserve the mapping', async (t) => {
  try {
    const staged = await stageAttachmentBatch({
      projectId: 'project-attach',
      threadId: 'thread-attach',
      turnId: 'turn-attach',
      attachments: [{
        kind: 'file',
        mediaType: 'text/plain',
        fileName: 'from-composer.txt',
        dataUrl: 'data:text/plain;base64,aGVsbG8gZnJvbSBjb21wb3Nlcg==',
      }],
    })
    assert.equal(staged.ok, true)
    const attachmentId = staged.attachments?.[0]?.attachmentId || ''
    assert.ok(attachmentId)

    const { client, state } = createMockClient()
    __setOpenAIAssetClientFactoryForTests(() => client)

    const uploaded = await uploadOpenAIFiles({
      projectId: 'project-attach',
      files: [{
        attachmentId,
        threadId: 'thread-attach',
      }],
    })

    assert.equal(uploaded.length, 1)
    assert.equal(uploaded[0].attachmentId, attachmentId)
    assert.equal(uploaded[0].threadId, 'thread-attach')
    assert.equal(state.files.size, 1)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})
