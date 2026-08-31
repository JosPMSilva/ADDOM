import { getDb } from '../memory/db.mjs'
import {
  deleteOpenAIProjectLocalAssets,
  deleteOpenAIProjectRemoteAssets,
} from '../api-clients/openai-asset-service.mjs'
import {
  cleanupProjectAttachments,
  cleanupThreadAttachments,
} from './workspace-store-cleanup.mjs'
import {
  markProjectGlobalProvenanceRemoved,
  markThreadRecoveryProvenanceDeleted,
} from './workspace-lifecycle-memory.mjs'
import {
  ensureDefaultThreadInternal,
  getProjectByIdInternal,
  getThreadInternal,
  mapProjectRow,
  mapThreadRow,
  now,
} from './workspace-store-utils.mjs'

function deleteRowsForThread(db, table, threadId) {
  return Number(db.prepare(`DELETE FROM ${table} WHERE thread_id = ?`).run(threadId).changes || 0)
}

function deleteRowsForThreadIfTableExists(db, table, threadId) {
  const exists = db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(table)
  return exists ? deleteRowsForThread(db, table, threadId) : 0
}

function deleteRowsForProjectOrThreads(db, table, projectColumn, projectValue, threadIds = []) {
  const normalizedThreadIds = threadIds.map((value) => String(value || '').trim()).filter(Boolean)
  const threadClause = normalizedThreadIds.length > 0
    ? ` OR thread_id IN (${normalizedThreadIds.map(() => '?').join(',')})`
    : ''
  const result = db.prepare(`
    DELETE FROM ${table}
    WHERE ${projectColumn} = ?${threadClause}
  `).run(projectValue, ...normalizedThreadIds)
  return Number(result.changes || 0)
}

function deleteRowsForThreads(db, table, threadIds = []) {
  const normalizedThreadIds = threadIds.map((value) => String(value || '').trim()).filter(Boolean)
  if (normalizedThreadIds.length === 0) return 0
  const result = db.prepare(`
    DELETE FROM ${table}
    WHERE thread_id IN (${normalizedThreadIds.map(() => '?').join(',')})
  `).run(...normalizedThreadIds)
  return Number(result.changes || 0)
}

function deleteRowsForThreadsIfTableExists(db, table, threadIds = []) {
  const exists = db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(table)
  return exists ? deleteRowsForThreads(db, table, threadIds) : 0
}

function removeProjectDatabaseState(db, project) {
  const projectId = String(project.id || '').trim()
  const projectPath = String(project.path || '').trim()
  const threadIds = db.prepare('SELECT id FROM chat_threads WHERE project_id = ?')
    .all(projectId)
    .map((row) => String(row.id || '').trim())
    .filter(Boolean)
  const recovery = markProjectGlobalProvenanceRemoved(db, {
    projectId,
    projectName: project.name,
    projectPath,
  })
  const cleanup = {
    artifacts: Number(db.prepare('DELETE FROM artifacts WHERE project = ?').run(projectPath).changes || 0),
    attachments: deleteRowsForProjectOrThreads(db, 'chat_attachments', 'project_id', projectId, threadIds),
    backgroundJobs: deleteRowsForProjectOrThreads(db, 'openai_background_jobs', 'project_id', projectId, threadIds),
    continuityFacts: deleteRowsForProjectOrThreads(db, 'continuity_facts', 'project', projectPath, threadIds),
    continuityInvariants: deleteRowsForProjectOrThreads(db, 'continuity_invariants', 'project', projectPath, threadIds),
    continuitySnapshots: deleteRowsForProjectOrThreads(db, 'continuity_snapshots', 'project', projectPath, threadIds),
    continuityState: deleteRowsForProjectOrThreads(db, 'thread_continuity_state', 'project', projectPath, threadIds),
    continuityTurns: deleteRowsForProjectOrThreads(db, 'thread_continuity_turns', 'project', projectPath, threadIds),
    agentRuns: deleteRowsForProjectOrThreads(db, 'agent_runs', 'project_id', projectId, threadIds),
    legacyAgentBackups: deleteRowsForThreadsIfTableExists(
      db,
      'moa_transactions_legacy_backup_v21',
      threadIds,
    ),
    openAIThreadState: deleteRowsForProjectOrThreads(db, 'openai_thread_state', 'project_id', projectId, threadIds),
    projectMemory: Number(db.prepare(`
      DELETE FROM nodes
      WHERE scope != 'global' AND (project = ? OR origin_project_id = ?)
    `).run(projectPath, projectId).changes || 0),
    terminalArchives: deleteRowsForProjectOrThreads(db, 'terminal_session_archive', 'project', projectPath, threadIds),
  }
  cleanup.providerAssets = deleteOpenAIProjectLocalAssets(projectId)
  cleanup.events = deleteRowsForThreads(db, 'chat_events', threadIds)
  cleanup.threads = Number(db.prepare('DELETE FROM chat_threads WHERE project_id = ?').run(projectId).changes || 0)
  cleanup.agentMemory = Number(db.prepare('DELETE FROM moa_agent_memory WHERE project_id = ?').run(projectId).changes || 0)
  cleanup.projects = Number(db.prepare('DELETE FROM workspace_projects WHERE id = ?').run(projectId).changes || 0)
  if (cleanup.projects !== 1) throw new Error('Project removal did not delete the workspace project.')
  return { cleanup, projectId, projectPath, recovery, threadIds }
}

