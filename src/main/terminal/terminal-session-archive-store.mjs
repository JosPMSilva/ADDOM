import crypto from 'node:crypto'
import { getDb } from '../memory/db.mjs'

export const TERMINAL_SESSION_ARCHIVE_STATUSES = Object.freeze([
  'ended',
  'terminated',
  'failed',
])

export const TERMINAL_SESSION_ARCHIVE_FAILURE_REASONS = Object.freeze([
  '',
  'approval_expired',
  'policy_blocked',
  'renderer_detached',
  'process_crashed',
])

export const DEFAULT_TERMINAL_ARCHIVE_MAX_TAIL_CHARS = 24_000
export const DEFAULT_TERMINAL_ARCHIVE_MAX_TAIL_CHUNKS = 200
export const DEFAULT_TERMINAL_ARCHIVE_MAX_PAYLOAD_ROWS_PER_PROJECT = 50
export const DEFAULT_TERMINAL_ARCHIVE_MAX_PAYLOAD_BYTES_PER_PROJECT = 2_000_000

const TERMINAL_ARCHIVE_STATUS_SET = new Set(TERMINAL_SESSION_ARCHIVE_STATUSES)
const TERMINAL_ARCHIVE_FAILURE_REASON_SET = new Set(TERMINAL_SESSION_ARCHIVE_FAILURE_REASONS)

function nanoid() {
  return crypto.randomUUID()
}

function asTrimmedString(value = '') {
  return String(value || '').trim()
}

function normalizeProjectKey(project = '') {
  return asTrimmedString(project)
}

function normalizeOptionalInteger(value, fallback = null) {
  if (value === '' || value === null || value === undefined) return fallback
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.round(n)
}

