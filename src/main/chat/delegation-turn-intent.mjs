import { hasExplicitDelegationRequest } from './delegation-tool-surface.mjs'

export const DELEGATION_TURN_INTENTS = Object.freeze({
  REVIEW_ONLY: 'review_only',
  EXECUTE_AUTHORIZED: 'execute_authorized',
  MATERIAL_DECISION: 'material_decision',
  FOLLOW_ORIGINAL_REQUEST: 'follow_original_request',
})

export const DELEGATION_SELECTION_INTENTS = Object.freeze({
  MODEL_ROUTED: 'model_routed',
  ALL_CONFIGURED_ROLES: 'all_configured_roles',
})

const REVIEW_SIGNAL = /\b(?:review|audit|inspect|analy[sz]e|assess|evaluate|check|investigate|findings?|report)\b/i
const EXPLICIT_MUTATION_SIGNAL = /\b(?:apply|implement|patch|refactor|modify|update|rewrite|delete|remove|create|write|address|resolve)\b/i
const FIX_IMPERATIVE = /(?:^|[.;]\s*|\bthen\s+|\band\s+)(?:please\s+)?fix\b/i
const QUESTION_LEAD = /^\s*(?:what|which|where|when|why|how|would|could|should|can|do|does|is|are)\b/i
const MATERIAL_DECISION_SIGNAL = /\b(?:choose|decision|decide|trade[\s-]?off|whether|which\s+(?:database|provider|model|approach|option|architecture|strategy|framework|library)|options?)\b/i
const ROLE_SET_SIGNAL = /\b(?:agent\s+)?roles?\b/i
const ALL_ROLE_SIGNAL = /\b(?:all|every)\s+(?:(?:the|\d+|configured|available|shown|listed)\s+)*(?:agent\s+)?roles?\b/i
const EACH_ROLE_SIGNAL = /\beach\s+(?:one\s+)?(?:of\s+)?(?:the\s+)?(?:\d+\s+)?(?:(?:configured|available|shown|listed)\s+)?(?:agent\s+)?roles?\b/i
const EACH_REFERENT_SIGNAL = /\b(?:run|use|ask|send|spawn)\s+each\s+(?:one\s+)?(?:of\s+)?(?:them|these)\b/i
const EXPLICIT_RETRY_SIGNAL = /\b(?:try|run|do|repeat)\s+(?:(?:that|it|this)\s+)?again\b|\bretry\b|\b(?:same|previous)\s+(?:request|task|thing)\b/i

function hasAllConfiguredRolesIntent(text = '') {
  return ALL_ROLE_SIGNAL.test(text)
    || EACH_ROLE_SIGNAL.test(text)
    || (ROLE_SET_SIGNAL.test(text) && EACH_REFERENT_SIGNAL.test(text))
}

function extractMessageText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
}

function recentUserRequests(history = []) {
  return (Array.isArray(history) ? history : [])
    .filter((message) => message?.role === 'user')
    .slice(-8)
    .map((message) => extractMessageText(message?.content).trim())
    .filter(Boolean)
}

export function resolveDelegationRequestText(userMessage = '', { history = [] } = {}) {
  const current = String(userMessage || '').trim()
    || recentUserRequests(history).at(-1)
    || ''
  if (!current || !EXPLICIT_RETRY_SIGNAL.test(current)) return current
  return recentUserRequests(history)
    .reverse()
    .find((messageText) => messageText !== current && !EXPLICIT_RETRY_SIGNAL.test(messageText))
    || current
}

export function resolveDelegationSelectionIntent(userMessage = '', { history = [] } = {}) {
  const text = String(userMessage || '').trim()
  if (!text) return DELEGATION_SELECTION_INTENTS.MODEL_ROUTED
  if (hasAllConfiguredRolesIntent(text)) {
    return DELEGATION_SELECTION_INTENTS.ALL_CONFIGURED_ROLES
  }
  if (EXPLICIT_RETRY_SIGNAL.test(text) && Array.isArray(history)) {
    const priorRequest = resolveDelegationRequestText(text, { history })
    if (hasAllConfiguredRolesIntent(priorRequest)) {
      return DELEGATION_SELECTION_INTENTS.ALL_CONFIGURED_ROLES
    }
  }
  return DELEGATION_SELECTION_INTENTS.MODEL_ROUTED
}

export function resolveDelegationTurnIntent(userMessage = '') {
  const text = String(userMessage || '').trim()
  if (!text) return DELEGATION_TURN_INTENTS.FOLLOW_ORIGINAL_REQUEST

  const questionLed = QUESTION_LEAD.test(text)
  const explicitlyAuthorizesMutation = EXPLICIT_MUTATION_SIGNAL.test(text)
    || (!questionLed && FIX_IMPERATIVE.test(text))
  if (explicitlyAuthorizesMutation) {
    return DELEGATION_TURN_INTENTS.EXECUTE_AUTHORIZED
  }
  if (MATERIAL_DECISION_SIGNAL.test(text)) {
    return DELEGATION_TURN_INTENTS.MATERIAL_DECISION
  }
  if (REVIEW_SIGNAL.test(text)) {
    return DELEGATION_TURN_INTENTS.REVIEW_ONLY
  }
  return DELEGATION_TURN_INTENTS.FOLLOW_ORIGINAL_REQUEST
}

export function resolveDelegationTurnContext({
  turnOptions = {},
  userMessage = '',
  history = [],
} = {}) {
  const requiredTasks = turnOptions?.requiredAgentDelegation?.tasks
  return {
    orchestratorIntent: resolveDelegationTurnIntent(userMessage),
    delegationSelectionIntent: resolveDelegationSelectionIntent(userMessage, { history }),
    requestedDelegation: (Array.isArray(requiredTasks) && requiredTasks.length > 0)
      || hasExplicitDelegationRequest({ userMessage, history }),
  }
}
