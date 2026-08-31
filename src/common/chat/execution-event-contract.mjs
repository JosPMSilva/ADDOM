export const EXECUTION_CONTRACT_VERSION = 1
export const CANONICAL_ROOT_EVENT_SCHEMA_VERSION = 1

export const CANONICAL_ROOT_EVENT_ACTORS = Object.freeze([
  'root',
  'child_agent',
  'system',
  'provider',
])

export const CANONICAL_ROOT_EVENT_PHASES = Object.freeze([
  'input',
  'commentary',
  'reasoning',
  'tool',
  'final_answer',
  'lifecycle',
  'system',
])

export const CANONICAL_ROOT_EVENT_LIFECYCLES = Object.freeze([
  'created',
  'active',
  'completed',
  'succeeded',
  'failed',
  'cancelled',
  'interrupted',
])

export const CANONICAL_ROOT_EVENT_SUPPORT_DECISIONS = Object.freeze([
  'supported',
  'diagnostic_only',
  'unsupported',
  'legacy_unknown',
])

export const EXECUTION_EVENT_KINDS = Object.freeze([
  'turn_state',
  'reasoning_chunk',
  'tool_started',
  'tool_output',
  'tool_result',
  'file_change',
  'diagnostic',
])

export const EXECUTION_STATES = Object.freeze([
  'queued',
  'active',
  'succeeded',
  'failed',
  'cancelled',
  'interrupted',
])

export const EXECUTION_REASONING_ROLES = Object.freeze(['stage', 'commentary', 'reasoning'])

const EVENT_KIND_SET = new Set(EXECUTION_EVENT_KINDS)
const STATE_SET = new Set(EXECUTION_STATES)
const REASONING_ROLE_SET = new Set(EXECUTION_REASONING_ROLES)
const TERMINAL_STATE_SET = new Set(['succeeded', 'failed', 'cancelled', 'interrupted'])
const ROOT_ACTOR_SET = new Set(CANONICAL_ROOT_EVENT_ACTORS)
const ROOT_PHASE_SET = new Set(CANONICAL_ROOT_EVENT_PHASES)
const ROOT_LIFECYCLE_SET = new Set(CANONICAL_ROOT_EVENT_LIFECYCLES)
const ROOT_SUPPORT_DECISION_SET = new Set(CANONICAL_ROOT_EVENT_SUPPORT_DECISIONS)
const ROOT_TERMINAL_LIFECYCLE_SET = new Set(['completed', 'succeeded', 'failed', 'cancelled', 'interrupted'])

function trimmed(value) {
  return String(value ?? '').trim()
}

function finiteNumber(value) {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : 0
}

function requiredString(value, field, maxLength = 1_024) {
  const normalized = trimmed(value)
  if (!normalized) throw new TypeError(`Canonical root event ${field} is required`)
  if (normalized.length > maxLength) throw new TypeError(`Canonical root event ${field} is too long`)
  if (/\p{Cc}/u.test(normalized)) throw new TypeError(`Canonical root event ${field} contains control characters`)
  return normalized
}

function optionalString(value, field, maxLength = 2_048) {
  const normalized = trimmed(value)
  if (!normalized) return ''
  if (normalized.length > maxLength) throw new TypeError(`Canonical root event ${field} is too long`)
  if (/\p{Cc}/u.test(normalized)) throw new TypeError(`Canonical root event ${field} contains control characters`)
  return normalized
}

function requiredToken(value, field, allowed = null) {
  const normalized = requiredString(value, field, 120).toLowerCase()
  if (!/^[a-z][a-z0-9_.:-]*$/u.test(normalized)) {
    throw new TypeError(`Invalid canonical root event ${field}: ${normalized}`)
  }
  if (allowed && !allowed.has(normalized)) {
    throw new TypeError(`Invalid canonical root event ${field}: ${normalized}`)
  }
  return normalized
}

function positiveInteger(value, field) {
  const normalized = Number(value)
  if (!Number.isSafeInteger(normalized) || normalized < 1) {
    throw new TypeError(`Canonical root event ${field} must be a positive integer`)
  }
  return normalized
}

function cloneJsonPayload(value, path = 'payload', seen = new WeakSet()) {
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (/^data:[^,]*;base64,/iu.test(value.trim())) {
      throw new TypeError(`Canonical root event ${path} must not contain binary data; store a managed artifact reference`)
    }
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`Canonical root event ${path} must contain finite numbers`)
    return value
  }
  if (typeof value !== 'object') throw new TypeError(`Canonical root event ${path} must be JSON-compatible`)
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    throw new TypeError(`Canonical root event ${path} must not contain binary data; store a managed artifact reference`)
  }
  if (seen.has(value)) throw new TypeError(`Canonical root event ${path} must not contain cycles`)
  seen.add(value)
  if (Array.isArray(value)) {
    const cloned = value.map((entry, index) => cloneJsonPayload(entry, `${path}[${index}]`, seen))
    seen.delete(value)
    return cloned
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`Canonical root event ${path} must contain plain objects, not binary or class instances`)
  }
  const cloned = {}
  for (const [key, entry] of Object.entries(value)) {
    Object.defineProperty(cloned, key, {
      configurable: true,
      enumerable: true,
      value: cloneJsonPayload(entry, `${path}.${key}`, seen),
      writable: true,
    })
  }
  seen.delete(value)
  return cloned
}

function normalizeRootSource(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  return {
    providerId: optionalString(source.providerId, 'source.providerId', 256).toLowerCase(),
    transport: optionalString(source.transport, 'source.transport', 120).toLowerCase(),
    runtime: optionalString(source.runtime, 'source.runtime', 256).toLowerCase(),
    providerEventId: optionalString(source.providerEventId, 'source.providerEventId'),
    providerCorrelationKey: optionalString(source.providerCorrelationKey, 'source.providerCorrelationKey'),
  }
}

