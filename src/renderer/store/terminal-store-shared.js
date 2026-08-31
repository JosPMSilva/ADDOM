import useAppStore from './useAppStore.js'
import useChatStore from './useChatStore.js'

export const TERMINAL_CLIENT_BUFFER_LIMIT = 120_000
export const DEFAULT_VIEWPORT_METRICS = Object.freeze({ cols: 120, rows: 32 })
export const CHAT_TERMINAL_COMPACT_MODE = 'chat_terminal_compact'
export const CHAT_TERMINAL_EXPANDED_MODE = 'chat_terminal_expanded'
export const DEFAULT_VIEWPORT_METRICS_BY_MODE = Object.freeze({
  [CHAT_TERMINAL_EXPANDED_MODE]: DEFAULT_VIEWPORT_METRICS,
  [CHAT_TERMINAL_COMPACT_MODE]: DEFAULT_VIEWPORT_METRICS,
})
export const DEFAULT_FOCUS_REQUEST_KEY_BY_MODE = Object.freeze({
  [CHAT_TERMINAL_EXPANDED_MODE]: 0,
  [CHAT_TERMINAL_COMPACT_MODE]: 0,
})
export const DEFAULT_RUNTIME_HEALTH = Object.freeze({
  status: 'idle',
  reason: 'not_loaded',
})
export const DEFAULT_OUTPUT_STATE = Object.freeze({
  rawOutput: '',
  lastSequence: 0,
  truncated: false,
})
export const DEFAULT_MODEL_SESSION_ACTIVITY = Object.freeze({
  sessionId: '',
  action: '',
  displayName: '',
  attentionMessage: '',
  panelIntent: 'none',
  liveSurface: 'chat_dock',
  userTakeoverAvailable: false,
  threadId: '',
  updatedAt: 0,
})

const MAX_TERMINAL_TELEMETRY_EVENTS = 200

let hydrateSequence = 0

export const subscriptionCleanupBySessionId = new Map()
export const connectionPromiseBySessionId = new Map()
export const lastRequestedResizeBySessionId = new Map()

export function getHydrateSequence() {
  return hydrateSequence
}

export function incrementHydrateSequence() {
  hydrateSequence += 1
  return hydrateSequence
}

export function resetTerminalConnectionState() {
  connectionPromiseBySessionId.clear()
  lastRequestedResizeBySessionId.clear()
}

export function createInitialTerminalStoreState() {
  return {
    runtimeHealth: DEFAULT_RUNTIME_HEALTH,
    runtimeHealthPending: false,
    sessionsPending: false,
    archivedSessionsPending: false,
    actionNotice: null,
    threadSuggestionArchivesByThreadId: {},
    threadSuggestionArchivesPendingByThreadId: {},
    liveMemoryActionPendingBySessionId: {},
    archiveMemoryActionPendingBySessionId: {},
    archiveDeletePendingBySessionId: {},
    creatingSession: false,
    actionError: '',
    sessions: [],
    archivedSessions: [],
    activeSessionId: '',
    activeArchivedSessionId: '',
    expandedArchivedSessionIds: [],
    rawOutputBySessionId: {},
    modelSessionActivity: DEFAULT_MODEL_SESSION_ACTIVITY,
    viewportMetrics: DEFAULT_VIEWPORT_METRICS,
    viewportMetricsByMode: DEFAULT_VIEWPORT_METRICS_BY_MODE,
    focusRequestKeyByMode: DEFAULT_FOCUS_REQUEST_KEY_BY_MODE,
    telemetryEvents: [],
    hydratedProjectFolder: '',
    hydratedPermissionMode: '',
  }
}

export function getTerminalApi() {
  if (typeof window === 'undefined') return null
  return window?.addom?.terminal || null
}

export function asTrimmedString(value = '') {
  return String(value || '').trim()
}

