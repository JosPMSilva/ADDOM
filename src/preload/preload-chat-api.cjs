const MAX_INLINE_ATTACHMENT_ACTION_DATA_LENGTH = 28 * 1024 * 1024

function normalizeAttachmentActionDescriptor(attachment = {}) {
  const source = attachment && typeof attachment === 'object' ? attachment : {}
  const descriptor = {}
  const addString = (key, value, { trim = true } = {}) => {
    const normalized = typeof value === 'string' ? (trim ? value.trim() : value) : ''
    if (normalized) descriptor[key] = normalized
  }
  addString('attachmentId', source.attachmentId)
  addString('kind', source.kind || source.type)
  addString('mediaType', source.mediaType || source.mimeType)
  addString('fileName', source.fileName || source.filename)
  const inlineData = typeof (source.data || source.dataUrl || source.image) === 'string'
    ? (source.data || source.dataUrl || source.image)
    : ''
  if (inlineData && inlineData.length <= MAX_INLINE_ATTACHMENT_ACTION_DATA_LENGTH) {
    descriptor.data = inlineData
  }
  return descriptor
}

function normalizeAttachmentActionScope(scope = {}) {
  return {
    projectId: String(scope?.projectId || '').trim(),
    threadId: String(scope?.threadId || '').trim(),
  }
}

function createAttachmentsApi({ invokeVersioned }) {
  return {
    stage: (projectId, threadId, attachments = [], turnId = '') => invokeVersioned('attachments:stage', {
      projectId: String(projectId || ''),
      threadId: String(threadId || ''),
      turnId: String(turnId || ''),
      attachments: Array.isArray(attachments) ? attachments : [],
    }),
    stat: (attachmentId, scope = {}) => invokeVersioned('attachments:stat', {
      attachmentId: String(attachmentId || ''),
      projectId: String(scope?.projectId || ''),
      threadId: String(scope?.threadId || ''),
    }),
    open: (attachmentId, scope = {}) => invokeVersioned('attachments:open', {
      attachmentId: String(attachmentId || ''),
      projectId: String(scope?.projectId || ''),
      threadId: String(scope?.threadId || ''),
    }),
    copy: (attachment, scope = {}) => invokeVersioned('attachments:copy', {
      attachment: normalizeAttachmentActionDescriptor(attachment),
      ...normalizeAttachmentActionScope(scope),
    }),
    reveal: (attachment, scope = {}) => invokeVersioned('attachments:reveal', {
      attachment: normalizeAttachmentActionDescriptor(attachment),
      ...normalizeAttachmentActionScope(scope),
    }),
    saveAs: (attachment, scope = {}) => invokeVersioned('attachments:save-as', {
      attachment: normalizeAttachmentActionDescriptor(attachment),
      ...normalizeAttachmentActionScope(scope),
    }),
    listOpenWith: (attachment, scope = {}) => invokeVersioned('attachments:list-open-with', {
      attachment: normalizeAttachmentActionDescriptor(attachment),
      ...normalizeAttachmentActionScope(scope),
    }),
    openWith: (attachment, applicationId, scope = {}) => invokeVersioned('attachments:open-with', {
      attachment: normalizeAttachmentActionDescriptor(attachment),
      applicationId: String(applicationId || '').trim(),
      ...normalizeAttachmentActionScope(scope),
    }),
    getTextExtractionStatus: (options = {}) => invokeVersioned('attachments:text-extraction-status', {
      forceRefresh: options?.forceRefresh === true,
      timeoutMs: Number(options?.timeoutMs || 0) || 0,
    }),
  }
}

function createVaultApi({ invokeVersioned }) {
  return {
    getProviders: (forceRefresh = false) =>
      invokeVersioned('vault:getProviders', { forceRefresh: !!forceRefresh }),
    getProviderModels: (providerId, forceRefresh = false) =>
      invokeVersioned('vault:getProviderModels', {
        providerId: String(providerId || ''),
        forceRefresh: !!forceRefresh,
      }),
    getModelCapabilities: (providerId, modelId, forceRefresh = false) =>
      invokeVersioned('vault:getModelCapabilities', {
        providerId: String(providerId || ''),
        modelId: String(modelId || ''),
        forceRefresh: !!forceRefresh,
      }),
    setKey: (id, key) => invokeVersioned('vault:setKey', { providerId: id, apiKey: key }),
    deleteKey: (id) => invokeVersioned('vault:deleteKey', { providerId: id }),
  }
}

