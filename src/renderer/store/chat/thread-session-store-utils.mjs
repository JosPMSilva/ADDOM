import { createEmptyContextUsage, createEmptyCostEstimate, createEmptyContinuityStatus } from './usage-normalizers.mjs'
import { normalizePendingContextPrefixPayload } from './use-chat-store-helpers.mjs'
import { createEmptyLiveExecutionState } from './live-execution-store.mjs'
import useAppStore from '../useAppStore.js'
import { normalizeQuestionUserRequest } from '../../../common/chat/question-user-request.mjs'
import {
  applyProcessingModeThreadRemoval,
  applyProcessingModeThreadSelection,
} from './chat-processing-mode-store.mjs'
import { normalizePermissionMode } from '../../../common/chat/permission-mode.mjs'

const DEFAULT_THREAD_SESSION_ID = '__default__'
const DEFAULT_TERMINAL_DOCK_HEIGHT = 260
const DEFAULT_TERMINAL_BROWSER_SECTION = 'current_thread'

function normalizeTerminalBrowserSection(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'current_thread' || normalized === 'other_live' || normalized === 'history') {
    return normalized
  }
  return DEFAULT_TERMINAL_BROWSER_SECTION
}

function normalizeTerminalDockState(input = null) {
  const source = input && typeof input === 'object' ? input : {}
  const height = Number(source.height)
  const selectedTabId = String(source.selectedTabId || '').trim()
  const browserOpen = source.browserOpen === true
  const browserSelectionSessionId = String(source.browserSelectionSessionId || '').trim()
  const hasExplicitCollapsedState = source.collapsed === true || source.collapsed === false
  const hasRestorableDockTarget = Boolean(
    selectedTabId
    || browserOpen
    || browserSelectionSessionId,
  )
  return {
    collapsed: hasExplicitCollapsedState ? source.collapsed === true : !hasRestorableDockTarget,
    selectedTabId,
    browserOpen,
    browserSection: normalizeTerminalBrowserSection(source.browserSection),
    browserSelectionSessionId,
    height: Number.isFinite(height)
      ? Math.max(180, Math.min(520, Math.round(height)))
      : DEFAULT_TERMINAL_DOCK_HEIGHT,
  }
}

export function normalizeThreadSessionId(value) {
  const id = String(value ?? '').trim()
  return id || ''
}

export function resolveAppActiveThreadId() {
  try {
    return normalizeThreadSessionId(useAppStore.getState?.().activeThreadId)
  } catch {
    return ''
  }
}

export function resolveThreadSessionId(state, requestedThreadId = '') {
  return (
    normalizeThreadSessionId(requestedThreadId)
    || normalizeThreadSessionId(state?.activeThreadId)
    || resolveAppActiveThreadId()
    || DEFAULT_THREAD_SESSION_ID
  )
}

export function createEmptyThreadSession({
  selectedProvider = null,
  selectedModel = null,
  permissionMode = 'ask',
} = {}) {
  return {
    selectedProvider: selectedProvider || null,
    selectedModel: selectedModel || null,
    permissionMode: normalizePermissionMode(permissionMode),
    providerSwitchHint: null,
    pendingContextPrefix: '',
    messages: [],
    timeline: [],
    streamingId: null,
    streamingMessageIndex: null,
    streamingTimelineIndex: null,
    toolActivity: [],
    liveExecution: createEmptyLiveExecutionState(),
    contextUsage: createEmptyContextUsage(),
    costEstimate: createEmptyCostEstimate(),
    continuityStatus: createEmptyContinuityStatus(),
    notices: [],
    suppressedNoticeKeys: [],
    pendingQuestionUser: null,
    pendingPlanDirection: null,
    planDocumentReady: null,
    agentFanoutConfirmRequest: null,
    writeConflicts: [],
    terminalDock: normalizeTerminalDockState(),
  }
}

