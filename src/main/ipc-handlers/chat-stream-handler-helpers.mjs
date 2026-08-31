import { sendVersioned } from '../ipc/ipc-versioning.mjs'
import { applyAdaptiveBudgetDiagnosticsState } from '../chat/chat-runtime-diagnostics.mjs'
import { applyDevToolSurfaceDiagnostics } from '../chat/dev-tool-surface-diagnostics.mjs'
import { trimText } from '../chat/tool-event-mapper.mjs'
import { listTimeline } from '../workspace/workspace-store.mjs'
import { createCanonicalRootEventWriter } from '../chat/canonical-root-event-writer.mjs'
import { resolveRunbookErrorDetailMode } from '../chat/chat-error-hints.mjs'
import {
  buildEmptyPromptBudgetDiagnosticSnapshot,
  buildPromptBudgetDiagnosticSnapshot,
} from '../chat/provider-prompt-budget-profile.mjs'
import { canExecuteResolvedToolSurface } from '../api-clients/ai-provider-capability-probes.mjs'
import { CURSOR_AGENT_PROVIDER_ID } from '../../common/api-clients/cursor-agent-provider.mjs'
import { getCursorAgentChatExecutor } from '../cursor-agent/cursor-agent-chat-execution.mjs'
import { buildPersistedUserContentParts } from '../chat/chat-attachment-parts.mjs'

export function pushUniqueRuntimeValue(target, value, { maxItems = 8 } = {}) {
  if (!Array.isArray(target)) return
  const normalized = String(value || '').trim()
  if (!normalized) return
  const key = normalized.toLowerCase()
  if (target.some((item) => String(item || '').trim().toLowerCase() === key)) return
  target.push(normalized)
  if (target.length > maxItems) target.splice(0, target.length - maxItems)
}

export function bumpRuntimeCount(target, key) {
  if (!target || typeof target !== 'object') return
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey) return
  target[normalizedKey] = (Number(target[normalizedKey] || 0) || 0) + 1
}

export function summarizeRuntimeNotice(notice = {}) {
  const source = notice && typeof notice === 'object' ? notice : {}
  const meta = source.meta && typeof source.meta === 'object' ? source.meta : {}
  return (
    String(meta.reason || '').trim()
    || String(meta.hostedToolId || '').trim()
    || String(source.text || '').trim()
  )
}

export function createChatStreamDelivery({
  event,
  activeThreadId = '',
  activeTurnId = '',
  activeAssistantMessageId = '',
  activeProjectId = '',
  providerId = '',
  transport = '',
  runtime = '',
  loop = null,
  suppressAssistantFinal = false,
} = {}) {
  const send = (channel, data) => {
    if (event.sender.isDestroyed()) return
    const base = {
      threadId: activeThreadId,
      turnId: activeTurnId,
      ...(activeAssistantMessageId ? { assistantMessageId: activeAssistantMessageId } : {}),
    }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      sendVersioned(event.sender, channel, {
        ...base,
        ...data,
      })
      return
    }
    sendVersioned(event.sender, channel, data)
  }
  const canonicalWriter = createCanonicalRootEventWriter({
    projectId: activeProjectId,
    threadId: activeThreadId,
    turnId: activeTurnId,
    assistantMessageId: activeAssistantMessageId,
    providerId,
    transport,
    runtime,
    send,
  })
  const persistTimelineEvent = (...args) => canonicalWriter.persistTimelineEvent(...args)
  persistTimelineEvent.commitAndProject = canonicalWriter.commitAndProject
  const deliveredNoticeKeys = new Set()
  const createSendNotice = ({ errorDiagnostics = {} } = {}) => (notice = {}) => {
    const source = notice && typeof notice === 'object' ? notice : {}
    const text = trimText(String(source.text || '').trim(), 1_000)
    if (!text) return
    const type = String(source.type || 'warning').trim().toLowerCase() === 'info'
      ? 'info'
      : 'warning'
    const meta = source.meta && typeof source.meta === 'object'
      ? source.meta
      : {}
    const dedupeKey = String(meta.dedupeKey || '').trim()
    if (dedupeKey && deliveredNoticeKeys.has(dedupeKey)) return
    if (dedupeKey) deliveredNoticeKeys.add(dedupeKey)
    const noticeSummary = summarizeRuntimeNotice({ ...source, meta })
    if (noticeSummary) pushUniqueRuntimeValue(errorDiagnostics.capabilityNotices, noticeSummary)
    if (String(meta.reason || '').trim()) pushUniqueRuntimeValue(errorDiagnostics.capabilityBlockReasons, String(meta.reason || '').trim())
    send('chat:notice', {
      type,
      text,
      meta,
      threadId: activeThreadId,
      turnId: activeTurnId,
    })
  }
  const failEarly = (message, { reason = 'preflight_failure', errorMeta = {} } = {}) => {
    canonicalWriter.commitFailureTurn({ message, reason, errorMeta })
    try { loop?.abortController?.abort() } catch { /* best-effort abort after early failure */ }
  }
  return {
    send,
    persistTimelineEvent,
    commitTurnState: canonicalWriter.commitTurnState,
    commitFinalTurn: suppressAssistantFinal
      ? ({ terminalPayload = {} } = {}) => canonicalWriter.commitTurnState('completed', {
          status: 'ok',
          ...terminalPayload,
        })
      : canonicalWriter.commitFinalTurn,
    commitCancellationTurn: canonicalWriter.commitCancellationTurn,
    commitFailureTurn: canonicalWriter.commitFailureTurn,
    createSendNotice,
    failEarly,
  }
}

