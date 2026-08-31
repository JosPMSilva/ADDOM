import {
  createOpenAIAccountRuntimeError,
  normalizeId,
} from './ai-provider-openai-account-shared.mjs'
import {
  extractDynamicToolCall,
  normalizeDynamicToolExecutorResult,
} from './ai-provider-openai-account-dynamic-tools.mjs'
import {
  normalizeOpenAIAccountQuestionUserRequest,
  registerOpenAIAccountPendingQuestionUserRequest,
} from './ai-provider-openai-account-question-user.mjs'
import {
  extractItemId,
  extractThreadId,
  extractTurnId,
} from './ai-provider-openai-account-transcript.mjs'
import { classifyOpenAIAccountServerRequestMethod } from './ai-provider-openai-account-protocol-registry.mjs'
import { normalizeOpenAIAccountMcpElicitationRequest } from './ai-provider-openai-account-elicitation.mjs'
import { registerOpenAIAccountPendingMcpElicitation } from './ai-provider-openai-account-elicitation-pending.mjs'
import {
  buildOpenAIAccountAttestationUnavailableError,
  buildOpenAIAccountCurrentTimeResponse,
} from './ai-provider-openai-account-utility-requests.mjs'
import {
  buildOpenAIAccountExternalAuthRefreshError,
  normalizeOpenAIAccountAuthRefreshRequest,
} from './ai-provider-openai-account-auth-refresh.mjs'
import {
  buildOpenAIAccountLegacyApprovalDeniedResponse,
  mapOpenAIAccountLegacyReviewDecision,
  normalizeOpenAIAccountLegacyApplyPatchApproval,
  normalizeOpenAIAccountLegacyExecCommandApproval,
} from './ai-provider-openai-account-legacy-approvals.mjs'