function normalizeOptionalTimestamp(value, fallback = 0) {
  const n = normalizeOptionalInteger(value, fallback)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function normalizeFlag(value) {
  return value === true ? 1 : 0
}

function safeParseJson(raw = '', fallback = null) {
  if (!asTrimmedString(raw)) return fallback
  try {
    return JSON.parse(String(raw))
  } catch {
    return fallback
  }
}

function safeStringify(value, fallback = '{}') {
  try {
    return JSON.stringify(value)
  } catch {
    return fallback
  }
}

function getPathTail(value = '') {
  const normalized = asTrimmedString(value)
  if (!normalized) return ''
  const parts = normalized.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || normalized
}

function normalizeArchiveStatus(value = '', fallback = 'ended') {
  const normalized = asTrimmedString(value).toLowerCase()
  return TERMINAL_ARCHIVE_STATUS_SET.has(normalized) ? normalized : fallback
}

function normalizeFailureReason(value = '') {
  const normalized = asTrimmedString(value).toLowerCase()
  if (!normalized) return ''
  if (TERMINAL_ARCHIVE_FAILURE_REASON_SET.has(normalized)) return normalized
  return normalized
}

function normalizeOutputMode(value = '') {
  const normalized = asTrimmedString(value).toLowerCase()
  return normalized === 'bounded_transcript' ? 'bounded_transcript' : 'tail'
}

function mergeMetadata(base = {}, patch = {}) {
  return {
    ...(base && typeof base === 'object' ? base : {}),
    ...(patch && typeof patch === 'object' ? patch : {}),
  }
}

function classifyArchiveLifecycle(snapshot = {}) {
  const explicitStatus = normalizeArchiveStatus(snapshot.status, '')
  const explicitFailureReason = normalizeFailureReason(snapshot.failureReason)
  if (explicitStatus) {
    return {
      status: explicitStatus,
      failureReason: explicitFailureReason,
    }
  }
  if (explicitFailureReason) {
    return {
      status: 'failed',
      failureReason: explicitFailureReason,
    }
  }

  const closeReason = asTrimmedString(snapshot.closeReason).toLowerCase()
  const exitCode = normalizeOptionalInteger(snapshot.exitCode, null)
  const exitSignal = asTrimmedString(snapshot.exitSignal)
  const lastError = asTrimmedString(snapshot.lastError)

  if (
    closeReason === 'close_requested'
  ) {
    return { status: 'ended', failureReason: '' }
  }

  if (
    closeReason === 'close_after_exit'
    || closeReason === 'manager_dispose'
    || closeReason === 'close_timeout_fallback'
    || closeReason === 'force_terminated'
  ) {
    return { status: closeReason === 'close_after_exit' ? 'ended' : 'terminated', failureReason: '' }
  }

  if (lastError || exitSignal || (Number.isFinite(exitCode) && exitCode !== 0)) {
    return { status: 'failed', failureReason: 'process_crashed' }
  }

  return { status: 'ended', failureReason: '' }
}

function buildDisplayLabels(snapshot = {}) {
  const sessionTitle = asTrimmedString(snapshot.sessionTitle)
  const cwd = asTrimmedString(snapshot.cwd)
  const cwdTail = getPathTail(cwd) || 'terminal'
  const shell = asTrimmedString(snapshot.shellKind || snapshot.shell) || 'shell'
  const scope = asTrimmedString(snapshot.scope).toLowerCase() === 'host' ? 'Host' : 'Workspace'
  const openedBy = asTrimmedString(snapshot.openedBy).toLowerCase()
  const actor = openedBy === 'model' ? 'AI' : openedBy === 'user' ? 'User' : ''
  const primary = sessionTitle || [cwdTail, shell].filter(Boolean).join(' · ')
  const secondary = [cwd || cwdTail, scope, actor].filter(Boolean).join(' · ')
  return {
    displayName: sessionTitle || primary || asTrimmedString(snapshot.sessionId) || 'terminal session',
    primary,
    secondary,
  }
}

function normalizeOutputTail(
  sourceChunks = [],
  {
    maxChars = DEFAULT_TERMINAL_ARCHIVE_MAX_TAIL_CHARS,
    maxChunks = DEFAULT_TERMINAL_ARCHIVE_MAX_TAIL_CHUNKS,
  } = {},
) {
  const source = Array.isArray(sourceChunks) ? sourceChunks : []
  const safeMaxChars = Math.max(256, Math.round(Number(maxChars || DEFAULT_TERMINAL_ARCHIVE_MAX_TAIL_CHARS)))
  const safeMaxChunks = Math.max(1, Math.round(Number(maxChunks || DEFAULT_TERMINAL_ARCHIVE_MAX_TAIL_CHUNKS)))
  const normalized = source.map((entry, index) => ({
    sequence: normalizeOptionalInteger(entry?.sequence, index + 1) ?? (index + 1),
    at: normalizeOptionalTimestamp(entry?.at, 0),
    data: String(entry?.data || ''),
  })).filter((entry) => entry.data.length > 0)

  const totalChars = normalized.reduce((sum, entry) => sum + entry.data.length, 0)
  const kept = []
  let keptChars = 0

  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    if (kept.length >= safeMaxChunks) break
    const entry = normalized[index]
    const remainingChars = safeMaxChars - keptChars
    if (remainingChars <= 0) break
    if (entry.data.length <= remainingChars) {
      kept.unshift(entry)
      keptChars += entry.data.length
      continue
    }
    kept.unshift({
      ...entry,
      data: entry.data.slice(-remainingChars),
    })
    keptChars += remainingChars
    break
  }

  const payloadJson = kept.length > 0 ? safeStringify(kept, '[]') : ''
  return {
    outputTail: kept,
    outputTailJson: payloadJson,
    outputMode: 'tail',
    outputTruncated: kept.length !== normalized.length || keptChars < totalChars,
    stats: {
      latestSequence: kept.length > 0
        ? normalizeOptionalInteger(kept[kept.length - 1]?.sequence, 0) || 0
        : 0,
      originalChunkCount: normalized.length,
      retainedChunkCount: kept.length,
      originalCharCount: totalChars,
      retainedCharCount: keptChars,
      retainedPayloadBytes: payloadJson ? Buffer.byteLength(payloadJson, 'utf8') : 0,
    },
  }
}