export function applyResolvedToolSurfaceDiagnostics({
  errorDiagnostics = {},
  resolvedToolSurface = {},
  adaptiveBudgetRuntimeDiagnostics = {},
  providerRuntimeSettings = null,
  effectiveProviderRuntimeSettings = null,
  openAIAccountCollaborationModeId = '',
} = {}) {
  errorDiagnostics.toolSurfaceKind = resolvedToolSurface.toolSurfaceKind
  errorDiagnostics.toolSurfaceComponents = resolvedToolSurface.toolSurfaceComponents
  errorDiagnostics.mixedToolSurfaceDetected = resolvedToolSurface.mixedToolSurfaceDetected === true
  errorDiagnostics.delegationBackend = String(resolvedToolSurface.delegationBackend || '').trim().toLowerCase() || 'none'
  errorDiagnostics.availableDelegationBackends = Array.isArray(resolvedToolSurface.delegationBackends)
    ? [...resolvedToolSurface.delegationBackends]
    : []
  errorDiagnostics.delegationBackendPreference = String(
    resolvedToolSurface.delegationBackendPreference
    || providerRuntimeSettings?.openai?.delegationBackendPreference
    || 'auto',
  ).trim().toLowerCase() || 'auto'
  errorDiagnostics.delegationBackendReason = String(resolvedToolSurface.delegationBackendReason || '').trim().toLowerCase()
  errorDiagnostics.nativeCollaborationModeId = String(
    effectiveProviderRuntimeSettings?.openai?.nativeCollaborationModeId
    || openAIAccountCollaborationModeId
    || '',
  ).trim()
  errorDiagnostics.excludedToolsWithReasons = Array.isArray(resolvedToolSurface.excludedToolsWithReasons)
    ? resolvedToolSurface.excludedToolsWithReasons
    : []
  errorDiagnostics.toolReliabilityProfileId = String(resolvedToolSurface.toolReliabilityProfile?.profileId || '').trim()
  errorDiagnostics.toolReliabilityTier = String(resolvedToolSurface.toolReliabilityProfile?.reliabilityTier || '').trim()
  errorDiagnostics.toolShadowIntent = String(resolvedToolSurface.shadowIntent?.intent || '').trim()
  errorDiagnostics.toolShadowIntentConfidence = String(resolvedToolSurface.shadowIntent?.confidence || '').trim()
  Object.assign(
    errorDiagnostics,
    buildPromptBudgetDiagnosticSnapshot(resolvedToolSurface.promptBudgetProfile),
  )
  Object.assign(errorDiagnostics, adaptiveBudgetRuntimeDiagnostics)
  applyAdaptiveBudgetDiagnosticsState(errorDiagnostics)
  errorDiagnostics.toolSurfaceBudgetProfile = String(resolvedToolSurface.toolSurfaceBudgetProfile || '').trim()
  errorDiagnostics.toolSurfaceVisibleCount = Number(resolvedToolSurface.toolSurfaceVisibleCount || Object.keys(resolvedToolSurface.tools || {}).length || 0) || 0
  errorDiagnostics.toolSurfaceHiddenFamilies = Array.isArray(resolvedToolSurface.toolSurfaceHiddenFamilies)
    ? [...resolvedToolSurface.toolSurfaceHiddenFamilies]
    : []
  applyDevToolSurfaceDiagnostics(errorDiagnostics, { resolvedToolSurface })
}

