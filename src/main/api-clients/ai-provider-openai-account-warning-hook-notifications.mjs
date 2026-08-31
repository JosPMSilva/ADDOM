import { createOpenAIAccountRuntimeError } from './ai-provider-openai-account-shared.mjs'

const MAX_VISIBLE_TEXT_LENGTH = 2_000
const HOOK_EVENT_NAMES = new Set([
  'preToolUse',
  'postToolUse',
  'sessionStart',
  'userPromptSubmit',
  'stop',
])
const REVIEW_STATUSES = new Set(['inProgress', 'approved', 'denied', 'aborted'])
const RISK_LEVELS = new Set(['low', 'medium', 'high'])

function normalizeId(value = '') {
  return String(value || '').trim()
}

function visibleText(value = '') {
  const text = normalizeId(value)
  return text.length > MAX_VISIBLE_TEXT_LENGTH
    ? `${text.slice(0, MAX_VISIBLE_TEXT_LENGTH)}...`
    : text
}

function rejectMalformed(rejectTurn = () => {}, method = '') {
  rejectTurn(createOpenAIAccountRuntimeError(
    'account_runtime_malformed_activity',
    `OpenAI account runtime received malformed ${method} activity.`,
  ))
}

function normalizeConfigWarning(params = null, ordinal = 0) {
  const source = params && typeof params === 'object' ? params : {}
  const summary = visibleText(source.summary)
  if (!summary) return null
  const details = visibleText(source.details)
  return {
    dedupeKey: `${summary}\u0000${details}`,
    status: {
      type: 'warning',
      toolCallId: `config_warning:${ordinal}`,
      toolName: 'config_warning',
      delta: [summary, details].filter(Boolean).join('\n'),
      activityKind: 'openai_account_config_warning',
      durable: true,
    },
  }
}

function normalizeHookActivity(method = '', params = null, activeTurnId = '') {
  const source = params && typeof params === 'object' ? params : {}
  const run = source.run && typeof source.run === 'object' ? source.run : {}
  const turnId = normalizeId(source.turnId || activeTurnId)
  const eventName = normalizeId(run.eventName)
  const displayOrder = Number(run.displayOrder)
  if (!turnId || !HOOK_EVENT_NAMES.has(eventName) || !Number.isSafeInteger(displayOrder)) return null
  const completed = method === 'hook/completed'
  const runStatus = normalizeId(run.status)
  return {
    type: completed && ['failed', 'blocked'].includes(runStatus) ? 'failed' : (completed ? 'completed' : 'running'),
    toolCallId: `hook:${turnId}:${eventName}:${displayOrder}`,
    toolName: 'hook',
    delta: `event: ${eventName}\nstatus: ${completed ? runStatus : 'running'}`,
    activityKind: 'openai_account_hook',
    durable: true,
  }
}

function normalizeApprovalReview(method = '', params = null, activeTurnId = '') {
  const source = params && typeof params === 'object' ? params : {}
  const review = source.review && typeof source.review === 'object' ? source.review : {}
  const turnId = normalizeId(source.turnId || activeTurnId)
  const targetItemId = normalizeId(source.targetItemId)
  const reviewStatus = normalizeId(review.status)
  if (!turnId || !targetItemId || !REVIEW_STATUSES.has(reviewStatus)) return null
  const riskLevel = normalizeId(review.riskLevel)
  const riskDetail = RISK_LEVELS.has(riskLevel) ? `\nrisk: ${riskLevel}` : ''
  const completed = method === 'item/autoApprovalReview/completed'
  return {
    type: completed && ['denied', 'aborted'].includes(reviewStatus)
      ? 'failed'
      : (completed ? 'completed' : 'running'),
    toolCallId: `auto_approval:${turnId}:${targetItemId}`,
    toolName: 'auto_approval_review',
    delta: `status: ${completed ? reviewStatus : 'inProgress'}${riskDetail}`,
    activityKind: 'openai_account_auto_approval_review',
    durable: true,
  }
}

function normalizeTurnError(params = null, activeTurnId = '') {
  const source = params && typeof params === 'object' ? params : {}
  const error = source.error && typeof source.error === 'object' ? source.error : {}
  const turnId = normalizeId(source.turnId || activeTurnId)
  const message = visibleText(error.message)
  if (!turnId || !message || typeof source.willRetry !== 'boolean') return null
  return {
    willRetry: source.willRetry,
    status: {
      type: source.willRetry ? 'warning' : 'failed',
      toolCallId: `provider_error:${turnId}`,
      toolName: 'provider_error',
      delta: source.willRetry ? `${message}\nretrying: true` : message,
      activityKind: 'openai_account_turn_error',
      durable: true,
    },
  }
}

export function createOpenAIAccountWarningHookNotificationHandler({
  markProgress = () => {},
  emitProviderToolStatus = () => {},
  rejectTurn = () => {},
} = {}) {
  const configWarnings = new Set()
  return (method = '', params = null, activeTurnId = '') => {
    const safeMethod = normalizeId(method)
    if (safeMethod === 'configWarning') {
      const normalized = normalizeConfigWarning(params, configWarnings.size + 1)
      if (!normalized) rejectMalformed(rejectTurn, safeMethod)
      else if (!configWarnings.has(normalized.dedupeKey)) {
        configWarnings.add(normalized.dedupeKey)
        markProgress()
        emitProviderToolStatus(normalized.status)
      }
      return true
    }
    if (safeMethod === 'hook/started' || safeMethod === 'hook/completed') {
      const status = normalizeHookActivity(safeMethod, params, activeTurnId)
      if (!status) rejectMalformed(rejectTurn, safeMethod)
      else {
        markProgress()
        emitProviderToolStatus(status)
      }
      return true
    }
    if (
      safeMethod === 'item/autoApprovalReview/started'
      || safeMethod === 'item/autoApprovalReview/completed'
    ) {
      const status = normalizeApprovalReview(safeMethod, params, activeTurnId)
      if (!status) rejectMalformed(rejectTurn, safeMethod)
      else {
        markProgress()
        emitProviderToolStatus(status)
      }
      return true
    }
    if (safeMethod === 'error') {
      const normalized = normalizeTurnError(params, activeTurnId)
      if (!normalized) rejectMalformed(rejectTurn, safeMethod)
      else {
        markProgress()
        emitProviderToolStatus(normalized.status)
        if (!normalized.willRetry) {
          rejectTurn(createOpenAIAccountRuntimeError(
            'account_turn_failed',
            normalized.status.delta,
          ))
        }
      }
      return true
    }
    return false
  }
}
