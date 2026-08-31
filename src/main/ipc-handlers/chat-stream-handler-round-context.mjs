import { resolveModelContextLimit } from '../api-clients/model-context-limits.mjs'
import { createContinuityRuntime } from '../chat/continuity/continuity-runtime.mjs'
import {
  buildExecutionBriefPrompt,
  buildRecentExecutionBriefContext,
} from '../chat/execution-brief-prompt.mjs'
import { resolveAssistantPhaseForTurn } from '../chat/assistant-phase-policy.mjs'
import {
  buildPersistedUserContentParts,
  hydrateHistoryAttachmentsForModel,
} from '../chat/chat-attachment-parts.mjs'
import { applyAttachmentFallbackPhase } from '../chat/chat-stream-attachment-fallback.mjs'
import {
  appendThreadAttachmentAgentContext,
  prepareThreadAttachmentAgentContext,
} from '../chat/thread-attachment-agent-context.mjs'
import { commitProjectedTimelineEvent } from '../chat/canonical-root-event-writer.mjs'
import { bootstrapTurnHistory } from '../chat/chat-turn-bootstrap.mjs'
import { buildRuntimeContextBlock } from '../chat/runtime-context.mjs'
import { listVisibleTerminalSessionsForChat } from '../chat/terminal-session-events.mjs'
import { collectRecentToolContextFacts } from '../chat/tool-context-facts.mjs'
import { buildModeSystemPrompt } from '../chat/turn-mode.mjs'
import {
  buildActivePlanAuthoringPrompt,
  buildActivePlanDecisionPrompt,
  buildPlanActionPrompt,
} from '../chat/plan-runtime-prompts.mjs'
import { resolveProviderPromptBudgetProfile } from '../chat/provider-prompt-budget-profile.mjs'
import {
  ASSISTANT_PHASE_COMMENTARY,
  ASSISTANT_PHASE_FINAL_ANSWER,
} from '../../common/chat/assistant-phase.mjs'
import {
  SYSTEM_PROMPT,
  PLAN_MODE_PROMPT,
  THINK_MODE_PROMPT,
} from '../chat/prompt-constants.mjs'

export function createOpenAIAccountQuestionUserBridge({
  activeThreadId = '',
  activeTurnId = '',
  mode = 'execute',
  send = () => {},
  persistTimelineEvent = () => {},
} = {}) {
  return {
    originMode: mode === 'plan' || mode === 'thinking' ? mode : 'execute',
    onQuestionUserRequest: (questionUser = null) => {
      const normalizedOriginMode = mode === 'plan' || mode === 'thinking' ? mode : 'execute'
      const request = {
        ...(questionUser && typeof questionUser === 'object' ? questionUser : {}),
        originMode: normalizedOriginMode,
      }
      const payload = {
        threadId: activeThreadId,
        turnId: activeTurnId,
        questionUser: request,
      }
      commitProjectedTimelineEvent({
        persistTimelineEvent, send, kind: 'question_user_requested',
        options: { role: 'system', content: String(request.question || ''), meta: { questionUser: request } },
        channel: 'chat:question-user-requested', payload,
      })
    },
    onQuestionUserResolved: (payload = {}) => {
      const deliveryPayload = {
        threadId: activeThreadId,
        turnId: activeTurnId,
        ...payload,
      }
      commitProjectedTimelineEvent({
        persistTimelineEvent, send, kind: 'question_user_cleared',
        options: { role: 'system', content: String(payload?.reason || 'resolved'), meta: { ...payload } },
        channel: 'chat:question-user-cleared', payload: deliveryPayload,
      })
    },
  }
}