export function applyToolCapabilityDiagnostics({
  errorDiagnostics = {},
  activeToolDefinitions = {},
  requestedToolCount = 0,
  modelCapabilities = {},
  resolvedToolSurface = {},
  adapterProfile = null,
  providerId = '',
  openaiHostedToolIds = [],
  openaiExcludedToolReasons = [],
} = {}) {
  const canExecuteToolSurface = (
    canExecuteResolvedToolSurface(modelCapabilities)
    && modelCapabilities?.supportsChatToolSurface !== false
  )
  const tools = canExecuteToolSurface ? activeToolDefinitions : {}
  const modelSupportsTools = modelCapabilities.supportsTools !== false
  const activeToolNames = Object.keys(tools)
  errorDiagnostics.activeToolCount = activeToolNames.length
  errorDiagnostics.toolWorkflowSurfaceNarrowed = errorDiagnostics.activeToolCount < requestedToolCount
  errorDiagnostics.toolWorkflowSuppressedToolCount = Math.max(0, requestedToolCount - errorDiagnostics.activeToolCount)
  errorDiagnostics.modelSupportsTools = modelSupportsTools
  if (typeof modelCapabilities?.supportsAnyToolSurface === 'boolean') {
    errorDiagnostics.modelSupportsAnyToolSurface = modelCapabilities.supportsAnyToolSurface
  }
  errorDiagnostics.modelToolSupportMode = String(modelCapabilities?.toolSupportMode || '').trim().toLowerCase()
  errorDiagnostics.modelCapabilitiesSource = String(modelCapabilities?.source || '').trim()
  if (String(providerId || '').trim().toLowerCase() === 'openai') {
    const runtimeSupport = adapterProfile?.openaiRuntimeSupport || {}
    const accountHostedTools = runtimeSupport?.authMethod === 'account'
      ? runtimeSupport?.accountCapabilityContract?.hostedTools
      : null
    const supportedToolMap = accountHostedTools && typeof accountHostedTools === 'object'
      ? Object.fromEntries(Object.entries(accountHostedTools).map(([toolId, entry]) => [
          toolId,
          entry?.supported === true,
        ]))
      : (runtimeSupport.hostedToolSupport || {})
    errorDiagnostics.supportedTools = Object.keys(supportedToolMap)
      .filter((toolId) => supportedToolMap?.[toolId] === true)
      .sort()
    errorDiagnostics.defaultEnabledTools = Array.from(new Set(openaiHostedToolIds)).sort()
    errorDiagnostics.excludedToolsWithReasons = [
      ...(Array.isArray(errorDiagnostics.excludedToolsWithReasons) ? errorDiagnostics.excludedToolsWithReasons : []),
      ...openaiExcludedToolReasons.map((row) => ({
        toolName: String(row?.toolName || row?.toolId || '').trim(),
        reason: String(row?.reason || '').trim(),
      })),
    ].filter((row) => String(row?.toolName || '').trim() && String(row?.reason || '').trim())
  }
  if (!canExecuteToolSurface) {
    errorDiagnostics.toolSurfaceKind = resolvedToolSurface.toolSurfaceKind
    errorDiagnostics.toolSurfaceComponents = resolvedToolSurface.toolSurfaceComponents
    errorDiagnostics.mixedToolSurfaceDetected = resolvedToolSurface.mixedToolSurfaceDetected === true
  }
  if (requestedToolCount > 0 && !canExecuteToolSurface) {
    const providerOwnedRuntimeNoLocalToolCalls = (
      String(adapterProfile?.providerNativeRuntime?.mode || '').trim().toLowerCase() === 'provider_owned_runtime'
    )
    const blockReason = providerOwnedRuntimeNoLocalToolCalls
      ? 'provider_owned_runtime_no_local_tool_calls'
      : 'model_no_tool_support'
    pushUniqueRuntimeValue(errorDiagnostics.capabilityBlockReasons, blockReason)
    errorDiagnostics.surfaceResolutionFailure = blockReason
  }
  return {
    activeToolNames,
    canExecuteToolSurface,
    modelSupportsTools,
    tools,
  }
}

