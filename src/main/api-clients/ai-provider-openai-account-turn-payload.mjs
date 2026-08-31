import { PROVIDER_POLICY } from './provider-policy.mjs'
import {
  normalizeId,
  normalizeProjectFolder,
} from './ai-provider-openai-account-shared.mjs'
import { asTokenCountOrNull } from './ai-provider-openai-account-telemetry.mjs'
import {
  buildAccountNativeActivityDetail,
  buildAccountNativeActivityOutput,
  cloneAccountCompactionState,
  cloneAccountNativeActivityState,
  hasAccountNativeActivityState,
  normalizeAccountNativeProviderToolName,
} from './ai-provider-openai-account-activity-state.mjs'
import { cloneAccountCollaborationState } from './ai-provider-openai-account-collaboration-state.mjs'
import { SUPPORTED_ITEM_TYPES } from './ai-provider-openai-account-constants.mjs'
import { buildOpenAIAccountProtocolMeta } from './ai-provider-openai-account-protocol-registry.mjs'
import { cloneOpenAIAccountModelRoutingState } from './ai-provider-openai-account-model-state.mjs'

export function createTurnTimeout(timeoutMs = Number(PROVIDER_POLICY.stream.timeoutMs || 0), onTimeout = () => {}) {
  const safeTimeoutMs = Math.max(0, Math.round(Number(timeoutMs || 0) || 0))
  if (safeTimeoutMs <= 0) return null
  const timeoutHandle = setTimeout(() => onTimeout(), safeTimeoutMs)
  timeoutHandle?.unref?.()
  return timeoutHandle
}

export function resolveStreamTimeoutMs(options = {}) {
  const requestedTimeoutMs = Number(options?.streamTimeoutMs)
  if (Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0) {
    return Math.round(requestedTimeoutMs)
  }
  return 0
}

export function resolveStreamIdleTimeoutMs(options = {}, streamTimeoutMs = 0, defaultStreamIdleTimeoutMs = 0) {
  const requestedIdleTimeoutMs = Number(options?.streamIdleTimeoutMs)
  if (Number.isFinite(requestedIdleTimeoutMs)) {
    if (requestedIdleTimeoutMs <= 0) return 0
    return streamTimeoutMs > 0
      ? Math.min(Math.round(requestedIdleTimeoutMs), streamTimeoutMs)
      : Math.round(requestedIdleTimeoutMs)
  }
  const normalizedDefaultIdleTimeoutMs = Math.max(
    0,
    Math.round(Number(defaultStreamIdleTimeoutMs || 0) || 0),
  )
  if (normalizedDefaultIdleTimeoutMs <= 0) return 0
  return streamTimeoutMs > 0
    ? Math.min(normalizedDefaultIdleTimeoutMs, streamTimeoutMs)
    : normalizedDefaultIdleTimeoutMs
}

export function createPendingActivityState() {
  return {
    dynamicToolCallIds: new Set(),
    contextCompactionIds: new Set(),
    collaborationItemIds: new Set(),
    webSearchItemIds: new Set(),
    commandExecutionItemIds: new Set(),
    fileChangeItemIds: new Set(),
    mcpToolCallItemIds: new Set(),
    imageViewItemIds: new Set(),
    imageGenerationItemIds: new Set(),
    planItemIds: new Set(),
    unknownActivityItemIds: new Set(),
  }
}

export function hasSuspendedStaleTimeout(state = null) {
  if (!state || typeof state !== 'object') return false
  return (
    state.dynamicToolCallIds?.size > 0
    || state.contextCompactionIds?.size > 0
    || state.collaborationItemIds?.size > 0
    || state.webSearchItemIds?.size > 0
    || state.commandExecutionItemIds?.size > 0
    || state.fileChangeItemIds?.size > 0
    || state.mcpToolCallItemIds?.size > 0
    || state.imageViewItemIds?.size > 0
    || state.imageGenerationItemIds?.size > 0
    || state.planItemIds?.size > 0
    || state.unknownActivityItemIds?.size > 0
  )
}

