import { formatToolResultForDisplay } from '../../../common/chat/tool-result-display.mjs'
import {
  extractToolIdentityDetail,
  isPlaceholderToolInputDetail,
} from '../../../common/chat/tool-identity.mjs'
import { buildReasoningEvent } from './live-execution-store-reasoning.mjs'
import { resolveCompletedTurnStatus } from './turn-status-classifier.mjs'

function normalizeId(value = '') {
  return String(value || '').trim()
}

function normalizeNumber(value = 0, fallback = 0) {
  const n = Number(value || 0) || 0
  return n > 0 ? n : fallback
}

function resolveActivitySessionId(activity = {}) {
  const turnId = normalizeId(activity?.turnId)
  const stepId = normalizeId(activity?.stepId)
  if (turnId && stepId) return `session:${turnId}:${stepId}`
  const activityId = normalizeId(activity?.id)
  if (turnId && activityId && (
    String(activity?.type || '').trim() === 'provider_tool'
    || String(activity?.eventKind || '').trim().startsWith('provider_tool_')
  )) {
    return `session:${turnId}:${activityId}`
  }
  return ''
}

export function resolveActivityEventKind(activity = {}) {
  return String(activity?.eventKind || '').trim().toLowerCase()
}

function isTransportEventKind(eventKind = '') {
  return (
    eventKind.startsWith('openai_websocket_')
    || eventKind === 'openai_continuity_status'
    || eventKind === 'background_response_queued'
    || eventKind === 'background_response_completed'
    || eventKind === 'background_response_failed'
    || eventKind === 'turn_started'
    || eventKind === 'turn_completed'
    || eventKind === 'turn_cancelled'
    || eventKind === 'turn_interrupted'
  )
}

function isCompactionEventKind(eventKind = '') {
  return (
    eventKind === 'context_compacted'
    || eventKind === 'continuity_compaction_applied'
    || eventKind === 'openai_compaction_event'
    || eventKind === 'compression_state'
  )
}

export function mapActivityToLiveKind(activity = {}) {
  const type = String(activity?.type || '').trim().toLowerCase()
  const eventKind = resolveActivityEventKind(activity)
  if (type === 'reasoning' || eventKind === 'reasoning_done') return 'reasoning'
  if (type === 'file_change' || eventKind === 'file_change') return 'file_change'
  if (type === 'usage' || eventKind === 'chat_usage') return 'usage'
  if (isCompactionEventKind(eventKind) || activity?.compactionMilestone === true) return 'compaction'
  if (type === 'warning') return 'warning'
  if ((type === 'result' && activity?.isError) || type === 'error') return 'error'
  if (isTransportEventKind(eventKind) || type === 'turn') return 'transport'
  if (type === 'executing') return 'tool_start'
  if (type === 'pending' || type === 'provider_tool') return 'tool_progress'
  if (type === 'result') return 'tool_result'
  return 'tool_progress'
}

function getTurnEvents(turn = null) {
  const eventIds = Array.isArray(turn?.eventOrder) ? turn.eventOrder : []
  const eventsById = turn?.eventsById && typeof turn.eventsById === 'object'
    ? turn.eventsById
    : {}
  return eventIds
    .map((eventId) => eventsById[eventId])
    .filter((event) => event && typeof event === 'object')
}

export function mapActivityToStatus(activity = {}, liveKind = '', turn = null) {
  const type = String(activity?.type || '').trim().toLowerCase()
  const activityStatus = String(activity?.status || '').trim().toLowerCase()
  const turnState = String(activity?.turnState || '').trim().toLowerCase()
  const turnStatus = String(activity?.turnStatus || '').trim().toLowerCase()
  const decision = String(activity?.decision || '').trim().toLowerCase()
  if (turnState) {
    if (turnState === 'cancelled') return 'cancelled'
    if (turnState === 'interrupted') return 'interrupted'
    if (turnState === 'completed') {
      return resolveCompletedTurnStatus({
        turnStatus: turnStatus || (activity?.isError ? 'error' : ''),
        activities: getTurnEvents(turn),
      })
    }
    if (type === 'turn' || liveKind === 'transport') return 'active'
  }
  if (decision === 'denied') return 'denied'
  if (liveKind === 'compaction') {
    if (activityStatus === 'requested' || activityStatus === 'running') return 'active'
    if (activityStatus === 'failed') return 'warning'
    if (activityStatus === 'applied') return 'done'
  }
  if (type === 'executing' || type === 'pending' || liveKind === 'tool_output') return 'active'
  if (type === 'result' && activity?.isError) return 'error'
  if (type === 'warning' || liveKind === 'warning') return 'warning'
  return 'done'
}