export function normalizeRuntimeHealth(runtimeHealth = null) {
  const source = runtimeHealth && typeof runtimeHealth === 'object' ? runtimeHealth : {}
  const availableShells = Array.isArray(source.availableShells)
    ? source.availableShells
      .map((shell) => ({
        id: asTrimmedString(shell?.id),
        shellKind: asTrimmedString(shell?.shellKind || shell?.id),
        file: asTrimmedString(shell?.file),
      }))
      .filter((shell) => shell.id)
    : []
  const statusValue = asTrimmedString(source.status).toLowerCase()
  const status = ['idle', 'loading', 'supported', 'disabled', 'failed'].includes(statusValue)
    ? statusValue
    : 'failed'
  return {
    status,
    reason: asTrimmedString(source.reason) || (status === 'supported' ? 'pty_spawn_ok' : 'unknown'),
    error: asTrimmedString(source.error),
    disabledBy: asTrimmedString(source.disabledBy),
    platform: asTrimmedString(source.platform),
    arch: asTrimmedString(source.arch),
    availableShells,
    dependency: source.dependency && typeof source.dependency === 'object'
      ? { ...source.dependency }
      : null,
    probe: source.probe && typeof source.probe === 'object'
      ? { ...source.probe }
      : null,
    checkedAt: Date.now(),
  }
}

export function normalizeTerminalSession(session = null) {
  const source = session && typeof session === 'object' ? session : {}
  return {
    id: asTrimmedString(source.id),
    sessionId: asTrimmedString(source.sessionId || source.id),
    project: asTrimmedString(source.project),
    threadId: asTrimmedString(source.threadId),
    owningThreadId: asTrimmedString(source.owningThreadId || source.threadId),
    turnId: asTrimmedString(source.turnId),
    pid: Number(source.pid || 0) || null,
    shell: asTrimmedString(source.shell || 'default') || 'default',
    shellKind: asTrimmedString(source.shellKind || source.shell || 'shell') || 'shell',
    cwd: asTrimmedString(source.cwd),
    scope: asTrimmedString(source.scope || (source?.policy?.hostAccessRequired === true ? 'host' : 'workspace')) || 'workspace',
    cols: Number(source.cols || 0) || DEFAULT_VIEWPORT_METRICS.cols,
    rows: Number(source.rows || 0) || DEFAULT_VIEWPORT_METRICS.rows,
    status: asTrimmedString(source.status || 'running') || 'running',
    lifecycleState: asTrimmedString(source.lifecycleState || source.status || 'live') || 'live',
    approvalState: asTrimmedString(source.approvalState || 'approved') || 'approved',
    takeoverState: asTrimmedString(source.takeoverState) || 'ai_controlling',
    controlState: asTrimmedString(source.controlState) || 'AI controlling',
    controlOwner: asTrimmedString(source.controlOwner || (source.takeoverState === 'user_takeover' ? 'user' : 'model')) || 'model',
    createdBy: asTrimmedString(source.createdBy || source.openedBy),
    createdAt: Number(source.createdAt || 0) || 0,
    updatedAt: Number(source.updatedAt || 0) || 0,
    lastActivityAt: Number(source.lastActivityAt || source.updatedAt || 0) || 0,
    exitedAt: Number(source.exitedAt || 0) || 0,
    exitCode: source.exitCode ?? null,
    exitSignal: source.exitSignal ?? null,
    closeRequested: source.closeRequested === true,
    outputSequence: Number(source.outputSequence || 0) || 0,
    policy: source.policy && typeof source.policy === 'object'
      ? { ...source.policy }
      : null,
    openedBy: asTrimmedString(source.openedBy).toLowerCase(),
    closedBy: asTrimmedString(source.closedBy).toLowerCase(),
    sessionTitle: asTrimmedString(source.sessionTitle),
    aiWriteBlocked: source.aiWriteBlocked === true,
    focusedSurface: asTrimmedString(source.focusedSurface),
    pendingAiControlRequest: source.pendingAiControlRequest === true,
    pendingApprovalVisible: source.pendingApprovalVisible === true,
    failureReason: asTrimmedString(source.failureReason),
    originWorkspaceContext: asTrimmedString(source.originWorkspaceContext),
    labelDisambiguator: asTrimmedString(source.labelDisambiguator),
    hasUnreadOutput: source.hasUnreadOutput === true,
    commandState: asTrimmedString(source.commandState || (source.isRunningCommand === true ? 'running' : 'idle')) || 'idle',
    isRunningCommand: source.isRunningCommand === true,
    dockVisibilityState: asTrimmedString(source.dockVisibilityState || 'visible') || 'visible',
    closeCapability: source.closeCapability !== false,
    terminateCapability: source.terminateCapability !== false,
    interruptCapability: source.interruptCapability !== false,
    canHandBackToAi: source.canHandBackToAi === true,
  }
}

