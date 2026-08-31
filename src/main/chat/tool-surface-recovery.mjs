import { COMPACT_DELEGATION_TOOL_NAMES, RAW_DELEGATION_TOOL_NAME } from './delegation-tool-surface.mjs'
import {
  TOOL_SURFACE_ACTIVATION_REASON,
  activateToolSurfaceCapability,
} from './tool-surface-activation.mjs'
import { buildBuiltInCapabilityEntries } from '../tools/capability-catalog-builtins.mjs'
import { toAISDKTools } from '../tools/tool-definitions.mjs'
import { recordDevHiddenKnownToolRecovery } from './dev-tool-surface-diagnostics.mjs'

export const TOOL_SURFACE_RECOVERY_CODES = Object.freeze({
  HIDDEN_KNOWN_TOOL: 'hidden_known_tool',
  HIDDEN_KNOWN_TOOL_DISABLED_FOR_TURN: 'hidden_known_tool_disabled_for_turn',
})

export const TOOL_SURFACE_RECOVERY_FAILURE_CLASSES = Object.freeze({
  HIDDEN_KNOWN_TOOL: 'HIDDEN_KNOWN_TOOL',
})

const MAX_HIDDEN_KNOWN_ATTEMPTS_PER_TURN = 1

function normalizeName(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeName(value).toLowerCase()
}

function buildKnownToolIndex() {
  const out = new Map()
  for (const entry of buildBuiltInCapabilityEntries()) {
    const capabilityId = normalizeName(entry?.id)
    if (!capabilityId) continue
    const catalogPath = normalizeName(entry?.limits?.pagePath) || `addom://capabilities/${normalizeName(entry?.slug) || capabilityId}.md`
    for (const toolName of Array.isArray(entry?.toolsAfterActivation) ? entry.toolsAfterActivation : []) {
      const normalizedToolName = normalizeKey(toolName)
      if (!normalizedToolName) continue
      out.set(normalizedToolName, {
        toolName: normalizeName(toolName),
        capabilityId,
        capabilityTitle: normalizeName(entry?.title) || capabilityId,
        catalogPath,
        toolsAfterActivation: Array.isArray(entry?.toolsAfterActivation)
          ? entry.toolsAfterActivation.map(normalizeName).filter(Boolean)
          : [],
      })
    }
  }
  return out
}

const KNOWN_TOOL_INDEX = buildKnownToolIndex()

function buildVisibleToolSet(toolNames = []) {
  return new Set(
    (Array.isArray(toolNames) ? toolNames : [])
      .map(normalizeKey)
      .filter(Boolean),
  )
}

function getRecoveryState(loop = null) {
  if (!loop || typeof loop !== 'object') return null
  if (!(loop.toolSurfaceRecoveryAttempts instanceof Map)) {
    loop.toolSurfaceRecoveryAttempts = new Map()
  }
  return loop.toolSurfaceRecoveryAttempts
}

function buildAttemptKey({
  activeThreadId = '',
  activeTurnId = '',
  capabilityId = '',
  toolName = '',
  errorKind = TOOL_SURFACE_RECOVERY_CODES.HIDDEN_KNOWN_TOOL,
} = {}) {
  return [
    normalizeKey(activeThreadId),
    normalizeKey(activeTurnId),
    normalizeKey(capabilityId),
    normalizeKey(toolName),
    normalizeKey(errorKind),
  ].join('::')
}

function ensureActivationList(loop = null) {
  if (!loop || typeof loop !== 'object') return []
  if (!Array.isArray(loop.toolSurfaceActivations)) {
    loop.toolSurfaceActivations = []
  }
  return loop.toolSurfaceActivations
}

function getAllKnownToolDefinitions() {
  return toAISDKTools('ask', true, { includeTerminalSessionTools: true })
}

export function resolveHiddenKnownToolRecovery({
  toolName = '',
  visibleToolNames = [],
} = {}) {
  const normalizedToolName = normalizeKey(toolName)
  if (!normalizedToolName) return null
  const visible = buildVisibleToolSet(visibleToolNames)
  if (visible.size === 0 || visible.has(normalizedToolName)) return null
  const known = KNOWN_TOOL_INDEX.get(normalizedToolName)
  if (!known) return null
  return {
    ...known,
    attemptedToolName: normalizeName(toolName),
  }
}

export function resolveHiddenRerouteToolRecovery({
  rerouteToolName = '',
  visibleToolNames = [],
} = {}) {
  return resolveHiddenKnownToolRecovery({
    toolName: rerouteToolName,
    visibleToolNames,
  })
}

