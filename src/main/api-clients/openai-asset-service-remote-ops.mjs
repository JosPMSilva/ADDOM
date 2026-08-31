import fs from 'node:fs'
import { toFile } from 'openai'

export function createOpenAIAssetRemoteOperations({
  constants = {},
  now,
  store = {},
  utils = {},
  buildRemoteCleanupFailure,
} = {}) {
  const {
    OPENAI_FILE_PURPOSE = 'user_data',
    DIRECT_UPLOAD_MAX_BYTES = 64 * 1024 * 1024,
    UPLOAD_PART_MAX_BYTES = 64 * 1024 * 1024,
  } = constants
  const {
    getVectorStoreRecordById,
    updateProviderFileRecord,
    upsertVectorStoreRecord,
    upsertVectorStoreFileLink,
  } = store
  const {
    normalizeId,
    normalizeStatus,
    createRemoteSummary,
  } = utils

  async function deleteRemoteVectorStoreIfPresent(client, vectorStoreRecord, failures = []) {
    const remoteVectorStoreId = normalizeId(vectorStoreRecord?.remoteVectorStoreId)
    if (!client || !remoteVectorStoreId) return false
    try {
      await client.vectorStores.delete(remoteVectorStoreId)
      return true
    } catch (error) {
      if (Number(error?.status || 0) === 404) return false
      failures.push(buildRemoteCleanupFailure('vector_store', remoteVectorStoreId, error))
      return false
    }
  }

  async function deleteRemoteFileIfPresent(client, fileRecord, failures = []) {
    const remoteFileId = normalizeId(fileRecord?.remoteFileId)
    if (!client || !remoteFileId) return false
    try {
      await client.files.delete(remoteFileId)
      return true
    } catch (error) {
      if (Number(error?.status || 0) === 404) return false
      failures.push(buildRemoteCleanupFailure('file', remoteFileId, error))
      return false
    }
  }

  async function uploadViaFilesApi(client, descriptor) {
    const file = await toFile(
      await fs.promises.readFile(descriptor.path),
      descriptor.fileName,
      { type: descriptor.mimeType },
    )
    return client.files.create({
      file,
      purpose: OPENAI_FILE_PURPOSE,
    })
  }

  async function uploadViaUploadsApi(client, descriptor) {
    const upload = await client.uploads.create({
      bytes: descriptor.sizeBytes,
      filename: descriptor.fileName,
      mime_type: descriptor.mimeType,
      purpose: OPENAI_FILE_PURPOSE,
    })

    const partIds = []
    const handle = await fs.promises.open(descriptor.path, 'r')
    try {
      let offset = 0
      while (offset < descriptor.sizeBytes) {
        const chunkSize = Math.min(UPLOAD_PART_MAX_BYTES, descriptor.sizeBytes - offset)
        const buffer = Buffer.allocUnsafe(chunkSize)
        const { bytesRead } = await handle.read(buffer, 0, chunkSize, offset)
        if (bytesRead <= 0) break
        const partFile = await toFile(
          buffer.subarray(0, bytesRead),
          `${descriptor.fileName}.part-${partIds.length + 1}`,
          { type: descriptor.mimeType },
        )
        const part = await client.uploads.parts.create(upload.id, {
          data: partFile,
        })
        partIds.push(part.id)
        offset += bytesRead
      }
    } catch (error) {
      try {
        await client.uploads.cancel(upload.id)
      } catch {
        // Best-effort cleanup only.
      }
      throw error
    } finally {
      await handle.close()
    }

    const completed = await client.uploads.complete(upload.id, {
      part_ids: partIds,
    })
    if (!completed?.file?.id) {
      throw new Error('OpenAI upload completed without a file id.')
    }
    return completed.file
  }

  async function uploadFileToOpenAI(client, descriptor) {
    if (descriptor.sizeBytes > DIRECT_UPLOAD_MAX_BYTES) {
      return uploadViaUploadsApi(client, descriptor)
    }
    return uploadViaFilesApi(client, descriptor)
  }

  async function ensureRemoteFileActive(client, record) {
    if (!record?.remoteFileId) return null
    try {
      return await client.files.retrieve(record.remoteFileId)
    } catch (error) {
      if (Number(error?.status || 0) === 404) return null
      throw error
    }
  }

  async function ensureRemoteVectorStoreActive(client, record) {
    if (!record?.remoteVectorStoreId) return null
    try {
      return await client.vectorStores.retrieve(record.remoteVectorStoreId)
    } catch (error) {
      if (Number(error?.status || 0) === 404) return null
      throw error
    }
  }

  async function syncProviderFileRecord(client, record) {
    if (!record?.remoteFileId) return record
    const remoteFile = await ensureRemoteFileActive(client, record)
    if (!remoteFile) {
      return updateProviderFileRecord(record.id, {
        status: 'deleted_remote',
        deletedRemoteAt: now(),
        metadata: {
          ...record.metadata,
          remote: null,
        },
      })
    }
    return updateProviderFileRecord(record.id, {
      fileName: normalizeId(remoteFile.filename) || record.fileName,
      sizeBytes: Number(remoteFile.bytes || 0) || record.sizeBytes,
      purpose: normalizeId(remoteFile.purpose) || record.purpose,
      status: normalizeStatus(remoteFile.status, record.status || 'uploaded'),
      deletedRemoteAt: 0,
      metadata: {
        ...record.metadata,
        remote: createRemoteSummary(remoteFile),
      },
    })
  }

  async function syncVectorStoreRecord(client, record) {
    if (!record?.remoteVectorStoreId) return record
    const remoteVectorStore = await ensureRemoteVectorStoreActive(client, record)
    if (!remoteVectorStore) {
      return upsertVectorStoreRecord({
        existingRecord: record,
        projectId: record.projectId,
        name: record.name,
        remoteVectorStoreId: '',
        status: 'deleted_remote',
        metadata: {
          ...record.metadata,
          remote: null,
        },
      })
    }
    return upsertVectorStoreRecord({
      existingRecord: record,
      projectId: record.projectId,
      name: normalizeId(remoteVectorStore.name) || record.name,
      remoteVectorStoreId: remoteVectorStore.id,
      status: normalizeStatus(remoteVectorStore.status, record.status || 'completed'),
      metadata: {
        ...record.metadata,
        remote: createRemoteSummary(remoteVectorStore),
      },
    })
  }

  async function syncVectorStoreFileLink(client, link) {
    if (!link?.remoteVectorStoreFileId) return link
    const vectorStoreRecord = getVectorStoreRecordById(link.vectorStoreRecordId)
    if (!vectorStoreRecord?.remoteVectorStoreId) return link
    try {
      const remoteLink = await client.vectorStores.files.retrieve(link.remoteVectorStoreFileId, {
        vector_store_id: vectorStoreRecord.remoteVectorStoreId,
      })
      return upsertVectorStoreFileLink({
        existingLink: link,
        vectorStoreRecordId: link.vectorStoreRecordId,
        providerFileRecordId: link.providerFileRecordId,
        remoteVectorStoreFileId: remoteLink.id,
        status: normalizeStatus(remoteLink.status, link.status || 'completed'),
        attributes: remoteLink.attributes || {},
      })
    } catch (error) {
      if (Number(error?.status || 0) === 404) {
        return upsertVectorStoreFileLink({
          existingLink: link,
          vectorStoreRecordId: link.vectorStoreRecordId,
          providerFileRecordId: link.providerFileRecordId,
          remoteVectorStoreFileId: '',
          status: 'deleted_remote',
          attributes: link.attributes || {},
        })
      }
      throw error
    }
  }

  return {
    deleteRemoteVectorStoreIfPresent,
    deleteRemoteFileIfPresent,
    uploadFileToOpenAI,
    ensureRemoteFileActive,
    ensureRemoteVectorStoreActive,
    syncProviderFileRecord,
    syncVectorStoreRecord,
    syncVectorStoreFileLink,
  }
}