export function trackPendingActivity(state = null, item = null, phase = '') {
  const target = state && typeof state === 'object' ? state : createPendingActivityState()
  const itemType = normalizeId(item?.type)
  const itemId = normalizeId(item?.id)
  if (!itemType || !itemId) return target

  let bucket = null
  if (itemType === 'dynamicToolCall') bucket = target.dynamicToolCallIds
  else if (itemType === 'contextCompaction') bucket = target.contextCompactionIds
  else if (itemType === 'collabToolCall' || itemType === 'collabAgentToolCall') bucket = target.collaborationItemIds
  else if (itemType === 'webSearch') bucket = target.webSearchItemIds
  else if (itemType === 'commandExecution') bucket = target.commandExecutionItemIds
  else if (itemType === 'fileChange') bucket = target.fileChangeItemIds
  else if (itemType === 'mcpToolCall') bucket = target.mcpToolCallItemIds
  else if (itemType === 'imageView') bucket = target.imageViewItemIds
  else if (itemType === 'imageGeneration') bucket = target.imageGenerationItemIds
  else if (itemType === 'plan') bucket = target.planItemIds
  else if (!SUPPORTED_ITEM_TYPES.has(itemType)) bucket = target.unknownActivityItemIds

  if (!bucket) return target
  if (phase === 'started') bucket.add(itemId)
  else if (phase === 'completed') bucket.delete(itemId)
  return target
}

export function matchesOpenAIAccountBridgeTurnScope(params = null, {
  bridgeThreadId = '',
  activeTurnId = '',
  extractThreadId = () => '',
  extractTurnId = () => '',
} = {}) {
  const notificationThreadId = extractThreadId(params)
  if (notificationThreadId && notificationThreadId !== bridgeThreadId) return false
  const notificationTurnId = extractTurnId(params)
  if (activeTurnId && notificationTurnId && notificationTurnId !== activeTurnId) return false
  return true
}

export function createProviderToolCollectors({
  onProviderToolStatus = null,
  onProviderToolOutput = null,
} = {}) {
  const providerToolStatuses = []
  const providerToolOutputs = []

  const emitProviderToolStatus = (payload = {}) => {
    const normalizedPayload = payload && typeof payload === 'object'
      ? {
          type: normalizeId(payload.type) || 'running',
          toolCallId: normalizeId(payload.toolCallId),
          toolName: normalizeId(payload.toolName),
          ...(String(payload.delta || '').length > 0 ? { delta: String(payload.delta) } : {}),
          ...(String(payload.title || '').length > 0 ? { title: String(payload.title) } : {}),
          ...(normalizeId(payload.activityKind) ? { activityKind: normalizeId(payload.activityKind) } : {}),
          ...(normalizeId(payload.model) ? { model: normalizeId(payload.model) } : {}),
          ...(payload.durable === true ? { durable: true } : {}),
          providerExecuted: true,
        }
      : null
    if (!normalizedPayload) return
    providerToolStatuses.push(normalizedPayload)
    if (typeof onProviderToolStatus === 'function') onProviderToolStatus(normalizedPayload)
  }

  const emitProviderToolOutput = (payload = {}) => {
    const normalizedPayload = payload && typeof payload === 'object'
      ? {
          type: 'tool-output-available',
          toolCallId: normalizeId(payload.toolCallId),
          toolName: normalizeId(payload.toolName),
          output: Object.prototype.hasOwnProperty.call(payload, 'output') ? payload.output : null,
          providerExecuted: true,
        }
      : null
    if (!normalizedPayload) return
    providerToolOutputs.push(normalizedPayload)
    if (typeof onProviderToolOutput === 'function') onProviderToolOutput(normalizedPayload)
  }

  return {
    providerToolStatuses,
    providerToolOutputs,
    emitProviderToolStatus,
    emitProviderToolOutput,
  }
}

export function createAccountNativeActivityEmitters({
  emitProviderToolStatus = () => {},
  emitProviderToolOutput = () => {},
} = {}) {
  const emitAccountNativeActivityStarted = (item = null) => {
    const itemType = normalizeId(item?.type)
    const toolName = normalizeAccountNativeProviderToolName(itemType)
    if (!toolName) return
    emitProviderToolStatus({
      type: 'running',
      toolCallId: normalizeId(item?.id),
      toolName,
      delta: buildAccountNativeActivityDetail(item),
    })
  }

  const emitAccountNativeActivityCompleted = (item = null) => {
    const itemType = normalizeId(item?.type)
    const toolName = normalizeAccountNativeProviderToolName(itemType)
    if (!toolName) return
    const output = buildAccountNativeActivityOutput(item)
    if (
      itemType === 'fileChange'
      && (!Array.isArray(output?.changes) || output.changes.length <= 0)
    ) {
      return
    }
    emitProviderToolOutput({
      toolCallId: normalizeId(item?.id),
      toolName,
      output,
    })
  }

  const emitAccountNativeActivityDelta = ({
    itemType = '',
    itemId = '',
    delta = '',
  } = {}) => {
    const toolName = normalizeAccountNativeProviderToolName(itemType)
    const textDelta = String(delta || '')
    if (!toolName || !textDelta) return
    emitProviderToolStatus({
      type: 'running',
      toolCallId: normalizeId(itemId),
      toolName,
      delta: textDelta,
    })
  }

  return {
    emitAccountNativeActivityStarted,
    emitAccountNativeActivityCompleted,
    emitAccountNativeActivityDelta,
  }
}