export function recordHiddenKnownToolRecoveryAttempt({
  loop = null,
  activeThreadId = '',
  activeTurnId = '',
  recovery = null,
} = {}) {
  const state = getRecoveryState(loop)
  const key = buildAttemptKey({
    activeThreadId,
    activeTurnId,
    capabilityId: recovery?.capabilityId,
    toolName: recovery?.attemptedToolName || recovery?.toolName,
  })
  if (!state || !recovery) {
    return {
      key,
      attemptCount: 1,
      blockedForTurn: false,
    }
  }
  const attemptCount = (Number(state.get(key) || 0) || 0) + 1
  state.set(key, attemptCount)
  return {
    key,
    attemptCount,
    blockedForTurn: attemptCount > MAX_HIDDEN_KNOWN_ATTEMPTS_PER_TURN,
  }
}

export function createHiddenKnownToolActivation(recovery = null) {
  if (!recovery?.capabilityId) return null
  return activateToolSurfaceCapability(null, {
    capabilityId: recovery.capabilityId,
    reason: TOOL_SURFACE_ACTIVATION_REASON.HIDDEN_KNOWN_RECOVERY,
    metadata: {
      attemptedToolName: recovery.attemptedToolName || recovery.toolName,
      catalogPath: recovery.catalogPath,
    },
  })
}

export function primeHiddenKnownToolRecovery({
  loop = null,
  recovery = null,
  activeToolDefinitions = {},
  tools = {},
  toolExecutionMap = {},
} = {}) {
  if (!recovery) return null
  const activation = createHiddenKnownToolActivation(recovery)
  if (activation) ensureActivationList(loop).push(activation)

  const allKnownToolDefinitions = getAllKnownToolDefinitions()
  const toolNames = Array.isArray(recovery.toolsAfterActivation) && recovery.toolsAfterActivation.length > 0
    ? recovery.toolsAfterActivation
    : [recovery.toolName]
  for (const toolName of toolNames) {
    const normalizedToolName = normalizeName(toolName)
    const definition = allKnownToolDefinitions[normalizedToolName]
    if (!normalizedToolName || !definition) continue
    if (activeToolDefinitions && typeof activeToolDefinitions === 'object') {
      activeToolDefinitions[normalizedToolName] = definition
    }
    if (tools && typeof tools === 'object') {
      tools[normalizedToolName] = definition
    }
    if (
      toolExecutionMap
      && typeof toolExecutionMap === 'object'
      && COMPACT_DELEGATION_TOOL_NAMES.includes(normalizedToolName)
    ) {
      toolExecutionMap[normalizedToolName] = RAW_DELEGATION_TOOL_NAME
    }
  }
  return activation
}

export function primeHiddenRerouteToolRecovery({
  loop = null,
  rerouteToolName = '',
  visibleToolNames = [],
  activeToolDefinitions = {},
  tools = {},
  toolExecutionMap = {},
} = {}) {
  const recovery = resolveHiddenRerouteToolRecovery({
    rerouteToolName,
    visibleToolNames,
  })
  if (!recovery) return null
  return primeHiddenKnownToolRecovery({
    loop,
    recovery,
    activeToolDefinitions,
    tools,
    toolExecutionMap,
  })
}

export function buildHiddenKnownToolRecoveryResult({
  recovery = null,
  blockedForTurn = false,
} = {}) {
  const toolName = normalizeName(recovery?.attemptedToolName || recovery?.toolName) || 'tool'
  const title = normalizeName(recovery?.capabilityTitle) || 'the related capability'
  const catalogPath = normalizeName(recovery?.catalogPath) || 'addom://capabilities/index.md'
  if (blockedForTurn) {
    return `Tool error: ${toolName} is disabled for this turn after repeated hidden-tool recovery attempts. Use read_file on ${catalogPath} or continue with a currently visible tool.`
  }
  return `Tool error: ${toolName} is a known ADDOM tool, but it is hidden on the current compact tool surface. ${title} is primed for the next model step. Retry ${toolName} after the surface refreshes, or read ${catalogPath}.`
}

export function buildHiddenKnownToolLintResult({
  blockedForTurn = false,
} = {}) {
  return {
    decision: 'reject',
    lintCode: blockedForTurn
      ? TOOL_SURFACE_RECOVERY_CODES.HIDDEN_KNOWN_TOOL_DISABLED_FOR_TURN
      : TOOL_SURFACE_RECOVERY_CODES.HIDDEN_KNOWN_TOOL,
    failureClass: TOOL_SURFACE_RECOVERY_FAILURE_CLASSES.HIDDEN_KNOWN_TOOL,
    rerouteToolName: 'read_file',
    severity: 'error',
  }
}