export function normalizeTerminalArchiveSession(session = null) {
  const source = session && typeof session === 'object' ? session : {}
  return {
    id: asTrimmedString(source.id),
    sessionId: asTrimmedString(source.sessionId || source.id),
    project: asTrimmedString(source.project),
    threadId: asTrimmedString(source.threadId),
    turnId: asTrimmedString(source.turnId),
    displayName: asTrimmedString(source.displayName),
    displayLabelPrimary: asTrimmedString(source.displayLabelPrimary),
    displayLabelSecondary: asTrimmedString(source.displayLabelSecondary),
    scope: asTrimmedString(source.scope || 'workspace') || 'workspace',
    cwd: asTrimmedString(source.cwd),
    shell: asTrimmedString(source.shell || 'default') || 'default',
    shellKind: asTrimmedString(source.shellKind || source.shell || 'shell') || 'shell',
    profileHint: asTrimmedString(source.profileHint),
    hostAccessRequired: source.hostAccessRequired === true,
    openedAt: Number(source.openedAt || 0) || 0,
    closedAt: Number(source.closedAt || 0) || 0,
    closeReason: asTrimmedString(source.closeReason),
    failureReason: asTrimmedString(source.failureReason),
    exitCode: source.exitCode ?? null,
    exitSignal: asTrimmedString(source.exitSignal),
    openedBy: asTrimmedString(source.openedBy).toLowerCase(),
    closedBy: asTrimmedString(source.closedBy).toLowerCase(),
    status: asTrimmedString(source.status || 'ended').toLowerCase() || 'ended',
    sessionTitle: asTrimmedString(source.sessionTitle),
    outputTail: Array.isArray(source.outputTail)
      ? source.outputTail.map((entry) => ({
          sequence: Number(entry?.sequence || 0) || 0,
          at: Number(entry?.at || 0) || 0,
          data: String(entry?.data || ''),
        }))
      : [],
    outputTruncated: source.outputTruncated === true,
    outputSequence: Number(source.outputSequence || 0) || 0,
    outputMode: asTrimmedString(source.outputMode || 'tail') || 'tail',
    policy: source.policy && typeof source.policy === 'object'
      ? { ...source.policy }
      : null,
    metadata: source.metadata && typeof source.metadata === 'object'
      ? { ...source.metadata }
      : null,
    memoryCandidateStatus: asTrimmedString(source.memoryCandidateStatus || 'none').toLowerCase() || 'none',
    memoryCandidateSummary: asTrimmedString(source.memoryCandidateSummary),
    memoryCandidateReason: asTrimmedString(source.memoryCandidateReason),
    memoryNodeId: asTrimmedString(source.memoryNodeId),
    archived: true,
  }
}

export function shouldLowercaseComparedPath(platform = '') {
  return asTrimmedString(platform).toLowerCase() === 'win32'
}

export function normalizePathForComparison(value = '', platform = '') {
  const normalized = asTrimmedString(value)
    .replace(/\\/g, '/')
    .replace(/\/+$/g, '')
  return shouldLowercaseComparedPath(platform)
    ? normalized.toLowerCase()
    : normalized
}

export function isSessionVisibleForProject(session, projectFolder, platform = '') {
  const normalizedProjectFolder = normalizePathForComparison(projectFolder, platform)
  if (!normalizedProjectFolder) return true
  const sessionCwd = normalizePathForComparison(session?.policy?.resolvedCwd || session?.cwd, platform)
  if (!sessionCwd) return false
  return sessionCwd === normalizedProjectFolder || sessionCwd.startsWith(`${normalizedProjectFolder}/`)
}

export function upsertSession(sessions = [], nextSession = null) {
  const normalized = normalizeTerminalSession(nextSession)
  if (!normalized.id) return Array.isArray(sessions) ? sessions : []
  const nextSessions = Array.isArray(sessions) ? [...sessions] : []
  const index = nextSessions.findIndex((entry) => entry.id === normalized.id)
  if (index >= 0) nextSessions[index] = { ...nextSessions[index], ...normalized }
  else nextSessions.unshift(normalized)
  nextSessions.sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0))
  return nextSessions
}

export function removeSession(sessions = [], sessionId = '') {
  const normalizedSessionId = asTrimmedString(sessionId)
  return Array.isArray(sessions)
    ? sessions.filter((entry) => entry.id !== normalizedSessionId)
    : []
}