function rowToTerminalSessionArchive(row = null) {
  if (!row) return null
  const policy = safeParseJson(row.policy_json, {})
  const metadata = safeParseJson(row.metadata_json, {})
  const outputTail = safeParseJson(row.output_tail, [])
  return {
    id: asTrimmedString(row.id),
    project: asTrimmedString(row.project),
    threadId: asTrimmedString(row.thread_id),
    turnId: asTrimmedString(row.turn_id),
    sessionId: asTrimmedString(row.session_id),
    displayName: asTrimmedString(row.display_name),
    displayLabelPrimary: asTrimmedString(row.display_label_primary),
    displayLabelSecondary: asTrimmedString(row.display_label_secondary),
    scope: asTrimmedString(row.scope) || 'workspace',
    cwd: asTrimmedString(row.cwd),
    shell: asTrimmedString(row.shell),
    shellKind: asTrimmedString(row.shell_kind),
    profileHint: asTrimmedString(row.profile_hint),
    hostAccessRequired: row.host_access_required === 1,
    openedAt: normalizeOptionalTimestamp(row.opened_at, 0),
    closedAt: normalizeOptionalTimestamp(row.closed_at, 0),
    closeReason: asTrimmedString(row.close_reason),
    failureReason: asTrimmedString(row.failure_reason),
    exitCode: normalizeOptionalInteger(row.exit_code, null),
    exitSignal: asTrimmedString(row.exit_signal),
    openedBy: asTrimmedString(row.opened_by),
    closedBy: asTrimmedString(row.closed_by),
    status: normalizeArchiveStatus(row.status),
    sessionTitle: asTrimmedString(row.session_title),
    outputTail: Array.isArray(outputTail) ? outputTail : [],
    outputTruncated: row.output_truncated === 1,
    outputSequence: normalizeOptionalInteger(row.output_sequence, 0) || 0,
    outputMode: normalizeOutputMode(row.output_mode),
    policy,
    metadata,
    memoryCandidateStatus: asTrimmedString(row.memory_candidate_status) || 'none',
    memoryCandidateSummary: asTrimmedString(row.memory_candidate_summary),
    memoryCandidateReason: asTrimmedString(row.memory_candidate_reason),
    memoryNodeId: asTrimmedString(row.memory_node_id),
  }
}

function buildArchiveRecord(snapshot = {}, options = {}) {
  const now = normalizeOptionalTimestamp(options.now, Date.now()) || Date.now()
  const lifecycle = classifyArchiveLifecycle(snapshot)
  const labels = buildDisplayLabels(snapshot)
  const normalizedPolicy = snapshot.policy && typeof snapshot.policy === 'object'
    ? snapshot.policy
    : {}
  const existingMetadata = snapshot.metadata && typeof snapshot.metadata === 'object'
    ? snapshot.metadata
    : {}
  const normalizedTail = normalizeOutputTail(
    snapshot.outputTail || snapshot.outputChunks || [],
    {
      maxChars: options.maxTailChars,
      maxChunks: options.maxTailChunks,
    },
  )
  const openedAt = normalizeOptionalTimestamp(snapshot.openedAt, 0)
    || normalizeOptionalTimestamp(snapshot.createdAt, 0)
    || now
  const closedAt = normalizeOptionalTimestamp(snapshot.closedAt, 0) || now
  const closeReason = asTrimmedString(snapshot.closeReason)
  const outputSequence = normalizedTail.stats.latestSequence > 0
    ? normalizedTail.stats.latestSequence
    : (normalizeOptionalInteger(snapshot.outputSequence, 0) || 0)
  const metadata = mergeMetadata(existingMetadata, {
    archiveHydrationMode: 'tail',
    runtimeCloseReason: closeReason,
    exactOpenedAt: openedAt,
    exactClosedAt: closedAt,
    retention: mergeMetadata(existingMetadata?.retention, {
      payloadPresent: normalizedTail.outputTail.length > 0,
      payloadPruned: false,
      originalChunkCount: normalizedTail.stats.originalChunkCount,
      retainedChunkCount: normalizedTail.stats.retainedChunkCount,
      originalCharCount: normalizedTail.stats.originalCharCount,
      retainedCharCount: normalizedTail.stats.retainedCharCount,
      retainedPayloadBytes: normalizedTail.stats.retainedPayloadBytes,
      archiveTailMaxChars: Math.max(256, Math.round(Number(options.maxTailChars || DEFAULT_TERMINAL_ARCHIVE_MAX_TAIL_CHARS))),
      archiveTailMaxChunks: Math.max(1, Math.round(Number(options.maxTailChunks || DEFAULT_TERMINAL_ARCHIVE_MAX_TAIL_CHUNKS))),
    }),
    lifecycle: mergeMetadata(existingMetadata?.lifecycle, {
      status: lifecycle.status,
      failureReason: lifecycle.failureReason,
      lastError: asTrimmedString(snapshot.lastError),
    }),
  })

  return {
    id: asTrimmedString(snapshot.id) || `terminal_archive_${nanoid()}`,
    project: normalizeProjectKey(snapshot.project),
    threadId: asTrimmedString(snapshot.threadId),
    turnId: asTrimmedString(snapshot.turnId),
    sessionId: asTrimmedString(snapshot.sessionId || snapshot.id),
    displayName: labels.displayName,
    displayLabelPrimary: labels.primary,
    displayLabelSecondary: labels.secondary,
    scope: asTrimmedString(snapshot.scope).toLowerCase() === 'host' ? 'host' : 'workspace',
    cwd: asTrimmedString(snapshot.cwd),
    shell: asTrimmedString(snapshot.shell),
    shellKind: asTrimmedString(snapshot.shellKind),
    profileHint: asTrimmedString(snapshot.profileHint || normalizedPolicy?.profileHint),
    hostAccessRequired: snapshot.hostAccessRequired === true || normalizedPolicy?.hostAccessRequired === true,
    openedAt,
    closedAt,
    closeReason,
    failureReason: lifecycle.failureReason,
    exitCode: normalizeOptionalInteger(snapshot.exitCode, null),
    exitSignal: asTrimmedString(snapshot.exitSignal),
    openedBy: asTrimmedString(snapshot.openedBy).toLowerCase(),
    closedBy: asTrimmedString(snapshot.closedBy).toLowerCase(),
    status: lifecycle.status,
    sessionTitle: asTrimmedString(snapshot.sessionTitle),
    outputTailJson: normalizedTail.outputTailJson,
    outputTruncated: snapshot.outputTruncated === true || normalizedTail.outputTruncated,
    outputSequence,
    outputMode: normalizeOutputMode(snapshot.outputMode || normalizedTail.outputMode),
    policyJson: safeStringify(normalizedPolicy, '{}'),
    metadataJson: safeStringify(metadata, '{}'),
  }
}

