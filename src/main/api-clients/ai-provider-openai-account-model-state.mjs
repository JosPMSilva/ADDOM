import { createOpenAIAccountRuntimeError } from './ai-provider-openai-account-shared.mjs'
import { createOpenAIAccountProgressNotificationHandler } from './ai-provider-openai-account-progress-notifications.mjs'
import { createOpenAIAccountWarningHookNotificationHandler } from './ai-provider-openai-account-warning-hook-notifications.mjs'

const MAX_MODEL_REROUTES = 8

function normalizeId(value = '') {
  return String(value || '').trim()
}

function normalizeReroute(value = null) {
  const source = value && typeof value === 'object' ? value : {}
  const fromModel = normalizeId(source.fromModel)
  const toModel = normalizeId(source.toModel)
  const reason = normalizeId(source.reason)
  if (!fromModel || !toModel || !reason) return null
  return { fromModel, toModel, reason }
}

function rerouteKey(value = null) {
  const reroute = normalizeReroute(value)
  return reroute
    ? `${reroute.fromModel}\u0000${reroute.toModel}\u0000${reroute.reason}`
    : ''
}

export function createOpenAIAccountModelRoutingState(requestedModelId = '') {
  const modelId = normalizeId(requestedModelId)
  return {
    requestedModelId: modelId,
    terminalModelId: modelId,
    reroutes: [],
  }
}

export function cloneOpenAIAccountModelRoutingState(state = null) {
  const source = state && typeof state === 'object' ? state : {}
  const requestedModelId = normalizeId(source.requestedModelId)
  const terminalModelId = normalizeId(source.terminalModelId) || requestedModelId
  const reroutes = Array.isArray(source.reroutes)
    ? source.reroutes.map(normalizeReroute).filter(Boolean).slice(-MAX_MODEL_REROUTES)
    : []
  return { requestedModelId, terminalModelId, reroutes }
}

export function createOpenAIAccountModelStateNotificationHandler({
  getState = () => createOpenAIAccountModelRoutingState(),
  setState = () => {},
  markProgress = () => {},
  emitProviderToolStatus = () => {},
  rejectTurn = () => {},
} = {}) {
  return (method = '', params = null, activeTurnId = '') => {
    if (normalizeId(method) !== 'model/rerouted') return false
    const reroute = normalizeReroute(params)
    const turnId = normalizeId(params?.turnId || activeTurnId)
    if (!reroute || !turnId) {
      rejectTurn(createOpenAIAccountRuntimeError(
        'account_runtime_malformed_activity',
        'OpenAI account runtime received malformed model/rerouted activity.',
      ))
      return true
    }

    const state = cloneOpenAIAccountModelRoutingState(getState())
    const key = rerouteKey(reroute)
    if (state.reroutes.some((entry) => rerouteKey(entry) === key)) return true
    const nextState = {
      ...state,
      terminalModelId: reroute.toModel,
      reroutes: [...state.reroutes, reroute].slice(-MAX_MODEL_REROUTES),
    }
    setState(nextState)
    markProgress()
    emitProviderToolStatus({
      type: 'completed',
      toolCallId: `model_reroute:${turnId}`,
      toolName: 'model_reroute',
      model: reroute.toModel,
      delta: `${reroute.fromModel} → ${reroute.toModel} · ${reroute.reason}`,
      activityKind: 'openai_account_model_reroute',
      durable: true,
    })
    return true
  }
}

export function createOpenAIAccountSupplementalNotificationController({
  requestedModelId = '',
  markProgress = () => {},
  emitProviderToolStatus = () => {},
  rejectTurn = () => {},
} = {}) {
  let state = createOpenAIAccountModelRoutingState(requestedModelId)
  const handleProgress = createOpenAIAccountProgressNotificationHandler({
    markProgress,
    emitProviderToolStatus,
    rejectTurn,
  })
  const handleModelState = createOpenAIAccountModelStateNotificationHandler({
    getState: () => state,
    setState: (nextState) => {
      state = nextState
    },
    markProgress,
    emitProviderToolStatus,
    rejectTurn,
  })
  const handleWarningHook = createOpenAIAccountWarningHookNotificationHandler({
    markProgress,
    emitProviderToolStatus,
    rejectTurn,
  })
  return {
    handle(method = '', params = null, activeTurnId = '') {
      return handleProgress(method, params, activeTurnId)
        || handleModelState(method, params, activeTurnId)
        || handleWarningHook(method, params, activeTurnId)
    },
    getModelRoutingState() {
      return cloneOpenAIAccountModelRoutingState(state)
    },
    getTerminalModelId() {
      return normalizeId(state.terminalModelId)
    },
  }
}
