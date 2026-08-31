import { normalizePermissionMode } from '../../common/chat/permission-mode.mjs'

const DEFAULT_MAX_RECENT_EVENTS = 5

function safeObject(input) {
  return input && typeof input === 'object' ? input : {}
}

function createEmptyCounters() {
  return {
    policyAdvisoryWarningsShown: 0,
    sandboxRoutesTaken: 0,
    elevationRequestsShown: 0,
    elevationRequestsApproved: 0,
    elevationRequestsDenied: 0,
    shellDialectMistakesDetected: 0,
    sessionRiskyAutoAllows: 0,
    permissionModePromptSuppressions: 0,
    terminalToolCycles: 0,
    terminalWaitTimeouts: 0,
    terminalLoopAlerts: 0,
  }
}

function createEmptyBreakdowns() {
  return {
    shellDialectMistakeKinds: {},
    eventKinds: {},
    policyDecisionsShown: {},
    policyDecisionsResult: {},
    elevationReasonKindsShown: {},
    elevationReasonKindsResult: {},
    hostPolicyReasonKinds: {},
    promptSuppressionsByPermissionMode: {},
    toolApprovalAutoAllowSources: {},
    terminalToolActions: {},
    terminalLoopAlertKinds: {},
  }
}

export function createRunCommandPolicyTelemetryState({ maxRecentEvents = DEFAULT_MAX_RECENT_EVENTS } = {}) {
  return {
    counters: createEmptyCounters(),
    breakdowns: createEmptyBreakdowns(),
    recentEvents: [],
    terminalSessionState: {},
    maxRecentEvents: Number.isFinite(maxRecentEvents) && maxRecentEvents > 0
      ? Math.max(1, Math.floor(maxRecentEvents))
      : DEFAULT_MAX_RECENT_EVENTS,
  }
}

function bump(map, key, by = 1) {
  const k = String(key || '').trim()
  if (!k) return
  map[k] = (Number(map[k] || 0) || 0) + by
}

function pushEvent(state, event = {}) {
  const st = safeObject(state)
  if (!Array.isArray(st.recentEvents)) return
  const row = {
    at: Number(event.at || Date.now()),
    type: String(event.type || 'event'),
    ...(event.payload && typeof event.payload === 'object' ? { payload: event.payload } : {}),
  }
  st.recentEvents.push(row)
  const max = Number(st.maxRecentEvents || DEFAULT_MAX_RECENT_EVENTS) || DEFAULT_MAX_RECENT_EVENTS
  if (st.recentEvents.length > max) {
    st.recentEvents.splice(0, st.recentEvents.length - max)
  }
}

function normalizePolicyReasons(policy = {}) {
  const direct = Array.isArray(policy?.policyReasons) ? policy.policyReasons : null
  const fallback = Array.isArray(policy?.reasons) ? policy.reasons : null
  const list = (direct || fallback || [])
    .map((v) => String(v || '').trim())
    .filter(Boolean)
  return Array.from(new Set(list))
}

function detectShellDialectMistakeKind({ command = '', shell = '', stderr = '', hints = [] } = {}) {
  const cmd = String(command || '').toLowerCase()
  const sh = String(shell || '').toLowerCase()
  const err = String(stderr || '').toLowerCase()
  const hintText = Array.isArray(hints) ? hints.map((h) => String(h || '')).join('\n').toLowerCase() : ''

  if (
    /dir\s+\/a\b/.test(cmd)
    && (sh.includes('powershell') || /get-childitem|cannot find path '.*:\\a'/.test(err) || /get-childitem -force/.test(hintText))
  ) {
    return 'powershell_dir_slash_a'
  }
  if (hintText.includes('get-childitem -force')) return 'powershell_cmd_flags'
  if (hintText.includes('shell hints')) return 'shell_hint_other'
  return 'unknown'
}

