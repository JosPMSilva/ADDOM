import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import OpenAI from 'openai'
import { resolveCachedAttachmentFilePath } from '../attachments/attachment-cache.mjs'
import { getDb } from '../memory/db.mjs'
import { createOpenAIAssetStore } from './openai-asset-service-store.mjs'
import {
  computeFileSha256,
  createRemoteSummary,
  inferMimeType,
  normalizeId,
  normalizeLowerId,
  normalizeStatus,
  normalizeUploadInputFile,
  now,
  parseJson,
  projectVectorStoreMetadata,
  resolveProjectVectorStoreName,
  sanitizeMetadataValue,
  stringifyJson,
} from './openai-asset-service-utils.mjs'
import { createOpenAIAssetRemoteOperations } from './openai-asset-service-remote-ops.mjs'
import {
  createOpenAIExecutionAuthError,
  resolveOpenAIExecutionAuth,
} from '../openai-account/openai-execution-auth.mjs'

const OPENAI_PROVIDER_ID = 'openai'
const OPENAI_FILE_PURPOSE = 'user_data'
const DIRECT_UPLOAD_MAX_BYTES = 64 * 1024 * 1024
const UPLOAD_PART_MAX_BYTES = 64 * 1024 * 1024
const VECTOR_STORE_SCOPE = 'project'
const VECTOR_STORE_RETENTION_POLICY = 'project_reusable'
const FILE_RETENTION_POLICY = 'project_reusable'
const DEFAULT_VECTOR_STORE_POLL_INTERVAL_MS = 1_000

let openAIAssetClientFactory = null

function buildOpenAIClient() {
  const auth = resolveOpenAIExecutionAuth()
  const resolvedApiKey = normalizeId(auth.apiKey)
  if (typeof openAIAssetClientFactory === 'function') {
    return openAIAssetClientFactory({
      apiKey: resolvedApiKey,
      baseURL: normalizeId(process.env.ADDOM_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL),
    })
  }
  if (!resolvedApiKey) {
    throw createOpenAIExecutionAuthError(auth)
  }
  return new OpenAI({
    apiKey: resolvedApiKey,
    ...(normalizeId(process.env.ADDOM_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL)
      ? { baseURL: normalizeId(process.env.ADDOM_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL) }
      : {}),
  })
}

const {
  mapProviderFileRow,
  getProviderFileRecordById,
  getVectorStoreRecordById,
  listProjectVectorStore,
  listAllProviderFiles,
  listAllVectorStoreRecords,
  getVectorStoreFileLink,
  updateProviderFileRecord,
  insertProviderFileRecord,
  upsertVectorStoreRecord,
  upsertVectorStoreFileLink,
  listProjectAssetSnapshot,
  clearThreadProviderFileAssociations,
  deleteProjectProviderAssetRows,
  deleteAllProviderAssetRows,
} = createOpenAIAssetStore({
  crypto,
  getDb,
  now,
  constants: {
    OPENAI_PROVIDER_ID,
    OPENAI_FILE_PURPOSE,
    VECTOR_STORE_SCOPE,
    VECTOR_STORE_RETENTION_POLICY,
    FILE_RETENTION_POLICY,
  },
  utils: {
    normalizeId,
    normalizeLowerId,
    parseJson,
    stringifyJson,
    normalizeStatus,
    resolveProjectVectorStoreName,
  },
})

function buildRemoteCleanupFailure(kind = '', id = '', error = null) {
  return {
    kind: normalizeId(kind),
    id: normalizeId(id),
    error: String(error?.message || error || 'cleanup_failed'),
  }
}

function tryBuildOpenAIClient() {
  try {
    return {
      client: buildOpenAIClient(),
      clientError: null,
    }
  } catch (error) {
    return {
      client: null,
      clientError: error,
    }
  }
}
const {
  deleteRemoteVectorStoreIfPresent,
  deleteRemoteFileIfPresent,
  uploadFileToOpenAI,
  ensureRemoteFileActive,
  ensureRemoteVectorStoreActive,
  syncProviderFileRecord,
  syncVectorStoreRecord,
  syncVectorStoreFileLink,
} = createOpenAIAssetRemoteOperations({
  constants: {
    OPENAI_FILE_PURPOSE,
    DIRECT_UPLOAD_MAX_BYTES,
    UPLOAD_PART_MAX_BYTES,
  },
  now,
  store: {
    getVectorStoreRecordById,
    updateProviderFileRecord,
    upsertVectorStoreRecord,
    upsertVectorStoreFileLink,
  },
  utils: {
    normalizeId,
    normalizeStatus,
    createRemoteSummary,
  },
  buildRemoteCleanupFailure,
})