function createChatApi(deps) {
  const {
    sendVersioned,
    invokeVersioned,
    subVersioned,
    asTrimmedString,
    asPlainObject,
    asString,
    asOptionalRoundedNumber,
    normalizeChatTurnOptions,
  } = deps

  return {
    stream: (
      providerId,
      model,
      messages,
      projectFolder,
      permissionMode = 'ask',
      mode = 'execute',
      memoryCompressionEnabled = true,
      memoryCompressionThreshold = 50,
      projectId = '',
      threadId = '',
      turnId = '',
      currentUserMessage = null,
      assistantMessageId = '',
      turnOptions = {},
    ) => sendVersioned('chat:stream', {
      providerId,
      model,
      messages,
      projectFolder,
      permissionMode,
      mode,
      memoryCompressionEnabled,
      memoryCompressionThreshold,
      projectId,
      threadId,
      turnId,
      currentUserMessage,
      assistantMessageId: asTrimmedString(assistantMessageId),
      ...(Object.keys(normalizeChatTurnOptions(turnOptions)).length > 0
        ? { turnOptions: normalizeChatTurnOptions(turnOptions) }
        : {}),
    }),
    cancel: (threadId = '', turnId = '') => sendVersioned('chat:cancel', {
      threadId: asTrimmedString(threadId),
      turnId: asTrimmedString(turnId),
    }),
    getPendingQuestionUser: (threadId = '', requestId = '') => invokeVersioned('chat:getPendingQuestionUser', {
      threadId: asTrimmedString(threadId),
      requestId: asTrimmedString(requestId),
    }),
    respondQuestionUser: (payload = {}) => {
      const source = asPlainObject(payload)
      return invokeVersioned('chat:respondQuestionUser', {
        threadId: asTrimmedString(source.threadId),
        requestId: asTrimmedString(source.requestId),
        answer: asString(source.answer),
        selectedOptionId: asTrimmedString(source.selectedOptionId),
        cancel: source.cancel === true,
      })
    },
    getPendingMcpElicitation: (threadId = '') => invokeVersioned('chat:getPendingMcpElicitation', {
      threadId: asTrimmedString(threadId),
    }),
    respondMcpElicitation: (payload = {}) => {
      const source = asPlainObject(payload)
      return invokeVersioned('chat:respondMcpElicitation', {
        threadId: asTrimmedString(source.threadId),
        action: asTrimmedString(source.action),
        content: asPlainObject(source.content),
      })
    },
    logComplianceEvent: (payload = {}) => {
      const source = asPlainObject(payload)
      sendVersioned('chat:compliance-event', {
        noticeAction: asTrimmedString(source.noticeAction),
        noticeType: asTrimmedString(source.noticeType),
        threadId: asTrimmedString(source.threadId),
        turnId: asTrimmedString(source.turnId),
        providerId: asTrimmedString(source.providerId),
        toProviderId: asTrimmedString(source.toProviderId),
        model: asString(source.model),
        toModelId: asString(source.toModelId),
        termsVersion: asTrimmedString(source.termsVersion),
        summary: asString(source.summary),
        message: asString(source.message),
        content: asString(source.content),
        source: asTrimmedString(source.source),
        sessionSuppressKey: asTrimmedString(source.sessionSuppressKey),
        repeatedCount: asOptionalRoundedNumber(source.repeatedCount),
        preserveCitations: typeof source.preserveCitations === 'boolean'
          ? source.preserveCitations
          : undefined,
      })
    },
    onChunk: (cb) => subVersioned('chat:chunk', cb),
    onAssistantCommentary: (cb) => subVersioned('chat:assistant-commentary', cb),
    onDone: (cb) => subVersioned('chat:done', cb),
    onError: (cb) => subVersioned('chat:error', cb),
    onToolsPending: (cb) => subVersioned('chat:tools-pending', cb),
    onToolExecuting: (cb) => subVersioned('chat:tool-executing', cb),
    onToolOutput: (cb) => subVersioned('chat:tool-output', cb),
    onToolResult: (cb) => subVersioned('chat:tool-result', cb),
    onPlanDocumentReady: (cb) => subVersioned('chat:plan-document-ready', cb),
    onPlanLifecycleEvent: (cb) => subVersioned('chat:plan-lifecycle-event', cb),
    onMemoryInjected: (cb) => subVersioned('memory:context-injected', cb),
    onReasoningChunk: (cb) => subVersioned('chat:reasoning-chunk', cb),
    onReasoningDone: (cb) => subVersioned('chat:reasoning-done', cb),
    onCancelled: (cb) => subVersioned('chat:cancelled', cb),
    onUsage: (cb) => subVersioned('chat:usage', cb),
    onSourceUrl: (cb) => subVersioned('chat:source-url', cb),
    onSourceDocument: (cb) => subVersioned('chat:source-document', cb),
    onProviderToolOutput: (cb) => subVersioned('chat:provider-tool-output', cb),
    onProviderToolStatus: (cb) => subVersioned('chat:provider-tool-status', cb),
    onRuntimeDiagnostics: (cb) => subVersioned('chat:runtime-diagnostics', cb),
    onToolWorkflowTelemetry: (cb) => subVersioned('chat:tool-workflow-telemetry', cb),
    onCostEstimate: (cb) => subVersioned('chat:cost-estimate', cb),
    onPromptComposition: (cb) => subVersioned('chat:prompt-composition', cb),
    onTurnState: (cb) => subVersioned('chat:turn-state', cb),
    onFileChange: (cb) => subVersioned('chat:file-change', cb),
    onArtifactTracking: (cb) => subVersioned('chat:artifact-tracking', cb),
    onWriteConflict: (cb) => subVersioned('chat:write-conflict', cb),
    onMemoryCompressed: (cb) => subVersioned('chat:memory-compressed', cb),
    onContextCompacted: (cb) => subVersioned('chat:context-compacted', cb),
    onContinuityStatus: (cb) => subVersioned('chat:continuity-status', cb),
    onContinuityPacket: (cb) => subVersioned('chat:continuity-packet', cb),
    onOpenAIContinuityStatus: (cb) => subVersioned('chat:openai-continuity-status', cb),
    onOpenAICompactionEvent: (cb) => subVersioned('chat:openai-compaction-event', cb),
    onAnthropicCompactionEvent: (cb) => subVersioned('chat:anthropic-compaction-event', cb),
    onOpenAIWebSocketReconnect: (cb) => subVersioned('chat:openai-websocket-reconnect', cb),
    onBackgroundResponseQueued: (cb) => subVersioned('chat:background-response-queued', cb),
    onBackgroundResponseCompleted: (cb) => subVersioned('chat:background-response-completed', cb),
    onBackgroundResponseFailed: (cb) => subVersioned('chat:background-response-failed', cb),
    onQuestionUserRequested: (cb) => subVersioned('chat:question-user-requested', cb),
    onQuestionUserCleared: (cb) => subVersioned('chat:question-user-cleared', cb),
    onMcpElicitationRequested: (cb) => subVersioned('chat:mcp-elicitation-requested', cb),
    onMcpElicitationCleared: (cb) => subVersioned('chat:mcp-elicitation-cleared', cb),
    onApprovalCountdown: (cb) => subVersioned('chat:approval-countdown', cb),
    onApprovalTimeout: (cb) => subVersioned('chat:approval-timeout', cb),
    onCompressionState: (cb) => subVersioned('chat:compression-state', cb),
    onComplianceEvent: (cb) => subVersioned('chat:compliance-event', cb),
    onNotice: (cb) => subVersioned('chat:notice', cb),
  }
}

