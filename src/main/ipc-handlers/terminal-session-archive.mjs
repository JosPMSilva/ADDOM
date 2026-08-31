import { createRequire } from 'node:module'
import { handleVersioned, sendVersioned } from '../ipc/ipc-versioning.mjs'
import { addNode, findTerminalSummaryNodeBySessionId } from '../memory/memory-store.mjs'
import {
  deleteTerminalSessionArchive,
  getTerminalSessionArchiveBySessionId,
  linkTerminalSessionArchiveMemoryNode,
  listTerminalSessionArchives,
  updateTerminalSessionArchiveCandidate,
} from '../terminal/terminal-session-archive-store.mjs'

const requireForRuntime = createRequire(import.meta.url)

function asTrimmedString(value = '') {
  return String(value || '').trim()
}

function createArchiveError(code = 'terminal_archive_failed', message = code) {
  const error = new Error(asTrimmedString(message) || code)
  error.code = asTrimmedString(code) || 'terminal_archive_failed'
  return error
}

function createIpcErrorPayload(error, fallback = 'terminal_archive_failed') {
  return {
    ok: false,
    error: asTrimmedString(error?.code) || fallback,
    message: asTrimmedString(error?.message || error || fallback),
  }
}

function normalizeTargetScope(value = '', fallback = 'thread') {
  const normalized = asTrimmedString(value).toLowerCase()
  if (normalized === 'thread' || normalized === 'project') return normalized
  return fallback
}

function resolveProjectFolder(payload = {}) {
  return asTrimmedString(payload.projectFolder || payload.projectRoot || '')
}

function buildTerminalMemoryTopic(archive = {}) {
  const label = asTrimmedString(
    archive.sessionTitle
    || archive.displayName
    || archive.displayLabelPrimary
    || archive.sessionId,
  )
  return label ? `Terminal summary: ${label}` : 'Terminal summary'
}

function buildTerminalMemoryContent(archive = {}) {
  const summary = asTrimmedString(archive.memoryCandidateSummary)
  const reason = asTrimmedString(archive.memoryCandidateReason)
  return [
    summary,
    reason ? `Why it matters: ${reason}` : '',
  ].filter(Boolean).join('\n\n')
}

function buildTerminalMemoryTags(archive = {}, { acceptedAt = Date.now() } = {}) {
  const tags = [
    'terminal_summary',
    'terminal_session',
  ]
  const sessionId = asTrimmedString(archive.sessionId)
  const threadId = asTrimmedString(archive.threadId)
  if (sessionId) tags.push(`terminal_session:${sessionId}`)
  if (threadId) tags.push(`terminal_thread:${threadId}`)
  if (Number.isFinite(Number(acceptedAt)) && Number(acceptedAt) > 0) {
    tags.push(`terminal_accepted_at:${Math.round(Number(acceptedAt))}`)
  }
  return tags
}

function ensureArchiveVisible(sessionId = '', projectFolder = '') {
  const archive = getTerminalSessionArchiveBySessionId(sessionId)
  if (!archive) {
    throw createArchiveError(
      'terminal_archive_not_found',
      `Archived terminal session "${asTrimmedString(sessionId)}" was not found.`,
    )
  }
  const normalizedProjectFolder = asTrimmedString(projectFolder)
  if (normalizedProjectFolder && archive.project !== normalizedProjectFolder) {
    throw createArchiveError(
      'terminal_archive_not_found',
      `Archived terminal session "${asTrimmedString(sessionId)}" was not found in this project.`,
    )
  }
  return archive
}

function hasRetainedTerminalMemorySummary(archive = null) {
  return asTrimmedString(archive?.memoryCandidateSummary).length > 0
}

function ensurePendingSuggestion(archive = null) {
  const normalizedArchive = archive && typeof archive === 'object' ? archive : null
  if (!normalizedArchive) {
    throw createArchiveError('terminal_archive_not_found', 'Archived terminal session was not found.')
  }
  if (
    asTrimmedString(normalizedArchive.memoryCandidateStatus).toLowerCase() === 'accepted'
    && asTrimmedString(normalizedArchive.memoryNodeId)
  ) {
    return normalizedArchive
  }
  if (asTrimmedString(normalizedArchive.memoryCandidateStatus).toLowerCase() === 'dismissed') {
    throw createArchiveError(
      'terminal_archive_suggestion_dismissed',
      'This archived terminal suggestion was already dismissed.',
    )
  }
  if (!asTrimmedString(normalizedArchive.memoryCandidateSummary)) {
    throw createArchiveError(
      'terminal_archive_suggestion_missing',
      'This archived terminal session does not have a pending suggestion to save.',
    )
  }
  return normalizedArchive
}

function ensureDismissableSuggestion(archive = null) {
  const normalizedArchive = archive && typeof archive === 'object' ? archive : null
  if (!normalizedArchive) {
    throw createArchiveError('terminal_archive_not_found', 'Archived terminal session was not found.')
  }
  if (
    asTrimmedString(normalizedArchive.memoryCandidateStatus).toLowerCase() === 'accepted'
    && asTrimmedString(normalizedArchive.memoryNodeId)
  ) {
    return normalizedArchive
  }
  if (asTrimmedString(normalizedArchive.memoryCandidateStatus).toLowerCase() === 'dismissed') {
    return normalizedArchive
  }
  if (!asTrimmedString(normalizedArchive.memoryCandidateSummary)) {
    throw createArchiveError(
      'terminal_archive_suggestion_missing',
      'This archived terminal session does not have a pending suggestion to dismiss.',
    )
  }
  return normalizedArchive
}