function getTerminalSessionState(state, sessionId = '') {
  const st = safeObject(state)
  if (!st.terminalSessionState || typeof st.terminalSessionState !== 'object') {
    st.terminalSessionState = {}
  }
  const normalizedSessionId = String(sessionId || '').trim()
  if (!normalizedSessionId) return null
  if (!st.terminalSessionState[normalizedSessionId]) {
    st.terminalSessionState[normalizedSessionId] = {
      lastOutputSequence: 0,
      lastWriteCommandHash: '',
      lastWriteOutputSequence: 0,
      consecutiveWaitTimeoutsWithoutProgress: 0,
      repeatedWritesWithoutProgress: 0,
    }
  }
  return st.terminalSessionState[normalizedSessionId]
}

function readTerminalSessionState(state, sessionId = '') {
  const st = safeObject(state)
  const normalizedSessionId = String(sessionId || '').trim()
  if (!normalizedSessionId) return null
  if (!st.terminalSessionState || typeof st.terminalSessionState !== 'object') return null
  return st.terminalSessionState[normalizedSessionId] || null
}

export function recordRunCommandPolicyTelemetryEvent(state, eventType, payload = {}) {
  const st = safeObject(state)
  if (!st.counters || !st.breakdowns) return null
  const type = String(eventType || '').trim() || 'event'
  bump(st.breakdowns.eventKinds, type)

  if (type === 'routed_to_sandbox') st.counters.sandboxRoutesTaken += 1
  if (type === 'host_policy_blocked' || type === 'host_policy_elevation_required') {
    const reasons = Array.isArray(payload?.reasons)
      ? payload.reasons.map((v) => String(v || '').trim()).filter(Boolean)
      : []
    for (const reason of reasons) bump(st.breakdowns.hostPolicyReasonKinds, reason)
  }

  pushEvent(st, { type, payload })
  return { type, payload }
}

export function recordToolApprovalPromptDecisionTelemetry(state, input = {}) {
  const st = safeObject(state)
  if (!st.counters || !st.breakdowns) return null
  const source = String(input?.source || '').trim() || 'unknown'
  const action = String(input?.action || '').trim() || 'unknown'
  const toolName = String(input?.toolName || '').trim() || 'unknown'
  const commandClass = String(input?.commandClass || '').trim()
  const permissionMode = normalizePermissionMode(input?.permissionMode)

  if (source === 'risky_action_session' && action === 'approve') {
    st.counters.sessionRiskyAutoAllows += 1
    bump(st.breakdowns.toolApprovalAutoAllowSources, source)
  }

  const isPermissionModeSuppression = (
    source === 'permission_mode_ask'
    || source === 'permission_mode_autonomy'
    || source === 'permission_mode_full_access'
  )
  if (isPermissionModeSuppression) {
    st.counters.permissionModePromptSuppressions += 1
    bump(st.breakdowns.promptSuppressionsByPermissionMode, permissionMode)
    if (action === 'approve') bump(st.breakdowns.toolApprovalAutoAllowSources, source)
  }

  pushEvent(st, {
    type: 'tool_approval_prompt_decision',
    payload: {
      source,
      action,
      toolName,
      ...(commandClass ? { commandClass } : {}),
      permissionMode,
    },
  })
  return { source, action }
}

export function recordRunCommandApprovalTelemetryShown(state, policy = null) {
  const st = safeObject(state)
  const p = safeObject(policy)
  if (!st.counters || !st.breakdowns || String(p.type || '') !== 'run_command_policy_v1') return null

  const decision = String(p.policyDecision || '').trim() || 'unknown'
  bump(st.breakdowns.policyDecisionsShown, decision)

  const hints = Array.isArray(p.hints) ? p.hints.map((h) => String(h || '').trim()).filter(Boolean) : []
  if (hints.length > 0 || decision === 'allow_with_warning') {
    st.counters.policyAdvisoryWarningsShown += 1
  }
  if (p.elevationRequired === true) {
    st.counters.elevationRequestsShown += 1
    for (const reason of normalizePolicyReasons(p)) bump(st.breakdowns.elevationReasonKindsShown, reason)
  }

  pushEvent(st, {
    type: 'approval_shown',
    payload: {
      policyDecision: decision,
      elevationRequired: !!p.elevationRequired,
      hintCount: hints.length,
      executionTarget: String(p.executionTarget || ''),
      commandClass: String(p.commandClass || ''),
    },
  })
  return true
}