export function detectTextualApprovalRequestWithoutToolCall(text = '') {
  const normalized = String(text || '').trim().toLowerCase()
  if (!normalized) return false
  return (
    /\bplease\s+approve\b/.test(normalized)
    || /\bi need your approval\b/.test(normalized)
    || /\bapprove (this|the) command\b/.test(normalized)
    || /\bwaiting for approval\b/.test(normalized)
    || /\bapprove (npm|pnpm|yarn|bun|pip|cargo|go|apt|brew|winget)\b/.test(normalized)
  )
}

export function extractPrefixedMetaFromResultText(resultText = '', key = '') {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey) return ''
  const source = String(resultText || '')
  const pattern = new RegExp(`^${normalizedKey}:\\s*(.+)$`, 'im')
  const match = source.match(pattern)
  return match ? String(match[1] || '').trim() : ''
}

function extractUserTextFromContent(content) {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => (part?.type === 'text' ? String(part?.text || '') : ''))
    .join(' ')
    .trim()
}

export function resolveEffectiveTurnUserMessage({
  currentUserMessage = '',
  hasExplicitCurrentUserMessage = false,
  messages = [],
} = {}) {
  const sourceHistoryMessages = Array.isArray(messages) ? messages : []
  const fallbackUserEntry = [...sourceHistoryMessages].reverse().find((row) => (
    String(row?.role || '').trim().toLowerCase() === 'user'
  )) || null
  const fallbackUserMessage = extractUserTextFromContent(fallbackUserEntry?.content)
  const userMessage = hasExplicitCurrentUserMessage
    ? String(currentUserMessage ?? '')
    : fallbackUserMessage
  return {
    sourceHistoryMessages,
    fallbackUserEntry,
    fallbackUserMessage,
    userMessage,
  }
}

export function persistTurnUserMessage({
  persistTimelineEvent = () => {},
  userMessage = '',
  fallbackUserEntry = null,
  meta = {},
  turnId = '',
} = {}) {
  const normalizedUserMessage = String(userMessage || '').trim()
  const persistedUserContentParts = buildPersistedUserContentParts(fallbackUserEntry?.content)
  const content = normalizedUserMessage || extractUserTextFromContent(fallbackUserEntry?.content)
  if (!String(content || '').trim() && persistedUserContentParts.length <= 0) return
  persistTimelineEvent('user_message', {
    role: 'user',
    content,
    meta: {
      ...(meta && typeof meta === 'object' ? meta : {}),
      ...(persistedUserContentParts.length > 0 ? { userContentParts: persistedUserContentParts } : {}),
    },
    turn: turnId,
  })
}