function updateMetadataRetentionForPrune(metadata = {}, payloadBytes = 0) {
  return mergeMetadata(metadata, {
    retention: mergeMetadata(metadata?.retention, {
      payloadPresent: false,
      payloadPruned: true,
      payloadPrunedAt: Date.now(),
      retainedChunkCount: 0,
      retainedCharCount: 0,
      retainedPayloadBytes: 0,
      prunedPayloadBytes: Math.max(0, Math.round(Number(payloadBytes || 0))),
    }),
  })
}

export function getTerminalSessionArchiveBySessionId(sessionId = '') {
  const normalizedSessionId = asTrimmedString(sessionId)
  if (!normalizedSessionId) return null
  const db = getDb()
  const row = db.prepare(`
    SELECT *
    FROM terminal_session_archive
    WHERE session_id = ?
  `).get(normalizedSessionId)
  return rowToTerminalSessionArchive(row)
}

export function deleteTerminalSessionArchive(sessionId = '') {
  const normalizedSessionId = asTrimmedString(sessionId)
  if (!normalizedSessionId) {
    throw new Error('sessionId is required')
  }
  const existing = getTerminalSessionArchiveBySessionId(normalizedSessionId)
  if (!existing) {
    throw new Error(`Archived terminal session not found: ${normalizedSessionId}`)
  }
  const db = getDb()
  const result = db.prepare(`
    DELETE FROM terminal_session_archive
    WHERE session_id = ?
  `).run(normalizedSessionId)
  if (Number(result.changes || 0) <= 0) {
    throw new Error(`Archived terminal session not found: ${normalizedSessionId}`)
  }
  return existing
}

export function clearTerminalSessionArchivesForProject({ project = '', threadIds = [] } = {}) {
  const db = getDb()
  const normalizedProject = normalizeProjectKey(project)
  const normalizedThreadIds = [...new Set(
    (Array.isArray(threadIds) ? threadIds : [])
      .map((value) => asTrimmedString(value))
      .filter(Boolean),
  )]

  const tx = db.transaction(() => {
    let deletedRows = 0
    if (normalizedProject) {
      deletedRows += Number(db.prepare(`
        DELETE FROM terminal_session_archive
        WHERE project = ?
      `).run(normalizedProject)?.changes || 0)
    }
    if (normalizedThreadIds.length > 0) {
      const placeholders = normalizedThreadIds.map(() => '?').join(', ')
      deletedRows += Number(db.prepare(`
        DELETE FROM terminal_session_archive
        WHERE thread_id IN (${placeholders})
      `).run(...normalizedThreadIds)?.changes || 0)
    }
    return { ok: true, deletedRows }
  })

  return tx()
}

export function clearAllTerminalSessionArchives() {
  const db = getDb()
  const result = db.prepare('DELETE FROM terminal_session_archive').run()
  return {
    ok: true,
    deletedRows: Number(result?.changes || 0) || 0,
  }
}

