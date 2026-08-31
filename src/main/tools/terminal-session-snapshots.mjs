import { DEFAULT_TERMINAL_SESSION_READ_SNAPSHOT_MODE } from './terminal-session-manager-constants.mjs'
import {
  asTrimmedString,
  clampReadSnapshotPreview,
  normalizeReadSnapshotMaxChars,
  normalizeReadSnapshotMode,
  normalizeTerminalSessionSequence,
} from './terminal-session-manager-normalizers.mjs'
import { stripTerminalAnsi } from './terminal-session-output-text.mjs'

export function normalizeSurface(value = '') {
  const normalized = asTrimmedString(value).toLowerCase()
  if (normalized === 'chat_dock' || normalized === 'terminal_panel') return normalized
  return ''
}

function getSessionLifecycleState(session) {
  const status = asTrimmedString(session?.status).toLowerCase()
  if (status === 'closed') return 'ended'
  if (status === 'exited') return 'ended'
  if (status === 'closing') return 'closing'
  if (status === 'failed') return 'failed'
  return session?.closeRequested === true ? 'closing' : 'live'
}

function getSessionApprovalState(session) {
  return asTrimmedString(session?.approvalState || 'approved').toLowerCase() || 'approved'
}

function getSessionTakeoverState(session) {
  if (session?.controlOwner === 'user') return 'user_takeover'
  if (session?.pendingAiControlRequest === true) return 'ai_waiting'
  return 'ai_controlling'
}

function getSessionCommandState(session) {
  const normalized = asTrimmedString(session?.commandState).toLowerCase()
  return normalized === 'running' ? 'running' : 'idle'
}

function getSessionControlState(session) {
  const takeoverState = getSessionTakeoverState(session)
  if (takeoverState === 'user_takeover') return 'User takeover'
  if (takeoverState === 'ai_waiting') return 'AI waiting'
  return 'AI controlling'
}

export function toPublicSession(session) {
  const lifecycleState = getSessionLifecycleState(session)
  const approvalState = getSessionApprovalState(session)
  const takeoverState = getSessionTakeoverState(session)
  const commandState = getSessionCommandState(session)
  const scope = session.policy?.hostAccessRequired === true ? 'host' : 'workspace'
  return {
    id: session.id,
    sessionId: session.id,
    pid: session.pid,
    project: session.project,
    threadId: session.threadId,
    owningThreadId: session.threadId,
    turnId: session.turnId,
    shell: session.shell,
    shellKind: session.shellKind,
    cwd: session.cwd,
    scope,
    cols: session.cols,
    rows: session.rows,
    status: session.status,
    lifecycleState,
    approvalState,
    takeoverState,
    controlState: getSessionControlState(session),
    controlOwner: session.controlOwner,
    createdBy: session.openedBy,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lastActivityAt: session.updatedAt,
    exitedAt: session.exitedAt,
    exitCode: session.exitCode,
    exitSignal: session.exitSignal,
    closeRequested: session.closeRequested === true,
    outputSequence: session.outputSequence,
    policy: session.policy || null,
    openedBy: session.openedBy,
    closedBy: session.closedBy,
    sessionTitle: session.sessionTitle,
    aiWriteBlocked: session.aiWriteBlocked === true,
    focusedSurface: normalizeSurface(session.focusedSurface),
    pendingAiControlRequest: session.pendingAiControlRequest === true,
    pendingApprovalVisible: approvalState === 'pending',
    failureReason: asTrimmedString(session.failureReason || session.closeReason || session.lastError),
    originWorkspaceContext: session.project,
    labelDisambiguator: asTrimmedString(session.labelDisambiguator),
    hasUnreadOutput: false,
    commandState,
    isRunningCommand: commandState === 'running',
    dockVisibilityState: 'visible',
    closeCapability: lifecycleState === 'live' || lifecycleState === 'closing',
    terminateCapability: lifecycleState === 'live' || lifecycleState === 'closing',
    interruptCapability: lifecycleState === 'live',
    canHandBackToAi: session.controlOwner === 'user',
  }
}