export function buildOpenAIAccountTurnProviderMeta({
  bridgeThreadId = '',
  turnId = '',
  modelId = '',
  accountModelRoutingState = null,
  status = 'completed',
  transportMode = 'codex_app_server_chatgpt',
  background = false,
  accountBridgeProjectFolder = '',
  accountDynamicToolSignature = '',
  accountDelegationBackend = '',
  accountCollaborationModeId = '',
  continuityEpoch = 1,
  continuityReducerVersion = '',
  modeSignature = '',
  modelSignature = '',
  contextCompactionGeneration = 0,
  accountCompactionState = null,
  accountCollaborationState = null,
  accountNativeActivityState = null,
  inputLimitTokens = null,
  remainingContextTokens = null,
  threadOccupancyTokens = null,
  threadCumulativeTotalTokens = null,
  providerUsageSemantics = '',
  accountRuntimeIdentity = null,
  accountUnknownActivityState = null,
} = {}) {
  const providerMeta = {
    transportMode,
    authMethod: 'account',
    accountBridgeThreadId: normalizeId(bridgeThreadId),
    accountBridgeProjectFolder: normalizeProjectFolder(accountBridgeProjectFolder),
    accountBridgeTurnId: normalizeId(turnId),
    responseId: normalizeId(turnId),
    conversationId: normalizeId(bridgeThreadId),
    background: background === true,
    status: normalizeId(status).toLowerCase() || 'completed',
    modelId: normalizeId(modelId),
    continuityEpoch: Math.max(1, Number(continuityEpoch || 1) || 1),
    continuityReducerVersion: normalizeId(continuityReducerVersion),
    modeSignature: normalizeId(modeSignature),
    modelSignature: normalizeId(modelSignature),
    contextCompactionGeneration: Math.max(0, Number(contextCompactionGeneration || 0) || 0),
  }
  const normalizedModelRoutingState = cloneOpenAIAccountModelRoutingState(accountModelRoutingState)
  if (
    normalizedModelRoutingState.requestedModelId
    && normalizedModelRoutingState.requestedModelId !== providerMeta.modelId
  ) {
    providerMeta.requestedModelId = normalizedModelRoutingState.requestedModelId
  }
  if (normalizedModelRoutingState.reroutes.length > 0) {
    providerMeta.accountModelReroutes = normalizedModelRoutingState.reroutes
  }
  const normalizedInputLimitTokens = asTokenCountOrNull(inputLimitTokens)
  if (normalizedInputLimitTokens !== null) {
    providerMeta.inputLimitTokens = normalizedInputLimitTokens
  }
  const normalizedRemainingContextTokens = asTokenCountOrNull(remainingContextTokens)
  if (normalizedRemainingContextTokens !== null) {
    providerMeta.remainingContextTokens = normalizedRemainingContextTokens
  }
  const normalizedThreadOccupancyTokens = asTokenCountOrNull(threadOccupancyTokens)
  if (normalizedThreadOccupancyTokens !== null) {
    providerMeta.threadOccupancyTokens = normalizedThreadOccupancyTokens
  }
  const normalizedThreadCumulativeTotalTokens = asTokenCountOrNull(threadCumulativeTotalTokens)
  if (normalizedThreadCumulativeTotalTokens !== null) {
    providerMeta.threadCumulativeTotalTokens = normalizedThreadCumulativeTotalTokens
  }
  const normalizedProviderUsageSemantics = normalizeId(providerUsageSemantics)
  if (normalizedProviderUsageSemantics) {
    providerMeta.providerUsageSemantics = normalizedProviderUsageSemantics
  }
  const normalizedDynamicToolSignature = normalizeId(accountDynamicToolSignature)
  if (normalizedDynamicToolSignature) {
    providerMeta.accountDynamicToolSignature = normalizedDynamicToolSignature
  }
  const normalizedDelegationBackend = normalizeId(accountDelegationBackend).toLowerCase()
  if (normalizedDelegationBackend) {
    providerMeta.accountDelegationBackend = normalizedDelegationBackend
  }
  const normalizedCollaborationModeId = normalizeId(accountCollaborationModeId)
  if (normalizedCollaborationModeId) {
    providerMeta.accountCollaborationModeId = normalizedCollaborationModeId
  }
  const accountProtocol = buildOpenAIAccountProtocolMeta({
    runtimeIdentity: accountRuntimeIdentity,
    unknownActivityState: accountUnknownActivityState,
  })
  if (accountProtocol) {
    providerMeta.accountProtocol = accountProtocol
  }
  const normalizedCompactionState = cloneAccountCompactionState(accountCompactionState)
  if (normalizedCompactionState && (normalizedCompactionState.started || normalizedCompactionState.completed || normalizedCompactionState.itemIds.length > 0)) {
    providerMeta.accountCompaction = normalizedCompactionState
  }
  const normalizedCollaborationState = cloneAccountCollaborationState(accountCollaborationState)
  if (
    normalizedCollaborationState
    && (
      normalizedCollaborationState.started
      || normalizedCollaborationState.completed
      || normalizedCollaborationState.itemIds.length > 0
      || normalizedCollaborationState.itemTypes.length > 0
    )
  ) {
    providerMeta.accountCollaboration = normalizedCollaborationState
  }
  const normalizedNativeActivityState = cloneAccountNativeActivityState(accountNativeActivityState)
  if (hasAccountNativeActivityState(normalizedNativeActivityState)) {
    providerMeta.accountNativeActivity = normalizedNativeActivityState
  }
  return providerMeta
}