function normalizeRootActor(input = {}, threadId = '') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Canonical root event actor is required')
  }
  const kind = requiredToken(input.kind, 'actor.kind', ROOT_ACTOR_SET)
  const actor = {
    kind,
    id: requiredString(input.id, 'actor.id', 512),
    conversationId: optionalString(input.conversationId, 'actor.conversationId', 512),
    runId: optionalString(input.runId, 'actor.runId', 512),
  }
  if (kind === 'root' && actor.conversationId !== threadId) {
    throw new TypeError('Canonical root event root actor conversationId must match threadId')
  }
  if (kind === 'child_agent' && (!actor.conversationId || !actor.runId)) {
    throw new TypeError('Canonical root event child_agent actor requires accepted conversationId and runId')
  }
  return actor
}

export function isTerminalCanonicalRootLifecycle(value = '') {
  return ROOT_TERMINAL_LIFECYCLE_SET.has(trimmed(value).toLowerCase())
}

export function normalizeCanonicalRootEvent(input = {}) {
  const schemaVersion = positiveInteger(input?.schemaVersion, 'schemaVersion')
  if (schemaVersion !== CANONICAL_ROOT_EVENT_SCHEMA_VERSION) {
    throw new TypeError(`Unsupported canonical root event schemaVersion: ${schemaVersion}`)
  }
  const threadId = requiredString(input?.threadId, 'threadId', 512)
  const conversationId = requiredString(input?.conversationId, 'conversationId', 512)
  if (conversationId !== threadId) {
    throw new TypeError('Canonical root event conversationId must match threadId')
  }
  const createdAt = positiveInteger(input?.createdAt, 'createdAt')
  const updatedAt = positiveInteger(input?.updatedAt, 'updatedAt')
  if (updatedAt < createdAt) throw new TypeError('Canonical root event updatedAt must not precede createdAt')
  const payloadInput = input?.payload ?? {}
  if (!payloadInput || typeof payloadInput !== 'object') {
    throw new TypeError('Canonical root event payload must be an object or array')
  }

  return Object.freeze({
    schemaVersion,
    canonicalEventId: requiredString(input?.canonicalEventId, 'canonicalEventId', 512),
    projectId: requiredString(input?.projectId, 'projectId', 512),
    conversationId,
    threadId,
    turnId: requiredString(input?.turnId, 'turnId', 512),
    localSequence: positiveInteger(input?.localSequence, 'localSequence'),
    occurredAt: positiveInteger(input?.occurredAt, 'occurredAt'),
    createdAt,
    updatedAt,
    source: Object.freeze(normalizeRootSource(input?.source)),
    actor: Object.freeze(normalizeRootActor(input?.actor, threadId)),
    semanticKind: requiredToken(input?.semanticKind, 'semanticKind'),
    phase: requiredToken(input?.phase, 'phase', ROOT_PHASE_SET),
    lifecycle: requiredToken(input?.lifecycle, 'lifecycle', ROOT_LIFECYCLE_SET),
    payload: Object.freeze(cloneJsonPayload(payloadInput)),
    supportDecision: requiredToken(input?.supportDecision, 'supportDecision', ROOT_SUPPORT_DECISION_SET),
    progressiveKey: optionalString(input?.progressiveKey, 'progressiveKey', 1_024),
  })
}

export function normalizeExecutionEvent(input = {}) {
  const kind = trimmed(input?.kind).toLowerCase()
  const turnId = trimmed(input?.turnId)
  const state = trimmed(input?.state).toLowerCase()
  const reasoningRole = trimmed(input?.reasoningRole).toLowerCase()
  const terminal = input?.terminal === true

  if (!EVENT_KIND_SET.has(kind)) {
    throw new TypeError(`Invalid execution event kind: ${kind || '(empty)'}`)
  }
  if (!turnId) {
    throw new TypeError('Execution event turnId is required')
  }
  if (state && !STATE_SET.has(state)) {
    throw new TypeError(`Invalid execution event state: ${state}`)
  }
  if (reasoningRole && !REASONING_ROLE_SET.has(reasoningRole)) {
    throw new TypeError(`Invalid execution event reasoningRole: ${reasoningRole}`)
  }
  if (kind === 'turn_state' && terminal && !TERMINAL_STATE_SET.has(state)) {
    throw new TypeError(`Invalid terminal state: ${state || '(empty)'}`)
  }

  const toolInput = input?.toolInput && typeof input.toolInput === 'object' && !Array.isArray(input.toolInput)
    ? input.toolInput
    : null
  const output = Object.hasOwn(input || {}, 'output') ? input.output : undefined

  return {
    contractVersion: EXECUTION_CONTRACT_VERSION,
    kind,
    threadId: trimmed(input?.threadId),
    turnId,
    eventId: trimmed(input?.eventId),
    sessionId: trimmed(input?.sessionId),
    messageId: trimmed(input?.messageId),
    reasoningRole,
    ...(input?.reasoningSegment != null
      ? { reasoningSegment: Math.max(0, finiteNumber(input.reasoningSegment)) }
      : {}),
    toolKind: trimmed(input?.toolKind).toLowerCase(),
    state,
    detail: String(input?.detail ?? ''),
    stream: trimmed(input?.stream).toLowerCase(),
    sequence: finiteNumber(input?.sequence),
    emittedAt: finiteNumber(input?.emittedAt),
    terminal,
    diagnosticSeverity: trimmed(input?.diagnosticSeverity).toLowerCase(),
    ...(toolInput ? { toolInput } : {}),
    ...(output !== undefined ? { output } : {}),
  }
}
