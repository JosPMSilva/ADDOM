import { normalizePermissionMode } from '../../common/chat/permission-mode.mjs'
import { createProgressTimeoutMonitor, createProviderStreamStaleError } from './provider-policy.mjs'
import {
  createAbortError,
  createOpenAIAccountRuntimeError,
  getAccountAuthService,
  normalizeId,
  normalizeProjectFolder,
  __resetOpenAIAccountRuntimeServiceGetterForTests,
  __resetOpenAIAccountRuntimeThreadStateGetterForTests,
  __setOpenAIAccountRuntimeServiceGetterForTests,
  __setOpenAIAccountRuntimeThreadStateGetterForTests,
} from './ai-provider-openai-account-shared.mjs'
import {
  clearOpenAIAccountPendingQuestionUserRequest,
  clearOpenAIAccountPendingQuestionUserRequestsForTurn,
  extractQuestionUserRequestId,
  getOpenAIAccountPendingQuestionUserRequest as getPendingOpenAIAccountQuestionUserRequest,
  respondToOpenAIAccountPendingQuestionUserRequest,
  __resetOpenAIAccountPendingQuestionUserRequestsForTests,
} from './ai-provider-openai-account-question-user.mjs'
import {
  extractOpenAIAccountThreadTokenUsageTelemetry,
  extractOpenAIAccountTurnContextTelemetry,
  extractOpenAIAccountTurnUsage,
  mergeOpenAIAccountUsage,
} from './ai-provider-openai-account-telemetry.mjs'
import {
  advanceAccountContextCompaction,
  resolveAccountContextCompactionGeneration,
  resolveEffectiveAccountContextTelemetry,
  tagAccountContextUsageTelemetry,
} from './ai-provider-openai-account-context-state.mjs'
import {
  buildTurnLaunchParams,
  ensureConnectedAccountSession,
  resolveOpenAIAccountBridgeTurnSession,
} from './ai-provider-openai-account-bridge-session.mjs'
import { normalizeOpenAIProviderRuntimeSettings } from './openai-runtime-types.mjs'
import { buildDynamicToolSignature, buildDynamicTools } from './ai-provider-openai-account-dynamic-tools.mjs'
import { ACCOUNT_NATIVE_ACTIVITY_ITEM_TYPES } from './ai-provider-openai-account-constants.mjs'
import {
  cloneAccountCompactionState,
  cloneAccountNativeActivityState,
  createAccountCompactionState,
  createAccountNativeActivityState,
  syncAggregatedText,
  trackAccountNativeActivityDelta,
  trackAccountNativeActivityItem,
} from './ai-provider-openai-account-activity-state.mjs'
import {
  cloneAccountCollaborationState,
  createAccountCollaborationState,
  normalizeAccountCollaborationEvent,
  trackAccountCollaborationItem,
} from './ai-provider-openai-account-collaboration-state.mjs'
import { createOpenAIAccountApprovalBridge } from './ai-provider-openai-account-approval.mjs'
import {
  buildOpenAIAccountTurnPayload, buildOpenAIAccountTurnProviderMeta,
  createAccountNativeActivityEmitters, createPendingActivityState,
  createProviderToolCollectors, createTurnTimeout, hasSuspendedStaleTimeout,
  matchesOpenAIAccountBridgeTurnScope, resolveStreamIdleTimeoutMs,
  resolveStreamTimeoutMs, trackPendingActivity,
} from './ai-provider-openai-account-turn-payload.mjs'
import {
  buildOpenAIAccountProtocolDriftWarning,
  classifyOpenAIAccountItemType,
  classifyOpenAIAccountNotificationMethod,
  createOpenAIAccountUnknownActivityState,
  createSanitizedOpenAIAccountUnknownActivity,
  normalizeOpenAIAccountRuntimeIdentity,
  trackOpenAIAccountUnknownActivity,
} from './ai-provider-openai-account-protocol-registry.mjs'
import { createOpenAIAccountEntryPoints } from './ai-provider-openai-account-entrypoints.mjs'
import {
  buildOpenAIAccountChunkPayload,
  buildTurnInput,
  createOpenAIAccountMessageBoundaryTracker,
  extractAssistantPhase, extractDeltaText, extractItemId,
  extractPlanText, extractReasoningText, extractThreadId, extractTurnId,
} from './ai-provider-openai-account-transcript.mjs'
import { createOpenAIAccountServerRequestHandler } from './ai-provider-openai-account-server-requests.mjs'
import { createOpenAIAccountSupplementalNotificationController } from './ai-provider-openai-account-model-state.mjs'
import { rejectOpenAIAccountNativeToolForMode, resolveOpenAIAccountTurnModePolicy } from './ai-provider-openai-account-turn-mode.mjs'
import { filterToolsForMode } from '../chat/turn-mode.mjs'
const DEFAULT_OPENAI_ACCOUNT_STREAM_IDLE_TIMEOUT_MS = 600_000
async function startOpenAIAccountTurnOperation({
  messages = [],
  options = {},
  onChunk = () => {},
  onReasoning = null,
  onProviderToolStatus = null,
  onProviderToolOutput = null,
  onProviderToolBoundary = null,
  onContextUsageUpdate = null,
  onCompactionEvent = null,
  onCollaborationEvent = null,
  onProviderWarning = null,
} = {}) {
  const service = getAccountAuthService()
  if (!service || typeof service.getBridge !== 'function') {
    throw createOpenAIAccountRuntimeError(
      'account_bridge_unavailable',
      'OpenAI account runtime could not access the local account bridge.',
    )
  }
  await ensureConnectedAccountSession(service)
  const bridge = service.getBridge()
  if (!bridge) {
    throw createOpenAIAccountRuntimeError(
      'account_bridge_unavailable',
      'OpenAI account runtime could not access the local account bridge.',
    )
  }

  const requestContext = options?.requestContext && typeof options.requestContext === 'object'
    ? options.requestContext
    : {}
  const runtimeSettings = normalizeOpenAIProviderRuntimeSettings(options?.providerRuntimeSettings || {})
  const preserveLeadingWhitespace = requestContext.inlineCompletion === true
  const openAIAccountApprovalContext = options?.openAIAccountApprovalContext
    && typeof options.openAIAccountApprovalContext === 'object'
    ? options.openAIAccountApprovalContext
    : {}
  const permissionMode = normalizePermissionMode(openAIAccountApprovalContext.permissionMode)
  const permissionProfile = normalizeId(openAIAccountApprovalContext.permissionProfile)
  const commandSafety = openAIAccountApprovalContext.commandSafety
    && typeof openAIAccountApprovalContext.commandSafety === 'object'
    ? openAIAccountApprovalContext.commandSafety
    : {}
  const approvalSender = openAIAccountApprovalContext.sender ?? null
  const openAIAccountRequestApproval = typeof options?.openAIAccountRequestApproval === 'function'
    ? options.openAIAccountRequestApproval
    : null
  const accountDynamicToolExecutor = typeof options?.openAIAccountDynamicToolExecutor === 'function'
    ? options.openAIAccountDynamicToolExecutor
    : null
  const openAIAccountQuestionUserBridgeContext = options?.openAIAccountQuestionUserBridgeContext && typeof options.openAIAccountQuestionUserBridgeContext === 'object' ? options.openAIAccountQuestionUserBridgeContext : {}
  const onQuestionUserRequest = typeof openAIAccountQuestionUserBridgeContext.onQuestionUserRequest === 'function'
    ? openAIAccountQuestionUserBridgeContext.onQuestionUserRequest
    : null
  const onQuestionUserResolved = typeof openAIAccountQuestionUserBridgeContext.onQuestionUserResolved === 'function'
    ? openAIAccountQuestionUserBridgeContext.onQuestionUserResolved
    : null
  const openAIAccountQuestionUserOriginMode = String(openAIAccountQuestionUserBridgeContext.originMode || '').trim().toLowerCase()
  const openAIAccountMcpElicitationBridgeContext = options?.openAIAccountMcpElicitationBridgeContext && typeof options.openAIAccountMcpElicitationBridgeContext === 'object' ? options.openAIAccountMcpElicitationBridgeContext : {}
  const onMcpElicitationRequest = typeof openAIAccountMcpElicitationBridgeContext.onRequest === 'function' ? openAIAccountMcpElicitationBridgeContext.onRequest : null
  const onMcpElicitationResolved = typeof openAIAccountMcpElicitationBridgeContext.onResolved === 'function' ? openAIAccountMcpElicitationBridgeContext.onResolved : null
  const projectFolder = normalizeProjectFolder(requestContext.projectFolder)
  const threadId = normalizeId(requestContext.threadId)
  const requestedDelegationBackend = normalizeId(
    options?.openAIAccountDelegationBackend
    || requestContext?.openai?.accountDelegationBackend
    || requestContext?.accountDelegationBackend,
  ).toLowerCase() || 'none'
  const requestedCollaborationModeId = normalizeId(
    options?.openAIAccountCollaborationModeId
    || requestContext?.openai?.accountCollaborationModeId
    || requestContext?.accountCollaborationModeId,
  )
  const modelId = normalizeId(options?.model)
  const { turnMode, launchPolicy } = resolveOpenAIAccountTurnModePolicy({
    requestContext, permissionMode, permissionProfile, projectFolder,
  })
  const dynamicTools = buildDynamicTools(filterToolsForMode(
    options?.openAIAccountDynamicToolCatalog ?? options?.tools,
    turnMode,
  ))
  const dynamicToolSignature = buildDynamicToolSignature(dynamicTools)
  const {
    bridgeThreadId,
    resumedExistingThread,
    selectedCollaborationModePreset,
    selectedCollaborationModeId,
    effectiveDelegationBackend,
    continuityEpoch,
    continuityReducerVersion,
    modeSignature,
    modelSignature,
  } = await resolveOpenAIAccountBridgeTurnSession({
    bridge,
    modelId,
    dynamicTools,
    projectFolder,
    threadId,
    requestContext,
    requestedDelegationBackend,
    requestedCollaborationModeId,
    permissionMode,
    launchPolicy,
  })

  const input = buildTurnInput(messages, { hasExistingThread: resumedExistingThread, currentTurnInput: options?.openAIAccountCurrentTurnInput })
  const abortSignal = options?.abortSignal ?? null
  if (abortSignal?.aborted) throw createAbortError()

  const {
    providerToolStatuses,
    providerToolOutputs,
    emitProviderToolStatus,
    emitProviderToolOutput,
  } = createProviderToolCollectors({
    onProviderToolStatus,
    onProviderToolOutput,
  })

  let activeTurnId = ''
  let text = ''
  let reasoning = ''
  let reasoningPartBoundaryPending = false
  let completedTurn = null
  let latestThreadTokenUsageTelemetry = null
  let contextCompactionGeneration = resolveAccountContextCompactionGeneration(requestContext)
  let accountCompactionState = createAccountCompactionState()
  let accountCollaborationState = createAccountCollaborationState()
  let accountNativeActivityState = createAccountNativeActivityState()
  const accountRuntimeIdentity = normalizeOpenAIAccountRuntimeIdentity(
    typeof bridge.getRuntimeIdentity === 'function' ? bridge.getRuntimeIdentity() : null,
  )
  let accountUnknownActivityState = createOpenAIAccountUnknownActivityState()
  const emittedProtocolDriftWarningKeys = new Set()
  const seenItemLifecycleKeys = new Set()
  const accountNativeItemsById = new Map()
  let pendingActivityState = createPendingActivityState()
  let interruptRequested = false
  let abortHandler = null
  let staleAbortHandler = null
  let timeoutHandle = null
  let settled = false
  const resolvedStreamTimeoutMs = resolveStreamTimeoutMs(options)
  const resolvedStreamIdleTimeoutMs = resolveStreamIdleTimeoutMs(options, resolvedStreamTimeoutMs, DEFAULT_OPENAI_ACCOUNT_STREAM_IDLE_TIMEOUT_MS)
  const staleMonitor = createProgressTimeoutMonitor({
    timeoutMs: resolvedStreamIdleTimeoutMs,
    buildError: () => createProviderStreamStaleError({
      providerId: 'openai',
      timeoutMs: resolvedStreamIdleTimeoutMs,
    }),
  })

  async function requestTurnInterrupt() {
    if (interruptRequested || !bridgeThreadId || !activeTurnId) return
    interruptRequested = true
    await bridge.interruptTurn(bridgeThreadId, activeTurnId)
    clearOpenAIAccountPendingQuestionUserRequestsForTurn({
      threadId: bridgeThreadId,
      turnId: activeTurnId,
      reason: 'turn_interrupt_requested',
    })
  }
  let settleTurn = null
  let rejectTurn = null

  const completionPromise = new Promise((resolve, reject) => {
    settleTurn = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    rejectTurn = (error) => {
      if (settled) return
      settled = true
      reject(error)
    }
  })

  const markProgress = () => {
    staleMonitor.markProgress()
  }

  const refreshStaleMonitor = () => {
    if (!resolvedStreamIdleTimeoutMs) return
    if (hasSuspendedStaleTimeout(pendingActivityState)) {
      staleMonitor.clear()
      return
    }
    markProgress()
  }
  const emitProtocolDriftWarning = (unknownActivity = null) => {
    if (typeof onProviderWarning !== 'function') return
    const warning = buildOpenAIAccountProtocolDriftWarning(unknownActivity)
    const dedupeKey = normalizeId(warning?.meta?.dedupeKey)
    if (!dedupeKey || emittedProtocolDriftWarningKeys.has(dedupeKey)) return
    emittedProtocolDriftWarningKeys.add(dedupeKey)
    onProviderWarning(warning)
  }

  const matchesScope = (params = null) => matchesOpenAIAccountBridgeTurnScope(params, {
    bridgeThreadId,
    activeTurnId,
    extractThreadId,
    extractTurnId,
  })
  const {
    emitAccountNativeActivityStarted,
    emitAccountNativeActivityCompleted,
    emitAccountNativeActivityDelta,
  } = createAccountNativeActivityEmitters({
    emitProviderToolStatus,
    emitProviderToolOutput,
  })

  const {
    buildSyntheticApplyPatchFileChangeItem,
    normalizeAccountNativeActivityItemForProject,
    resolveCommandApprovalResponse, resolveFileChangeApprovalResponse,
    resolvePermissionApprovalResponse,
    supportsApprovalDecision,
  } = createOpenAIAccountApprovalBridge({
    projectFolder, appThreadId: threadId,
    permissionMode,
    commandSafety,
    approvalSender,
    openAIAccountRequestApproval,
    accountNativeItemsById,
    getBridgeThreadId: () => bridgeThreadId,
    getActiveTurnId: () => activeTurnId,
  })
  const supplementalNotificationController = createOpenAIAccountSupplementalNotificationController({ requestedModelId: modelId, markProgress, emitProviderToolStatus, rejectTurn })
  const isAgentMessageBoundary = createOpenAIAccountMessageBoundaryTracker()
  const onNotification = ({ method = '', params = null } = {}) => {
    if (!matchesScope(params)) return
    const safeMethod = normalizeId(method)
    const notificationClassification = classifyOpenAIAccountNotificationMethod(safeMethod)
    if (safeMethod === 'thread/tokenUsage/updated') {
      markProgress()
      latestThreadTokenUsageTelemetry = tagAccountContextUsageTelemetry(
        extractOpenAIAccountThreadTokenUsageTelemetry(params),
        contextCompactionGeneration,
      )
      if (latestThreadTokenUsageTelemetry && typeof onContextUsageUpdate === 'function') {
        onContextUsageUpdate({
          ...latestThreadTokenUsageTelemetry,
          authMethod: 'account',
          transportMode: 'codex_app_server_chatgpt',
          accountBridgeThreadId: bridgeThreadId,
          accountBridgeTurnId: extractTurnId(params) || activeTurnId,
        })
      }
      return
    }
    if (safeMethod === 'item/agentMessage/delta') {
      const delta = extractDeltaText(params)
      if (!delta) return
      const phase = extractAssistantPhase(params)
      markProgress()
      text += delta
      onChunk(buildOpenAIAccountChunkPayload(delta, {
        modelId: supplementalNotificationController.getTerminalModelId() || modelId,
        phase,
        activityKind: 'item/agentMessage/delta',
        boundaryBefore: isAgentMessageBoundary(extractItemId(params)),
      }))
      return
    }
    if (safeMethod === 'item/reasoning/delta') {
      const delta = extractReasoningText(params)
      if (!delta) return
      markProgress()
      reasoning += delta
      if (typeof onReasoning === 'function') onReasoning(delta)
      return
    }
    if (safeMethod === 'item/reasoning/summaryTextDelta' || safeMethod === 'item/reasoning/textDelta') {
      const delta = extractReasoningText(params)
      if (!delta) return
      markProgress()
      reasoning += delta
      if (typeof onReasoning === 'function') {
        onReasoning(delta, { boundaryBefore: reasoningPartBoundaryPending })
      }
      reasoningPartBoundaryPending = false
      return
    }
    if (safeMethod === 'item/reasoning/summaryPartAdded') {
      if (!reasoning) return
      reasoning += '\n'
      reasoningPartBoundaryPending = true
      return
    }
    if (supplementalNotificationController.handle(safeMethod, params, activeTurnId)) return
    if (safeMethod === 'item/plan/delta') {
      const delta = extractPlanText(params)
      if (!delta) return
      markProgress()
      accountNativeActivityState = trackAccountNativeActivityDelta(accountNativeActivityState, {
        itemType: 'plan',
        itemId: extractItemId(params),
        delta,
        params,
      })
      emitAccountNativeActivityDelta({
        itemType: 'plan',
        itemId: extractItemId(params),
        delta,
      })
      onChunk(buildOpenAIAccountChunkPayload(delta, {
        modelId: supplementalNotificationController.getTerminalModelId() || modelId,
        activityKind: 'item/plan/delta',
      }))
      return
    }
    if (safeMethod === 'item/commandExecution/outputDelta' || safeMethod === 'item/fileChange/outputDelta') {
      const itemType = safeMethod.includes('commandExecution') ? 'commandExecution' : 'fileChange'
      const delta = extractDeltaText(params)
      if (!delta) return
      markProgress()
      accountNativeActivityState = trackAccountNativeActivityDelta(accountNativeActivityState, {
        itemType,
        itemId: extractItemId(params),
        delta,
        params,
      })
      emitAccountNativeActivityDelta({
        itemType,
        itemId: extractItemId(params),
        delta,
      })
      return
    }
    if (safeMethod === 'item/started' || safeMethod === 'item/completed') {
      const item = params?.item && typeof params.item === 'object' ? params.item : null
      const normalizedItem = normalizeAccountNativeActivityItemForProject(item)
      if (!normalizedItem) {
        rejectTurn(createOpenAIAccountRuntimeError(
          'account_runtime_malformed_activity',
          `OpenAI account runtime received malformed ${safeMethod} notification without an item payload.`,
        ))
        return
      }
      const normalizedItemType = normalizeId(normalizedItem?.type)
      if (!normalizedItemType) {
        rejectTurn(createOpenAIAccountRuntimeError(
          'account_runtime_malformed_activity',
          'OpenAI account runtime received malformed app-server activity without a valid item type.',
        ))
        return
      }
      if (rejectOpenAIAccountNativeToolForMode({
        protocolMethod: safeMethod, itemType: normalizedItemType, item: normalizedItem, turnMode,
        bridge, bridgeThreadId, turnId: extractTurnId(params) || activeTurnId, rejectTurn,
      })) return
      const normalizedItemId = normalizeId(normalizedItem?.id)
      const lifecycleKey = normalizedItemId
        ? `${safeMethod}:${normalizedItemType}:${normalizedItemId}`
        : ''
      if (lifecycleKey && seenItemLifecycleKeys.has(lifecycleKey)) return
      if (lifecycleKey) seenItemLifecycleKeys.add(lifecycleKey)
      const itemClassification = classifyOpenAIAccountItemType(normalizedItemType)
      if (itemClassification.status === 'unknown') {
        const unknownActivity = createSanitizedOpenAIAccountUnknownActivity({
          protocolMethod: safeMethod,
          item: normalizedItem,
          runtimeIdentity: accountRuntimeIdentity,
        })
        accountUnknownActivityState = trackOpenAIAccountUnknownActivity(
          accountUnknownActivityState,
          unknownActivity,
        )
        emitProtocolDriftWarning(unknownActivity)
        pendingActivityState = trackPendingActivity(
          pendingActivityState,
          normalizedItem,
          safeMethod === 'item/completed' ? 'completed' : 'started',
        )
        refreshStaleMonitor()
        return
      }
      if (normalizedItemType === 'hookPrompt') {
        // Hook fragment text and run ids are hidden provider context.
        refreshStaleMonitor()
        return
      }
      if (
        normalizedItemType !== 'imageGeneration'
        && normalizedItemId
      ) {
        accountNativeItemsById.set(normalizedItemId, { ...normalizedItem })
      }
      pendingActivityState = trackPendingActivity(
        pendingActivityState,
        normalizedItem,
        safeMethod === 'item/completed' ? 'completed' : 'started',
      )
      refreshStaleMonitor()
      if (normalizedItemType === 'contextCompaction') {
        const completed = safeMethod === 'item/completed'
        const transition = advanceAccountContextCompaction({
          state: accountCompactionState, item: normalizedItem, completed,
          contextCompactionGeneration, accountBridgeThreadId: bridgeThreadId,
          accountBridgeTurnId: extractTurnId(params) || activeTurnId,
        })
        accountCompactionState = transition.state
        contextCompactionGeneration = transition.contextCompactionGeneration
        if (typeof onCompactionEvent === 'function') onCompactionEvent(transition.event)
        return
      }
      if (normalizedItemType === 'collabToolCall' || normalizedItemType === 'collabAgentToolCall') {
        const collaborationPhase = safeMethod === 'item/completed' ? 'completed' : 'started'
        accountCollaborationState = trackAccountCollaborationItem(
          accountCollaborationState,
          normalizedItem,
          collaborationPhase,
          { bridgeThreadId },
        )
        const collaborationEvent = normalizeAccountCollaborationEvent(
          normalizedItem,
          collaborationPhase,
          { bridgeThreadId },
        )
        if (collaborationEvent && typeof onCollaborationEvent === 'function') {
          onCollaborationEvent(collaborationEvent)
        }
        return
      }
      if (ACCOUNT_NATIVE_ACTIVITY_ITEM_TYPES.has(normalizedItemType)) {
        accountNativeActivityState = trackAccountNativeActivityItem(
          accountNativeActivityState,
          normalizedItem,
          safeMethod === 'item/completed' ? 'completed' : 'started',
        )
        if (safeMethod === 'item/completed') emitAccountNativeActivityCompleted(normalizedItem)
        else emitAccountNativeActivityStarted(normalizedItem)
        if (normalizedItemType === 'plan') {
          const nextPlanText = extractPlanText(normalizedItem)
          if (!text && nextPlanText && safeMethod === 'item/completed') {
            text = nextPlanText
          }
        }
        return
      }
      if (normalizedItemType === 'agentMessage') {
        const phase = extractAssistantPhase(normalizedItem) || extractAssistantPhase(params)
        text = syncAggregatedText(text, normalizedItem?.text, (delta) => {
          onChunk(buildOpenAIAccountChunkPayload(delta, {
            modelId: supplementalNotificationController.getTerminalModelId() || modelId,
            phase,
            activityKind: 'item/completed:agentMessage',
            boundaryBefore: isAgentMessageBoundary(normalizedItemId),
          }))
        })
        return
      }
      if (normalizedItemType === 'reasoning') {
        const nextReasoning = extractReasoningText(normalizedItem)
        reasoning = syncAggregatedText(reasoning, nextReasoning, onReasoning)
      }
      return
    }
    if (safeMethod === 'serverRequest/resolved') {
      markProgress()
      clearOpenAIAccountPendingQuestionUserRequest({
        threadId: extractThreadId(params) || bridgeThreadId,
        requestId: extractQuestionUserRequestId(params),
        reason: 'server_request_resolved',
      })
      return
    }
    if (safeMethod === 'turn/completed') {
      markProgress()
      const turn = params?.turn && typeof params.turn === 'object' ? params.turn : {}
      const status = normalizeId(turn?.status).toLowerCase()
      clearOpenAIAccountPendingQuestionUserRequestsForTurn({
        threadId: extractThreadId(params) || bridgeThreadId,
        turnId: normalizeId(turn?.id) || activeTurnId,
        reason: status === 'interrupted' ? 'turn_interrupted' : 'turn_completed',
      })
      if (status === 'failed' || turn?.error) {
        const errorMessage = normalizeId(turn?.error?.message) || 'OpenAI account turn failed.'
        rejectTurn(createOpenAIAccountRuntimeError(
          normalizeId(turn?.error?.code) || 'account_turn_failed',
          errorMessage,
        ))
        return
      }
      completedTurn = turn
      settleTurn(turn)
      return
    }
    if (
      notificationClassification.status === 'unknown'
      && (extractThreadId(params) || extractTurnId(params))
    ) {
      markProgress()
      const unknownActivity = createSanitizedOpenAIAccountUnknownActivity({
        protocolMethod: safeMethod,
        runtimeIdentity: accountRuntimeIdentity,
      })
      accountUnknownActivityState = trackOpenAIAccountUnknownActivity(
        accountUnknownActivityState,
        unknownActivity,
      )
      emitProtocolDriftWarning(unknownActivity)
    }
    if (notificationClassification.status === 'ignored_by_policy') markProgress()
  }
  const onServerRequest = createOpenAIAccountServerRequestHandler({
    bridge,
    matchesScope,
    markProgress,
    rejectTurn,
    accountDynamicToolExecutor,
    onProviderToolBoundary,
    bridgeThreadId,
    originMode: openAIAccountQuestionUserOriginMode,
    getActiveTurnId: () => activeTurnId,
    threadId,
    buildSyntheticApplyPatchFileChangeItem,
    accountNativeItemsById,
    getAccountNativeActivityState: () => accountNativeActivityState,
    setAccountNativeActivityState: (nextState) => {
      accountNativeActivityState = nextState
    },
    trackAccountNativeActivityItem,
    emitAccountNativeActivityCompleted,
    resolveCommandApprovalResponse, resolveFileChangeApprovalResponse,
    resolvePermissionApprovalResponse,
    supportsApprovalDecision,
    onQuestionUserRequest,
    onQuestionUserResolved,
    onMcpElicitationRequest,
    onMcpElicitationResolved,
    mcpElicitationRendererSenderId: Number(openAIAccountMcpElicitationBridgeContext.senderId || 0),
    subscribeMcpElicitationRendererDestroyed: openAIAccountMcpElicitationBridgeContext.subscribeRendererDestroyed, abortSignal, refreshAccountState: service.refreshState?.bind(service), accountRuntimeVersion: accountRuntimeIdentity.version,
  })
  bridge.on('notification', onNotification)
  bridge.on('server-request', onServerRequest)
  try {
    const turnResult = await bridge.startTurn(buildTurnLaunchParams({
      bridgeThreadId,
      input,
      model: modelId,
      collaborationModePreset: selectedCollaborationModePreset,
      launchPolicy,
      effort: runtimeSettings.reasoningEffort,
      serviceTier: requestContext.processingMode,
    }))
    activeTurnId = normalizeId(turnResult?.turn?.id)
    if (!activeTurnId) {
    throw createOpenAIAccountRuntimeError(
      'account_turn_start_failed',
      'OpenAI account runtime could not start a bridge-backed turn.',
      )
    }
    if (abortSignal) {
      abortHandler = () => {
        void requestTurnInterrupt().catch(() => {})
        rejectTurn(createAbortError())
      }
      abortSignal.addEventListener('abort', abortHandler, { once: true })
    }
    if (staleMonitor.signal) {
      staleAbortHandler = () => {
        void requestTurnInterrupt().catch(() => {})
        rejectTurn(staleMonitor.error() || createProviderStreamStaleError({
          providerId: 'openai',
          timeoutMs: resolvedStreamIdleTimeoutMs,
        }))
      }
      staleMonitor.signal.addEventListener('abort', staleAbortHandler, { once: true })
    }
    timeoutHandle = createTurnTimeout(resolvedStreamTimeoutMs, () => {
      rejectTurn(createOpenAIAccountRuntimeError(
        'account_turn_timeout',
        'OpenAI account runtime timed out while waiting for the bridge-backed turn to finish.',
      ))
    })
    markProgress()
    refreshStaleMonitor()
  } catch (error) {
    clearOpenAIAccountPendingQuestionUserRequestsForTurn({
      threadId: bridgeThreadId,
      turnId: activeTurnId,
      reason: 'turn_start_failed',
    })
    if (timeoutHandle) clearTimeout(timeoutHandle)
    if (abortSignal && abortHandler) abortSignal.removeEventListener('abort', abortHandler)
    if (staleMonitor.signal && staleAbortHandler) staleMonitor.signal.removeEventListener('abort', staleAbortHandler)
    staleMonitor.dispose()
    bridge.off('notification', onNotification)
    bridge.off('server-request', onServerRequest)
    throw error
  }
  const resultPromise = (async () => {
    try {
      await completionPromise
      const turnUsage = extractOpenAIAccountTurnUsage(completedTurn)
      const turnContextTelemetry = extractOpenAIAccountTurnContextTelemetry(completedTurn)
      const effectiveUsage = mergeOpenAIAccountUsage(turnUsage, latestThreadTokenUsageTelemetry?.usage)
      const effectiveContextTelemetry = resolveEffectiveAccountContextTelemetry({
        turnContextTelemetry,
        latestThreadTokenUsageTelemetry,
        accountCompactionCompleted: accountCompactionState.completed,
        contextCompactionGeneration,
      })
      const accountModelRoutingState = supplementalNotificationController.getModelRoutingState()
      return buildOpenAIAccountTurnPayload({
        bridgeThreadId,
        turnId: activeTurnId,
        modelId: accountModelRoutingState.terminalModelId || modelId,
        accountModelRoutingState,
        status: normalizeId(completedTurn?.status).toLowerCase() || 'completed',
        text,
        preserveLeadingWhitespace,
        reasoning,
        accountBridgeProjectFolder: projectFolder,
        accountDynamicToolSignature: dynamicToolSignature,
        accountDelegationBackend: effectiveDelegationBackend,
        accountCollaborationModeId: selectedCollaborationModeId,
        continuityEpoch,
        continuityReducerVersion,
        modeSignature,
        modelSignature,
        accountCompactionState,
        accountCollaborationState,
        accountNativeActivityState,
        usage: effectiveUsage,
        inputLimitTokens: effectiveContextTelemetry?.inputLimitTokens ?? null,
        remainingContextTokens: effectiveContextTelemetry?.remainingContextTokens ?? null,
        threadOccupancyTokens: effectiveContextTelemetry?.threadOccupancyTokens ?? null,
        threadCumulativeTotalTokens: effectiveContextTelemetry?.threadCumulativeTotalTokens ?? null,
        providerUsageSemantics: effectiveContextTelemetry?.providerUsageSemantics || '',
        contextCompactionGeneration,
        providerToolStatuses,
        providerToolOutputs,
        accountRuntimeIdentity,
        accountUnknownActivityState,
      })
    } finally {
      clearOpenAIAccountPendingQuestionUserRequestsForTurn({
        threadId: bridgeThreadId,
        turnId: activeTurnId,
        reason: 'turn_operation_closed',
      })
      if (timeoutHandle) clearTimeout(timeoutHandle)
      if (abortSignal && abortHandler) abortSignal.removeEventListener('abort', abortHandler)
      if (staleMonitor.signal && staleAbortHandler) staleMonitor.signal.removeEventListener('abort', staleAbortHandler)
      staleMonitor.dispose()
      bridge.off('notification', onNotification)
      bridge.off('server-request', onServerRequest)
    }
  })()

  return {
    bridgeThreadId,
    turnId: activeTurnId,
    modelId,
    resultPromise,
    cancel: async () => {
      await requestTurnInterrupt()
    },
    initialProviderResponseMeta: buildOpenAIAccountTurnProviderMeta({
      bridgeThreadId,
      turnId: activeTurnId,
      modelId,
      accountModelRoutingState: supplementalNotificationController.getModelRoutingState(),
      status: 'in_progress',
      accountBridgeProjectFolder: projectFolder,
      accountDynamicToolSignature: dynamicToolSignature,
      accountDelegationBackend: effectiveDelegationBackend,
      accountCollaborationModeId: selectedCollaborationModeId,
      continuityEpoch,
      continuityReducerVersion,
      modeSignature,
      modelSignature,
      accountCompactionState,
      contextCompactionGeneration,
      accountCollaborationState,
      accountNativeActivityState,
      accountRuntimeIdentity,
      accountUnknownActivityState,
    }),
  }
}