export function buildOpenAIAccountTurnPayload({
  bridgeThreadId = '',
  turnId = '',
  modelId = '',
  accountModelRoutingState = null,
  status = 'completed',
  text = '',
  preserveLeadingWhitespace = false,
  reasoning = '',
  transportMode = 'codex_app_server_chatgpt',
  background = false,
  accountBridgeProjectFolder = '',
  accountDynamicToolSignature = '',
  accountDelegationBackend = '',
  accountCollaborationModeId = '',
  continuityEpoch = 1,
  continuityReducerVersion = '',
  modeSignature = '',
  modelSignature = '',
  contextCompactionGeneration = 0,
  accountCompactionState = null,
  accountCollaborationState = null,
  accountNativeActivityState = null,
  usage = null,
  inputLimitTokens = null,
  remainingContextTokens = null,
  threadOccupancyTokens = null,
  threadCumulativeTotalTokens = null,
  providerUsageSemantics = '',
  providerToolStatuses = [],
  providerToolOutputs = [],
  accountRuntimeIdentity = null,
  accountUnknownActivityState = null,
} = {}) {
  const normalizedNativeActivityState = cloneAccountNativeActivityState(accountNativeActivityState)
  const normalizedText = preserveLeadingWhitespace
    ? String(text || '').trimEnd()
    : String(text || '').trim()
  const effectiveText = normalizedText || String(normalizedNativeActivityState?.plan?.text || '').trim()
  return {
    stopReason: normalizeId(status).toLowerCase() === 'interrupted' ? 'cancel' : 'stop',
    text: effectiveText,
    reasoning,
    usage: usage && typeof usage === 'object' ? { ...usage } : null,
    toolCalls: [],
    providerToolStatuses: Array.isArray(providerToolStatuses) ? [...providerToolStatuses] : [],
    providerToolOutputs: Array.isArray(providerToolOutputs) ? [...providerToolOutputs] : [],
    providerResponseMeta: buildOpenAIAccountTurnProviderMeta({
      bridgeThreadId,
      turnId,
      modelId,
      accountModelRoutingState,
      status,
      transportMode,
      background,
      accountBridgeProjectFolder,
      accountDynamicToolSignature,
      accountDelegationBackend,
      accountCollaborationModeId,
      continuityEpoch,
      continuityReducerVersion,
      modeSignature,
      modelSignature,
      contextCompactionGeneration,
      accountCompactionState,
      accountCollaborationState,
      accountNativeActivityState: normalizedNativeActivityState,
      inputLimitTokens,
      remainingContextTokens,
      threadOccupancyTokens,
      threadCumulativeTotalTokens,
      providerUsageSemantics,
      accountRuntimeIdentity,
      accountUnknownActivityState,
    }),
  }
}
