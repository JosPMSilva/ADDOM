export function createOpenAIAssetStore({
  crypto,
  getDb,
  now,
  constants,
  utils,
}) {
  const {
    OPENAI_PROVIDER_ID,
    OPENAI_FILE_PURPOSE,
    VECTOR_STORE_SCOPE,
    VECTOR_STORE_RETENTION_POLICY,
    FILE_RETENTION_POLICY,
  } = constants
  const {
    normalizeId,
    normalizeLowerId,
    parseJson,
    stringifyJson,
    normalizeStatus,
    resolveProjectVectorStoreName,
  } = utils

  function mapProviderFileRow(row = null) {
    if (!row || typeof row !== 'object') return null
    return {
      id: normalizeId(row.id),
      providerId: normalizeLowerId(row.provider_id),
      projectId: normalizeId(row.project_id),
      threadId: normalizeId(row.thread_id),
      attachmentId: normalizeId(row.attachment_id),
      localPath: normalizeId(row.local_path),
      sha256: normalizeId(row.sha256),
      fileName: normalizeId(row.file_name),
      mimeType: normalizeId(row.mime_type),
      sizeBytes: Number(row.size_bytes || 0) || 0,
      remoteFileId: normalizeId(row.remote_file_id),
      purpose: normalizeId(row.purpose) || OPENAI_FILE_PURPOSE,
      status: normalizeStatus(row.status, 'pending'),
      retentionPolicy: normalizeId(row.retention_policy) || FILE_RETENTION_POLICY,
      createdAt: Number(row.created_at || 0) || 0,
      updatedAt: Number(row.updated_at || 0) || 0,
      lastUsedAt: Number(row.last_used_at || 0) || 0,
      deletedRemoteAt: Number(row.deleted_remote_at || 0) || 0,
      metadata: parseJson(row.metadata_json),
    }
  }

  function mapVectorStoreRow(row = null) {
    if (!row || typeof row !== 'object') return null
    return {
      id: normalizeId(row.id),
      providerId: normalizeLowerId(row.provider_id),
      projectId: normalizeId(row.project_id),
      threadId: normalizeId(row.thread_id),
      scope: normalizeId(row.scope) || VECTOR_STORE_SCOPE,
      name: normalizeId(row.name),
      remoteVectorStoreId: normalizeId(row.remote_vector_store_id),
      status: normalizeStatus(row.status, 'pending'),
      retentionPolicy: normalizeId(row.retention_policy) || VECTOR_STORE_RETENTION_POLICY,
      createdAt: Number(row.created_at || 0) || 0,
      updatedAt: Number(row.updated_at || 0) || 0,
      lastUsedAt: Number(row.last_used_at || 0) || 0,
      metadata: parseJson(row.metadata_json),
    }
  }

  function mapVectorStoreFileRow(row = null) {
    if (!row || typeof row !== 'object') return null
    return {
      id: normalizeId(row.id),
      providerId: normalizeLowerId(row.provider_id),
      vectorStoreRecordId: normalizeId(row.vector_store_record_id),
      providerFileRecordId: normalizeId(row.provider_file_record_id),
      remoteVectorStoreFileId: normalizeId(row.remote_vector_store_file_id),
      status: normalizeStatus(row.status, 'pending'),
      attributes: parseJson(row.attributes_json),
      createdAt: Number(row.created_at || 0) || 0,
      updatedAt: Number(row.updated_at || 0) || 0,
      lastUsedAt: Number(row.last_used_at || 0) || 0,
    }
  }

  function getProviderFileRecordById(assetId = '') {
    const normalizedAssetId = normalizeId(assetId)
    if (!normalizedAssetId) return null
    const db = getDb()
    const row = db.prepare(`
      SELECT *
      FROM provider_files
      WHERE provider_id = ? AND id = ?
      LIMIT 1
    `).get(OPENAI_PROVIDER_ID, normalizedAssetId)
    return mapProviderFileRow(row)
  }

  function getVectorStoreRecordById(vectorStoreRecordId = '') {
    const normalizedVectorStoreRecordId = normalizeId(vectorStoreRecordId)
    if (!normalizedVectorStoreRecordId) return null
    const db = getDb()
    const row = db.prepare(`
      SELECT *
      FROM provider_vector_stores
      WHERE provider_id = ? AND id = ?
      LIMIT 1
    `).get(OPENAI_PROVIDER_ID, normalizedVectorStoreRecordId)
    return mapVectorStoreRow(row)
  }

  function listProjectProviderFiles(projectId = '') {
    const normalizedProjectId = normalizeId(projectId)
    if (!normalizedProjectId) return []
    const db = getDb()
    const rows = db.prepare(`
      SELECT *
      FROM provider_files
      WHERE provider_id = ? AND project_id = ?
      ORDER BY updated_at DESC, created_at DESC
    `).all(OPENAI_PROVIDER_ID, normalizedProjectId)
    return rows.map(mapProviderFileRow).filter(Boolean)
  }

  function listThreadProviderFiles(threadId = '') {
    const normalizedThreadId = normalizeId(threadId)
    if (!normalizedThreadId) return []
    const db = getDb()
    const rows = db.prepare(`
      SELECT *
      FROM provider_files
      WHERE provider_id = ? AND thread_id = ?
      ORDER BY updated_at DESC, created_at DESC
    `).all(OPENAI_PROVIDER_ID, normalizedThreadId)
    return rows.map(mapProviderFileRow).filter(Boolean)
  }

  function listAllProviderFiles() {
    const db = getDb()
    const rows = db.prepare(`
      SELECT *
      FROM provider_files
      WHERE provider_id = ?
      ORDER BY updated_at DESC, created_at DESC
    `).all(OPENAI_PROVIDER_ID)
    return rows.map(mapProviderFileRow).filter(Boolean)
  }

  function listProjectVectorStoreFileLinks(vectorStoreRecordId = '') {
    const normalizedVectorStoreRecordId = normalizeId(vectorStoreRecordId)
    if (!normalizedVectorStoreRecordId) return []
    const db = getDb()
    const rows = db.prepare(`
      SELECT *
      FROM provider_vector_store_files
      WHERE provider_id = ? AND vector_store_record_id = ?
      ORDER BY updated_at DESC, created_at DESC
    `).all(OPENAI_PROVIDER_ID, normalizedVectorStoreRecordId)
    return rows.map(mapVectorStoreFileRow).filter(Boolean)
  }

  function listProjectVectorStore(projectId = '') {
    const normalizedProjectId = normalizeId(projectId)
    if (!normalizedProjectId) return null
    const db = getDb()
    const row = db.prepare(`
      SELECT *
      FROM provider_vector_stores
      WHERE provider_id = ? AND project_id = ? AND scope = ?
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `).get(OPENAI_PROVIDER_ID, normalizedProjectId, VECTOR_STORE_SCOPE)
    return mapVectorStoreRow(row)
  }

  function listAllVectorStoreRecords() {
    const db = getDb()
    const rows = db.prepare(`
      SELECT *
      FROM provider_vector_stores
      WHERE provider_id = ?
      ORDER BY updated_at DESC, created_at DESC
    `).all(OPENAI_PROVIDER_ID)
    return rows.map(mapVectorStoreRow).filter(Boolean)
  }

  function getVectorStoreFileLink(vectorStoreRecordId = '', providerFileRecordId = '') {
    const normalizedVectorStoreRecordId = normalizeId(vectorStoreRecordId)
    const normalizedProviderFileRecordId = normalizeId(providerFileRecordId)
    if (!normalizedVectorStoreRecordId || !normalizedProviderFileRecordId) return null
    const row = getDb().prepare(`
      SELECT *
      FROM provider_vector_store_files
      WHERE provider_id = ?
        AND vector_store_record_id = ?
        AND provider_file_record_id = ?
      LIMIT 1
    `).get(
      OPENAI_PROVIDER_ID,
      normalizedVectorStoreRecordId,
      normalizedProviderFileRecordId,
    )
    return mapVectorStoreFileRow(row)
  }

  function updateProviderFileRecord(recordId = '', patch = {}) {
    const normalizedRecordId = normalizeId(recordId)
    if (!normalizedRecordId) return null
    const current = getProviderFileRecordById(normalizedRecordId)
    if (!current) return null
    const touchedAt = now()
    const next = {
      ...current,
      ...patch,
      metadata: patch.metadata && typeof patch.metadata === 'object'
        ? patch.metadata
        : current.metadata,
      updatedAt: touchedAt,
      lastUsedAt: patch.touchLastUsed === false ? current.lastUsedAt : touchedAt,
    }
    const db = getDb()
    db.prepare(`
      UPDATE provider_files
      SET thread_id = ?,
          attachment_id = ?,
          local_path = ?,
          sha256 = ?,
          file_name = ?,
          mime_type = ?,
          size_bytes = ?,
          remote_file_id = ?,
          purpose = ?,
          status = ?,
          retention_policy = ?,
          updated_at = ?,
          last_used_at = ?,
          deleted_remote_at = ?,
          metadata_json = ?
      WHERE provider_id = ? AND id = ?
    `).run(
      normalizeId(next.threadId),
      normalizeId(next.attachmentId),
      normalizeId(next.localPath),
      normalizeId(next.sha256),
      normalizeId(next.fileName),
      normalizeId(next.mimeType),
      Number(next.sizeBytes || 0) || 0,
      normalizeId(next.remoteFileId),
      normalizeId(next.purpose) || OPENAI_FILE_PURPOSE,
      normalizeStatus(next.status, 'pending'),
      normalizeId(next.retentionPolicy) || FILE_RETENTION_POLICY,
      Number(next.updatedAt || 0) || touchedAt,
      Number(next.lastUsedAt || 0) || touchedAt,
      Number(next.deletedRemoteAt || 0) || 0,
      stringifyJson(next.metadata),
      OPENAI_PROVIDER_ID,
      normalizedRecordId,
    )
    return getProviderFileRecordById(normalizedRecordId)
  }

  function insertProviderFileRecord({
    projectId = '',
    threadId = '',
    attachmentId = '',
    localPath = '',
    sha256 = '',
    fileName = '',
    mimeType = '',
    sizeBytes = 0,
    remoteFileId = '',
    purpose = OPENAI_FILE_PURPOSE,
    status = 'uploaded',
    retentionPolicy = FILE_RETENTION_POLICY,
    metadata = {},
  } = {}) {
    const timestamp = now()
    const recordId = `opf_${crypto.randomUUID()}`
    const db = getDb()
    db.prepare(`
      INSERT INTO provider_files (
        id,
        provider_id,
        project_id,
        thread_id,
        attachment_id,
        local_path,
        sha256,
        file_name,
        mime_type,
        size_bytes,
        remote_file_id,
        purpose,
        status,
        retention_policy,
        created_at,
        updated_at,
        last_used_at,
        deleted_remote_at,
        metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      recordId,
      OPENAI_PROVIDER_ID,
      normalizeId(projectId),
      normalizeId(threadId),
      normalizeId(attachmentId),
      normalizeId(localPath),
      normalizeId(sha256),
      normalizeId(fileName),
      normalizeId(mimeType),
      Number(sizeBytes || 0) || 0,
      normalizeId(remoteFileId),
      normalizeId(purpose) || OPENAI_FILE_PURPOSE,
      normalizeStatus(status, 'uploaded'),
      normalizeId(retentionPolicy) || FILE_RETENTION_POLICY,
      timestamp,
      timestamp,
      timestamp,
      0,
      stringifyJson(metadata),
    )
    return getProviderFileRecordById(recordId)
  }

  function upsertVectorStoreRecord({
    existingRecord = null,
    projectId = '',
    name = '',
    remoteVectorStoreId = '',
    status = 'completed',
    metadata = {},
  } = {}) {
    const timestamp = now()
    const db = getDb()
    if (existingRecord?.id) {
      db.prepare(`
        UPDATE provider_vector_stores
        SET name = ?,
            remote_vector_store_id = ?,
            status = ?,
            retention_policy = ?,
            updated_at = ?,
            last_used_at = ?,
            metadata_json = ?
        WHERE provider_id = ? AND id = ?
      `).run(
        normalizeId(name) || existingRecord.name || resolveProjectVectorStoreName(projectId),
        normalizeId(remoteVectorStoreId),
        normalizeStatus(status, 'completed'),
        VECTOR_STORE_RETENTION_POLICY,
        timestamp,
        timestamp,
        stringifyJson(metadata),
        OPENAI_PROVIDER_ID,
        existingRecord.id,
      )
      return getVectorStoreRecordById(existingRecord.id)
    }

    const recordId = `ovs_${crypto.randomUUID()}`
    db.prepare(`
      INSERT INTO provider_vector_stores (
        id,
        provider_id,
        project_id,
        thread_id,
        scope,
        name,
        remote_vector_store_id,
        status,
        retention_policy,
        created_at,
        updated_at,
        last_used_at,
        metadata_json
      ) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      recordId,
      OPENAI_PROVIDER_ID,
      normalizeId(projectId),
      VECTOR_STORE_SCOPE,
      normalizeId(name) || resolveProjectVectorStoreName(projectId),
      normalizeId(remoteVectorStoreId),
      normalizeStatus(status, 'completed'),
      VECTOR_STORE_RETENTION_POLICY,
      timestamp,
      timestamp,
      timestamp,
      stringifyJson(metadata),
    )
    return getVectorStoreRecordById(recordId)
  }

  function upsertVectorStoreFileLink({
    existingLink = null,
    vectorStoreRecordId = '',
    providerFileRecordId = '',
    remoteVectorStoreFileId = '',
    status = 'completed',
    attributes = {},
  } = {}) {
    const timestamp = now()
    const db = getDb()
    const targetId = existingLink?.id || `ovf_${crypto.randomUUID()}`
    db.prepare(`
      INSERT INTO provider_vector_store_files (
        id,
        provider_id,
        vector_store_record_id,
        provider_file_record_id,
        remote_vector_store_file_id,
        status,
        attributes_json,
        created_at,
        updated_at,
        last_used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        vector_store_record_id = excluded.vector_store_record_id,
        provider_file_record_id = excluded.provider_file_record_id,
        remote_vector_store_file_id = excluded.remote_vector_store_file_id,
        status = excluded.status,
        attributes_json = excluded.attributes_json,
        updated_at = excluded.updated_at,
        last_used_at = excluded.last_used_at
    `).run(
      targetId,
      OPENAI_PROVIDER_ID,
      normalizeId(vectorStoreRecordId),
      normalizeId(providerFileRecordId),
      normalizeId(remoteVectorStoreFileId),
      normalizeStatus(status, 'completed'),
      stringifyJson(attributes),
      existingLink?.createdAt || timestamp,
      timestamp,
      timestamp,
    )
    const row = getDb().prepare(`
      SELECT *
      FROM provider_vector_store_files
      WHERE provider_id = ? AND id = ?
      LIMIT 1
    `).get(OPENAI_PROVIDER_ID, targetId)
    return mapVectorStoreFileRow(row)
  }

  function listProjectAssetSnapshot(projectId = '') {
    const normalizedProjectId = normalizeId(projectId)
    if (!normalizedProjectId) {
      return {
        projectId: '',
        providerId: OPENAI_PROVIDER_ID,
        files: [],
        vectorStore: null,
        vectorStoreFiles: [],
        remotePhaseReady: true,
      }
    }
    const vectorStore = listProjectVectorStore(normalizedProjectId)
    return {
      projectId: normalizedProjectId,
      providerId: OPENAI_PROVIDER_ID,
      files: listProjectProviderFiles(normalizedProjectId),
      vectorStore,
      vectorStoreFiles: vectorStore ? listProjectVectorStoreFileLinks(vectorStore.id) : [],
      remotePhaseReady: true,
    }
  }

  function clearThreadProviderFileAssociations(threadId = '') {
    const normalizedThreadId = normalizeId(threadId)
    if (!normalizedThreadId) {
      return {
        ok: false,
        threadId: '',
        updatedFiles: 0,
      }
    }
    const timestamp = now()
    const result = getDb().prepare(`
      UPDATE provider_files
      SET thread_id = '',
          attachment_id = '',
          updated_at = ?
      WHERE provider_id = ? AND thread_id = ?
    `).run(timestamp, OPENAI_PROVIDER_ID, normalizedThreadId)
    return {
      ok: true,
      threadId: normalizedThreadId,
      updatedFiles: Number(result?.changes || 0),
    }
  }

  function deleteProjectProviderAssetRows(projectId = '') {
    const normalizedProjectId = normalizeId(projectId)
    if (!normalizedProjectId) {
      return {
        ok: false,
        projectId: '',
        deletedFiles: 0,
        deletedVectorStores: 0,
        deletedVectorStoreFiles: 0,
      }
    }
    const db = getDb()
    const deleteVectorStoreFiles = db.prepare(`
      DELETE FROM provider_vector_store_files
      WHERE provider_id = ?
        AND (
          vector_store_record_id IN (
            SELECT id
            FROM provider_vector_stores
            WHERE provider_id = ? AND project_id = ?
          )
          OR provider_file_record_id IN (
            SELECT id
            FROM provider_files
            WHERE provider_id = ? AND project_id = ?
          )
        )
    `).run(
      OPENAI_PROVIDER_ID,
      OPENAI_PROVIDER_ID,
      normalizedProjectId,
      OPENAI_PROVIDER_ID,
      normalizedProjectId,
    )
    const deleteVectorStores = db.prepare(`
      DELETE FROM provider_vector_stores
      WHERE provider_id = ? AND project_id = ?
    `).run(OPENAI_PROVIDER_ID, normalizedProjectId)
    const deleteFiles = db.prepare(`
      DELETE FROM provider_files
      WHERE provider_id = ? AND project_id = ?
    `).run(OPENAI_PROVIDER_ID, normalizedProjectId)
    return {
      ok: true,
      projectId: normalizedProjectId,
      deletedFiles: Number(deleteFiles?.changes || 0),
      deletedVectorStores: Number(deleteVectorStores?.changes || 0),
      deletedVectorStoreFiles: Number(deleteVectorStoreFiles?.changes || 0),
    }
  }

  function deleteAllProviderAssetRows() {
    const db = getDb()
    const deleteVectorStoreFiles = db.prepare(`
      DELETE FROM provider_vector_store_files
      WHERE provider_id = ?
    `).run(OPENAI_PROVIDER_ID)
    const deleteVectorStores = db.prepare(`
      DELETE FROM provider_vector_stores
      WHERE provider_id = ?
    `).run(OPENAI_PROVIDER_ID)
    const deleteFiles = db.prepare(`
      DELETE FROM provider_files
      WHERE provider_id = ?
    `).run(OPENAI_PROVIDER_ID)
    return {
      ok: true,
      deletedFiles: Number(deleteFiles?.changes || 0),
      deletedVectorStores: Number(deleteVectorStores?.changes || 0),
      deletedVectorStoreFiles: Number(deleteVectorStoreFiles?.changes || 0),
    }
  }

  return {
    mapProviderFileRow,
    mapVectorStoreRow,
    mapVectorStoreFileRow,
    getProviderFileRecordById,
    getVectorStoreRecordById,
    listProjectProviderFiles,
    listThreadProviderFiles,
    listAllProviderFiles,
    listProjectVectorStoreFileLinks,
    listProjectVectorStore,
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
  }
}
