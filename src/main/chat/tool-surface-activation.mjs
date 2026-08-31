import {
  TOOL_SURFACE_ACTIVATION_DECAY,
  TOOL_SURFACE_ACTIVATION_REASON,
  TOOL_SURFACE_ACTIVATION_STATE,
  getToolSurfaceActivationReasonConfig,
  isToolSurfaceActivationReason,
  isToolSurfaceActivationState,
} from './tool-surface-activation-reasons.mjs'

export {
  TOOL_SURFACE_ACTIVATION_DECAY,
  TOOL_SURFACE_ACTIVATION_REASON,
  TOOL_SURFACE_ACTIVATION_STATE,
} from './tool-surface-activation-reasons.mjs'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeStringList(value) {
  const values = Array.isArray(value) ? value : [value]
  return [...new Set(values.map(normalizeText).filter(Boolean))]
}

function normalizeCapabilityId(value) {
  const capabilityId = normalizeText(value)
  if (!capabilityId) {
    throw new Error('capabilityId is required')
  }
  return capabilityId
}

function normalizeReason(reason) {
  const normalized = normalizeText(reason).toLowerCase()
  if (!isToolSurfaceActivationReason(normalized)) {
    throw new Error(`Invalid tool surface activation reason: ${reason}`)
  }
  return normalized
}

function normalizeState(state) {
  const normalized = normalizeText(state).toLowerCase()
  if (!isToolSurfaceActivationState(normalized)) {
    throw new Error(`Invalid tool surface activation state: ${state}`)
  }
  return normalized
}

function isStatusState(state) {
  return state === TOOL_SURFACE_ACTIVATION_STATE.BLOCKED
    || state === TOOL_SURFACE_ACTIVATION_STATE.UNAVAILABLE
}

function createRecord({
  capabilityId,
  state,
  reason,
  reasons = [reason],
  decay,
  activeToolStepsRemaining = null,
  primedForNextEligibleStep = false,
  persistAcrossCompaction = false,
  scope = null,
  blockedReason = '',
  unavailableReason = '',
  metadata = {},
}) {
  return {
    capabilityId: normalizeCapabilityId(capabilityId),
    state: normalizeState(state),
    reasons: normalizeStringList(reasons).map(normalizeReason),
    decay: normalizeText(decay),
    activeToolStepsRemaining: Number.isInteger(activeToolStepsRemaining) ? activeToolStepsRemaining : null,
    primedForNextEligibleStep: Boolean(primedForNextEligibleStep),
    persistAcrossCompaction: Boolean(persistAcrossCompaction),
    scope: normalizeText(scope) || null,
    blockedReason: normalizeText(blockedReason),
    unavailableReason: normalizeText(unavailableReason),
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...metadata } : {},
  }
}

function mergeReasons(current = [], next = []) {
  return normalizeStringList([...current, ...next]).map(normalizeReason)
}

function shouldReplaceStatusState(current, nextState) {
  if (!current || !isStatusState(current.state)) return true
  if (nextState === TOOL_SURFACE_ACTIVATION_STATE.UNAVAILABLE) return current.state !== nextState
  if (nextState === TOOL_SURFACE_ACTIVATION_STATE.BLOCKED) return current.state !== TOOL_SURFACE_ACTIVATION_STATE.UNAVAILABLE
  return false
}

export function createHiddenDiscoverableActivation(capabilityId, options = {}) {
  return createRecord({
    capabilityId,
    state: TOOL_SURFACE_ACTIVATION_STATE.HIDDEN_DISCOVERABLE,
    reason: options.reason || TOOL_SURFACE_ACTIVATION_REASON.CATALOG_READ,
    reasons: options.reasons || [],
    decay: options.decay || '',
    scope: options.scope,
    metadata: options.metadata,
  })
}

export function activateToolSurfaceCapability(currentRecord = null, {
  capabilityId = currentRecord?.capabilityId,
  reason,
  scope = null,
  blockedReason = '',
  unavailableReason = '',
  metadata = {},
} = {}) {
  const normalizedReason = normalizeReason(reason)
  const config = getToolSurfaceActivationReasonConfig(normalizedReason)
  const nextState = normalizeState(config.state)

  if (!shouldReplaceStatusState(currentRecord, nextState)) {
    return {
      ...currentRecord,
      reasons: mergeReasons(currentRecord.reasons, [normalizedReason]),
    }
  }

  return createRecord({
    capabilityId,
    state: nextState,
    reason: normalizedReason,
    reasons: mergeReasons(currentRecord?.reasons || [], [normalizedReason]),
    decay: config.decay,
    activeToolStepsRemaining: nextState === TOOL_SURFACE_ACTIVATION_STATE.ACTIVE
      ? config.activeToolStepsRemaining
      : null,
    primedForNextEligibleStep: nextState === TOOL_SURFACE_ACTIVATION_STATE.PRIMED,
    persistAcrossCompaction: config.persistAcrossCompaction,
    scope,
    blockedReason,
    unavailableReason,
    metadata,
  })
}

