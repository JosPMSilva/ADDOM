const MAX_UNKNOWN_ACTIVITY_EVENTS = 32

function normalizeId(value = '') {
  return String(value || '').trim()
}

function freezeRegistry(entries = {}) {
  return Object.freeze(Object.fromEntries(
    Object.entries(entries).map(([key, value]) => [
      key,
      Object.freeze({ ...value }),
    ]),
  ))
}

export const OPENAI_ACCOUNT_ITEM_HANDLER_REGISTRY = freezeRegistry({
  userMessage: { status: 'ignored_by_policy', handlerId: 'provider_user_echo' },
  hookPrompt: {
    status: 'ignored_by_policy',
    handlerId: 'hidden_hook_context',
    reason: 'hidden_provider_context',
  },
  agentMessage: { status: 'supported', handlerId: 'assistant_message' },
  plan: { status: 'supported', handlerId: 'account_native_activity' },
  reasoning: { status: 'supported', handlerId: 'reasoning' },
  commandExecution: { status: 'supported', handlerId: 'account_native_activity' },
  fileChange: { status: 'supported', handlerId: 'account_native_activity' },
  mcpToolCall: { status: 'supported', handlerId: 'account_native_activity' },
  dynamicToolCall: { status: 'supported', handlerId: 'dynamic_tool_lifecycle' },
  collabAgentToolCall: { status: 'supported', handlerId: 'collaboration' },
  webSearch: { status: 'supported', handlerId: 'account_native_activity' },
  imageView: { status: 'supported', handlerId: 'account_native_activity' },
  imageGeneration: { status: 'supported', handlerId: 'account_native_activity' },
  enteredReviewMode: { status: 'supported', handlerId: 'account_native_activity' },
  exitedReviewMode: { status: 'supported', handlerId: 'account_native_activity' },
  contextCompaction: { status: 'supported', handlerId: 'context_compaction' },
  collabToolCall: {
    status: 'partially_supported',
    handlerId: 'collaboration',
    reason: 'legacy_protocol_alias',
  },
})

export const OPENAI_ACCOUNT_ITEM_QUALIFICATION_REGISTRY = freezeRegistry({
  hookPrompt: { status: 'qualified', fixtureId: 'openai-account-hook-prompt-v1' },
  agentMessage: { status: 'qualified', fixtureId: 'openai-account-thread-items-v1' },
  plan: { status: 'qualified', fixtureId: 'openai-account-native-plan-v1' },
  reasoning: { status: 'qualified', fixtureId: 'openai-account-thread-items-v1' },
  commandExecution: { status: 'qualified', fixtureId: 'openai-account-native-tools-v1' },
  fileChange: { status: 'qualified', fixtureId: 'openai-account-native-tools-v1' },
  mcpToolCall: { status: 'qualified', fixtureId: 'openai-account-native-tools-v1' },
  dynamicToolCall: { status: 'qualified', fixtureId: 'openai-account-dynamic-tools-v1' },
  collabAgentToolCall: { status: 'qualified', fixtureId: 'openai-account-collaboration-v1' },
  webSearch: { status: 'qualified', fixtureId: 'openai-account-native-tools-v1' },
  imageView: { status: 'qualified', fixtureId: 'openai-account-native-tools-v1' },
  imageGeneration: { status: 'qualified', fixtureId: 'openai-account-image-generation-v1' },
  enteredReviewMode: { status: 'qualified', fixtureId: 'openai-account-review-mode-v1' },
  exitedReviewMode: { status: 'qualified', fixtureId: 'openai-account-review-mode-v1' },
  contextCompaction: { status: 'qualified', fixtureId: 'openai-account-compaction-v1' },
  collabToolCall: { status: 'qualified', fixtureId: 'openai-account-collaboration-v1' },
})