export function recordRunCommandApprovalTelemetryDecision(state, { policy = null, decision = '' } = {}) {
  const st = safeObject(state)
  const p = safeObject(policy)
  if (!st.counters || !st.breakdowns || String(p.type || '') !== 'run_command_policy_v1') return null

  const normalizedDecision = String(decision || '').trim().toLowerCase() === 'approved' ? 'approved' : 'denied'
  const policyDecision = String(p.policyDecision || '').trim() || 'unknown'
  bump(st.breakdowns.policyDecisionsResult, `${policyDecision}:${normalizedDecision}`)

  if (p.elevationRequired === true) {
    if (normalizedDecision === 'approved') st.counters.elevationRequestsApproved += 1
    else st.counters.elevationRequestsDenied += 1
    for (const reason of normalizePolicyReasons(p)) {
      bump(st.breakdowns.elevationReasonKindsResult, `${reason}:${normalizedDecision}`)
    }
  }

  pushEvent(st, {
    type: 'approval_decision',
    payload: {
      decision: normalizedDecision,
      policyDecision,
      elevationRequired: !!p.elevationRequired,
      executionTarget: String(p.executionTarget || ''),
      commandClass: String(p.commandClass || ''),
    },
  })
  return true
}

export function recordRunCommandShellDialectHints(state, { command = '', shell = '', stderr = '', hints = [] } = {}) {
  const st = safeObject(state)
  if (!st.counters || !st.breakdowns) return null
  const list = Array.isArray(hints) ? hints.map((h) => String(h || '').trim()).filter(Boolean) : []
  if (list.length === 0) return null

  st.counters.shellDialectMistakesDetected += 1
  const kind = detectShellDialectMistakeKind({ command, shell, stderr, hints: list })
  bump(st.breakdowns.shellDialectMistakeKinds, kind)

  pushEvent(st, {
    type: 'shell_dialect_hint',
    payload: {
      kind,
      shell: String(shell || ''),
      commandPreview: String(command || '').slice(0, 200),
      hintCount: list.length,
    },
  })
  return kind
}