export function blockToolSurfaceCapability(currentRecord = null, options = {}) {
  return activateToolSurfaceCapability(currentRecord, {
    ...options,
    reason: TOOL_SURFACE_ACTIVATION_REASON.POLICY,
  })
}

export function markToolSurfaceCapabilityUnavailable(currentRecord = null, options = {}) {
  return activateToolSurfaceCapability(currentRecord, {
    ...options,
    reason: TOOL_SURFACE_ACTIVATION_REASON.RUNTIME_STATUS,
  })
}

export function consumePrimedToolSurfaceActivation(record = null) {
  if (!record || record.state !== TOOL_SURFACE_ACTIVATION_STATE.PRIMED) return record
  const catalogRead = record.reasons.includes(TOOL_SURFACE_ACTIVATION_REASON.CATALOG_READ)
  return createRecord({
    ...record,
    state: TOOL_SURFACE_ACTIVATION_STATE.ACTIVE,
    decay: catalogRead
      ? TOOL_SURFACE_ACTIVATION_DECAY.CURRENT_TURN_PLUS_TWO_STEPS
      : TOOL_SURFACE_ACTIVATION_DECAY.NEXT_ELIGIBLE_STEP,
    activeToolStepsRemaining: catalogRead ? 2 : 0,
    primedForNextEligibleStep: false,
    persistAcrossCompaction: false,
  })
}

export function decayToolSurfaceActivationAfterAssistantToolStep(record = null) {
  if (!record || isStatusState(record.state)) return record
  if (record.state === TOOL_SURFACE_ACTIVATION_STATE.PRIMED) {
    return createHiddenDiscoverableActivation(record.capabilityId)
  }
  if (record.state !== TOOL_SURFACE_ACTIVATION_STATE.ACTIVE) return record
  if (record.decay === TOOL_SURFACE_ACTIVATION_DECAY.DEFAULT_SURFACE) return record
  if (record.decay === TOOL_SURFACE_ACTIVATION_DECAY.THREAD_RELEVANCE) return record
  if (record.decay === TOOL_SURFACE_ACTIVATION_DECAY.CURRENT_TURN) {
    return record
  }
  if (record.activeToolStepsRemaining === null) return record
  const remaining = Math.max(0, record.activeToolStepsRemaining - 1)
  if (remaining === 0) {
    return createHiddenDiscoverableActivation(record.capabilityId)
  }
  return {
    ...record,
    activeToolStepsRemaining: remaining,
  }
}

export function decayToolSurfaceActivationAtTurnBoundary(record = null) {
  if (!record || isStatusState(record.state)) return record
  if (record.decay === TOOL_SURFACE_ACTIVATION_DECAY.DEFAULT_SURFACE) return record
  if (record.decay === TOOL_SURFACE_ACTIVATION_DECAY.THREAD_RELEVANCE) return record
  return createHiddenDiscoverableActivation(record.capabilityId)
}

export function serializeToolSurfaceActivationForCompaction(record = null, {
  referencedCapabilityIds = [],
} = {}) {
  if (!record) return null
  if (record.state === TOOL_SURFACE_ACTIVATION_STATE.PRIMED) return null
  if (record.decay === TOOL_SURFACE_ACTIVATION_DECAY.UNAVAILABLE_UNTIL_RUNTIME_CHANGE) return null
  const referenced = new Set(normalizeStringList(referencedCapabilityIds))
  if (record.persistAcrossCompaction) {
    if (
      referenced.size > 0
      && record.decay === TOOL_SURFACE_ACTIVATION_DECAY.THREAD_RELEVANCE
      && !referenced.has(record.capabilityId)
    ) {
      return null
    }
    return record
  }
  if (record.state === TOOL_SURFACE_ACTIVATION_STATE.ACTIVE && referenced.has(record.capabilityId)) {
    return {
      ...record,
      primedForNextEligibleStep: false,
    }
  }
  return null
}

export function restoreToolSurfaceActivationFromCompaction(serializedRecord = null) {
  if (!serializedRecord) return null
  return createRecord(serializedRecord)
}

export function summarizeToolSurfaceActivation(record = null) {
  if (!record) return null
  return {
    capabilityId: record.capabilityId,
    state: record.state,
    reasons: [...record.reasons],
    decay: record.decay,
    activeToolStepsRemaining: record.activeToolStepsRemaining,
    primedForNextEligibleStep: record.primedForNextEligibleStep,
    blockedReason: record.blockedReason,
    unavailableReason: record.unavailableReason,
  }
}