export function buildThreadProjectionPatch(threadSession) {
  const normalized = threadSession && typeof threadSession === 'object'
    ? threadSession
    : createEmptyThreadSession()
  return {
    selectedProvider: normalized.selectedProvider || null,
    selectedModel: normalized.selectedModel || null,
    permissionMode: normalizePermissionMode(normalized.permissionMode),
    providerSwitchHint: normalized.providerSwitchHint || null,
    pendingContextPrefix: normalizePendingContextPrefixPayload(normalized.pendingContextPrefix),
    messages: Array.isArray(normalized.messages) ? normalized.messages : [],
    timeline: Array.isArray(normalized.timeline) ? normalized.timeline : [],
    streamingId: normalized.streamingId || null,
    streamingMessageIndex: Number.isInteger(normalized.streamingMessageIndex) ? normalized.streamingMessageIndex : null,
    streamingTimelineIndex: Number.isInteger(normalized.streamingTimelineIndex) ? normalized.streamingTimelineIndex : null,
    toolActivity: Array.isArray(normalized.toolActivity) ? normalized.toolActivity : [],
    liveExecution: normalized.liveExecution || createEmptyLiveExecutionState(),
    contextUsage: normalized.contextUsage || createEmptyContextUsage(),
    costEstimate: normalized.costEstimate || createEmptyCostEstimate(),
    continuityStatus: normalized.continuityStatus || createEmptyContinuityStatus(),
    notices: Array.isArray(normalized.notices) ? normalized.notices : [],
    suppressedNoticeKeys: Array.isArray(normalized.suppressedNoticeKeys) ? normalized.suppressedNoticeKeys : [],
    pendingQuestionUser: normalizeQuestionUserRequest(normalized.pendingQuestionUser),
    pendingPlanDirection: normalized.pendingPlanDirection && typeof normalized.pendingPlanDirection === 'object' ? normalized.pendingPlanDirection : null,
    planDocumentReady: normalized.planDocumentReady && typeof normalized.planDocumentReady === 'object' ? normalized.planDocumentReady : null,
    agentFanoutConfirmRequest: normalized.agentFanoutConfirmRequest ?? null,
    writeConflicts: Array.isArray(normalized.writeConflicts) ? normalized.writeConflicts : [],
    terminalDock: normalizeTerminalDockState(normalized.terminalDock),
  }
}

export function snapshotProjectedThreadSession(state) {
  return {
    selectedProvider: state.selectedProvider || null,
    selectedModel: state.selectedModel || null,
    permissionMode: normalizePermissionMode(useAppStore.getState?.().permissionMode),
    providerSwitchHint: state.providerSwitchHint || null,
    pendingContextPrefix: normalizePendingContextPrefixPayload(state.pendingContextPrefix),
    messages: Array.isArray(state.messages) ? state.messages : [],
    timeline: Array.isArray(state.timeline) ? state.timeline : [],
    streamingId: state.streamingId || null,
    streamingMessageIndex: Number.isInteger(state.streamingMessageIndex) ? state.streamingMessageIndex : null,
    streamingTimelineIndex: Number.isInteger(state.streamingTimelineIndex) ? state.streamingTimelineIndex : null,
    toolActivity: Array.isArray(state.toolActivity) ? state.toolActivity : [],
    liveExecution: state.liveExecution || createEmptyLiveExecutionState(),
    contextUsage: state.contextUsage || createEmptyContextUsage(),
    costEstimate: state.costEstimate || createEmptyCostEstimate(),
    continuityStatus: state.continuityStatus || createEmptyContinuityStatus(),
    notices: Array.isArray(state.notices) ? state.notices : [],
    suppressedNoticeKeys: Array.isArray(state.suppressedNoticeKeys) ? state.suppressedNoticeKeys : [],
    pendingQuestionUser: normalizeQuestionUserRequest(state.pendingQuestionUser),
    pendingPlanDirection: state.pendingPlanDirection && typeof state.pendingPlanDirection === 'object' ? state.pendingPlanDirection : null,
    planDocumentReady: state.planDocumentReady && typeof state.planDocumentReady === 'object' ? state.planDocumentReady : null,
    agentFanoutConfirmRequest: state.agentFanoutConfirmRequest ?? null,
    writeConflicts: Array.isArray(state.writeConflicts) ? state.writeConflicts : [],
    terminalDock: normalizeTerminalDockState(state.terminalDock),
  }
}