export function listTerminalSessionArchives(project = '', {
  threadId = '',
  limit = 200,
} = {}) {
  const db = getDb()
  const normalizedProject = normalizeProjectKey(project)
  const normalizedThreadId = asTrimmedString(threadId)
  const safeLimit = Math.max(1, Math.min(1_000, Math.round(Number(limit || 200))))
  const rows = normalizedThreadId
    ? db.prepare(`
      SELECT *
      FROM terminal_session_archive
      WHERE project = ?
        AND thread_id = ?
      ORDER BY closed_at DESC, session_id DESC
      LIMIT ?
    `).all(normalizedProject, normalizedThreadId, safeLimit)
    : db.prepare(`
      SELECT *
      FROM terminal_session_archive
      WHERE project = ?
      ORDER BY closed_at DESC, session_id DESC
      LIMIT ?
    `).all(normalizedProject, safeLimit)
  return rows.map(rowToTerminalSessionArchive)
}

export function updateTerminalSessionArchiveCandidate(sessionId = '', {
  status = '',
  summary,
  reason,
} = {}) {
  const normalizedSessionId = asTrimmedString(sessionId)
  if (!normalizedSessionId) {
    throw new Error('sessionId is required')
  }
  const normalizedStatus = (() => {
    const candidate = asTrimmedString(status).toLowerCase()
    return ['none', 'pending', 'accepted', 'dismissed'].includes(candidate) ? candidate : 'none'
  })()
  const db = getDb()
  const result = db.prepare(`
    UPDATE terminal_session_archive
    SET memory_candidate_status = ?,
        memory_candidate_summary = ?,
        memory_candidate_reason = ?
    WHERE session_id = ?
  `).run(
    normalizedStatus,
    summary === undefined ? '' : String(summary || ''),
    reason === undefined ? '' : String(reason || ''),
    normalizedSessionId,
  )
  if (Number(result.changes || 0) <= 0) {
    throw new Error(`Archived terminal session not found: ${normalizedSessionId}`)
  }
  return getTerminalSessionArchiveBySessionId(normalizedSessionId)
}

export function linkTerminalSessionArchiveMemoryNode(sessionId = '', {
  memoryNodeId = '',
  status = 'accepted',
} = {}) {
  const normalizedSessionId = asTrimmedString(sessionId)
  const normalizedMemoryNodeId = asTrimmedString(memoryNodeId)
  if (!normalizedSessionId) {
    throw new Error('sessionId is required')
  }
  if (!normalizedMemoryNodeId) {
    throw new Error('memoryNodeId is required')
  }
  const normalizedStatus = asTrimmedString(status).toLowerCase() === 'accepted'
    ? 'accepted'
    : 'pending'
  const db = getDb()
  const result = db.prepare(`
    UPDATE terminal_session_archive
    SET memory_node_id = ?,
        memory_candidate_status = ?
    WHERE session_id = ?
  `).run(normalizedMemoryNodeId, normalizedStatus, normalizedSessionId)
  if (Number(result.changes || 0) <= 0) {
    throw new Error(`Archived terminal session not found: ${normalizedSessionId}`)
  }
  return getTerminalSessionArchiveBySessionId(normalizedSessionId)
}

export function pruneTerminalSessionArchivePayloads({
  project = '',
  maxPayloadRowsPerProject = DEFAULT_TERMINAL_ARCHIVE_MAX_PAYLOAD_ROWS_PER_PROJECT,
  maxPayloadBytesPerProject = DEFAULT_TERMINAL_ARCHIVE_MAX_PAYLOAD_BYTES_PER_PROJECT,
} = {}) {
  const db = getDb()
  const normalizedProject = normalizeProjectKey(project)
  const safeMaxRows = Math.max(0, Math.round(Number(maxPayloadRowsPerProject || 0)))
  const safeMaxBytes = Math.max(0, Math.round(Number(maxPayloadBytesPerProject || 0)))
  const rows = db.prepare(`
    SELECT session_id, output_tail, metadata_json
    FROM terminal_session_archive
    WHERE project = ?
      AND LENGTH(output_tail) > 0
    ORDER BY closed_at DESC, session_id DESC
  `).all(normalizedProject)

  let retainedRows = 0
  let retainedBytes = 0
  let prunedRows = 0

  const updateStmt = db.prepare(`
    UPDATE terminal_session_archive
    SET output_tail = '',
        metadata_json = ?
    WHERE session_id = ?
  `)

  const tx = db.transaction(() => {
    for (const row of rows) {
      const payloadBytes = Buffer.byteLength(String(row.output_tail || ''), 'utf8')
      const mayKeepByRow = safeMaxRows <= 0 ? false : retainedRows < safeMaxRows
      const mayKeepByBytes = safeMaxBytes <= 0
        ? false
        : (retainedRows === 0 || (retainedBytes + payloadBytes) <= safeMaxBytes)
      if (mayKeepByRow && mayKeepByBytes) {
        retainedRows += 1
        retainedBytes += payloadBytes
        continue
      }
      const metadata = safeParseJson(row.metadata_json, {})
      updateStmt.run(
        safeStringify(updateMetadataRetentionForPrune(metadata, payloadBytes), '{}'),
        asTrimmedString(row.session_id),
      )
      prunedRows += 1
    }
  })
  tx()

  return {
    project: normalizedProject,
    retainedRows,
    retainedBytes,
    prunedRows,
  }
}

