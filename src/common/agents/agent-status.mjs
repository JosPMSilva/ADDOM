import { validateEnum } from './agent-contract-utils.mjs'

export const AGENT_RUN_STATUSES = Object.freeze([
  'created', 'queued', 'running', 'waiting', 'finalizing', 'cancelling', 'completed', 'failed', 'cancelled',
])
export const AGENT_NODE_STATUSES = Object.freeze([
  'queued', 'starting', 'running', 'waiting', 'approval_required', 'paused', 'cancelling', 'completed', 'failed', 'cancelled',
])
export const AGENT_ATTEMPT_STATUSES = Object.freeze([
  'queued', 'starting', 'running', 'waiting', 'approval_required', 'paused', 'cancelling', 'completed', 'failed', 'cancelled',
])
export const AGENT_TERMINAL_STATUSES = Object.freeze(['completed', 'failed', 'cancelled'])
export const AGENT_RECONCILIATION_STATES = Object.freeze([
  'pending_match',
  'matched',
  'provider_orphan',
  'opaque_unmatched',
  'reconciling',
  'provider_ahead',
  'provider_unverified_terminal',
  'forked_history',
])

const RUN_TRANSITIONS = Object.freeze({
  created: ['queued', 'running', 'cancelling', 'failed', 'cancelled'],
  queued: ['running', 'cancelling', 'failed', 'cancelled'],
  running: ['waiting', 'finalizing', 'cancelling', 'failed', 'cancelled'],
  waiting: ['running', 'finalizing', 'cancelling', 'failed', 'cancelled'],
  finalizing: ['cancelling', 'completed', 'failed', 'cancelled'],
  cancelling: ['failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
})

const EXECUTION_TRANSITIONS = Object.freeze({
  queued: ['starting', 'running', 'cancelling', 'failed', 'cancelled'],
  starting: ['running', 'waiting', 'approval_required', 'cancelling', 'completed', 'failed', 'cancelled'],
  running: ['waiting', 'approval_required', 'paused', 'cancelling', 'completed', 'failed', 'cancelled'],
  waiting: ['queued', 'running', 'approval_required', 'paused', 'cancelling', 'completed', 'failed', 'cancelled'],
  approval_required: ['running', 'waiting', 'cancelling', 'failed', 'cancelled'],
  paused: ['queued', 'starting', 'running', 'cancelling', 'failed', 'cancelled'],
  cancelling: ['failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
})

const STATUS_CONFIG = Object.freeze({
  run: { statuses: AGENT_RUN_STATUSES, transitions: RUN_TRANSITIONS },
  node: { statuses: AGENT_NODE_STATUSES, transitions: EXECUTION_TRANSITIONS },
  attempt: { statuses: AGENT_ATTEMPT_STATUSES, transitions: EXECUTION_TRANSITIONS },
})

export function validateAgentStatus(entity, status) {
  const config = STATUS_CONFIG[entity]
  if (!config) throw new TypeError(`Unknown agent status entity: ${entity}`)
  return validateEnum(status, `${entity} status`, config.statuses)
}

export function assertAgentStatusTransition(entity, from, to) {
  const config = STATUS_CONFIG[entity]
  if (!config) throw new TypeError(`Unknown agent status entity: ${entity}`)
  validateAgentStatus(entity, from)
  validateAgentStatus(entity, to)
  if (from === to) return true
  if (!config.transitions[from].includes(to)) {
    throw new TypeError(`Invalid ${entity} status transition: ${from} -> ${to}`)
  }
  return true
}