async function resolveUploadDescriptor(projectId, entry) {
  const normalizedProjectId = normalizeId(projectId)
  const normalizedEntry = normalizeUploadInputFile(entry)
  if (!normalizedProjectId) {
    throw new Error('projectId is required')
  }
  let resolvedPath = normalizedEntry.path
  let resolvedFileName = normalizedEntry.fileName
  let resolvedMimeType = normalizedEntry.mimeType

  if (!resolvedPath && normalizedEntry.attachmentId) {
    const resolvedAttachment = await resolveCachedAttachmentFilePath(normalizedEntry.attachmentId, {
      projectId: normalizedProjectId,
      ...(normalizeId(normalizedEntry.threadId) ? { threadId: normalizeId(normalizedEntry.threadId) } : {}),
    })
    if (!resolvedAttachment?.ok || !resolvedAttachment.absolutePath) {
      throw new Error(`attachment not found for OpenAI upload: ${normalizedEntry.attachmentId}`)
    }
    resolvedPath = normalizeId(resolvedAttachment.absolutePath)
    resolvedFileName = resolvedFileName || normalizeId(resolvedAttachment.fileName)
    resolvedMimeType = resolvedMimeType || normalizeId(resolvedAttachment.mediaType)
  }

  if (!resolvedPath) {
    throw new Error('file path or attachmentId is required')
  }
  const stat = await fs.promises.stat(resolvedPath)
  if (!stat.isFile()) {
    throw new Error(`OpenAI asset upload expects a file path: ${resolvedPath}`)
  }
  const fileName = resolvedFileName || path.basename(resolvedPath)
  const mimeType = resolvedMimeType || inferMimeType(resolvedPath)
  const sha256 = await computeFileSha256(resolvedPath)
  return {
    projectId: normalizedProjectId,
    threadId: normalizeId(normalizedEntry.threadId),
    attachmentId: normalizeId(normalizedEntry.attachmentId),
    path: resolvedPath,
    fileName,
    mimeType,
    sizeBytes: Number(stat.size || 0) || 0,
    sha256,
  }
}

function findReusableProviderFile(descriptor) {
  const db = getDb()
  const row = db.prepare(`
    SELECT *
    FROM provider_files
    WHERE provider_id = ?
      AND project_id = ?
      AND sha256 = ?
      AND size_bytes = ?
      AND mime_type = ?
      AND deleted_remote_at = 0
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `).get(
    OPENAI_PROVIDER_ID,
    descriptor.projectId,
    descriptor.sha256,
    descriptor.sizeBytes,
    descriptor.mimeType,
  )
  return mapProviderFileRow(row)
}

export function listOpenAIProjectAssets(projectId = '') {
  return listProjectAssetSnapshot(projectId)
}

export async function ensureOpenAIProjectVectorStore(projectId = '', options = {}) {
  const normalizedProjectId = normalizeId(projectId)
  if (!normalizedProjectId) {
    throw new Error('projectId is required')
  }

  const client = buildOpenAIClient()
  const existingRecord = listProjectVectorStore(normalizedProjectId)
  const existingRemote = await ensureRemoteVectorStoreActive(client, existingRecord)
  if (existingRecord && existingRemote) {
    return syncVectorStoreRecord(client, existingRecord)
  }

  const remoteVectorStore = await client.vectorStores.create({
    name: normalizeId(options?.name) || existingRecord?.name || resolveProjectVectorStoreName(normalizedProjectId),
    metadata: projectVectorStoreMetadata(normalizedProjectId, { vectorStoreScope: VECTOR_STORE_SCOPE }),
  })

  return upsertVectorStoreRecord({
    existingRecord,
    projectId: normalizedProjectId,
    name: normalizeId(remoteVectorStore.name) || resolveProjectVectorStoreName(normalizedProjectId),
    remoteVectorStoreId: remoteVectorStore.id,
    status: normalizeStatus(remoteVectorStore.status, 'in_progress'),
    metadata: {
      source: 'openai',
      remote: createRemoteSummary(remoteVectorStore),
    },
  })
}