export function upsertArchivedSession(archivedSessions = [], nextArchivedSession = null) {
  const normalized = normalizeTerminalArchiveSession(nextArchivedSession)
  if (!normalized.sessionId) return Array.isArray(archivedSessions) ? archivedSessions : []
  const nextArchivedSessions = Array.isArray(archivedSessions) ? [...archivedSessions] : []
  const index = nextArchivedSessions.findIndex((entry) => entry.sessionId === normalized.sessionId)
  if (index >= 0) nextArchivedSessions[index] = { ...nextArchivedSessions[index], ...normalized }
  else nextArchivedSessions.unshift(normalized)
  nextArchivedSessions.sort((left, right) => {
    const closedDelta = Number(right.closedAt || 0) - Number(left.closedAt || 0)
    if (closedDelta !== 0) return closedDelta
    return String(right.sessionId || '').localeCompare(String(left.sessionId || ''))
  })
  return nextArchivedSessions
}

export function replaceArchivedSessions(archivedSessions = []) {
  const normalized = (Array.isArray(archivedSessions) ? archivedSessions : [])
    .map((entry) => normalizeTerminalArchiveSession(entry))
    .filter((entry) => entry.sessionId)
  normalized.sort((left, right) => {
    const closedDelta = Number(right.closedAt || 0) - Number(left.closedAt || 0)
    if (closedDelta !== 0) return closedDelta
    return String(right.sessionId || '').localeCompare(String(left.sessionId || ''))
  })
  return normalized
}

export function removeArchivedSession(archivedSessions = [], sessionId = '') {
  const normalizedSessionId = asTrimmedString(sessionId)
  return Array.isArray(archivedSessions)
    ? archivedSessions.filter((entry) => entry.sessionId !== normalizedSessionId)
    : []
}

export function removeThreadSuggestionArchiveBySessionId(map = {}, sessionId = '') {
  const normalizedSessionId = asTrimmedString(sessionId)
  const sourceMap = map && typeof map === 'object' ? map : {}
  if (!normalizedSessionId) return sourceMap
  const next = {}
  for (const [threadId, archives] of Object.entries(sourceMap)) {
    const remaining = removeArchivedSession(archives, normalizedSessionId)
    if (remaining.length > 0) next[threadId] = remaining
  }
  return next
}

export function upsertThreadSuggestionArchives(map = {}, archive = null) {
  const normalizedArchive = normalizeTerminalArchiveSession(archive)
  const threadId = asTrimmedString(normalizedArchive.threadId)
  if (!threadId) return map && typeof map === 'object' ? map : {}
  const sourceMap = map && typeof map === 'object' ? map : {}
  return {
    ...sourceMap,
    [threadId]: upsertArchivedSession(sourceMap[threadId], normalizedArchive),
  }
}

export function findArchivedSessionBySessionId({
  archivedSessions = [],
  threadSuggestionArchivesByThreadId = {},
  sessionId = '',
} = {}) {
  const normalizedSessionId = asTrimmedString(sessionId)
  if (!normalizedSessionId) return null
  const panelMatch = (Array.isArray(archivedSessions) ? archivedSessions : [])
    .find((entry) => asTrimmedString(entry?.sessionId) === normalizedSessionId)
  if (panelMatch) return normalizeTerminalArchiveSession(panelMatch)
  const byThread = threadSuggestionArchivesByThreadId && typeof threadSuggestionArchivesByThreadId === 'object'
    ? threadSuggestionArchivesByThreadId
    : {}
  for (const archives of Object.values(byThread)) {
    const match = (Array.isArray(archives) ? archives : [])
      .find((entry) => asTrimmedString(entry?.sessionId) === normalizedSessionId)
    if (match) return normalizeTerminalArchiveSession(match)
  }
  return null
}

export function normalizeExpandedArchiveSessionIds(value) {
  return Array.isArray(value)
    ? value.map((entry) => asTrimmedString(entry)).filter(Boolean)
    : []
}

export function upsertBooleanMapEntry(map = {}, key = '', value = false) {
  const normalizedKey = asTrimmedString(key)
  const source = map && typeof map === 'object' ? map : {}
  if (!normalizedKey) return source
  return {
    ...source,
    [normalizedKey]: value === true,
  }
}

export function removeBooleanMapEntry(map = {}, key = '') {
  const normalizedKey = asTrimmedString(key)
  const source = map && typeof map === 'object' ? map : {}
  if (!normalizedKey || !Object.prototype.hasOwnProperty.call(source, normalizedKey)) return source
  const next = { ...source }
  delete next[normalizedKey]
  return next
}