export const OPENAI_ACCOUNT_NOTIFICATION_HANDLER_REGISTRY = freezeRegistry({
  'mcpServer/startupStatus/updated': { status: 'ignored_by_policy', handlerId: 'diagnostic_lifecycle' },
  'thread/goal/cleared': { status: 'ignored_by_policy', handlerId: 'diagnostic_lifecycle' },
  'thread/settings/updated': { status: 'ignored_by_policy', handlerId: 'diagnostic_lifecycle' },
  'thread/status/changed': { status: 'ignored_by_policy', handlerId: 'diagnostic_lifecycle' },
  'turn/started': { status: 'ignored_by_policy', handlerId: 'diagnostic_lifecycle' },
  'thread/tokenUsage/updated': { status: 'supported', handlerId: 'token_usage' },
  'item/agentMessage/delta': { status: 'supported', handlerId: 'assistant_message_delta' },
  'item/reasoning/delta': {
    status: 'partially_supported',
    handlerId: 'reasoning_delta',
    reason: 'legacy_protocol_alias',
  },
  'item/reasoning/summaryTextDelta': { status: 'supported', handlerId: 'reasoning_delta' },
  'item/reasoning/textDelta': { status: 'supported', handlerId: 'reasoning_delta' },
  'item/reasoning/summaryPartAdded': { status: 'supported', handlerId: 'reasoning_boundary' },
  'item/plan/delta': { status: 'supported', handlerId: 'account_native_delta' },
  'item/commandExecution/outputDelta': { status: 'supported', handlerId: 'account_native_delta' },
  'item/fileChange/outputDelta': { status: 'supported', handlerId: 'account_native_delta' },
  'turn/plan/updated': { status: 'supported', handlerId: 'turn_plan_update' },
  'turn/diff/updated': { status: 'supported', handlerId: 'turn_diff_update' },
  'item/commandExecution/terminalInteraction': { status: 'supported', handlerId: 'terminal_interaction' },
  'item/mcpToolCall/progress': { status: 'supported', handlerId: 'mcp_tool_progress' },
  'model/rerouted': { status: 'supported', handlerId: 'model_reroute' },
  configWarning: { status: 'supported', handlerId: 'config_warning' },
  'hook/started': { status: 'supported', handlerId: 'hook_lifecycle' },
  'hook/completed': { status: 'supported', handlerId: 'hook_lifecycle' },
  'item/autoApprovalReview/started': { status: 'supported', handlerId: 'auto_approval_review' },
  'item/autoApprovalReview/completed': { status: 'supported', handlerId: 'auto_approval_review' },
  error: { status: 'supported', handlerId: 'turn_error' },
  'item/started': { status: 'supported', handlerId: 'item_lifecycle' },
  'item/completed': { status: 'supported', handlerId: 'item_lifecycle' },
  'serverRequest/resolved': { status: 'supported', handlerId: 'server_request_resolution' },
  'turn/completed': { status: 'supported', handlerId: 'turn_completion' },
})

export const OPENAI_ACCOUNT_SERVER_REQUEST_HANDLER_REGISTRY = freezeRegistry({
  'item/tool/call': { status: 'supported', handlerId: 'dynamic_tool_call' },
  execCommandApproval: {
    status: 'supported',
    handlerId: 'legacy_exec_command_approval',
    reason: 'schema_qualified_runtime_versions',
  },
  applyPatchApproval: {
    status: 'supported',
    handlerId: 'legacy_apply_patch_approval',
    reason: 'schema_qualified_runtime_versions',
  },
  'item/commandExecution/requestApproval': { status: 'supported', handlerId: 'command_approval' },
  'item/fileChange/requestApproval': { status: 'supported', handlerId: 'file_change_approval' },
  'item/permissions/requestApproval': { status: 'supported', handlerId: 'permission_approval' },
  'item/tool/requestUserInput': { status: 'supported', handlerId: 'request_user_input' },
  'mcpServer/elicitation/request': { status: 'supported', handlerId: 'mcp_elicitation' },
  'currentTime/read': { status: 'supported', handlerId: 'current_time' },
  'attestation/generate': {
    status: 'unsupported_by_policy',
    handlerId: 'attestation_unavailable',
    reason: 'client_attestation_unavailable',
  },
  'account/chatgptAuthTokens/refresh': {
    status: 'unsupported_by_policy',
    handlerId: 'external_auth_refresh_unavailable',
    reason: 'managed_account_auth',
  },
})

export function classifyOpenAIAccountItemType(value = '') {
  const itemType = normalizeId(value)
  const registered = OPENAI_ACCOUNT_ITEM_HANDLER_REGISTRY[itemType]
  if (registered) {
    return {
      itemType,
      declared: true,
      status: registered.status,
      handlerId: registered.handlerId,
      reason: normalizeId(registered.reason),
    }
  }
  return {
    itemType,
    declared: false,
    status: 'unknown',
    handlerId: 'sanitized_unknown_activity',
    reason: 'unregistered_protocol_item',
  }
}

