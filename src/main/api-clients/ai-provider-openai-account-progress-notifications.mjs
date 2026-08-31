import { createOpenAIAccountRuntimeError } from './ai-provider-openai-account-shared.mjs'

const MAX_PROGRESS_TEXT_LENGTH = 24_000
const PROGRESS_NOTIFICATION_METHODS = new Set([
  'turn/plan/updated',
  'turn/diff/updated',
  'item/commandExecution/terminalInteraction',
  'item/mcpToolCall/progress',
])

function normalizeId(value = '') {
  return String(value || '').trim()
}

function trimProgressText(value = '', maxLength = MAX_PROGRESS_TEXT_LENGTH) {
  const text = String(value || '')
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function formatPlanStep(step = null) {
  const source = step && typeof step === 'object' ? step : {}
  const text = normalizeId(source.step)
  if (!text) return ''
  const status = normalizeId(source.status)
  const marker = status === 'completed' ? '[x]' : (status === 'inProgress' ? '[-]' : '[ ]')
  return `${marker} ${text}`
}

function formatTurnPlan(params = null) {
  const source = params && typeof params === 'object' ? params : {}
  if (!Array.isArray(source.plan)) return ''
  const explanation = normalizeId(source.explanation)
  const steps = source.plan.map(formatPlanStep).filter(Boolean)
  return trimProgressText([explanation, ...steps].filter(Boolean).join('\n'))
}

function buildDurableStatus({
  type = 'running',
  toolCallId = '',
  toolName = '',
  activityKind = '',
  delta = '',
} = {}) {
  const normalizedToolCallId = normalizeId(toolCallId)
  const normalizedToolName = normalizeId(toolName)
  const normalizedActivityKind = normalizeId(activityKind)
  const normalizedDelta = trimProgressText(delta)
  if (!normalizedToolCallId || !normalizedToolName || !normalizedActivityKind || !normalizedDelta) {
    return null
  }
  return {
    type: normalizeId(type).toLowerCase() || 'running',
    toolCallId: normalizedToolCallId,
    toolName: normalizedToolName,
    delta: normalizedDelta,
    activityKind: normalizedActivityKind,
    durable: true,
  }
}

export function normalizeOpenAIAccountProgressNotification({
  method = '',
  params = null,
  activeTurnId = '',
} = {}) {
  const safeMethod = normalizeId(method)
  const source = params && typeof params === 'object' ? params : {}
  const turnId = normalizeId(source.turnId || activeTurnId)

  if (safeMethod === 'turn/plan/updated') {
    return buildDurableStatus({
      type: 'completed',
      toolCallId: turnId ? `turn_plan:${turnId}` : '',
      toolName: 'plan',
      activityKind: 'openai_account_turn_plan',
      delta: formatTurnPlan(source),
    })
  }
  if (safeMethod === 'turn/diff/updated') {
    return buildDurableStatus({
      type: 'completed',
      toolCallId: turnId ? `turn_diff:${turnId}` : '',
      toolName: 'turn_diff',
      activityKind: 'openai_account_turn_diff',
      delta: source.diff,
    })
  }
  if (safeMethod === 'item/commandExecution/terminalInteraction') {
    const stdinLength = String(source.stdin || '').length
    return buildDurableStatus({
      toolCallId: normalizeId(source.itemId),
      toolName: 'command_execution',
      activityKind: 'openai_account_terminal_interaction',
      delta: stdinLength > 0
        ? `Terminal input sent (${stdinLength} character${stdinLength === 1 ? '' : 's'}).`
        : 'Terminal input sent.',
    })
  }
  if (safeMethod === 'item/mcpToolCall/progress') {
    return buildDurableStatus({
      toolCallId: normalizeId(source.itemId),
      toolName: 'mcp_tool_call',
      activityKind: 'openai_account_mcp_progress',
      delta: source.message,
    })
  }
  return null
}

export function createOpenAIAccountProgressNotificationHandler({
  markProgress = () => {},
  emitProviderToolStatus = () => {},
  rejectTurn = () => {},
} = {}) {
  return (method = '', params = null, activeTurnId = '') => {
    const safeMethod = normalizeId(method)
    if (!PROGRESS_NOTIFICATION_METHODS.has(safeMethod)) return false
    const progressStatus = normalizeOpenAIAccountProgressNotification({
      method: safeMethod,
      params,
      activeTurnId,
    })
    if (!progressStatus) {
      rejectTurn(createOpenAIAccountRuntimeError(
        'account_runtime_malformed_activity',
        `OpenAI account runtime received malformed ${safeMethod} activity.`,
      ))
      return true
    }
    markProgress()
    emitProviderToolStatus(progressStatus)
    return true
  }
}