export function selectNextActiveSessionId(sessions = [], preferredSessionId = '') {
  const normalizedPreferredId = asTrimmedString(preferredSessionId)
  if (normalizedPreferredId && sessions.some((entry) => entry.id === normalizedPreferredId)) {
    return normalizedPreferredId
  }
  return asTrimmedString(sessions[0]?.id)
}

function clampViewportMetric(value, fallback, min, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, Math.round(numeric)))
}

export function normalizeViewportMetrics(metrics = {}) {
  return {
    cols: clampViewportMetric(metrics.cols, DEFAULT_VIEWPORT_METRICS.cols, 20, 400),
    rows: clampViewportMetric(metrics.rows, DEFAULT_VIEWPORT_METRICS.rows, 5, 200),
  }
}

export function normalizeViewportMode(value = '') {
  const normalized = asTrimmedString(value).toLowerCase()
  if (
    normalized === 'chat_dock'
    || normalized === 'compact'
    || normalized === CHAT_TERMINAL_COMPACT_MODE
  ) {
    return CHAT_TERMINAL_COMPACT_MODE
  }
  return CHAT_TERMINAL_EXPANDED_MODE
}

export function normalizeRuntimeSurfaceKey(value = '') {
  const normalizedMode = normalizeViewportMode(value)
  return normalizedMode === CHAT_TERMINAL_COMPACT_MODE
    ? 'chat_dock'
    : 'terminal_panel'
}

export function clearUnreadFlagOnSession(sessions = [], sessionId = '') {
  const normalizedSessionId = asTrimmedString(sessionId)
  if (!normalizedSessionId) return Array.isArray(sessions) ? sessions : []
  let changed = false
  const nextSessions = (Array.isArray(sessions) ? sessions : []).map((session) => {
    if (asTrimmedString(session?.id) !== normalizedSessionId || session?.hasUnreadOutput !== true) return session
    changed = true
    return {
      ...session,
      hasUnreadOutput: false,
    }
  })
  return changed ? nextSessions : (Array.isArray(sessions) ? sessions : [])
}

export function shouldMarkSessionUnread(session = null, {
  activeSessionId = '',
  activeThreadId = '',
  activePanel = '',
  terminalDock = null,
} = {}) {
  const sessionId = asTrimmedString(session?.id)
  const sessionThreadId = asTrimmedString(session?.threadId)
  if (!sessionId || !sessionThreadId) return false

  const selectedTabId = asTrimmedString(terminalDock?.selectedTabId)
  if (sessionThreadId !== asTrimmedString(activeThreadId)) return true
  if (asTrimmedString(activePanel).toLowerCase() !== 'chat') return true
  if (terminalDock?.collapsed === true) return true
  if (selectedTabId) return selectedTabId !== sessionId
  return asTrimmedString(activeSessionId) !== sessionId
}

export function getSessionUnreadContext(session = null, activeSessionId = '') {
  const sessionThreadId = asTrimmedString(session?.threadId)
  if (!sessionThreadId) {
    return {
      activeSessionId,
      activeThreadId: '',
      activePanel: '',
      terminalDock: null,
    }
  }
  const appState = useAppStore.getState?.() || {}
  const chatState = useChatStore.getState?.() || {}
  const threadState = typeof chatState.getThreadState === 'function'
    ? chatState.getThreadState(sessionThreadId)
    : null
  return {
    activeSessionId,
    activeThreadId: asTrimmedString(appState.activeThreadId),
    activePanel: asTrimmedString(appState.activePanel),
    terminalDock: threadState?.terminalDock && typeof threadState.terminalDock === 'object'
      ? threadState.terminalDock
      : null,
  }
}

export function normalizeViewportMetricsByMode(metricsByMode = null) {
  const source = metricsByMode && typeof metricsByMode === 'object' ? metricsByMode : {}
  return {
    [CHAT_TERMINAL_EXPANDED_MODE]: normalizeViewportMetrics(
      source[CHAT_TERMINAL_EXPANDED_MODE]
      || source.expanded
      || source.terminal_panel
      || DEFAULT_VIEWPORT_METRICS,
    ),
    [CHAT_TERMINAL_COMPACT_MODE]: normalizeViewportMetrics(
      source[CHAT_TERMINAL_COMPACT_MODE]
      || source.compact
      || source.chat_dock
      || DEFAULT_VIEWPORT_METRICS,
    ),
  }
}