export async function syncOpenAIProjectAssets(projectId = '') {
  const normalizedProjectId = normalizeId(projectId)
  if (!normalizedProjectId) return listProjectAssetSnapshot('')
  const client = buildOpenAIClient()
  const current = listProjectAssetSnapshot(normalizedProjectId)
  if (current.vectorStore) {
    await syncVectorStoreRecord(client, current.vectorStore)
  }
  for (const fileRecord of current.files) {
    await syncProviderFileRecord(client, fileRecord)
  }
  const refreshed = listProjectAssetSnapshot(normalizedProjectId)
  for (const link of refreshed.vectorStoreFiles) {
    await syncVectorStoreFileLink(client, link)
  }
  return listProjectAssetSnapshot(normalizedProjectId)
}

export async function uploadOpenAIFiles(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const normalizedProjectId = normalizeId(source.projectId)
  if (!normalizedProjectId) {
    throw new Error('projectId is required')
  }

  const inputFiles = Array.isArray(source.files) ? source.files : []
  if (inputFiles.length === 0) return []

  const client = buildOpenAIClient()
  const uploadedRecords = []
  for (const entry of inputFiles) {
    const descriptor = await resolveUploadDescriptor(normalizedProjectId, entry)
    const reusable = findReusableProviderFile(descriptor)
    if (reusable) {
      const remoteFile = await ensureRemoteFileActive(client, reusable)
      if (remoteFile) {
        uploadedRecords.push(updateProviderFileRecord(reusable.id, {
          threadId: descriptor.threadId || reusable.threadId,
          attachmentId: descriptor.attachmentId || reusable.attachmentId,
          localPath: descriptor.path,
          fileName: descriptor.fileName,
          mimeType: descriptor.mimeType,
          sizeBytes: descriptor.sizeBytes,
          metadata: {
            ...reusable.metadata,
            reused: true,
            remote: createRemoteSummary(remoteFile),
          },
        }))
        continue
      }
    }

    const remoteFile = await uploadFileToOpenAI(client, descriptor)
    const record = reusable
      ? updateProviderFileRecord(reusable.id, {
        threadId: descriptor.threadId || reusable.threadId,
        attachmentId: descriptor.attachmentId || reusable.attachmentId,
        localPath: descriptor.path,
        fileName: descriptor.fileName,
        mimeType: descriptor.mimeType,
        sizeBytes: descriptor.sizeBytes,
        sha256: descriptor.sha256,
        remoteFileId: remoteFile.id,
        purpose: normalizeId(remoteFile.purpose) || OPENAI_FILE_PURPOSE,
        status: normalizeStatus(remoteFile.status, 'uploaded'),
        deletedRemoteAt: 0,
        metadata: {
          remote: createRemoteSummary(remoteFile),
        },
      })
      : insertProviderFileRecord({
        projectId: normalizedProjectId,
        threadId: descriptor.threadId,
        attachmentId: descriptor.attachmentId,
        localPath: descriptor.path,
        sha256: descriptor.sha256,
        fileName: descriptor.fileName,
        mimeType: descriptor.mimeType,
        sizeBytes: descriptor.sizeBytes,
        remoteFileId: remoteFile.id,
        purpose: normalizeId(remoteFile.purpose) || OPENAI_FILE_PURPOSE,
        status: normalizeStatus(remoteFile.status, 'uploaded'),
        retentionPolicy: FILE_RETENTION_POLICY,
        metadata: {
          remote: createRemoteSummary(remoteFile),
        },
      })
    uploadedRecords.push(record)
  }

  return uploadedRecords.filter(Boolean)
}