export async function handleCursorAgentProviderTurn({
  payload = {}, mode = '', permissionMode = '', activeTurnId = '',
  activeAssistantMessageId = '',
  authoritativeProjectFolder = '', loop = null, send = () => {},
  persistTimelineEvent = () => {}, commitFinalTurn = null,
  sendTurnState = () => {}, sendCancelled = () => {},
  executeCursorAgent = null, runPostTurn = () => {},
} = {}) {
  const providerId = String(payload?.providerId || '').trim().toLowerCase()
  if (providerId !== CURSOR_AGENT_PROVIDER_ID) return false
  const { userMessage, fallbackUserEntry } = resolveEffectiveTurnUserMessage({
    currentUserMessage: payload?.currentUserMessage,
    hasExplicitCurrentUserMessage: Object.prototype.hasOwnProperty.call(payload, 'currentUserMessage'),
    messages: payload?.messages,
  })
  persistTurnUserMessage({
    persistTimelineEvent,
    userMessage,
    fallbackUserEntry,
    turnId: activeTurnId,
    meta: {
      projectId: String(payload?.projectId || '').trim(),
      providerId,
      model: String(payload?.model ?? ''),
      threadId: String(payload?.threadId || '').trim(),
    },
  })
  const execute = executeCursorAgent || getCursorAgentChatExecutor()
  const result = await execute({
    mode, permissionMode,
    projectId: String(payload?.projectId || '').trim(),
    threadId: String(payload?.threadId || '').trim(),
    turnId: activeTurnId,
    assistantMessageId: activeAssistantMessageId,
    activeProjectPath: authoritativeProjectFolder,
    requestedProjectPath: String(payload?.projectFolder || '').trim(),
    prompt: userMessage,
    model: payload?.model ?? '',
    loop, send, persistTimelineEvent, commitFinalTurn, sendTurnState, sendCancelled,
  })
  if (result?.status === 'completed') {
    runPostTurn({
      userMessage,
      assistantText: String(result.full || ''),
      toolResults: Array.isArray(result.toolResults) ? result.toolResults : [],
    })
  }
  return true
}

export function resolvePreviousThreadRuntimeContext(threadId = '') {
  const normalizedThreadId = String(threadId || '').trim()
  if (!normalizedThreadId) return null
  try {
    const rows = listTimeline(normalizedThreadId, { limit: 250 })
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const event = rows[index]
      const meta = event?.meta && typeof event.meta === 'object' ? event.meta : {}
      const providerId = String(meta.providerId || '').trim().toLowerCase()
      const model = String(meta.model || '').trim()
      const projectId = String(meta.projectId || '').trim()
      if (!providerId && !model && !projectId) continue
      return { providerId, model, projectId }
    }
  } catch {
    return null
  }
  return null
}

export function normalizeChatTurnOptions(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const openai = source.openai && typeof source.openai === 'object' && !Array.isArray(source.openai)
    ? source.openai
    : {}
  const anthropic = source.anthropic && typeof source.anthropic === 'object' && !Array.isArray(source.anthropic)
    ? source.anthropic
    : {}
  const command = source.command && typeof source.command === 'object' && !Array.isArray(source.command)
    ? source.command
    : {}
  const normalizedOpenAI = {}
  const normalizedAnthropic = {}
  const normalizedCommand = {}
  const requiredAgentDelegation = normalizeRequiredAgentDelegation(source.requiredAgentDelegation)
  const processingMode = String(source.processingMode || '').trim().toLowerCase()
  const planAction = normalizePlanAction(source.planAction)

  if (openai.forceManualCompaction === true) normalizedOpenAI.forceManualCompaction = true
  if (openai.forceServerSideCompaction === true) normalizedOpenAI.forceServerSideCompaction = true
  if (openai.commandOnly === true) normalizedOpenAI.commandOnly = true

  const thresholdTokens = Number(openai.serverSideCompactionThresholdTokens || 0)
  if (Number.isFinite(thresholdTokens) && thresholdTokens > 0) {
    normalizedOpenAI.serverSideCompactionThresholdTokens = Math.round(thresholdTokens)
  }

  if (anthropic.forceContextManagementCompaction === true) normalizedAnthropic.forceContextManagementCompaction = true
  const anthropicThresholdTokens = Number(anthropic.contextManagementCompactionThresholdTokens || 0)
  if (Number.isFinite(anthropicThresholdTokens) && anthropicThresholdTokens > 0) {
    normalizedAnthropic.contextManagementCompactionThresholdTokens = Math.round(anthropicThresholdTokens)
  }
  const anthropicInstructions = String(anthropic.contextManagementCompactionInstructions || '').trim()
  if (anthropicInstructions) {
    normalizedAnthropic.contextManagementCompactionInstructions = anthropicInstructions.slice(0, 4_000)
  }
  if (command.disableTools === true) normalizedCommand.disableTools = true

  const normalized = {}
  if (processingMode === 'standard' || processingMode === 'fast') {
    normalized.processingMode = processingMode
  }
  if (Object.keys(normalizedOpenAI).length > 0) normalized.openai = normalizedOpenAI
  if (Object.keys(normalizedAnthropic).length > 0) normalized.anthropic = normalizedAnthropic
  if (Object.keys(normalizedCommand).length > 0) normalized.command = normalizedCommand
  if (requiredAgentDelegation) normalized.requiredAgentDelegation = requiredAgentDelegation
  if (planAction) normalized.planAction = planAction
  return normalized
}