function deleteThreadDatabaseState(db, { threadId, threadTitle, deletedAt }) {
  const thread = getThreadInternal(db, threadId)
  if (!thread || !!thread.archived) throw new Error('Thread not found.')
  const project = getProjectByIdInternal(db, thread.project_id)
  if (!project) throw new Error('Project not found.')

  const recovery = markThreadRecoveryProvenanceDeleted(db, {
    threadId,
    threadTitle,
    deletedAt,
  })
  const cleanup = {
    backgroundJobs: deleteRowsForThread(db, 'openai_background_jobs', threadId),
    continuityFacts: deleteRowsForThread(db, 'continuity_facts', threadId),
    continuityInvariants: deleteRowsForThread(db, 'continuity_invariants', threadId),
    continuitySnapshots: deleteRowsForThread(db, 'continuity_snapshots', threadId),
    continuityState: deleteRowsForThread(db, 'thread_continuity_state', threadId),
    continuityTurns: deleteRowsForThread(db, 'thread_continuity_turns', threadId),
    agentRuns: deleteRowsForThread(db, 'agent_runs', threadId),
    legacyAgentBackups: deleteRowsForThreadIfTableExists(
      db,
      'moa_transactions_legacy_backup_v21',
      threadId,
    ),
    openAIThreadState: deleteRowsForThread(db, 'openai_thread_state', threadId),
    terminalArchives: deleteRowsForThread(db, 'terminal_session_archive', threadId),
  }
  const providerFiles = db.prepare(`
    UPDATE provider_files
    SET thread_id = '', attachment_id = '', updated_at = ?
    WHERE thread_id = ?
  `).run(deletedAt, threadId)
  const providerVectorStores = db.prepare(`
    UPDATE provider_vector_stores
    SET thread_id = '', updated_at = ?
    WHERE thread_id = ?
  `).run(deletedAt, threadId)
  cleanup.providerFiles = Number(providerFiles.changes || 0)
  cleanup.providerVectorStores = Number(providerVectorStores.changes || 0)

  const deletedEvents = deleteRowsForThread(db, 'chat_events', threadId)
  deleteRowsForThread(db, 'chat_attachments', threadId)
  const deletedThreads = Number(db.prepare('DELETE FROM chat_threads WHERE id = ?').run(threadId).changes || 0)

  let activeThread = null
  const currentActiveId = String(project.active_thread_id || '').trim()
  if (currentActiveId === threadId || !currentActiveId) {
    db.prepare('UPDATE workspace_projects SET active_thread_id = NULL, last_opened_at = ? WHERE id = ?')
      .run(now(), thread.project_id)
    activeThread = ensureDefaultThreadInternal(db, thread.project_id)
  } else {
    const activeRow = db.prepare(`
      SELECT * FROM chat_threads
      WHERE id = ? AND project_id = ? AND archived = 0
    `).get(currentActiveId, thread.project_id)
    activeThread = activeRow ? mapThreadRow(activeRow) : ensureDefaultThreadInternal(db, thread.project_id)
  }

  return {
    activeThread,
    cleanup,
    deletedEvents,
    deletedThreadId: threadId,
    deletedThreads,
    project: mapProjectRow(getProjectByIdInternal(db, thread.project_id)),
    projectId: thread.project_id,
    recovery,
  }
}

export async function deleteWorkspaceThread(threadId) {
  const normalizedThreadId = String(threadId || '').trim()
  if (!normalizedThreadId) throw new Error('threadId is required.')
  const db = getDb()
  const thread = getThreadInternal(db, normalizedThreadId)
  if (!thread || !!thread.archived) throw new Error('Thread not found.')
  if (!getProjectByIdInternal(db, thread.project_id)) throw new Error('Project not found.')

  const threadTitle = String(thread.title || '').trim()
  const deletedAt = Date.now()
  const attachmentCleanup = await cleanupThreadAttachments(normalizedThreadId)
  if (!attachmentCleanup?.ok) throw new Error('Thread attachment cleanup failed.')

  const tx = db.transaction(() => deleteThreadDatabaseState(db, {
    threadId: normalizedThreadId,
    threadTitle,
    deletedAt,
  }))
  const result = tx()
  return {
    ok: true,
    ...result,
    attachmentCleanup,
  }
}

export async function removeWorkspaceProject(projectId) {
  const normalizedProjectId = String(projectId || '').trim()
  if (!normalizedProjectId) throw new Error('projectId is required.')
  const db = getDb()
  const project = getProjectByIdInternal(db, normalizedProjectId)
  if (!project) throw new Error('Project not found.')

  const remoteCleanup = await deleteOpenAIProjectRemoteAssets(normalizedProjectId)
  if (!remoteCleanup.ok) {
    return {
      ok: false,
      error: 'Remote project asset cleanup failed. Retry removal.',
      errorCode: 'remote_cleanup_failed',
      projectId: normalizedProjectId,
      remoteFailures: remoteCleanup.remoteFailures || [],
      retryable: true,
    }
  }

  let result
  try {
    result = db.transaction(() => removeProjectDatabaseState(db, project))()
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || 'Local project cleanup failed.'),
      errorCode: 'local_cleanup_failed',
      projectId: normalizedProjectId,
      remoteCleanup,
      retryable: true,
    }
  }

  return {
    ok: true,
    deletedProjectId: result.projectId,
    deletedProjectName: String(project.name || ''),
    deletedProjectPath: result.projectPath,
    cleanup: result.cleanup,
    remoteCleanup,
    recovery: result.recovery,
    attachmentCleanup: await cleanupProjectAttachments(normalizedProjectId),
  }
}