function classifyProtocolMethod(registry = {}, value = '', {
  unknownStatus = 'unknown',
  unknownHandlerId = '',
  unknownReason = '',
} = {}) {
  const method = normalizeId(value)
  const registered = registry[method]
  if (registered) {
    return {
      method,
      declared: true,
      status: registered.status,
      handlerId: registered.handlerId,
      reason: normalizeId(registered.reason),
    }
  }
  return {
    method,
    declared: false,
    status: unknownStatus,
    handlerId: unknownHandlerId,
    reason: unknownReason,
  }
}

export function classifyOpenAIAccountNotificationMethod(value = '') {
  return classifyProtocolMethod(OPENAI_ACCOUNT_NOTIFICATION_HANDLER_REGISTRY, value, {
    unknownStatus: 'unknown',
    unknownHandlerId: 'sanitized_unknown_activity',
    unknownReason: 'unregistered_protocol_notification',
  })
}

export function classifyOpenAIAccountServerRequestMethod(value = '') {
  return classifyProtocolMethod(OPENAI_ACCOUNT_SERVER_REQUEST_HANDLER_REGISTRY, value, {
    unknownStatus: 'unsupported',
    unknownHandlerId: 'fail_closed',
    unknownReason: 'unregistered_server_request',
  })
}

export function normalizeOpenAIAccountRuntimeIdentity(value = null) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    executable: normalizeId(source.executable),
    version: normalizeId(source.version),
    platformFamily: normalizeId(source.platformFamily),
    platformOs: normalizeId(source.platformOs),
  }
}

function buildCapabilityEntries(registry = {}) {
  return Object.fromEntries(
    Object.entries(registry).map(([key, value]) => [
      key,
      {
        status: normalizeId(value.status),
        handlerId: normalizeId(value.handlerId),
        ...(normalizeId(value.reason) ? { reason: normalizeId(value.reason) } : {}),
      },
    ]),
  )
}

function resolveQualifiedItemStatus(handlerStatus = '', qualificationStatus = '') {
  const normalizedHandlerStatus = normalizeId(handlerStatus)
  if (normalizedHandlerStatus !== 'supported') return normalizedHandlerStatus
  return normalizeId(qualificationStatus) === 'qualified'
    ? 'supported'
    : 'partially_supported'
}

function buildQualifiedItemCapabilityEntries(
  registry = {},
  qualificationRegistry = OPENAI_ACCOUNT_ITEM_QUALIFICATION_REGISTRY,
) {
  return Object.fromEntries(Object.entries(registry).map(([key, value]) => {
    const qualification = qualificationRegistry?.[key] && typeof qualificationRegistry[key] === 'object'
      ? qualificationRegistry[key]
      : {}
    const qualificationStatus = normalizeId(qualification.status) || 'not_qualified'
    const fixtureId = normalizeId(qualification.fixtureId)
    return [key, {
      status: resolveQualifiedItemStatus(value.status, qualificationStatus),
      handlerStatus: normalizeId(value.status),
      handlerId: normalizeId(value.handlerId),
      ...(normalizeId(value.reason) ? { reason: normalizeId(value.reason) } : {}),
      qualification: {
        status: qualificationStatus,
        ...(fixtureId ? { fixtureId } : {}),
      },
    }]
  }))
}

export function buildOpenAIAccountProtocolCapabilitySnapshot({
  runtimeIdentity = null,
  itemQualificationRegistry = OPENAI_ACCOUNT_ITEM_QUALIFICATION_REGISTRY,
} = {}) {
  return {
    schemaVersion: 1,
    transport: 'codex_app_server_chatgpt',
    runtime: normalizeOpenAIAccountRuntimeIdentity(runtimeIdentity),
    itemTypes: buildQualifiedItemCapabilityEntries(
      OPENAI_ACCOUNT_ITEM_HANDLER_REGISTRY,
      itemQualificationRegistry,
    ),
    notifications: buildCapabilityEntries(OPENAI_ACCOUNT_NOTIFICATION_HANDLER_REGISTRY),
    serverRequests: buildCapabilityEntries(OPENAI_ACCOUNT_SERVER_REQUEST_HANDLER_REGISTRY),
    unknownPolicy: {
      itemLifecycle: 'retain_sanitized',
      notification: 'retain_sanitized',
      serverRequest: 'fail_closed',
    },
  }
}