export function buildThreadSelectionState(state, requestedThreadId = '') {
  const currentThreadId = resolveThreadSessionId(state, state?.activeThreadId)
  const nextThreadId = resolveThreadSessionId(state, requestedThreadId)
  const map = state?.threadStateById && typeof state.threadStateById === 'object'
    ? state.threadStateById
    : {}
  const nextMap = {
    ...map,
    [currentThreadId]: {
      ...(map[currentThreadId] || createEmptyThreadSession({
        selectedProvider: state?.selectedProvider || null,
        selectedModel: state?.selectedModel || null,
      })),
      ...snapshotProjectedThreadSession(state),
    },
  }
  const nextSession = nextMap[nextThreadId] || createEmptyThreadSession({
    selectedProvider: state?.selectedProvider || null,
    selectedModel: state?.selectedModel || null,
    permissionMode: useAppStore.getState?.().permissionMode,
  })
  nextMap[nextThreadId] = nextSession
  return applyProcessingModeThreadSelection(state, {
    activeThreadId: nextThreadId,
    threadStateById: nextMap,
    ...buildThreadProjectionPatch(nextSession),
  })
}

export function removeThreadSessionState(state, removedThreadId = '', successorThreadId = '') {
  const removedId = normalizeThreadSessionId(removedThreadId)
  if (!removedId) return {}
  const activeThreadId = resolveThreadSessionId(state, state?.activeThreadId)
  const map = state?.threadStateById && typeof state.threadStateById === 'object'
    ? { ...state.threadStateById }
    : {}
  delete map[removedId]
  const totals = state?.threadUsageTotals && typeof state.threadUsageTotals === 'object'
    ? { ...state.threadUsageTotals }
    : {}
  delete totals[removedId]
  if (activeThreadId !== removedId) {
    return applyProcessingModeThreadRemoval(
      state,
      { threadStateById: map, threadUsageTotals: totals },
      removedId,
    )
  }
  const nextThreadId = normalizeThreadSessionId(successorThreadId) || DEFAULT_THREAD_SESSION_ID
  const nextSession = map[nextThreadId] || createEmptyThreadSession({
    permissionMode: useAppStore.getState?.().permissionMode,
  })
  map[nextThreadId] = nextSession
  return applyProcessingModeThreadRemoval(state, {
    activeThreadId: nextThreadId,
    threadStateById: map,
    threadUsageTotals: totals,
    ...buildThreadProjectionPatch(nextSession),
  }, removedId)
}

export function captureChatRouteState(state) {
  return {
    activeThreadId: normalizeThreadSessionId(state?.activeThreadId),
    session: snapshotProjectedThreadSession(state),
  }
}

export function buildChatRouteRestoreState(state, snapshot = {}) {
  const activeThreadId = normalizeThreadSessionId(snapshot.activeThreadId)
  const session = snapshot.session && typeof snapshot.session === 'object'
    ? snapshot.session
    : createEmptyThreadSession()
  const map = state?.threadStateById && typeof state.threadStateById === 'object'
    ? state.threadStateById
    : {}
  return {
    activeThreadId,
    threadStateById: activeThreadId ? { ...map, [activeThreadId]: session } : map,
    ...buildThreadProjectionPatch(session),
  }
}

export function getThreadSessionSnapshot(state, requestedThreadId = '') {
  const threadId = resolveThreadSessionId(state, requestedThreadId)
  const activeThreadId = resolveThreadSessionId(state, state?.activeThreadId)
  if (threadId === activeThreadId) {
    return {
      threadId,
      ...snapshotProjectedThreadSession(state),
    }
  }
  const map = state?.threadStateById && typeof state.threadStateById === 'object'
    ? state.threadStateById
    : {}
  const session = map[threadId] || createEmptyThreadSession({
    selectedProvider: state?.selectedProvider || null,
    selectedModel: state?.selectedModel || null,
    permissionMode: useAppStore.getState?.().permissionMode,
  })
  return {
    threadId,
    ...buildThreadProjectionPatch(session),
  }
}

function hasActiveLiveExecution(threadSession = {}) {
  const liveExecution = threadSession?.liveExecution
  const turnsById = liveExecution?.turnsById && typeof liveExecution.turnsById === 'object'
    ? liveExecution.turnsById
    : {}
  return Object.values(turnsById).some((turn) => {
    const status = String(turn?.status || '').trim().toLowerCase()
    if (!['active', 'started', 'running'].includes(status)) return false
    const eventIds = Array.isArray(turn?.eventOrder) ? turn.eventOrder : []
    const eventsById = turn?.eventsById && typeof turn.eventsById === 'object'
      ? turn.eventsById
      : {}
    const hasTerminalEvent = eventIds.some((eventId) => {
      const event = eventsById[eventId]
      const eventKind = String(event?.activity?.eventKind || event?.eventKind || '').trim().toLowerCase()
      return eventKind === 'turn_completed'
        || eventKind === 'turn_cancelled'
        || eventKind === 'turn_interrupted'
        || eventKind === 'moa_delegation_done'
    })
    if (hasTerminalEvent) return false
    return eventIds.some((eventId) => {
      const event = eventsById[eventId]
      return String(event?.status || '').trim().toLowerCase() === 'active'
    })
  })
}