export function recordTerminalToolContextTelemetry(state, fact = {}) {
  const st = safeObject(state)
  if (!st.counters || !st.breakdowns) return null
  if (String(fact?.kind || '').trim() !== 'terminal_session') return null

  const action = String(fact?.action || fact?.toolName || '').trim() || 'terminal_session'
  const sessionId = String(fact?.sessionId || '').trim()
  const outputSequence = Number(fact?.outputSequence || 0) || 0
  const sinceSequence = Number(fact?.sinceSequence || 0) || 0
  const hasExplicitOutputProgress = typeof fact?.outputProgress === 'boolean'
  const outputProgress = hasExplicitOutputProgress
    ? fact.outputProgress === true
    : (action !== 'write' && outputSequence > 0 && outputSequence > sinceSequence)

  st.counters.terminalToolCycles += 1
  bump(st.breakdowns.terminalToolActions, action)

  const sessionState = getTerminalSessionState(st, sessionId)
  if (sessionState && (action === 'open' || action === 'attach' || action === 'read_snapshot')) {
    sessionState.consecutiveWaitTimeoutsWithoutProgress = 0
    sessionState.repeatedWritesWithoutProgress = 0
  }
  if (outputProgress && sessionState) {
    sessionState.lastOutputSequence = Math.max(sessionState.lastOutputSequence, outputSequence)
    sessionState.consecutiveWaitTimeoutsWithoutProgress = 0
    sessionState.repeatedWritesWithoutProgress = 0
  }

  if (action === 'wait_for_output' && fact?.timedOut === true) {
    st.counters.terminalWaitTimeouts += 1
    if (sessionState && !outputProgress) {
      sessionState.consecutiveWaitTimeoutsWithoutProgress += 1
      if (sessionState.consecutiveWaitTimeoutsWithoutProgress === 2) {
        st.counters.terminalLoopAlerts += 1
        bump(st.breakdowns.terminalLoopAlertKinds, 'wait_timeout_streak')
        pushEvent(st, {
          type: 'terminal_loop_alert',
          payload: {
            kind: 'wait_timeout_streak',
            sessionId,
            action,
            outputSequence,
            sinceSequence,
          },
        })
      }
    }
  } else if (action === 'wait_for_output' && sessionState) {
    sessionState.consecutiveWaitTimeoutsWithoutProgress = 0
  }

  if (action === 'write' && sessionState) {
    const commandHash = String(fact?.commandHash || '').trim()
    const repeatedWriteWithoutProgress = (
      !!commandHash
      && commandHash === sessionState.lastWriteCommandHash
      && !outputProgress
      && outputSequence === sessionState.lastWriteOutputSequence
    )
    if (repeatedWriteWithoutProgress) {
      sessionState.repeatedWritesWithoutProgress += 1
      if (sessionState.repeatedWritesWithoutProgress === 1) {
        st.counters.terminalLoopAlerts += 1
        bump(st.breakdowns.terminalLoopAlertKinds, 'repeated_write_no_output_progress')
        pushEvent(st, {
          type: 'terminal_loop_alert',
          payload: {
            kind: 'repeated_write_no_output_progress',
            sessionId,
            action,
            outputSequence,
          },
        })
      }
    } else {
      sessionState.repeatedWritesWithoutProgress = 0
    }
    sessionState.lastWriteCommandHash = commandHash
    sessionState.lastWriteOutputSequence = outputSequence
  }

  if (action === 'close' && sessionId && st.terminalSessionState && st.terminalSessionState[sessionId]) {
    delete st.terminalSessionState[sessionId]
  }

  pushEvent(st, {
    type: 'terminal_tool',
    payload: {
      sessionId,
      action,
      outputSequence,
      sinceSequence,
      matched: fact?.matched === true,
      timedOut: fact?.timedOut === true,
      outputProgress,
    },
  })
  return {
    sessionId,
    action,
    outputProgress,
  }
}

export function inspectTerminalToolLoopState(state, {
  sessionId = '',
  action = '',
  commandHash = '',
} = {}) {
  const normalizedSessionId = String(sessionId || '').trim()
  const normalizedAction = String(action || '').trim()
  if (!normalizedSessionId || !normalizedAction) {
    return { blocked: false, reason: '', sessionId: normalizedSessionId }
  }
  const sessionState = readTerminalSessionState(state, normalizedSessionId)
  if (!sessionState) {
    return { blocked: false, reason: '', sessionId: normalizedSessionId }
  }

  if (normalizedAction === 'wait_for_output' && sessionState.consecutiveWaitTimeoutsWithoutProgress >= 2) {
    return {
      blocked: true,
      reason: 'wait_timeout_streak',
      sessionId: normalizedSessionId,
      recentOutputSequence: Number(sessionState.lastOutputSequence || 0) || 0,
      guidance: 'Read a fresh terminal snapshot or change the command before waiting again.',
    }
  }

  if (
    normalizedAction === 'write'
    && commandHash
    && commandHash === String(sessionState.lastWriteCommandHash || '').trim()
    && sessionState.repeatedWritesWithoutProgress >= 1
  ) {
    return {
      blocked: true,
      reason: 'repeated_write_no_output_progress',
      sessionId: normalizedSessionId,
      recentOutputSequence: Number(sessionState.lastOutputSequence || 0) || 0,
      guidance: 'Inspect the terminal state or send a different command instead of repeating the same write.',
    }
  }

  return {
    blocked: false,
    reason: '',
    sessionId: normalizedSessionId,
    recentOutputSequence: Number(sessionState.lastOutputSequence || 0) || 0,
  }
}

export function clearRunCommandPolicyTelemetry(state) {
  const st = safeObject(state)
  st.counters = createEmptyCounters()
  st.breakdowns = createEmptyBreakdowns()
  st.recentEvents = []
  st.terminalSessionState = {}
  if (!Number.isFinite(st.maxRecentEvents) || st.maxRecentEvents <= 0) {
    st.maxRecentEvents = DEFAULT_MAX_RECENT_EVENTS
  }
  return st
}