function normalizePlanAction(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const kind = String(source.kind || '').trim().toLowerCase()
  if (kind !== 'synthesize_direction' && kind !== 'draft_plan' && kind !== 'revise_plan') return null
  const planId = String(source.planId || '').trim().slice(0, 128)
  const requestId = String(source.requestId || '').trim().slice(0, 160)
  const expectedRevision = Number(source.expectedRevision)
  const expectedDirectionRevision = Number(source.expectedDirectionRevision)
  const expectedAnswerRevision = Number(source.expectedAnswerRevision)
  if (!planId || !Number.isInteger(expectedRevision) || !Number.isInteger(expectedDirectionRevision)) return null
  if (kind === 'synthesize_direction' && (!requestId || !Number.isInteger(expectedAnswerRevision))) return null
  if (kind === 'revise_plan' && !requestId) return null
  return {
    kind,
    planId,
    ...(requestId ? { requestId } : {}),
    expectedRevision,
    expectedDirectionRevision,
    ...(Number.isInteger(expectedAnswerRevision) ? { expectedAnswerRevision } : {}),
  }
}

export function normalizeRequiredAgentDelegation(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const route = String(source.route || '').trim().toLowerCase()
  const normalizedRoute = route === 'orchestrated_single' || route === 'orchestrated_fanout'
    ? route
    : ''
  const tasks = Array.isArray(source.tasks)
    ? source.tasks.slice(0, 100).map((task, index) => {
      const row = task && typeof task === 'object' && !Array.isArray(task) ? task : {}
      const instruction = String(row.instruction || '').trim().slice(0, 12_000)
      const agentRoleId = String(row.agentRoleId || '').trim().slice(0, 160)
      const agentRole = String(row.agentRole || '').trim().slice(0, 240)
      if (!instruction || (!agentRoleId && !agentRole)) return null
      return {
        task_id: (String(row.task_id || '').trim() || `task_${index + 1}`).slice(0, 160),
        agentRoleId,
        agentRole,
        instruction,
        injected_context: (
          String(row.injected_context || '').trim()
          || 'User-selected agent task. Inspect the current project with the available read/search tools.'
        ).slice(0, 4_000),
        expected_output_format: (
          String(row.expected_output_format || '').trim()
          || 'Return a concise, actionable result in natural Markdown with file references when relevant.'
        ).slice(0, 1_000),
      }
    }).filter(Boolean)
    : []
  if (tasks.length === 0) return null
  return {
    route: normalizedRoute || (tasks.length === 1 ? 'orchestrated_single' : 'orchestrated_fanout'),
    tasks,
  }
}

