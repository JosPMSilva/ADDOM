import { resolveRoleByIdentity } from '../moa/moa-policy.mjs'

export const MAX_MOA_AGENT_RETRY_ATTEMPTS = 1

const RETRYABLE_STATUSES = new Set(['timeout', 'aborted', 'failed'])
const TERMINAL_STATUSES = new Set(['rate_limited', 'missing_api_key', 'not_found', 'budget_exceeded'])

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function ensureState(state = null) {
  const target = state && typeof state === 'object' ? state : {}
  if (!(target.taskAttempts instanceof Map)) {
    target.taskAttempts = new Map()
  }
  return target
}

export function createMoaRetryState() {
  return { taskAttempts: new Map(), roleDispatchCounts: new Map() }
}

export function buildMoaTaskSignature(task = {}, moaRoles = []) {
  const role = resolveRoleByIdentity(task, moaRoles)
  const roleKey = clean(role?.id || task?.agent_role_id || task?.agent_role)
  const providerId = clean(role?.providerId)
  const model = clean(role?.model)
  return [
    `role:${roleKey}`,
    `provider:${providerId}`,
    `model:${model}`,
    `instruction:${clean(task?.instruction)}`,
    `context:${clean(task?.injected_context)}`,
    `format:${clean(task?.expected_output_format)}`,
  ].join('\n')
}

export function getMoaRetryRecord(state = null, signature = '') {
  const normalizedSignature = clean(signature)
  if (!normalizedSignature) {
    return {
      signature: '',
      attempts: 0,
      terminalForTurn: false,
      lastStatus: '',
      lastError: '',
    }
  }
  const target = ensureState(state)
  const existing = target.taskAttempts.get(normalizedSignature)
  if (existing) return existing
  const created = {
    signature: normalizedSignature,
    attempts: 0,
    terminalForTurn: false,
    lastStatus: '',
    lastError: '',
  }
  target.taskAttempts.set(normalizedSignature, created)
  return created
}

export function isMoaRetryableAgentStatus(status = '') {
  return RETRYABLE_STATUSES.has(clean(status).toLowerCase())
}

export function isMoaTerminalAgentStatus(status = '') {
  return TERMINAL_STATUSES.has(clean(status).toLowerCase())
}

export function isMoaTaskTerminalForTurn(state = null, signature = '') {
  return getMoaRetryRecord(state, signature).terminalForTurn === true
}

export function shouldRetryMoaTask(state = null, signature = '', status = '') {
  const record = getMoaRetryRecord(state, signature)
  return (
    isMoaRetryableAgentStatus(status)
    && !record.terminalForTurn
    && Number(record.attempts || 0) < MAX_MOA_AGENT_RETRY_ATTEMPTS
  )
}

export function noteMoaTaskRetryScheduled(state = null, signature = '', { status = '', error = '' } = {}) {
  const record = getMoaRetryRecord(state, signature)
  record.attempts = Number(record.attempts || 0) + 1
  record.lastStatus = clean(status).toLowerCase()
  record.lastError = String(error || '').trim()
  record.terminalForTurn = false
  return record
}

export function noteMoaTaskTerminalFailure(state = null, signature = '', { status = '', error = '' } = {}) {
  const record = getMoaRetryRecord(state, signature)
  record.lastStatus = clean(status).toLowerCase()
  record.lastError = String(error || '').trim()
  record.terminalForTurn = true
  return record
}

export function noteMoaTaskSuccess(state = null, signature = '', { status = 'completed', error = '' } = {}) {
  const record = getMoaRetryRecord(state, signature)
  record.lastStatus = clean(status).toLowerCase() || 'completed'
  record.lastError = String(error || '').trim()
  if (record.terminalForTurn !== true) {
    record.terminalForTurn = false
  }
  return record
}