export function threadSessionHasLiveState(threadSession = {}) {
  const streamingId = String(threadSession?.streamingId || '').trim()
  const messages = Array.isArray(threadSession?.messages) ? threadSession.messages : []
  if (messages.some((message) => {
    if (String(message?.status || '').trim().toLowerCase() !== 'streaming') return false
    if (!streamingId) return true
    return String(message?.id || '').trim() === streamingId
  })) return true
  return hasActiveLiveExecution(threadSession)
}

export function updateThreadSessionState(state, targetThreadId, updater) {
  const threadId = resolveThreadSessionId(state, targetThreadId)
  const activeThreadId = resolveThreadSessionId(state, state?.activeThreadId)
  const map = state?.threadStateById && typeof state.threadStateById === 'object'
    ? state.threadStateById
    : {}
  const seededSession = map[threadId] || createEmptyThreadSession({
    selectedProvider: state?.selectedProvider || null,
    selectedModel: state?.selectedModel || null,
    permissionMode: useAppStore.getState?.().permissionMode,
  })
  const baseSession = threadId === activeThreadId
    ? { ...seededSession, ...snapshotProjectedThreadSession(state) }
    : seededSession
  const patch = typeof updater === 'function' ? updater(baseSession, threadId) : null
  if (!patch || typeof patch !== 'object') return {}
  const nextSession = {
    ...baseSession,
    ...patch,
  }
  const nextThreadStateById = {
    ...map,
    [threadId]: nextSession,
  }
  if (threadId !== activeThreadId) {
    return { threadStateById: nextThreadStateById }
  }
  return {
    threadStateById: nextThreadStateById,
    ...buildThreadProjectionPatch(nextSession),
  }
}

export function findThreadIdByMessageId(state, messageId) {
  const targetId = String(messageId || '').trim()
  const activeThreadId = resolveThreadSessionId(state, state?.activeThreadId)
  if (!targetId) return activeThreadId
  const activeMessages = Array.isArray(state?.messages) ? state.messages : []
  if (activeMessages.some((entry) => String(entry?.id || '').trim() === targetId)) {
    return activeThreadId
  }
  const map = state?.threadStateById && typeof state.threadStateById === 'object'
    ? state.threadStateById
    : {}
  for (const [threadId, threadState] of Object.entries(map)) {
    const rows = Array.isArray(threadState?.messages) ? threadState.messages : []
    if (rows.some((entry) => String(entry?.id || '').trim() === targetId)) {
      return resolveThreadSessionId(state, threadId)
    }
  }
  return activeThreadId
}

function threadContainsMessageId(state, threadId, messageId) {
  const targetThreadId = resolveThreadSessionId(state, threadId)
  const targetMessageId = String(messageId || '').trim()
  if (!targetThreadId || !targetMessageId) return false
  const activeThreadId = resolveThreadSessionId(state, state?.activeThreadId)
  if (targetThreadId === activeThreadId) {
    const activeMessages = Array.isArray(state?.messages) ? state.messages : []
    return activeMessages.some((entry) => String(entry?.id || '').trim() === targetMessageId)
  }
  const map = state?.threadStateById && typeof state.threadStateById === 'object'
    ? state.threadStateById
    : {}
  const rows = Array.isArray(map?.[targetThreadId]?.messages) ? map[targetThreadId].messages : []
  return rows.some((entry) => String(entry?.id || '').trim() === targetMessageId)
}

export function resolveTargetThreadIdForMessage(state, explicitThreadId = '', messageId = '') {
  const requested = String(explicitThreadId || '').trim()
  const targetMessageId = String(messageId || '').trim()
  if (!requested) return findThreadIdByMessageId(state, targetMessageId)
  const resolvedRequested = resolveThreadSessionId(state, requested)
  if (!targetMessageId) return resolvedRequested
  if (threadContainsMessageId(state, resolvedRequested, targetMessageId)) {
    return resolvedRequested
  }
  const byMessageId = findThreadIdByMessageId(state, targetMessageId)
  if (threadContainsMessageId(state, byMessageId, targetMessageId)) {
    return byMessageId
  }
  return resolvedRequested
}