export function createChatStreamErrorDiagnostics({
  providerId,
  model,
  mode,
  messages,
  settings,
  permissionMode,
  persistedPermissionMode,
  requestedPermissionMode,
  adapterProfile,
  workspaceDiagnostics,
}) {
  return {
    providerId: String(providerId || '').trim().toLowerCase(),
    model: String(model || '').trim(),
    authMethod: '',
    mode: String(mode || 'execute').trim().toLowerCase() || 'execute',
    round: 0,
    requestedToolCount: 0,
    activeToolCount: 0,
    historyMessageCount: Array.isArray(messages) ? messages.length : 0,
    preCallOccupancyEstimateTokens: 0,
    promptOccupancyEstimateTokens: 0,
    rollingTotalTokens: 0,
    continuityPacketTokens: 0,
    continuitySourceRefs: 0,
    conversion_attempted: false,
    converted_count: 0,
    skipped_count: 0,
    failed_count: 0,
    failure_reason_code: '',
    failure_message_sanitized: '',
    next_action_hint: '',
    runbookDetailMode: resolveRunbookErrorDetailMode(settings),
    runtimeDiagnosticsVisible: settings?.commandSafety?.showDeveloperOptions === true,
    permissionMode,
    persistedPermissionMode,
    permissionModeInSync: !requestedPermissionMode || requestedPermissionMode === persistedPermissionMode,
    adapterSelection: adapterProfile.adapterSelection,
    adapterReason: adapterProfile.adapterReason,
    adapterId: adapterProfile.adapterId,
    wireApi: String(adapterProfile?.wireApi || '').trim() || 'ai_sdk_stream_text:unknown',
    workspaceRoot: workspaceDiagnostics.workspaceRoot,
    workspaceTrustSource: workspaceDiagnostics.workspaceTrustSource,
    trustedWorkspaceActive: workspaceDiagnostics.trustedWorkspaceActive,
    toolSurfaceKind: 'none',
    toolSurfaceComponents: [],
    mixedToolSurfaceDetected: false,
    delegationBackend: 'none',
    availableDelegationBackends: [],
    delegationBackendPreference: 'auto',
    delegationBackendReason: '',
    nativeCollaborationModeId: '',
    modelSupportsTools: true,
    modelSupportsAnyToolSurface: true,
    modelToolSupportMode: '',
    modelCapabilitiesSource: '',
    capabilityBlockReasons: [],
    capabilityNotices: [],
    accountRuntimeStatus: '',
    openAIAuthParityStatus: '',
    openAIAuthParityExceptions: [],
    openAIAuthParityMismatches: [],
    supportedTools: [],
    defaultEnabledTools: [],
    usedTools: [],
    excludedToolsWithReasons: [],
    ...buildEmptyPromptBudgetDiagnosticSnapshot(),
    surfacePolicyReresolution: [],
    toolCallCount: 0,
    modelEmittedToolCalls: false,
    firstToolLatencyMs: 0,
    zeroToolExecuteTurn: false,
    approvalPromptCount: 0,
    approvalApprovedCount: 0,
    approvalDeniedCount: 0,
    approvalPolicyBlockedCount: 0,
    approvalUserDeniedCount: 0,
    approvalTimeoutCount: 0,
    approvalAutoSources: {},
    riskyApprovalPromptCount: 0,
    toolWorkflowLintRejectCount: 0,
    toolWorkflowLintWarnCount: 0,
    toolWorkflowRerouteCount: 0,
    toolWorkflowWrongToolRetryCount: 0,
    toolWorkflowSurfaceNarrowed: false,
    toolWorkflowSuppressedToolCount: 0,
    toolWorkflowWriteIntentDetected: false,
    toolWorkflowApplyPatchFailureCount: 0,
    toolWorkflowFirstSuccessfulMutationLatencyMs: 0,
    toolWorkflowFailureClassCounts: {},
    toolWorkflowToolAttemptCounts: {},
    toolWorkflowToolFailureCounts: {},
    toolWorkflowWriteFailureCounts: {},
    toolWorkflowLintCodeCounts: {},
    toolWorkflowFamilyCounts: {},
    surfaceResolutionFailure: '',
    guardrailFailures: [],
    modelTextualApprovalWithoutToolCall: false,
    modelTextualApprovalCueCount: 0,
  }
}