export function archiveTerminalSession(snapshot = {}, {
  maxTailChars = DEFAULT_TERMINAL_ARCHIVE_MAX_TAIL_CHARS,
  maxTailChunks = DEFAULT_TERMINAL_ARCHIVE_MAX_TAIL_CHUNKS,
  maxPayloadRowsPerProject = DEFAULT_TERMINAL_ARCHIVE_MAX_PAYLOAD_ROWS_PER_PROJECT,
  maxPayloadBytesPerProject = DEFAULT_TERMINAL_ARCHIVE_MAX_PAYLOAD_BYTES_PER_PROJECT,
} = {}) {
  const record = buildArchiveRecord(snapshot, { maxTailChars, maxTailChunks })
  if (!record.sessionId) {
    throw new Error('sessionId is required to archive a terminal session')
  }

  const db = getDb()
  db.prepare(`
    INSERT INTO terminal_session_archive (
      id,
      project,
      thread_id,
      turn_id,
      session_id,
      display_name,
      display_label_primary,
      display_label_secondary,
      scope,
      cwd,
      shell,
      shell_kind,
      profile_hint,
      host_access_required,
      opened_at,
      closed_at,
      close_reason,
      failure_reason,
      exit_code,
      exit_signal,
      opened_by,
      closed_by,
      status,
      session_title,
      output_tail,
      output_truncated,
      output_sequence,
      output_mode,
      policy_json,
      metadata_json,
      memory_candidate_status,
      memory_candidate_summary,
      memory_candidate_reason,
      memory_node_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'none', '', '', '')
    ON CONFLICT(session_id) DO UPDATE SET
      project = excluded.project,
      thread_id = excluded.thread_id,
      turn_id = excluded.turn_id,
      display_name = excluded.display_name,
      display_label_primary = excluded.display_label_primary,
      display_label_secondary = excluded.display_label_secondary,
      scope = excluded.scope,
      cwd = excluded.cwd,
      shell = excluded.shell,
      shell_kind = excluded.shell_kind,
      profile_hint = excluded.profile_hint,
      host_access_required = excluded.host_access_required,
      opened_at = excluded.opened_at,
      closed_at = excluded.closed_at,
      close_reason = excluded.close_reason,
      failure_reason = excluded.failure_reason,
      exit_code = excluded.exit_code,
      exit_signal = excluded.exit_signal,
      opened_by = excluded.opened_by,
      closed_by = excluded.closed_by,
      status = excluded.status,
      session_title = excluded.session_title,
      output_tail = excluded.output_tail,
      output_truncated = excluded.output_truncated,
      output_sequence = excluded.output_sequence,
      output_mode = excluded.output_mode,
      policy_json = excluded.policy_json,
      metadata_json = excluded.metadata_json
  `).run(
    record.id,
    record.project,
    record.threadId,
    record.turnId,
    record.sessionId,
    record.displayName,
    record.displayLabelPrimary,
    record.displayLabelSecondary,
    record.scope,
    record.cwd,
    record.shell,
    record.shellKind,
    record.profileHint,
    normalizeFlag(record.hostAccessRequired),
    record.openedAt,
    record.closedAt,
    record.closeReason,
    record.failureReason,
    record.exitCode,
    record.exitSignal,
    record.openedBy,
    record.closedBy,
    record.status,
    record.sessionTitle,
    record.outputTailJson,
    normalizeFlag(record.outputTruncated),
    record.outputSequence,
    record.outputMode,
    record.policyJson,
    record.metadataJson,
  )

  pruneTerminalSessionArchivePayloads({
    project: record.project,
    maxPayloadRowsPerProject,
    maxPayloadBytesPerProject,
  })
  return getTerminalSessionArchiveBySessionId(record.sessionId)
}
