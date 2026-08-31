export function createOpenAIAccountEntryPoints(dependencies = {}) {
  const {
    startOpenAIAccountTurnOperation,
    buildOpenAIAccountTurnProviderMeta,
    cloneAccountCompactionState,
    cloneAccountCollaborationState,
    cloneAccountNativeActivityState,
    normalizeId,
    normalizeProjectFolder,
  } = dependencies

  async function createOpenAIAccountInlineCompletion({
    messages = [],
    options = {},
  } = {}) {
    const payload = await createOpenAIAccountStreamPayload({
      messages,
      options: {
        ...options,
        requestContext: {
          ...(options?.requestContext && typeof options.requestContext === 'object'
            ? options.requestContext
            : {}),
          inlineCompletion: true,
          projectId: '',
          threadId: '',
        },
      },
      onChunk: () => {},
      onReasoning: null,
    })
    return {
      text: String(payload?.text || ''),
      usage: payload?.usage ?? null,
      model: normalizeId(options?.model),
      providerId: 'openai',
      providerResponseMeta: payload?.providerResponseMeta && typeof payload.providerResponseMeta === 'object'
        ? { ...payload.providerResponseMeta }
        : null,
    }
  }

  async function createOpenAIAccountStreamPayload({
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
    const operation = await startOpenAIAccountTurnOperation({
      messages,
      options,
      onChunk,
      onReasoning,
      onProviderToolStatus,
      onProviderToolOutput,
      onProviderToolBoundary,
      onContextUsageUpdate,
      onCompactionEvent,
      onCollaborationEvent,
      onProviderWarning,
    })
    return await operation.resultPromise
  }

  async function startOpenAIAccountBackgroundOperation({
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
    const operation = await startOpenAIAccountTurnOperation({
      messages,
      options,
      onChunk,
      onReasoning,
      onProviderToolStatus,
      onProviderToolOutput,
      onProviderToolBoundary,
      onContextUsageUpdate,
      onCompactionEvent,
      onCollaborationEvent,
      onProviderWarning,
    })

    return {
      response: {
        id: operation.turnId,
        status: 'in_progress',
        model: operation.modelId,
        background: true,
        conversation: { id: operation.bridgeThreadId },
      },
      providerResponseMeta: buildOpenAIAccountTurnProviderMeta({
        bridgeThreadId: operation.bridgeThreadId,
        turnId: operation.turnId,
        modelId: operation.modelId,
        status: 'in_progress',
        transportMode: 'codex_app_server_chatgpt_background',
        background: true,
        accountDynamicToolSignature: normalizeId(operation.initialProviderResponseMeta?.accountDynamicToolSignature),
        accountDelegationBackend: normalizeId(operation.initialProviderResponseMeta?.accountDelegationBackend).toLowerCase(),
        accountCollaborationModeId: normalizeId(operation.initialProviderResponseMeta?.accountCollaborationModeId),
        continuityEpoch: Math.max(1, Number(operation.initialProviderResponseMeta?.continuityEpoch || 1) || 1),
        continuityReducerVersion: normalizeId(operation.initialProviderResponseMeta?.continuityReducerVersion),
        modeSignature: normalizeId(operation.initialProviderResponseMeta?.modeSignature),
        modelSignature: normalizeId(operation.initialProviderResponseMeta?.modelSignature),
        contextCompactionGeneration: Math.max(0, Number(operation.initialProviderResponseMeta?.contextCompactionGeneration || 0) || 0),
        inputLimitTokens: operation.initialProviderResponseMeta?.inputLimitTokens ?? null,
        remainingContextTokens: operation.initialProviderResponseMeta?.remainingContextTokens ?? null,
        threadOccupancyTokens: operation.initialProviderResponseMeta?.threadOccupancyTokens ?? null,
        threadCumulativeTotalTokens: operation.initialProviderResponseMeta?.threadCumulativeTotalTokens ?? null,
        providerUsageSemantics: normalizeId(operation.initialProviderResponseMeta?.providerUsageSemantics),
        accountNativeActivityState: cloneAccountNativeActivityState(operation.initialProviderResponseMeta?.accountNativeActivity),
        accountRuntimeIdentity: operation.initialProviderResponseMeta?.accountProtocol?.runtime,
        accountUnknownActivityState: {
          events: operation.initialProviderResponseMeta?.accountProtocol?.unknownActivities,
        },
      }),
      cancel: operation.cancel,
      awaitResult: async () => {
        const payload = await operation.resultPromise
        return {
          ...payload,
          providerResponseMeta: buildOpenAIAccountTurnProviderMeta({
            bridgeThreadId: operation.bridgeThreadId,
            turnId: operation.turnId,
            modelId: normalizeId(payload?.providerResponseMeta?.modelId) || operation.modelId,
            accountModelRoutingState: {
              requestedModelId: normalizeId(payload?.providerResponseMeta?.requestedModelId) || operation.modelId,
              terminalModelId: normalizeId(payload?.providerResponseMeta?.modelId) || operation.modelId,
              reroutes: payload?.providerResponseMeta?.accountModelReroutes,
            },
            status: normalizeId(payload?.providerResponseMeta?.status).toLowerCase() || 'completed',
            transportMode: 'codex_app_server_chatgpt_background',
            background: true,
            accountBridgeProjectFolder: normalizeProjectFolder(payload?.providerResponseMeta?.accountBridgeProjectFolder),
            accountDynamicToolSignature: normalizeId(payload?.providerResponseMeta?.accountDynamicToolSignature),
            accountDelegationBackend: normalizeId(payload?.providerResponseMeta?.accountDelegationBackend).toLowerCase(),
            accountCollaborationModeId: normalizeId(payload?.providerResponseMeta?.accountCollaborationModeId),
            continuityEpoch: Math.max(1, Number(payload?.providerResponseMeta?.continuityEpoch || 1) || 1),
            continuityReducerVersion: normalizeId(payload?.providerResponseMeta?.continuityReducerVersion),
            modeSignature: normalizeId(payload?.providerResponseMeta?.modeSignature),
            modelSignature: normalizeId(payload?.providerResponseMeta?.modelSignature),
            contextCompactionGeneration: Math.max(0, Number(payload?.providerResponseMeta?.contextCompactionGeneration || 0) || 0),
            accountCompactionState: cloneAccountCompactionState(payload?.providerResponseMeta?.accountCompaction),
            accountCollaborationState: cloneAccountCollaborationState(payload?.providerResponseMeta?.accountCollaboration),
            accountNativeActivityState: cloneAccountNativeActivityState(payload?.providerResponseMeta?.accountNativeActivity),
            inputLimitTokens: payload?.providerResponseMeta?.inputLimitTokens ?? null,
            remainingContextTokens: payload?.providerResponseMeta?.remainingContextTokens ?? null,
            threadOccupancyTokens: payload?.providerResponseMeta?.threadOccupancyTokens ?? null,
            threadCumulativeTotalTokens: payload?.providerResponseMeta?.threadCumulativeTotalTokens ?? null,
            providerUsageSemantics: normalizeId(payload?.providerResponseMeta?.providerUsageSemantics),
            accountRuntimeIdentity: payload?.providerResponseMeta?.accountProtocol?.runtime,
            accountUnknownActivityState: {
              events: payload?.providerResponseMeta?.accountProtocol?.unknownActivities,
            },
          }),
        }
      },
    }
  }

  return {
    createOpenAIAccountInlineCompletion,
    createOpenAIAccountStreamPayload,
    startOpenAIAccountBackgroundOperation,
  }
}