export async function attachFilesToOpenAIProjectVectorStore(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const normalizedProjectId = normalizeId(source.projectId)
  if (!normalizedProjectId) {
    throw new Error('projectId is required')
  }
  const assetIds = Array.isArray(source.assetIds)
    ? source.assetIds
    : Array.isArray(source.fileIds)
      ? source.fileIds
      : []
  const normalizedAssetIds = assetIds.map((value) => normalizeId(value)).filter(Boolean)
  if (normalizedAssetIds.length === 0) {
    return {
      projectId: normalizedProjectId,
      vectorStore: await ensureOpenAIProjectVectorStore(normalizedProjectId),
      attachedFiles: [],
      skippedFiles: [],
    }
  }

  const client = buildOpenAIClient()
  const vectorStoreRecord = await ensureOpenAIProjectVectorStore(normalizedProjectId)
  const attachedFiles = []
  const skippedFiles = []

  for (const assetId of normalizedAssetIds) {
    const fileRecord = getProviderFileRecordById(assetId)
    if (!fileRecord || fileRecord.projectId !== normalizedProjectId || !fileRecord.remoteFileId) {
      skippedFiles.push({ assetId, reason: 'missing_file_record' })
      continue
    }

    const existingLink = getVectorStoreFileLink(vectorStoreRecord.id, fileRecord.id)
    if (existingLink?.remoteVectorStoreFileId) {
      const remoteLink = await syncVectorStoreFileLink(client, existingLink)
      if (remoteLink?.status === 'completed' || remoteLink?.status === 'in_progress') {
        attachedFiles.push(remoteLink)
        continue
      }
    }

    const remoteLink = await client.vectorStores.files.createAndPoll(
      vectorStoreRecord.remoteVectorStoreId,
      {
        file_id: fileRecord.remoteFileId,
        attributes: {
          addom_project_id: normalizedProjectId,
          addom_file_name: sanitizeMetadataValue(fileRecord.fileName),
          addom_sha256: sanitizeMetadataValue(fileRecord.sha256),
        },
      },
      { pollIntervalMs: DEFAULT_VECTOR_STORE_POLL_INTERVAL_MS },
    )
    attachedFiles.push(upsertVectorStoreFileLink({
      existingLink,
      vectorStoreRecordId: vectorStoreRecord.id,
      providerFileRecordId: fileRecord.id,
      remoteVectorStoreFileId: remoteLink.id,
      status: normalizeStatus(remoteLink.status, 'completed'),
      attributes: remoteLink.attributes || {},
    }))
  }

  return {
    projectId: normalizedProjectId,
    vectorStore: await syncVectorStoreRecord(client, vectorStoreRecord),
    attachedFiles,
    skippedFiles,
  }
}

export async function removeOpenAIProjectAsset(assetId = '') {
  const record = getProviderFileRecordById(assetId)
  if (!record) return false

  const client = buildOpenAIClient()
  if (record.remoteFileId) {
    try {
      await client.files.delete(record.remoteFileId)
    } catch (error) {
      if (Number(error?.status || 0) !== 404) throw error
    }
  }

  const db = getDb()
  db.prepare(`
    DELETE FROM provider_vector_store_files
    WHERE provider_id = ? AND provider_file_record_id = ?
  `).run(OPENAI_PROVIDER_ID, record.id)
  const result = db.prepare(`
    DELETE FROM provider_files
    WHERE provider_id = ? AND id = ?
  `).run(OPENAI_PROVIDER_ID, record.id)
  return Number(result?.changes || 0) > 0
}

export async function deleteOpenAIProjectVectorStore(projectId = '') {
  const vectorStoreRecord = listProjectVectorStore(projectId)
  if (!vectorStoreRecord) return false

  const client = buildOpenAIClient()
  if (vectorStoreRecord.remoteVectorStoreId) {
    try {
      await client.vectorStores.delete(vectorStoreRecord.remoteVectorStoreId)
    } catch (error) {
      if (Number(error?.status || 0) !== 404) throw error
    }
  }

  const db = getDb()
  db.prepare(`
    DELETE FROM provider_vector_store_files
    WHERE provider_id = ? AND vector_store_record_id = ?
  `).run(OPENAI_PROVIDER_ID, vectorStoreRecord.id)
  const result = db.prepare(`
    DELETE FROM provider_vector_stores
    WHERE provider_id = ? AND id = ?
  `).run(OPENAI_PROVIDER_ID, vectorStoreRecord.id)
  return Number(result?.changes || 0) > 0
}