const openAIAccountEntryPoints = createOpenAIAccountEntryPoints({
  startOpenAIAccountTurnOperation,
  buildOpenAIAccountTurnProviderMeta,
  cloneAccountCompactionState,
  cloneAccountCollaborationState,
  cloneAccountNativeActivityState,
  normalizeId,
  normalizeProjectFolder,
})

export const createOpenAIAccountInlineCompletion = openAIAccountEntryPoints.createOpenAIAccountInlineCompletion
export const createOpenAIAccountStreamPayload = openAIAccountEntryPoints.createOpenAIAccountStreamPayload
export const startOpenAIAccountBackgroundOperation = openAIAccountEntryPoints.startOpenAIAccountBackgroundOperation

export {
  getPendingOpenAIAccountQuestionUserRequest as getOpenAIAccountPendingQuestionUserRequest,
  respondToOpenAIAccountPendingQuestionUserRequest as respondToOpenAIAccountQuestionUserRequest,
  __resetOpenAIAccountPendingQuestionUserRequestsForTests,
  __resetOpenAIAccountRuntimeServiceGetterForTests,
  __resetOpenAIAccountRuntimeThreadStateGetterForTests,
  __setOpenAIAccountRuntimeServiceGetterForTests,
  __setOpenAIAccountRuntimeThreadStateGetterForTests,
}