function createOpenAIAccountApi({ invokeOpenAIAccountVersioned, subVersioned, asTrimmedString }) {
  return {
    getState: () => invokeOpenAIAccountVersioned('openai-account:get-state'),
    refreshState: () => invokeOpenAIAccountVersioned('openai-account:refresh-state'),
    prepareRuntime: (options = {}) => invokeOpenAIAccountVersioned('openai-account:prepare-runtime', {
      force: options?.force === true,
    }),
    checkRuntimeUpdate: () => invokeOpenAIAccountVersioned('openai-account:check-runtime-update'),
    installRuntimeUpdate: () => invokeOpenAIAccountVersioned('openai-account:install-runtime-update'),
    startLogin: () => invokeOpenAIAccountVersioned('openai-account:start-login'),
    reopenLoginBrowser: (loginId) => invokeOpenAIAccountVersioned('openai-account:reopen-login-browser', {
      loginId: asTrimmedString(loginId),
    }),
    cancelLogin: (loginId) => invokeOpenAIAccountVersioned('openai-account:cancel-login', {
      loginId: asTrimmedString(loginId),
    }),
    disconnect: () => invokeOpenAIAccountVersioned('openai-account:disconnect'),
    onSessionUpdated: (cb) => subVersioned('openai-account:session-updated', cb),
    onLoginUpdated: (cb) => subVersioned('openai-account:login-updated', cb),
    onStorageUpdated: (cb) => subVersioned('openai-account:storage-updated', cb),
  }
}

function createCursorAgentApi({ invokeVersioned }) {
  return {
    getState: (options = {}) => invokeVersioned('cursor-agent:get-state', {
      forceRefresh: options?.forceRefresh !== false,
    }),
    prepareRuntime: () => invokeVersioned('cursor-agent:prepare-runtime'),
    checkRuntimeUpdate: () => invokeVersioned('cursor-agent:check-runtime-update'),
    installRuntimeUpdate: () => invokeVersioned('cursor-agent:install-runtime-update'),
    startLogin: () => invokeVersioned('cursor-agent:start-login'),
    cancelLogin: () => invokeVersioned('cursor-agent:cancel-login'),
    logout: () => invokeVersioned('cursor-agent:logout'),
  }
}

module.exports = {
  createAttachmentsApi,
  createVaultApi,
  createChatApi,
  createOpenAIAccountApi,
  createCursorAgentApi,
}