export function clearOpenAIThreadAssetAssociations(threadId = '') {
  return clearThreadProviderFileAssociations(threadId)
}

export async function deleteOpenAIProjectRemoteAssets(projectId = '') {
  const normalizedProjectId = normalizeId(projectId)
  if (!normalizedProjectId) {
    return {
      ok: false,
      projectId: '',
      deletedRemoteVectorStore: false,
      deletedRemoteFiles: 0,
      deletedFiles: 0,
      deletedVectorStores: 0,
      deletedVectorStoreFiles: 0,
      remoteFailures: [],
    }
  }

  const snapshot = listProjectAssetSnapshot(normalizedProjectId)
  const remoteFailures = []
  const { client, clientError } = tryBuildOpenAIClient()

  if (clientError && (
    normalizeId(snapshot?.vectorStore?.remoteVectorStoreId)
    || snapshot.files.some((row) => normalizeId(row?.remoteFileId))
  )) {
    remoteFailures.push(buildRemoteCleanupFailure('client', normalizedProjectId, clientError))
  }

  const deletedRemoteVectorStore = await deleteRemoteVectorStoreIfPresent(client, snapshot.vectorStore, remoteFailures)
  let deletedRemoteFiles = 0
  for (const fileRecord of snapshot.files) {
    if (await deleteRemoteFileIfPresent(client, fileRecord, remoteFailures)) {
      deletedRemoteFiles += 1
    }
  }

  return {
    ok: remoteFailures.length === 0,
    projectId: normalizedProjectId,
    deletedRemoteVectorStore,
    deletedRemoteFiles,
    remoteFailures,
  }
}

export function deleteOpenAIProjectLocalAssets(projectId = '') {
  return deleteProjectProviderAssetRows(projectId)
}

export async function deleteOpenAIProjectAssets(projectId = '') {
  const remoteCleanup = await deleteOpenAIProjectRemoteAssets(projectId)
  if (!remoteCleanup.ok) return remoteCleanup
  return {
    ...remoteCleanup,
    ...deleteOpenAIProjectLocalAssets(projectId),
  }
}

export async function deleteAllOpenAIWorkspaceAssets() {
  const remoteFailures = []
  const { client, clientError } = tryBuildOpenAIClient()
  const vectorStores = listAllVectorStoreRecords()
  const files = listAllProviderFiles()

  if (clientError && (
    vectorStores.some((row) => normalizeId(row?.remoteVectorStoreId))
    || files.some((row) => normalizeId(row?.remoteFileId))
  )) {
    remoteFailures.push(buildRemoteCleanupFailure('client', 'workspace', clientError))
  }

  let deletedRemoteVectorStores = 0
  for (const vectorStoreRecord of vectorStores) {
    if (await deleteRemoteVectorStoreIfPresent(client, vectorStoreRecord, remoteFailures)) {
      deletedRemoteVectorStores += 1
    }
  }

  let deletedRemoteFiles = 0
  for (const fileRecord of files) {
    if (await deleteRemoteFileIfPresent(client, fileRecord, remoteFailures)) {
      deletedRemoteFiles += 1
    }
  }

  const localCleanup = deleteAllProviderAssetRows()
  return {
    ok: true,
    deletedRemoteVectorStores,
    deletedRemoteFiles,
    remoteFailures,
    ...localCleanup,
  }
}

export function listOpenAIProjectVectorStoreIds(projectId = '') {
  const assets = listProjectAssetSnapshot(projectId)
  const remoteId = normalizeId(assets?.vectorStore?.remoteVectorStoreId)
  return remoteId ? [remoteId] : []
}

export function __setOpenAIAssetClientFactoryForTests(factory = null) {
  openAIAssetClientFactory = typeof factory === 'function' ? factory : null
}

export function __resetOpenAIAssetClientFactoryForTests() {
  openAIAssetClientFactory = null
}