export function createOpenAIAccountMcpElicitationBridge({
  activeThreadId = '',
  activeTurnId = '',
  sender = null,
  senderId = 0,
  send = () => {},
  persistTimelineEvent = () => {},
} = {}) {
  return {
    senderId: Number(senderId || 0),
    subscribeRendererDestroyed: (callback) => {
      if (typeof callback !== 'function' || typeof sender?.once !== 'function') return () => {}
      if (sender.isDestroyed?.()) {
        queueMicrotask(callback)
        return () => {}
      }
      sender.once('destroyed', callback)
      return () => sender.removeListener?.('destroyed', callback)
    },
    onRequest: (elicitation = null) => {
      const payload = {
        threadId: activeThreadId,
        turnId: activeTurnId,
        elicitation,
      }
      commitProjectedTimelineEvent({
        persistTimelineEvent, send, kind: 'mcp_elicitation_requested',
        options: {
          role: 'system', content: String(elicitation?.message || ''),
          meta: {
            serverName: String(elicitation?.serverName || ''),
            fieldCount: Array.isArray(elicitation?.fields) ? elicitation.fields.length : 0,
          },
        },
        channel: 'chat:mcp-elicitation-requested', payload,
      })
    },
    onResolved: (payload = {}) => {
      const deliveryPayload = {
        threadId: activeThreadId,
        turnId: activeTurnId,
        ...payload,
      }
      commitProjectedTimelineEvent({
        persistTimelineEvent, send, kind: 'mcp_elicitation_resolved',
        options: {
          role: 'system', content: String(payload?.action || 'cancel'),
          meta: {
            action: String(payload?.action || 'cancel'),
            reason: String(payload?.reason || 'resolved'),
          },
        },
        channel: 'chat:mcp-elicitation-cleared', payload: deliveryPayload,
      })
    },
  }
}