export function buildClosedSessionArchiveSnapshot(session, {
  closedAt = Date.now(),
  closeReason = '',
} = {}) {
  const normalizedCloseReason = asTrimmedString(closeReason || session.closeReason)
  const status = (
    normalizedCloseReason === 'close_requested'
    || normalizedCloseReason === 'close_after_exit'
  )
    ? 'ended'
    : (
      normalizedCloseReason === 'force_terminated'
      || normalizedCloseReason === 'close_timeout_fallback'
      || normalizedCloseReason === 'manager_dispose'
    )
      ? 'terminated'
      : (asTrimmedString(session.lastError) ? 'failed' : 'ended')
  const failureReason = status === 'failed'
    ? asTrimmedString(session.failureReason || session.lastError)
    : ''
  return {
    project: session.project,
    threadId: session.threadId,
    turnId: session.turnId,
    sessionId: session.id,
    cwd: session.cwd,
    shell: session.shell,
    shellKind: session.shellKind,
    profileHint: session.policy?.profileHint || '',
    hostAccessRequired: session.policy?.hostAccessRequired === true,
    scope: session.policy?.hostAccessRequired === true ? 'host' : 'workspace',
    openedAt: session.createdAt,
    closedAt,
    closeReason: normalizedCloseReason,
    failureReason,
    exitCode: session.exitCode,
    exitSignal: session.exitSignal,
    openedBy: session.openedBy,
    closedBy: session.closedBy,
    sessionTitle: session.sessionTitle,
    outputSequence: session.outputSequence,
    outputTruncated: session.outputTruncated === true,
    outputMode: 'tail',
    outputTail: Array.isArray(session.outputBuffer)
      ? session.outputBuffer.map((entry) => ({
        sequence: Number(entry?.sequence || 0) || 0,
        at: Number(entry?.at || 0) || 0,
        data: String(entry?.data || ''),
      }))
      : [],
    status,
    policy: session.policy && typeof session.policy === 'object'
      ? { ...session.policy }
      : null,
    metadata: {
      pid: session.pid,
      updatedAt: session.updatedAt,
    },
    lastError: session.lastError,
  }
}

export function createOutputSnapshot(session, sinceSequence = 0) {
  const normalizedSinceSequence = normalizeTerminalSessionSequence(sinceSequence)
  return {
    session: toPublicSession(session),
    output: {
      chunks: session.outputBuffer.filter((entry) => Number(entry.sequence || 0) > normalizedSinceSequence),
      nextSequence: session.outputSequence,
      truncated: session.outputTruncated === true,
    },
  }
}

export function createReadSnapshot(session, {
  sinceSequence = 0,
  maxChars,
  mode = DEFAULT_TERMINAL_SESSION_READ_SNAPSHOT_MODE,
  capturedAt = Date.now(),
} = {}) {
  const normalizedSinceSequence = normalizeTerminalSessionSequence(sinceSequence)
  const normalizedMaxChars = normalizeReadSnapshotMaxChars(maxChars)
  const normalizedMode = normalizeReadSnapshotMode(mode)
  if (normalizedMode === 'visible_text') {
    const visibleSnapshot = session?.visibleSnapshot && typeof session.visibleSnapshot === 'object'
      ? session.visibleSnapshot
      : null
    const focusedSurface = normalizeSurface(session?.focusedSurface)
    const snapshotSurface = normalizeSurface(visibleSnapshot?.surface)
    const available = visibleSnapshot?.available === true
      && !!snapshotSurface
      && snapshotSurface === focusedSurface
    const rawText = available
      ? String(visibleSnapshot?.text || '')
      : ''
    const truncated = rawText.length > normalizedMaxChars
    const text = truncated
      ? rawText.slice(-normalizedMaxChars)
      : rawText
    return {
      sessionId: session.id,
      session: toPublicSession(session),
      output: {
        text,
        preview: clampReadSnapshotPreview(text),
        nextSequence: session.outputSequence,
        chunkCount: available && text ? 1 : 0,
        truncated,
        mode: normalizedMode,
        capturedAt: Number(visibleSnapshot?.capturedAt || capturedAt || 0) || Date.now(),
        available,
      },
    }
  }
  const relevantChunks = session.outputBuffer.filter((entry) => Number(entry?.sequence || 0) > normalizedSinceSequence)
  const keptChunks = []
  let totalChars = 0
  let truncated = session.outputTruncated === true

  for (let index = relevantChunks.length - 1; index >= 0; index -= 1) {
    const entry = relevantChunks[index]
    const chunk = String(entry?.data || '')
    if (!chunk) continue
    const nextChars = totalChars + chunk.length
    if (keptChunks.length > 0 && nextChars > normalizedMaxChars) {
      truncated = true
      break
    }
    if (keptChunks.length === 0 && chunk.length > normalizedMaxChars) {
      keptChunks.unshift({
        ...entry,
        data: chunk.slice(-normalizedMaxChars),
      })
      totalChars = normalizedMaxChars
      truncated = true
      break
    }
    keptChunks.unshift({
      ...entry,
      data: chunk,
    })
    totalChars = nextChars
    if (totalChars >= normalizedMaxChars) break
  }

  if (keptChunks.length < relevantChunks.length) truncated = true

  const rawText = keptChunks.map((entry) => String(entry?.data || '')).join('')
  const text = normalizedMode === 'plain_text_tail'
    ? stripTerminalAnsi(rawText)
    : rawText
  return {
    sessionId: session.id,
    session: toPublicSession(session),
    output: {
      text,
      preview: clampReadSnapshotPreview(text),
      nextSequence: session.outputSequence,
      chunkCount: keptChunks.length,
      truncated,
      mode: normalizedMode,
      capturedAt: Number(capturedAt || 0) || Date.now(),
      available: true,
    },
  }
}