export function createOpenAIAccountServerRequestHandler({
  bridge = null,
  matchesScope = () => false,
  markProgress = () => {},
  rejectTurn = () => {},
  accountDynamicToolExecutor = null,
  onProviderToolBoundary = null,
  bridgeThreadId = '',
  originMode = '',
  getActiveTurnId = () => '',
  threadId = '',
  buildSyntheticApplyPatchFileChangeItem = () => null,
  accountNativeItemsById = new Map(),
  getAccountNativeActivityState = () => null,
  setAccountNativeActivityState = () => {},
  trackAccountNativeActivityItem = (state) => state,
  emitAccountNativeActivityCompleted = () => {},
  resolveCommandApprovalResponse = async () => 'decline',
  resolveFileChangeApprovalResponse = async () => 'decline',
  resolvePermissionApprovalResponse = async () => ({ scope: 'turn', permissions: {} }),
  supportsApprovalDecision = () => false,
  onQuestionUserRequest = null,
  onQuestionUserResolved = null,
  onMcpElicitationRequest = null,
  onMcpElicitationResolved = null,
  mcpElicitationRendererSenderId = 0,
  subscribeMcpElicitationRendererDestroyed = null,
  abortSignal = null,
  now = Date.now,
  refreshAccountState = null,
  accountRuntimeVersion = '',
} = {}) {
  const handleDynamicToolCall = async (requestId, params) => {
    if (typeof accountDynamicToolExecutor !== 'function') {
      throw createOpenAIAccountRuntimeError(
        'account_runtime_dynamic_tool_unavailable',
        'OpenAI account runtime received a dynamic tool call, but no client-side tool executor is configured.',
      )
    }
    const activeTurnId = getActiveTurnId()
    const toolCall = extractDynamicToolCall(params)
    if (!toolCall.toolName) {
      throw createOpenAIAccountRuntimeError(
        'account_runtime_dynamic_tool_invalid',
        'OpenAI account runtime received a dynamic tool call without a valid tool name.',
      )
    }
    if (typeof onProviderToolBoundary === 'function') {
      onProviderToolBoundary({
        toolCallId: toolCall.id,
        toolName: toolCall.toolName,
        threadId: extractThreadId(params) || bridgeThreadId,
        turnId: extractTurnId(params) || activeTurnId,
      })
    }
    const responsePayload = await accountDynamicToolExecutor({
      id: toolCall.id,
      toolName: toolCall.toolName,
      input: toolCall.input,
      threadId: extractThreadId(params) || bridgeThreadId,
      turnId: extractTurnId(params) || activeTurnId,
      params,
    })
    await bridge.respond(requestId, normalizeDynamicToolExecutorResult(responsePayload))
    const syntheticApplyPatchItem = buildSyntheticApplyPatchFileChangeItem({
      toolCall,
      responsePayload,
    })
    if (!syntheticApplyPatchItem) return
    accountNativeItemsById.set(syntheticApplyPatchItem.id, { ...syntheticApplyPatchItem })
    setAccountNativeActivityState(trackAccountNativeActivityItem(
      getAccountNativeActivityState(),
      syntheticApplyPatchItem,
      'completed',
    ))
    emitAccountNativeActivityCompleted(syntheticApplyPatchItem)
  }

  const handleApprovalRequest = async (requestId, method, params) => {
    const requestThreadId = extractThreadId(params)
    const requestTurnId = extractTurnId(params)
    const requestItemId = normalizeId(params?.itemId)
    if (!requestThreadId || !requestTurnId || !requestItemId) {
      throw createOpenAIAccountRuntimeError(
        'account_runtime_malformed_approval_request',
        `OpenAI account runtime received malformed ${method} request without thread, turn, or item scope.`,
      )
    }
    const decision = method === 'item/commandExecution/requestApproval'
      ? await resolveCommandApprovalResponse(params)
      : method === 'item/fileChange/requestApproval'
        ? await resolveFileChangeApprovalResponse(params)
        : await resolvePermissionApprovalResponse(params)
    await bridge.respond(requestId, decision)
  }

  const handleLegacyApprovalRequest = async (requestId, method, params) => {
    const context = {
      runtimeVersion: accountRuntimeVersion,
      bridgeThreadId,
      activeTurnId: getActiveTurnId(),
    }
    const normalized = method === 'execCommandApproval'
      ? normalizeOpenAIAccountLegacyExecCommandApproval(params, context)
      : normalizeOpenAIAccountLegacyApplyPatchApproval(params, context)
    if (!normalized.valid) {
      await bridge.respond(
        requestId,
        buildOpenAIAccountLegacyApprovalDeniedResponse(normalized.failureReason),
      )
      rejectTurn(createOpenAIAccountRuntimeError(
        'account_runtime_legacy_approval_unqualified',
        `OpenAI account runtime rejected ${method}: ${normalized.failureReason}.`,
      ))
      return
    }
    const decision = method === 'execCommandApproval'
      ? await resolveCommandApprovalResponse(normalized.params)
      : await resolveFileChangeApprovalResponse(normalized.params)
    await bridge.respond(requestId, mapOpenAIAccountLegacyReviewDecision(decision))
  }

  const handleRequestUserInput = (requestId, params) => {
    const activeTurnId = getActiveTurnId()
    const questionUser = normalizeOpenAIAccountQuestionUserRequest(params, {
      threadId: bridgeThreadId,
      turnId: activeTurnId,
      itemId: extractItemId(params),
      originMode,
    })
    if (!questionUser?.requestId || !questionUser.threadId || !questionUser.turnId) {
      throw createOpenAIAccountRuntimeError(
        'account_runtime_malformed_request_user_input',
        'OpenAI account runtime received tool/requestUserInput without request, thread, or turn scope.',
      )
    }
    if (!questionUser.header && !questionUser.question && questionUser.options.length === 0) {
      throw createOpenAIAccountRuntimeError(
        'account_runtime_malformed_request_user_input',
        'OpenAI account runtime received tool/requestUserInput without visible prompt content.',
      )
    }
    const pendingEntry = registerOpenAIAccountPendingQuestionUserRequest({
      bridge,
      bridgeRequestId: requestId,
      appThreadId: threadId,
      requestId: questionUser.requestId,
      threadId: questionUser.threadId,
      turnId: questionUser.turnId,
      itemId: questionUser.itemId,
      questionUser,
      onResolved: onQuestionUserResolved,
    })
    if (!pendingEntry) {
      throw createOpenAIAccountRuntimeError(
        'account_runtime_request_user_input_register_failed',
        'OpenAI account runtime could not register the pending clarification request.',
      )
    }
    if (typeof onQuestionUserRequest === 'function') {
      onQuestionUserRequest({
        ...questionUser,
        responsePending: false,
      })
    }
  }

  const handleMcpElicitation = async (requestId, params) => {
    const normalized = normalizeOpenAIAccountMcpElicitationRequest(params)
    if (!normalized.valid || !threadId) {
      await bridge.respond(requestId, {
        action: 'cancel',
        content: null,
        _meta: null,
      })
      return
    }
    const pending = registerOpenAIAccountPendingMcpElicitation({
      bridge,
      bridgeRequestId: requestId,
      appThreadId: threadId,
      providerThreadId: extractThreadId(params) || bridgeThreadId,
      providerTurnId: extractTurnId(params) || getActiveTurnId(),
      rendererSenderId: mcpElicitationRendererSenderId,
      subscribeRendererDestroyed: subscribeMcpElicitationRendererDestroyed,
      abortSignal,
      elicitation: normalized.elicitation,
      onResolved: (payload) => {
        markProgress()
        if (typeof onMcpElicitationResolved === 'function') onMcpElicitationResolved(payload)
      },
    })
    if (typeof onMcpElicitationRequest === 'function') onMcpElicitationRequest(pending)
  }

  const handleUtilityRequest = async (requestId, method, params) => {
    if (method === 'attestation/generate') {
      await bridge.respond(
        requestId,
        null,
        buildOpenAIAccountAttestationUnavailableError(),
      )
      return
    }
    const currentTime = buildOpenAIAccountCurrentTimeResponse(params, { now })
    if (!currentTime.valid) {
      await bridge.respond(requestId, null, {
        code: -32602,
        message: `Invalid currentTime/read request: ${currentTime.reason}.`,
      })
      return
    }
    await bridge.respond(requestId, currentTime.response)
  }

  const handleAuthRefreshRequest = async (requestId, params) => {
    const normalized = normalizeOpenAIAccountAuthRefreshRequest(params)
    if (!normalized.valid) {
      await bridge.respond(requestId, null, {
        code: -32602,
        message: `Invalid account/chatgptAuthTokens/refresh request: ${normalized.failureReason}.`,
      })
      return
    }
    if (typeof refreshAccountState === 'function') {
      await refreshAccountState().catch(() => null)
    }
    const refreshError = buildOpenAIAccountExternalAuthRefreshError()
    await bridge.respond(requestId, null, refreshError)
    rejectTurn(createOpenAIAccountRuntimeError(
      'account_runtime_auth_refresh_required',
      refreshError.message,
    ))
  }

  return ({ id = 0, method = '', params = null } = {}) => {
    if (!matchesScope(params)) return
    const safeMethod = normalizeId(method)
    const requestClassification = classifyOpenAIAccountServerRequestMethod(safeMethod)
    if (safeMethod === 'attestation/generate' || safeMethod === 'currentTime/read') {
      markProgress()
      void handleUtilityRequest(id, safeMethod, params)
        .then(markProgress)
        .catch((error) => rejectTurn(createOpenAIAccountRuntimeError(
          normalizeId(error?.reason || error?.code) || 'account_runtime_utility_request_failed',
          normalizeId(error?.message) || `OpenAI account runtime failed to answer ${safeMethod}.`,
        )))
      return
    }
    if (safeMethod === 'account/chatgptAuthTokens/refresh') {
      markProgress()
      void handleAuthRefreshRequest(id, params)
        .then(markProgress)
        .catch((error) => rejectTurn(createOpenAIAccountRuntimeError(
          normalizeId(error?.reason || error?.code) || 'account_runtime_auth_refresh_failed',
          normalizeId(error?.message) || 'OpenAI account authorization refresh failed.',
        )))
      return
    }
    if (requestClassification.status !== 'supported') {
      void bridge.respond(id, { cancelled: true }).catch(() => {})
      rejectTurn(createOpenAIAccountRuntimeError(
        'account_runtime_unsupported_server_request',
        `OpenAI account runtime received unsupported server request: ${safeMethod}.`,
      ))
      return
    }
    if (safeMethod === 'item/tool/call') {
      markProgress()
      void (async () => {
        try {
          await handleDynamicToolCall(id, params)
          markProgress()
        } catch (error) {
          const message = normalizeId(error?.message) || 'Dynamic tool execution failed.'
          await bridge.respond(id, {
            contentItems: [{ type: 'inputText', text: `Tool error: ${message}` }],
            success: false,
          }).catch(() => {})
          markProgress()
          rejectTurn(createOpenAIAccountRuntimeError(
            normalizeId(error?.reason || error?.code) || 'account_runtime_dynamic_tool_failed',
            message,
          ))
        }
      })()
      return
    }
    if (
      safeMethod === 'item/commandExecution/requestApproval'
      || safeMethod === 'item/fileChange/requestApproval'
      || safeMethod === 'item/permissions/requestApproval'
    ) {
      markProgress()
      void (async () => {
        try {
          await handleApprovalRequest(id, safeMethod, params)
          markProgress()
        } catch (error) {
          const failureResponse = safeMethod === 'item/permissions/requestApproval'
            ? { scope: 'turn', permissions: {} }
            : (supportsApprovalDecision(params?.availableDecisions, 'cancel') ? 'cancel' : 'decline')
          await bridge.respond(id, failureResponse).catch(() => {})
          rejectTurn(createOpenAIAccountRuntimeError(
            normalizeId(error?.reason || error?.code) || 'account_runtime_approval_bridge_failed',
            normalizeId(error?.message) || `OpenAI account runtime failed to bridge ${safeMethod}.`,
          ))
        }
      })()
      return
    }
    if (safeMethod === 'execCommandApproval' || safeMethod === 'applyPatchApproval') {
      markProgress()
      void handleLegacyApprovalRequest(id, safeMethod, params)
        .then(markProgress)
        .catch(async (error) => {
          await bridge.respond(
            id,
            buildOpenAIAccountLegacyApprovalDeniedResponse('approval_bridge_failed'),
          ).catch(() => {})
          rejectTurn(createOpenAIAccountRuntimeError(
            normalizeId(error?.reason || error?.code) || 'account_runtime_legacy_approval_failed',
            normalizeId(error?.message) || `OpenAI account runtime failed to bridge ${safeMethod}.`,
          ))
        })
      return
    }
    if (safeMethod === 'item/tool/requestUserInput') {
      markProgress()
      try {
        handleRequestUserInput(id, params)
      } catch (error) {
        void bridge.respond(id, { cancelled: true }).catch(() => {})
        rejectTurn(createOpenAIAccountRuntimeError(
          normalizeId(error?.reason || error?.code) || 'account_runtime_request_user_input_failed',
          normalizeId(error?.message) || 'OpenAI account runtime failed to bridge tool/requestUserInput.',
        ))
      }
      return
    }
    if (safeMethod === 'mcpServer/elicitation/request') {
      markProgress()
      void handleMcpElicitation(id, params).catch(async (error) => {
        await bridge.respond(id, {
          action: 'cancel',
          content: null,
          _meta: null,
        }).catch(() => {})
        rejectTurn(createOpenAIAccountRuntimeError(
          normalizeId(error?.reason || error?.code) || 'account_runtime_mcp_elicitation_failed',
          normalizeId(error?.message) || 'OpenAI account runtime failed to bridge MCP elicitation.',
        ))
      })
      return
    }
    void bridge.respond(id, { cancelled: true }).catch(() => {})
    rejectTurn(createOpenAIAccountRuntimeError(
      'account_runtime_protocol_registry_mismatch',
      `OpenAI account runtime has no implementation for registered server request: ${safeMethod}.`,
    ))
  }
}