export function resolveMoaDelegationTerminalStatus(activity = {}) {
  const normalized = String(activity?.moa?.status || activity?.status || '').trim().toLowerCase()
  if (!normalized || normalized === 'completed' || normalized === 'done' || normalized === 'ok') {
    return 'done'
  }
  if (normalized === 'cancelled') return 'cancelled'
  return 'error'
}

function resolveCanonicalToolKind(activity = {}) {
  const toolName = String(activity?.toolName || '').trim().toLowerCase()
  if (!toolName) return 'tool'
  if (/command|shell|terminal|exec|bash|run_terminal|^shell$/.test(toolName)) return 'command'
  if (/delete/.test(toolName)) return 'file_delete'
  if (/edit|patch|rename|str_replace|search_replace|apply_patch/.test(toolName)) return 'file_edit'
  if (/write|create_file|create_directory|write_to_file/.test(toolName)) return 'file_write'
  if (/^read$|read_file|view_file|list_directory|list_dir|read_/.test(toolName)) return 'file_read'
  if (/fetch_page|web_|http_/.test(toolName)) return 'web'
  if (/search|find_files|grep_file|grep|glob/.test(toolName)) return 'search'
  if (/plan/.test(toolName)) return 'plan'
  if (/browser/.test(toolName)) return 'browser'
  if (/delegate|agent/.test(toolName)) return 'agent'
  // Never surface raw provider tool names as kinds — unknown maps to generic tool.
  return 'tool'
}

function resolveCanonicalInputDetail(activity = {}) {
  const explicitDetail = String(activity?.detail || '').trim()
  const toolKind = resolveCanonicalToolKind(activity)
  const extracted = extractToolIdentityDetail({
    toolInput: activity?.toolInput,
    output: activity?.output,
    detail: explicitDetail,
    toolKind,
  })
  if (extracted) return extracted

  if (explicitDetail && !isPlaceholderToolInputDetail(explicitDetail) && !explicitDetail.startsWith('{')) {
    return explicitDetail
  }

  const input = activity?.toolInput && typeof activity.toolInput === 'object'
    ? activity.toolInput
    : {}
  const args = input?.args && typeof input.args === 'object' ? input.args : input
  if (toolKind === 'command') return String(args.command || args.script || '').trim()
  if (toolKind.startsWith('file_')) {
    return String(
      args.path || args.filePath || args.file_path || args.targetFile || args.target_file || args.from || args.to || '',
    ).trim()
  }
  if (toolKind === 'search' || toolKind === 'web') {
    return String(args.query || args.url || args.pattern || args.glob || args.globPattern || '').trim()
  }
  return ''
}

function resolveCanonicalTerminalState(activity = {}) {
  const turnState = String(activity?.turnState || '').trim().toLowerCase()
  const turnStatus = String(activity?.turnStatus || '').trim().toLowerCase()
  if (turnState === 'cancelled' || turnState === 'canceled') return 'cancelled'
  if (turnState === 'interrupted') return 'interrupted'
  if (['error', 'failed', 'failure'].includes(turnStatus)) return 'failed'
  return 'succeeded'
}