export function recordHiddenKnownToolRecoveryDiagnostics(errorDiagnostics = {}, {
  recovery = null,
  blockedForTurn = false,
} = {}) {
  const diagnostics = errorDiagnostics && typeof errorDiagnostics === 'object' ? errorDiagnostics : null
  if (!diagnostics || !recovery) return
  diagnostics.toolSurfaceHiddenKnownRecoveryCount = Number(diagnostics.toolSurfaceHiddenKnownRecoveryCount || 0) + 1
  if (blockedForTurn) {
    diagnostics.toolSurfaceHiddenKnownRecoveryBlockedCount = Number(diagnostics.toolSurfaceHiddenKnownRecoveryBlockedCount || 0) + 1
  }
  if (!diagnostics.toolSurfaceHiddenKnownRecoveryCapabilities || typeof diagnostics.toolSurfaceHiddenKnownRecoveryCapabilities !== 'object') {
    diagnostics.toolSurfaceHiddenKnownRecoveryCapabilities = {}
  }
  const capabilityId = normalizeName(recovery.capabilityId)
  if (capabilityId) {
    diagnostics.toolSurfaceHiddenKnownRecoveryCapabilities[capabilityId] =
      Number(diagnostics.toolSurfaceHiddenKnownRecoveryCapabilities[capabilityId] || 0) + 1
  }
  recordDevHiddenKnownToolRecovery(diagnostics, {
    recovery,
    blockedForTurn,
  })
}

export function handleHiddenKnownToolRecoveryStep({
  tc = {},
  toolInput = {},
  toolEventInput = {},
  visibleToolNames = [],
  loop = null,
  activeThreadId = '',
  activeTurnId = '',
  activeToolDefinitions = {},
  tools = {},
  toolExecutionMap = {},
  errorDiagnostics = {},
  recordToolStepOutcome = () => {},
  recordToolWorkflowOutcome = () => {},
  turnToolResults = [],
  history = [],
  send = () => {},
  persistTimelineEvent = () => {},
  buildToolResultMessage = () => ({}),
  trimText = (value) => String(value ?? ''),
  extractRunCommandMeta = () => ({}),
  stepId = '',
  stepSequence = 0,
  stepStartedAt = 0,
  providerId = '',
  model = '',
  promptBudgetProfile = null,
  turnStartedAt = 0,
} = {}) {
  const recovery = resolveHiddenKnownToolRecovery({
    toolName: tc?.name,
    visibleToolNames,
  })
  if (!recovery) return { handled: false }

  const attempt = recordHiddenKnownToolRecoveryAttempt({
    loop,
    activeThreadId,
    activeTurnId,
    recovery,
  })
  const lintResult = buildHiddenKnownToolLintResult({
    blockedForTurn: attempt.blockedForTurn,
  })
  if (!attempt.blockedForTurn) {
    primeHiddenKnownToolRecovery({
      loop,
      recovery,
      activeToolDefinitions,
      tools,
      toolExecutionMap,
    })
  }
  recordHiddenKnownToolRecoveryDiagnostics(errorDiagnostics, {
    recovery,
    blockedForTurn: attempt.blockedForTurn,
  })

  const stepFinishedAt = Date.now()
  const durationMs = Math.max(0, stepFinishedAt - stepStartedAt)
  recordToolStepOutcome({
    turnToolResults,
    history,
    send,
    persistTimelineEvent,
    buildToolResultMessage,
    trimText,
    extractRunCommandMeta,
    approvalId: '',
    tc,
    toolInput,
    toolEventInput,
    result: buildHiddenKnownToolRecoveryResult({
      recovery,
      blockedForTurn: attempt.blockedForTurn,
    }),
    isError: true,
    decision: 'approved',
    denyReason: '',
    missingDependencySuspected: false,
    stepId,
    sequence: stepSequence,
    startedAt: stepStartedAt,
    finishedAt: stepFinishedAt,
    durationMs,
    threadId: activeThreadId,
    turnId: activeTurnId,
    providerId,
    model,
    promptBudgetProfile,
    errorDiagnostics,
    lintResult,
  })
  recordToolWorkflowOutcome(errorDiagnostics, {
    toolName: tc?.name,
    decision: 'approved',
    isError: true,
    failureClass: lintResult.failureClass || '',
    rerouteToolName: lintResult.rerouteToolName || '',
    turnStartedAt,
    finishedAt: stepFinishedAt,
    repeatedBlockedRetry: attempt.blockedForTurn,
  })
  return {
    handled: true,
    blockedForTurn: attempt.blockedForTurn,
    recovery,
    lintResult,
  }
}