export function appendTelemetryEvent(events = [], type = '', detail = {}) {
  const next = [
    ...(Array.isArray(events) ? events : []),
    {
      type: asTrimmedString(type),
      detail: detail && typeof detail === 'object' ? { ...detail } : {},
      at: Date.now(),
    },
  ]
  return next.length > MAX_TERMINAL_TELEMETRY_EVENTS
    ? next.slice(next.length - MAX_TERMINAL_TELEMETRY_EVENTS)
    : next
}

function trimRawOutput(value = '') {
  const rawOutput = String(value || '')
  if (rawOutput.length <= TERMINAL_CLIENT_BUFFER_LIMIT) {
    return { rawOutput, truncated: false }
  }
  return {
    rawOutput: rawOutput.slice(rawOutput.length - TERMINAL_CLIENT_BUFFER_LIMIT),
    truncated: true,
  }
}

export function filterOutputStateByVisibleSessions(rawOutputBySessionId = {}, sessions = []) {
  const nextOutputBySessionId = {}
  const visibleSessionIds = new Set(
    (Array.isArray(sessions) ? sessions : [])
      .map((session) => asTrimmedString(session?.id))
      .filter(Boolean),
  )
  if (visibleSessionIds.size === 0) return nextOutputBySessionId
  const source = rawOutputBySessionId && typeof rawOutputBySessionId === 'object'
    ? rawOutputBySessionId
    : {}
  for (const sessionId of visibleSessionIds) {
    if (!source[sessionId]) continue
    nextOutputBySessionId[sessionId] = source[sessionId]
  }
  return nextOutputBySessionId
}

export function appendOutputState(previousState = null, chunk = '', sequence = undefined) {
  const previous = previousState && typeof previousState === 'object'
    ? previousState
    : DEFAULT_OUTPUT_STATE
  const nextSequence = Number(sequence)
  if (Number.isFinite(nextSequence) && nextSequence > 0 && nextSequence <= Number(previous.lastSequence || 0)) {
    return previous
  }
  const trimmed = trimRawOutput(`${previous.rawOutput || ''}${String(chunk || '')}`)
  return {
    rawOutput: trimmed.rawOutput,
    lastSequence: Number.isFinite(nextSequence) && nextSequence > 0
      ? nextSequence
      : Number(previous.lastSequence || 0) || 0,
    truncated: previous.truncated === true || trimmed.truncated,
  }
}

export function mergeAttachOutput(previousState = null, output = null) {
  const previous = previousState && typeof previousState === 'object'
    ? previousState
    : DEFAULT_OUTPUT_STATE
  const source = output && typeof output === 'object' ? output : {}
  const chunks = Array.isArray(source.chunks) ? source.chunks : []
  const nextSequence = Number(source.nextSequence || previous.lastSequence) || previous.lastSequence
  const previousLastSequence = Number(previous.lastSequence || 0) || 0
  const firstChunkSequence = Number(chunks[0]?.sequence || 0) || 0
  const truncatedSnapshot = source.truncated === true
  const hasSequenceGap = truncatedSnapshot
    && firstChunkSequence > 0
    && firstChunkSequence > (previousLastSequence + 1)
  const shouldReplaceFromSnapshot = truncatedSnapshot && (
    previousLastSequence <= 0
    || hasSequenceGap
  )
  const relevantChunks = source.truncated === true
    ? chunks
    : chunks.filter((entry) => Number(entry?.sequence || 0) > previousLastSequence)
  const chunkText = relevantChunks.map((entry) => String(entry?.data || '')).join('')
  const baseText = shouldReplaceFromSnapshot ? '' : previous.rawOutput
  const trimmed = trimRawOutput(`${baseText}${chunkText}`)
  return {
    rawOutput: trimmed.rawOutput,
    lastSequence: nextSequence,
    truncated: previous.truncated === true || source.truncated === true || trimmed.truncated,
  }
}

export async function disconnectSessionSubscription(sessionId) {
  const normalizedSessionId = asTrimmedString(sessionId)
  const cleanup = subscriptionCleanupBySessionId.get(normalizedSessionId)
  subscriptionCleanupBySessionId.delete(normalizedSessionId)
  if (typeof cleanup !== 'function') return
  try {
    await cleanup()
  } catch {
    // Best-effort renderer cleanup only.
  }
}

export async function disconnectAllSessionSubscriptions() {
  const sessionIds = Array.from(subscriptionCleanupBySessionId.keys())
  await Promise.allSettled(sessionIds.map((sessionId) => disconnectSessionSubscription(sessionId)))
}