export function mapActivityToCanonicalExecutionEvents(activity = {}) {
  const turnId = normalizeId(activity?.turnId)
  if (!turnId) return []
  const eventKind = resolveActivityEventKind(activity)
  const liveKind = mapActivityToLiveKind(activity)
  const sessionId = resolveActivitySessionId(activity)
  const emittedAt = normalizeNumber(
    activity?.finishedAt || activity?.updatedAt || activity?.createdAt || activity?.startedAt,
    Date.now(),
  )
  const base = {
    turnId,
    threadId: normalizeId(activity?.threadId),
    eventId: (() => {
      const activityId = normalizeId(activity?.id)
      const lifecycleKind = eventKind || liveKind
      if (activityId) {
        if (eventKind === 'provider_tool_status') {
          return `activity:${activityId}:${lifecycleKind}:${Number(activity?.sequence || 0) || emittedAt}`
        }
        return `activity:${activityId}:${lifecycleKind}`
      }
      return `activity:${turnId}:${lifecycleKind}:${emittedAt}`
    })(),
    sessionId,
    toolKind: resolveCanonicalToolKind(activity),
    detail: resolveCanonicalInputDetail(activity),
    sequence: Number(activity?.sequence || 0) || 0,
    emittedAt,
    ...(String(activity?.providerId || '').trim()
      ? { providerId: String(activity.providerId).trim().toLowerCase() }
      : {}),
  }

  if (eventKind === 'provider_tool_status') {
    if (!sessionId) return []
    const status = String(activity?.status || '').trim().toLowerCase()
    const toolInput = activity?.toolInput && typeof activity.toolInput === 'object'
      ? activity.toolInput
      : null
    return [{
      ...base,
      kind: 'tool_started',
      state: status === 'completed' ? 'succeeded' : 'active',
      ...(toolInput ? { toolInput } : {}),
    }]
  }

  if (liveKind === 'transport' && String(activity?.turnState || '').trim()) {
    const terminal = ['completed', 'cancelled', 'canceled', 'interrupted']
      .includes(String(activity?.turnState || '').trim().toLowerCase())
    return [{
      ...base,
      kind: 'turn_state',
      state: terminal ? resolveCanonicalTerminalState(activity) : 'active',
      terminal,
    }]
  }
  if (eventKind === 'moa_delegation_done') {
    const status = resolveMoaDelegationTerminalStatus(activity)
    return [{
      ...base,
      kind: 'turn_state',
      state: status === 'done' ? 'succeeded' : (status === 'cancelled' ? 'cancelled' : 'failed'),
      terminal: true,
    }]
  }
  if (liveKind === 'reasoning') {
    return [{
      ...base,
      kind: 'reasoning_chunk',
      messageId: normalizeId(activity?.messageId) || base.eventId,
      reasoningRole: 'reasoning',
      ...(activity?.reasoningSegment != null
        ? { reasoningSegment: Math.max(0, Number(activity.reasoningSegment) || 0) }
        : {}),
      state: 'active',
    }]
  }
  if (liveKind === 'file_change') {
    return [{ ...base, kind: 'file_change', state: 'succeeded' }]
  }
  if (sessionId && (liveKind === 'tool_start' || liveKind === 'tool_progress')) {
    return [{ ...base, kind: 'tool_started', state: 'active' }]
  }
  if (sessionId && (liveKind === 'tool_result' || liveKind === 'error')) {
    const resultDetail = formatToolResultForDisplay(String(activity?.toolName || ''), activity?.result)
    const rawDetail = String(activity?.detail || '').trim()
    const toolInput = activity?.toolInput && typeof activity.toolInput === 'object'
      ? activity.toolInput
      : null
    return [{
      ...base,
      kind: 'tool_result',
      state: activity?.isError === true || liveKind === 'error' ? 'failed' : 'succeeded',
      // Keep provider JSON/output text for L3; L2 identity is derived separately.
      detail: rawDetail || resultDetail || base.detail,
      ...(toolInput ? { toolInput } : {}),
      ...(activity?.output !== undefined ? { output: activity.output } : {}),
    }]
  }
  if (liveKind === 'warning' || liveKind === 'error' || liveKind === 'compaction') {
    return [{
      ...base,
      kind: 'diagnostic',
      diagnosticSeverity: liveKind === 'error' ? 'error' : (liveKind === 'warning' ? 'warning' : 'info'),
    }]
  }
  return []
}

export function buildActivityEvent(activity = {}) {
  const turnId = normalizeId(activity?.turnId)
  if (!turnId) return null
  const liveKind = mapActivityToLiveKind(activity)
  if (!liveKind) return null
  const turnState = String(activity?.turnState || '').trim().toLowerCase()
  const baseCreatedAt = normalizeNumber(activity?.createdAt || activity?.startedAt, Date.now())
  const updatedAt = normalizeNumber(activity?.finishedAt || activity?.updatedAt, baseCreatedAt)
  const createdAt = (
    liveKind === 'tool_result'
    || liveKind === 'error'
    || (liveKind === 'transport' && (turnState === 'completed' || turnState === 'cancelled' || turnState === 'interrupted'))
  )
    ? updatedAt
    : baseCreatedAt
  if (liveKind === 'reasoning') {
    return buildReasoningEvent({
      eventId: `activity:${normalizeId(activity?.id) || `${turnId}:reasoning:${createdAt}`}`,
      turnId,
      threadId: normalizeId(activity?.threadId),
      messageId: normalizeId(activity?.messageId),
      reasoningRole: 'reasoning',
      detail: String(activity?.detail || '').trim(),
      createdAt,
      updatedAt,
      status: mapActivityToStatus(activity, liveKind),
    })
  }
  const sessionId = resolveActivitySessionId(activity)
  const status = mapActivityToStatus(activity, liveKind)
  const summary = String(activity?.label || '').trim()
    || String(activity?.toolName || '').trim()
    || String(activity?.eventKind || liveKind).trim()
  const resultDetail = formatToolResultForDisplay(String(activity?.toolName || ''), activity?.result)
  return {
    id: `activity:${normalizeId(activity?.id) || `${turnId}:${liveKind}:${createdAt}`}`,
    turnId,
    threadId: normalizeId(activity?.threadId),
    stepId: normalizeId(activity?.stepId),
    sessionId,
    kind: liveKind,
    status,
    createdAt,
    updatedAt,
    summary,
    detail: String(activity?.detail || resultDetail || '').trim(),
    sequence: Number(activity?.sequence || 0) || 0,
    activity,
  }
}