function resolveLifecycle(protocolMethod = '') {
  const method = normalizeId(protocolMethod)
  if (method.endsWith('/started')) return 'started'
  if (method.endsWith('/completed')) return 'completed'
  return 'notification'
}

export function createSanitizedOpenAIAccountUnknownActivity({
  protocolMethod = '',
  item = null,
  runtimeIdentity = null,
} = {}) {
  const source = item && typeof item === 'object' ? item : {}
  const classification = classifyOpenAIAccountItemType(source.type)
  return {
    protocolMethod: normalizeId(protocolMethod),
    itemType: classification.itemType,
    itemId: normalizeId(source.id),
    lifecycle: resolveLifecycle(protocolMethod),
    providerStatus: normalizeId(source.status),
    supportStatus: 'unknown',
    handlerId: classification.handlerId,
    reason: classification.itemType
      ? classification.reason
      : 'unregistered_protocol_notification',
    runtimeVersion: normalizeOpenAIAccountRuntimeIdentity(runtimeIdentity).version,
  }
}

function protocolDriftWarningKey(event = {}) {
  const runtimeVersion = normalizeId(event.runtimeVersion) || 'unknown'
  const itemType = normalizeId(event.itemType)
  const activitySignature = itemType
    ? `item:${itemType}`
    : `notification:${normalizeId(event.protocolMethod) || 'unknown'}`
  return `openai_account_protocol_drift:${runtimeVersion}:${activitySignature}`
}

export function buildOpenAIAccountProtocolDriftWarning(event = null) {
  const source = event && typeof event === 'object' ? event : {}
  return {
    type: 'warning',
    text: 'Codex app-server activity',
    meta: {
      noticeKind: 'provider_protocol_drift',
      reason: 'unrecognized_provider_activity',
      providerId: 'openai',
      transportMode: 'codex_app_server_chatgpt',
      protocolMethod: normalizeId(source.protocolMethod),
      protocolItemType: normalizeId(source.itemType),
      runtimeVersion: normalizeId(source.runtimeVersion),
      dedupeKey: protocolDriftWarningKey(source),
    },
  }
}

export function createOpenAIAccountUnknownActivityState() {
  return { events: [] }
}

function unknownActivityIdentity(event = {}) {
  return [
    normalizeId(event.protocolMethod),
    normalizeId(event.itemType),
    normalizeId(event.itemId),
    normalizeId(event.lifecycle),
  ].join('|')
}

export function trackOpenAIAccountUnknownActivity(state = null, event = null) {
  const sourceEvents = Array.isArray(state?.events) ? state.events : []
  const nextEvent = event && typeof event === 'object' ? { ...event } : null
  if (!nextEvent?.protocolMethod) return { events: [...sourceEvents] }
  const identity = unknownActivityIdentity(nextEvent)
  if (sourceEvents.some((entry) => unknownActivityIdentity(entry) === identity)) {
    return { events: [...sourceEvents] }
  }
  return {
    events: [...sourceEvents, nextEvent].slice(-MAX_UNKNOWN_ACTIVITY_EVENTS),
  }
}

export function cloneOpenAIAccountUnknownActivityState(state = null) {
  return {
    events: Array.isArray(state?.events)
      ? state.events.map((event) => ({ ...event }))
      : [],
  }
}

export function buildOpenAIAccountProtocolMeta({
  runtimeIdentity = null,
  unknownActivityState = null,
} = {}) {
  const runtime = normalizeOpenAIAccountRuntimeIdentity(runtimeIdentity)
  const unknownActivities = cloneOpenAIAccountUnknownActivityState(unknownActivityState).events
  if (
    !runtime.executable
    && !runtime.version
    && !runtime.platformFamily
    && !runtime.platformOs
    && unknownActivities.length === 0
  ) {
    return null
  }
  return {
    schemaVersion: 1,
    runtime,
    unknownActivities,
  }
}