export function getRunCommandPolicyTelemetrySnapshot(state) {
  const st = safeObject(state)
  return {
    counters: { ...createEmptyCounters(), ...safeObject(st.counters) },
    breakdowns: {
      shellDialectMistakeKinds: { ...safeObject(st.breakdowns?.shellDialectMistakeKinds) },
      eventKinds: { ...safeObject(st.breakdowns?.eventKinds) },
      policyDecisionsShown: { ...safeObject(st.breakdowns?.policyDecisionsShown) },
      policyDecisionsResult: { ...safeObject(st.breakdowns?.policyDecisionsResult) },
      elevationReasonKindsShown: { ...safeObject(st.breakdowns?.elevationReasonKindsShown) },
      elevationReasonKindsResult: { ...safeObject(st.breakdowns?.elevationReasonKindsResult) },
      hostPolicyReasonKinds: { ...safeObject(st.breakdowns?.hostPolicyReasonKinds) },
      promptSuppressionsByPermissionMode: { ...safeObject(st.breakdowns?.promptSuppressionsByPermissionMode) },
      toolApprovalAutoAllowSources: { ...safeObject(st.breakdowns?.toolApprovalAutoAllowSources) },
      terminalToolActions: { ...safeObject(st.breakdowns?.terminalToolActions) },
      terminalLoopAlertKinds: { ...safeObject(st.breakdowns?.terminalLoopAlertKinds) },
    },
    recentEvents: Array.isArray(st.recentEvents) ? st.recentEvents.map((row) => ({
      at: Number(row?.at || 0),
      type: String(row?.type || ''),
      ...(row?.payload && typeof row.payload === 'object' ? { payload: { ...row.payload } } : {}),
    })) : [],
    maxRecentEvents: Number(st.maxRecentEvents || DEFAULT_MAX_RECENT_EVENTS) || DEFAULT_MAX_RECENT_EVENTS,
  }
}

const GLOBAL_RUN_COMMAND_POLICY_TELEMETRY = createRunCommandPolicyTelemetryState()

export function recordGlobalRunCommandPolicyTelemetryEvent(eventType, payload = {}) {
  return recordRunCommandPolicyTelemetryEvent(GLOBAL_RUN_COMMAND_POLICY_TELEMETRY, eventType, payload)
}

export function recordGlobalRunCommandApprovalTelemetryShown(policy = null) {
  return recordRunCommandApprovalTelemetryShown(GLOBAL_RUN_COMMAND_POLICY_TELEMETRY, policy)
}

export function recordGlobalRunCommandApprovalTelemetryDecision(input = {}) {
  return recordRunCommandApprovalTelemetryDecision(GLOBAL_RUN_COMMAND_POLICY_TELEMETRY, input)
}

export function recordGlobalRunCommandShellDialectHints(input = {}) {
  return recordRunCommandShellDialectHints(GLOBAL_RUN_COMMAND_POLICY_TELEMETRY, input)
}

export function recordGlobalTerminalToolContextTelemetry(fact = {}) {
  return recordTerminalToolContextTelemetry(GLOBAL_RUN_COMMAND_POLICY_TELEMETRY, fact)
}

export function inspectGlobalTerminalToolLoopState(input = {}) {
  return inspectTerminalToolLoopState(GLOBAL_RUN_COMMAND_POLICY_TELEMETRY, input)
}

export function getGlobalRunCommandPolicyTelemetrySnapshot() {
  return getRunCommandPolicyTelemetrySnapshot(GLOBAL_RUN_COMMAND_POLICY_TELEMETRY)
}

export function clearGlobalRunCommandPolicyTelemetry() {
  return clearRunCommandPolicyTelemetry(GLOBAL_RUN_COMMAND_POLICY_TELEMETRY)
}

export function recordGlobalToolApprovalPromptDecisionTelemetry(input = {}) {
  return recordToolApprovalPromptDecisionTelemetry(GLOBAL_RUN_COMMAND_POLICY_TELEMETRY, input)
}
