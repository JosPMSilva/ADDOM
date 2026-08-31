export function markThreadRecoveryProvenanceDeleted(db, {
  threadId = '',
  threadTitle = '',
  deletedAt = Date.now(),
} = {}) {
  const normalizedThreadId = String(threadId || '').trim()
  if (!normalizedThreadId) throw new Error('threadId is required.')
  const normalizedTitle = String(threadTitle || '').trim()
  const timestamp = Math.max(1, Number(deletedAt) || Date.now())

  const memoryResult = db.prepare(`
    UPDATE nodes
    SET origin_thread_id = COALESCE(NULLIF(origin_thread_id, ''), ?),
        origin_thread_title = ?,
        origin_thread_state = 'deleted',
        origin_thread_deleted_at = ?,
        updated_at = ?
    WHERE origin_thread_id = ? OR thread_id = ?
  `).run(
    normalizedThreadId,
    normalizedTitle,
    timestamp,
    timestamp,
    normalizedThreadId,
    normalizedThreadId,
  )
  const artifactResult = db.prepare(`
    UPDATE artifacts
    SET origin_thread_title = ?,
        origin_thread_state = 'deleted',
        origin_thread_deleted_at = ?
    WHERE origin_thread_id = ?
  `).run(normalizedTitle, timestamp, normalizedThreadId)

  return {
    deletedAt: timestamp,
    preservedArtifacts: Number(artifactResult.changes || 0),
    preservedMemory: Number(memoryResult.changes || 0),
    threadId: normalizedThreadId,
    threadTitle: normalizedTitle,
  }
}

export function markProjectGlobalProvenanceRemoved(db, {
  projectId = '',
  projectName = '',
  projectPath = '',
  removedAt = Date.now(),
} = {}) {
  const normalizedProjectId = String(projectId || '').trim()
  if (!normalizedProjectId) throw new Error('projectId is required.')
  const timestamp = Math.max(1, Number(removedAt) || Date.now())
  const result = db.prepare(`
    UPDATE nodes
    SET origin_project_id = NULL,
        origin_project_name = CASE
          WHEN TRIM(origin_project_name) = '' THEN ?
          ELSE origin_project_name
        END,
        origin_project_path = CASE
          WHEN TRIM(origin_project_path) = '' THEN ?
          ELSE origin_project_path
        END,
        origin_project_state = 'removed',
        origin_project_removed_at = ?,
        updated_at = ?
    WHERE scope = 'global' AND origin_project_id = ?
  `).run(
    String(projectName || '').trim(),
    String(projectPath || '').trim(),
    timestamp,
    timestamp,
    normalizedProjectId,
  )
  return {
    preservedGlobalMemory: Number(result.changes || 0),
    projectId: normalizedProjectId,
    removedAt: timestamp,
  }
}