async function saveTerminalArchiveToMemory(archive = {}, { sender = null, targetScope = 'thread' } = {}) {
  const existingArchive = archive && typeof archive === 'object' ? archive : null
  if (!existingArchive) {
    throw createArchiveError('terminal_archive_not_found', 'Archived terminal session was not found.')
  }
  if (
    asTrimmedString(existingArchive.memoryCandidateStatus).toLowerCase() === 'accepted'
    && asTrimmedString(existingArchive.memoryNodeId)
  ) {
    return existingArchive
  }
  if (!hasRetainedTerminalMemorySummary(existingArchive)) {
    throw createArchiveError(
      'terminal_archive_manual_promotion_unavailable',
      'This archived terminal session does not have a retained summary to save to Memory.',
    )
  }

  const normalizedTargetScope = normalizeTargetScope(targetScope)
  const archiveThreadId = asTrimmedString(existingArchive.threadId)
  if (normalizedTargetScope === 'thread' && !archiveThreadId) {
    throw createArchiveError(
      'terminal_archive_thread_scope_unavailable',
      'This archived terminal session cannot be saved to thread memory because no owning thread was recorded.',
    )
  }

  const acceptedAt = Date.now()
  const reusableNode = findTerminalSummaryNodeBySessionId(existingArchive.project, existingArchive.sessionId, {
    scope: normalizedTargetScope,
    threadId: normalizedTargetScope === 'thread' ? archiveThreadId : '',
  })
  const memoryNodeId = reusableNode?.id || await addNode({
    project: existingArchive.project,
    topic: buildTerminalMemoryTopic(existingArchive),
    content: buildTerminalMemoryContent(existingArchive),
    tags: buildTerminalMemoryTags(existingArchive, { acceptedAt }),
    source: 'terminal_summary',
    dataPolicy: 'standard',
    scope: normalizedTargetScope,
    threadId: normalizedTargetScope === 'thread' ? archiveThreadId : null,
    originThreadId: archiveThreadId || null,
    promotedAt: normalizedTargetScope === 'project' && archiveThreadId ? acceptedAt : null,
  })
  const linkedArchive = linkTerminalSessionArchiveMemoryNode(existingArchive.sessionId, {
    memoryNodeId,
    status: 'accepted',
  })
  if (sender && typeof sender.isDestroyed === 'function' && !sender.isDestroyed()) {
    sendVersioned(sender, 'memory:updated', { count: 1 })
  }
  return linkedArchive
}

export function registerTerminalSessionArchiveHandlers({
  ipcMainImpl = requireForRuntime('electron').ipcMain,
} = {}) {
  handleVersioned(ipcMainImpl, 'terminal:archive:list', async (_event, payload = {}) => {
    try {
      return {
        ok: true,
        archives: listTerminalSessionArchives(resolveProjectFolder(payload), {
          threadId: asTrimmedString(payload.threadId),
          limit: payload.limit,
        }),
        serverTime: Date.now(),
      }
    } catch (error) {
      return createIpcErrorPayload(error)
    }
  })

  handleVersioned(ipcMainImpl, 'terminal:archive:get', async (_event, payload = {}) => {
    try {
      return {
        ok: true,
        archive: ensureArchiveVisible(payload.sessionId, resolveProjectFolder(payload)),
      }
    } catch (error) {
      return createIpcErrorPayload(error)
    }
  })

  handleVersioned(ipcMainImpl, 'terminal:archive:delete', async (_event, payload = {}) => {
    try {
      const existing = ensureArchiveVisible(payload.sessionId, resolveProjectFolder(payload))
      return {
        ok: true,
        sessionId: existing.sessionId,
        deletedArchive: deleteTerminalSessionArchive(existing.sessionId),
      }
    } catch (error) {
      return createIpcErrorPayload(error)
    }
  })

  handleVersioned(ipcMainImpl, 'terminal:archive:dismiss-suggestion', async (_event, payload = {}) => {
    try {
      const existing = ensureDismissableSuggestion(
        ensureArchiveVisible(payload.sessionId, resolveProjectFolder(payload)),
      )
      if (asTrimmedString(existing.memoryCandidateStatus).toLowerCase() === 'accepted' && asTrimmedString(existing.memoryNodeId)) {
        return {
          ok: true,
          archive: existing,
        }
      }
      if (asTrimmedString(existing.memoryCandidateStatus).toLowerCase() === 'dismissed') {
        return {
          ok: true,
          archive: existing,
        }
      }
      return {
        ok: true,
        archive: updateTerminalSessionArchiveCandidate(existing.sessionId, {
          status: 'dismissed',
          summary: existing.memoryCandidateSummary,
          reason: existing.memoryCandidateReason,
        }),
      }
    } catch (error) {
      return createIpcErrorPayload(error)
    }
  })

  handleVersioned(ipcMainImpl, 'terminal:archive:accept-suggestion', async (event, payload = {}) => {
    try {
      const existing = ensurePendingSuggestion(
        ensureArchiveVisible(payload.sessionId, resolveProjectFolder(payload)),
      )
      return {
        ok: true,
        archive: await saveTerminalArchiveToMemory(existing, {
          sender: event?.sender || null,
          targetScope: payload.targetScope,
        }),
      }
    } catch (error) {
      return createIpcErrorPayload(error)
    }
  })

  handleVersioned(ipcMainImpl, 'terminal:archive:save-to-memory', async (event, payload = {}) => {
    try {
      const existing = ensureArchiveVisible(payload.sessionId, resolveProjectFolder(payload))
      return {
        ok: true,
        archive: await saveTerminalArchiveToMemory(existing, {
          sender: event?.sender || null,
          targetScope: payload.targetScope,
        }),
      }
    } catch (error) {
      return createIpcErrorPayload(error)
    }
  })
}