export async function buildChatStreamRoundContext({
  sender = null,
  providerId = '',
  model = '',
  mode = 'execute',
  permissionMode = '',
  settings = {},
  sourceHistoryMessages = [],
  fallbackUserEntry = null,
  userMessage = '',
  resolvedToolSurface = {},
  tools = {},
  openAIAccountDynamicToolCatalog = {},
  modelSupportsTools = true,
  modelCapabilities = {},
  delegationAvailable = false,
  includeGlobalMemoryInContext = false,
  activeProjectId = '',
  activeThreadId = '',
  activeTurnId = '',
  effectiveProjectFolder = '',
  errorDiagnostics = {},
  send = () => {},
  sendNotice = () => {},
  sendTurnState = () => {},
  persistTimelineEvent = () => {},
  commitFailureTurn = null,
  openAIExecutionAuth = null,
  openAIAccountDynamicToolExecutor = null,
  openAIAccountCollaborationModeId = '',
  loop = null,
  turnOptions = {},
} = {}) {
  const normalizedProviderId = String(providerId || '').trim().toLowerCase()
  const options = {
    model: model ?? '',
    tools,
    openAIAccountDynamicToolCatalog,
    resolvedModelCapabilities: modelCapabilities,
    abortSignal: loop?.abortController?.signal,
    ...(typeof openAIAccountDynamicToolExecutor === 'function'
      ? { openAIAccountDynamicToolExecutor }
      : {}),
    ...(normalizedProviderId === 'openai'
      ? {
          openAIExecutionAuthContext: {
            authMethod: openAIExecutionAuth?.authMethod || 'api_key',
            sessionStatus: String(openAIExecutionAuth?.sessionSummary?.status || '').trim(),
          },
          openAIAccountApprovalContext: {
            sender,
            permissionMode,
            commandSafety: settings?.commandSafety,
          },
          openAIAccountDelegationBackend: String(resolvedToolSurface.delegationBackend || '').trim().toLowerCase() || 'none',
          openAIAccountCollaborationModeId,
          openAIAccountQuestionUserBridgeContext: createOpenAIAccountQuestionUserBridge({
            activeThreadId,
            activeTurnId,
            mode,
            send,
            persistTimelineEvent,
          }),
          openAIAccountMcpElicitationBridgeContext: createOpenAIAccountMcpElicitationBridge({
            activeThreadId,
            activeTurnId,
            sender,
            senderId: Number(sender?.id || 0),
            send,
            persistTimelineEvent,
          }),
        }
      : {}),
  }
  const modelContext = resolveModelContextLimit(providerId, model ?? '')
  const promptBudgetProfile = resolvedToolSurface.promptBudgetProfile
    || resolveProviderPromptBudgetProfile({
      providerId,
      modelId: model ?? '',
      runtimeSettings: settings?.providerRuntimeSettings || null,
      requestContext: { mode },
    })
  const rollingUsage = {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  }
  const continuityRuntime = createContinuityRuntime({
    providerId,
    policy: settings.continuityPolicy,
    threadId: activeThreadId,
    turnId: activeTurnId,
    project: effectiveProjectFolder,
    modelLimit: modelContext.limitTokens,
    modelMaxOutputTokens: Number.isFinite(modelContext?.maxOutputTokens)
      ? Number(modelContext.maxOutputTokens)
      : null,
    modelSource: modelContext.source,
    promptBudgetProfile,
    send,
    persistTimelineEvent,
  })
  const runtimeContextBlock = buildRuntimeContextBlock()
  const planAuthoringPrompt = buildActivePlanAuthoringPrompt(effectiveProjectFolder, {
    threadId: activeThreadId,
    mode,
  })
  const planDecisionPrompt = buildActivePlanDecisionPrompt(effectiveProjectFolder, {
    threadId: activeThreadId,
    mode,
  })
  const planActionPrompt = buildPlanActionPrompt(effectiveProjectFolder, {
    threadId: activeThreadId,
    mode,
    action: turnOptions?.planAction,
  })
  if (normalizedProviderId === 'openai' && planActionPrompt) {
    options.openAIAccountCurrentTurnInput = [{
      type: 'text',
      text: planActionPrompt,
    }]
  }
  const systemPromptAppendix = String(settings.systemPromptAppendix ?? '').trim()
  const modeSystemPrompt = [
    buildModeSystemPrompt(
      SYSTEM_PROMPT,
      { plan: PLAN_MODE_PROMPT, thinking: THINK_MODE_PROMPT },
      mode,
    ),
    runtimeContextBlock,
    ...(planDecisionPrompt ? [planDecisionPrompt] : []),
    ...(planAuthoringPrompt ? [planAuthoringPrompt] : []),
    ...(planActionPrompt ? [planActionPrompt] : []),
    ...(systemPromptAppendix
      ? [`[ADDOM Custom System Prompt]\n${systemPromptAppendix}`]
      : []),
  ].join('\n\n')
  const executionBriefPrompt = buildExecutionBriefPrompt({
    mode,
    permissionMode,
    toolSurfaceKind: resolvedToolSurface.toolSurfaceKind,
    activeTools: tools,
    modelSupportsTools,
    modelCapabilities,
    delegationAvailable,
    recentContext: buildRecentExecutionBriefContext(sourceHistoryMessages),
    toolContextFacts: collectRecentToolContextFacts(activeThreadId, { limit: 48 }),
    visibleTerminalSessions: listVisibleTerminalSessionsForChat({
      projectFolder: effectiveProjectFolder,
      permissionMode,
      activeThreadId,
    }),
  })
  const assistantCommentaryPhase = resolveAssistantPhaseForTurn({
    providerId,
    modelId: model ?? '',
    phase: ASSISTANT_PHASE_COMMENTARY,
  })
  const assistantFinalPhase = resolveAssistantPhaseForTurn({
    providerId,
    modelId: model ?? '',
    phase: ASSISTANT_PHASE_FINAL_ANSWER,
  })
  const persistedUserContentParts = buildPersistedUserContentParts(fallbackUserEntry?.content)
  let historyWithMemory = await hydrateHistoryAttachmentsForModel(sourceHistoryMessages, {
    preferLocalImagePaths: normalizedProviderId === 'openai'
      && String(openAIExecutionAuth?.authMethod || '').trim().toLowerCase() === 'account',
  })
  if (userMessage) {
    persistTimelineEvent('user_message', {
      role: 'user',
      content: userMessage,
      meta: {
        projectId: activeProjectId,
        providerId: String(providerId ?? ''),
        model: String(model ?? ''),
        ...(persistedUserContentParts.length > 0
          ? { userContentParts: persistedUserContentParts }
          : {}),
      },
    })
  }
  const attachmentFallback = await applyAttachmentFallbackPhase({
    historyMessages: historyWithMemory,
    settings,
    providerId,
    model: model ?? '',
    projectId: activeProjectId,
    threadId: activeThreadId,
    errorDiagnostics,
    send,
    sendNotice,
    sendTurnState,
    persistTimelineEvent,
    commitFailureTurn,
  })
  if (!attachmentFallback.ok) {
    return {
      ok: false,
    }
  }
  historyWithMemory = attachmentFallback.history

  const isOpenAIAccountTurn = normalizedProviderId === 'openai'
    && String(openAIExecutionAuth?.authMethod || '').trim().toLowerCase() === 'account'
  if (isOpenAIAccountTurn) {
    let attachmentAgentContext = null
    try {
      attachmentAgentContext = await prepareThreadAttachmentAgentContext({
        projectId: activeProjectId,
        threadId: activeThreadId,
      })
    } catch {
      attachmentAgentContext = {
        ok: false,
        errors: [{ error: 'attachment_mirror_prepare_failed' }],
      }
    }
    if (!attachmentAgentContext?.ok) {
      const message = 'No output generated. Check turn runbook for errors.'
      const reason = 'Thread attachment mirror preparation failed.'
      if (typeof commitFailureTurn === 'function') {
        commitFailureTurn({
          message,
          reason,
          errorMeta: { failureReasonCode: 'attachment_mirror_prepare_failed' },
        })
      } else {
        persistTimelineEvent('chat_error', { role: 'system', content: `Error: ${message}` })
        send('chat:error', { message })
        sendTurnState('completed', { status: 'error', reason })
      }
      return { ok: false }
    }
    historyWithMemory = appendThreadAttachmentAgentContext(
      historyWithMemory,
      attachmentAgentContext.prompt,
    )
    if (attachmentAgentContext.rootPath) {
      options.openAIAccountAttachmentMirrorRoot = attachmentAgentContext.rootPath
    }
  }

  const ollamaToolPromptEnabled = providerId === 'ollama' && modelSupportsTools && Object.keys(tools).length > 0
  historyWithMemory = await bootstrapTurnHistory({
    history: historyWithMemory,
    mode,
    modeSystemPrompt,
    runtimeContextBlock,
    planModePrompt: PLAN_MODE_PROMPT,
    thinkModePrompt: THINK_MODE_PROMPT,
    providerId,
    model: model ?? '',
    modelContext,
    userMessage,
    projectFolder: effectiveProjectFolder,
    activeThreadId,
    activeTurnId,
    ollamaToolPromptEnabled,
    delegationAvailable,
    includeGlobalMemoryInContext,
    executionBriefPrompt,
    emitPromptComposition: settings?.commandSafety?.showDeveloperOptions === true,
    authMethod: openAIExecutionAuth?.authMethod || '',
    promptBudgetProfile,
    errorDiagnostics,
    send,
    persistTimelineEvent,
  })
  errorDiagnostics.historyMessageCount = Array.isArray(historyWithMemory)
    ? historyWithMemory.length
    : errorDiagnostics.historyMessageCount

  return {
    ok: true,
    options,
    modelContext,
    promptBudgetProfile,
    rollingUsage,
    continuityRuntime,
    assistantCommentaryPhase,
    assistantFinalPhase,
    history: historyWithMemory,
    turnToolResults: [],
    turnReasoningSegments: [],
  }
}
