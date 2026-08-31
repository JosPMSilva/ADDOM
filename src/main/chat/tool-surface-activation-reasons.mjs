export const TOOL_SURFACE_ACTIVATION_STATES = Object.freeze([
  'hidden_discoverable',
  'primed',
  'active',
  'blocked',
  'unavailable',
])

export const TOOL_SURFACE_ACTIVATION_REASONS = Object.freeze([
  'default_core',
  'strong_intent',
  'catalog_read',
  'explicit_request',
  'hidden_known_recovery',
  'policy',
  'runtime_status',
])

export const TOOL_SURFACE_ACTIVATION_REASON = Object.freeze({
  DEFAULT_CORE: 'default_core',
  STRONG_INTENT: 'strong_intent',
  CATALOG_READ: 'catalog_read',
  EXPLICIT_REQUEST: 'explicit_request',
  HIDDEN_KNOWN_RECOVERY: 'hidden_known_recovery',
  POLICY: 'policy',
  RUNTIME_STATUS: 'runtime_status',
})

export const TOOL_SURFACE_ACTIVATION_STATE = Object.freeze({
  HIDDEN_DISCOVERABLE: 'hidden_discoverable',
  PRIMED: 'primed',
  ACTIVE: 'active',
  BLOCKED: 'blocked',
  UNAVAILABLE: 'unavailable',
})

export const TOOL_SURFACE_ACTIVATION_DECAY = Object.freeze({
  DEFAULT_SURFACE: 'default_surface',
  CURRENT_TURN: 'current_turn',
  CURRENT_TURN_PLUS_TWO_STEPS: 'current_turn_plus_two_steps',
  NEXT_ELIGIBLE_STEP: 'next_eligible_step',
  THREAD_RELEVANCE: 'thread_relevance',
  BLOCKED_UNTIL_POLICY_CHANGE: 'blocked_until_policy_change',
  UNAVAILABLE_UNTIL_RUNTIME_CHANGE: 'unavailable_until_runtime_change',
})

export const TOOL_SURFACE_ACTIVATION_REASON_CONFIG = Object.freeze({
  default_core: Object.freeze({
    state: 'active',
    decay: 'default_surface',
    persistAcrossCompaction: true,
  }),
  strong_intent: Object.freeze({
    state: 'active',
    decay: 'current_turn',
    persistAcrossCompaction: false,
  }),
  catalog_read: Object.freeze({
    state: 'primed',
    decay: 'current_turn_plus_two_steps',
    activeToolStepsRemaining: 2,
    persistAcrossCompaction: false,
  }),
  explicit_request: Object.freeze({
    state: 'active',
    decay: 'thread_relevance',
    persistAcrossCompaction: true,
  }),
  hidden_known_recovery: Object.freeze({
    state: 'primed',
    decay: 'next_eligible_step',
    activeToolStepsRemaining: 0,
    persistAcrossCompaction: false,
  }),
  policy: Object.freeze({
    state: 'blocked',
    decay: 'blocked_until_policy_change',
    persistAcrossCompaction: true,
  }),
  runtime_status: Object.freeze({
    state: 'unavailable',
    decay: 'unavailable_until_runtime_change',
    persistAcrossCompaction: false,
  }),
})

export function isToolSurfaceActivationState(value) {
  return TOOL_SURFACE_ACTIVATION_STATES.includes(value)
}

export function isToolSurfaceActivationReason(value) {
  return TOOL_SURFACE_ACTIVATION_REASONS.includes(value)
}

export function getToolSurfaceActivationReasonConfig(reason) {
  return TOOL_SURFACE_ACTIVATION_REASON_CONFIG[reason] || null
}
