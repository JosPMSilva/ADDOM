export const OPENAI_API_WEBSOCKET_PROTOCOL_REVISION = 1

export const OPENAI_API_QUALIFIED_RUNTIME_MANIFEST = Object.freeze({
  openaiAdapterVersion: '3.0.30',
  undiciVersion: '6.28.0',
})

const CURATED_OPENAI_API_MODELS = new Set([
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.3-codex',
])

const OPENAI_API_HOSTED_TOOL_FIXTURES = Object.freeze({
  web_search: 'openai-api-hosted-web-search-v1',
  file_search: 'openai-api-hosted-file-search-v1',
  code_interpreter: 'openai-api-hosted-code-interpreter-v1',
  image_generation: 'openai-api-hosted-image-generation-v1',
  mcp: 'openai-api-hosted-mcp-v1',
  shell: 'openai-api-hosted-shell-v1',
  apply_patch: 'openai-api-hosted-apply-patch-v1',
})

export const OPENAI_API_HOSTED_TOOL_BUILDERS = Object.freeze({
  web_search: Object.freeze({ builderName: 'webSearch', handlerId: 'ai_sdk_openai.tools.webSearch' }),
  file_search: Object.freeze({ builderName: 'fileSearch', handlerId: 'ai_sdk_openai.tools.fileSearch' }),
  code_interpreter: Object.freeze({ builderName: 'codeInterpreter', handlerId: 'ai_sdk_openai.tools.codeInterpreter' }),
  image_generation: Object.freeze({ builderName: 'imageGeneration', handlerId: 'ai_sdk_openai.tools.imageGeneration' }),
  mcp: Object.freeze({ builderName: 'mcp', handlerId: 'ai_sdk_openai.tools.mcp' }),
  shell: Object.freeze({ builderName: 'shell', handlerId: 'ai_sdk_openai.tools.shell' }),
  apply_patch: Object.freeze({ builderName: 'applyPatch', handlerId: 'ai_sdk_openai.tools.applyPatch' }),
})

function normalizeModelId(value = '') {
  return String(value || '').trim().toLowerCase().replace(/-\d{4}-\d{2}-\d{2}$/, '')
}

function parseSemver(value = '') {
  const match = String(value || '').trim().match(/^(\d+)\.(\d+)\.(\d+)/)
  return match
    ? {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
      }
    : null
}

function isSupportedUndiciVersion(value = '') {
  const version = parseSemver(value)
  if (!version || version.major !== 6) return false
  return version.minor === 28
}

function buildDefaultImplementationRegistry() {
  return Object.freeze(Object.fromEntries(
    Object.entries(OPENAI_API_HOSTED_TOOL_BUILDERS).map(([toolId, definition]) => (
      [toolId, Object.freeze({
        supported: true,
        builderName: definition.builderName,
        handlerId: definition.handlerId,
        runtimeFamily: '@ai-sdk/openai',
        runtimeVersion: OPENAI_API_QUALIFIED_RUNTIME_MANIFEST.openaiAdapterVersion,
        evidenceSource: 'locked_runtime_qualification',
        reason: '',
      })]
    )),
  ))
}

export const OPENAI_API_HOSTED_TOOL_IMPLEMENTATION_REGISTRY = buildDefaultImplementationRegistry()

function resolveModelEligibility(modelId = '', capabilityId = '') {
  const canonicalModelId = normalizeModelId(modelId)
  const curated = CURATED_OPENAI_API_MODELS.has(canonicalModelId)
  const codexRestricted = (
    canonicalModelId === 'gpt-5.3-codex'
    && Boolean(capabilityId)
    && capabilityId !== 'responses_websocket'
  )
  const eligible = curated && !codexRestricted
  return Object.freeze({
    status: curated ? 'curated' : 'unsupported',
    eligible,
    source: 'curated_model_metadata',
    reason: eligible
      ? ''
      : (
          codexRestricted
            ? 'The selected Codex model is not eligible for OpenAI hosted tools.'
            : 'The selected model has no curated OpenAI API capability contract.'
        ),
  })
}

function normalizeImplementationEntry(toolId = '', registry = null) {
  const defaultEntry = OPENAI_API_HOSTED_TOOL_IMPLEMENTATION_REGISTRY[toolId] || {}
  const override = registry?.[toolId] && typeof registry[toolId] === 'object'
    ? registry[toolId]
    : {}
  return Object.freeze({
    ...defaultEntry,
    ...override,
    supported: override.supported === undefined
      ? defaultEntry.supported === true
      : override.supported === true,
    handlerId: String(override.handlerId || defaultEntry.handlerId || '').trim(),
    reason: String(override.reason || defaultEntry.reason || '').trim(),
  })
}

function buildHostedToolCapability(modelId = '', toolId = '', implementationRegistry = null) {
  const modelEligibility = resolveModelEligibility(modelId, toolId)
  const implementation = normalizeImplementationEntry(toolId, implementationRegistry)
  const fixtureId = String(OPENAI_API_HOSTED_TOOL_FIXTURES[toolId] || '').trim()
  const qualification = Object.freeze({
    status: fixtureId ? 'fixture_qualified' : 'not_qualified',
    fixtureId,
    liveQualified: false,
  })
  const supported = (
    modelEligibility.eligible === true
    && implementation.supported === true
    && qualification.status === 'fixture_qualified'
  )
  return Object.freeze({
    capabilityId: toolId,
    supported,
    modelEligibility,
    implementation,
    qualification,
    reason: supported
      ? ''
      : (
          modelEligibility.reason
          || implementation.reason
          || 'This OpenAI API capability is not backed by a qualification fixture.'
        ),
  })
}

export function resolveOpenAIResponsesWebSocketQualification({
  undiciVersion = OPENAI_API_QUALIFIED_RUNTIME_MANIFEST.undiciVersion,
  protocolRevision = OPENAI_API_WEBSOCKET_PROTOCOL_REVISION,
} = {}) {
  const normalizedUndiciVersion = String(undiciVersion || '').trim()
  const normalizedProtocolRevision = Number(protocolRevision)
  const dependencyQualified = isSupportedUndiciVersion(normalizedUndiciVersion)
  const protocolQualified = normalizedProtocolRevision === OPENAI_API_WEBSOCKET_PROTOCOL_REVISION
  const supported = dependencyQualified && protocolQualified
  const reason = !dependencyQualified
    ? `The experimental transport is qualified for undici 6.28.x; loaded ${normalizedUndiciVersion || 'unknown'}.`
    : (
        !protocolQualified
          ? `OpenAI WebSocket protocol revision ${normalizedProtocolRevision} is not qualified; expected ${OPENAI_API_WEBSOCKET_PROTOCOL_REVISION}.`
          : ''
      )
  return Object.freeze({
    supported,
    implementation: Object.freeze({
      supported: true,
      handlerId: 'openai_responses_websocket_runtime',
      protocolRevision: normalizedProtocolRevision,
      runtimeFamily: 'undici',
      runtimeVersion: normalizedUndiciVersion,
    }),
    qualification: Object.freeze({
      status: supported ? 'fixture_qualified' : 'version_mismatch',
      fixtureId: 'openai-api-responses-websocket-v1',
      liveQualified: false,
    }),
    reason,
  })
}

export function resolveOpenAIApiCapabilityContract(modelId = '', {
  implementationRegistry = null,
  websocketRuntime = null,
} = {}) {
  const canonicalModelId = normalizeModelId(modelId)
  const modelEligibility = resolveModelEligibility(canonicalModelId)
  const hostedTools = Object.freeze(Object.fromEntries(
    Object.keys(OPENAI_API_HOSTED_TOOL_BUILDERS).map((toolId) => [
      toolId,
      buildHostedToolCapability(canonicalModelId, toolId, implementationRegistry),
    ]),
  ))
  const websocketQualification = resolveOpenAIResponsesWebSocketQualification(websocketRuntime || {})
  const websocketModelEligibility = resolveModelEligibility(canonicalModelId, 'responses_websocket')
  const websocketSupported = (
    websocketModelEligibility.eligible === true
    && websocketQualification.implementation.supported === true
    && websocketQualification.supported === true
  )
  return Object.freeze({
    schemaVersion: 1,
    providerId: 'openai',
    authMethod: 'api_key',
    modelId: String(modelId || '').trim(),
    canonicalModelId,
    modelEligibility,
    hostedTools,
    betaFeatures: Object.freeze({
      responses_websocket: Object.freeze({
        capabilityId: 'responses_websocket',
        ...websocketQualification,
        supported: websocketSupported,
        modelEligibility: websocketModelEligibility,
        reason: websocketSupported
          ? ''
          : (websocketModelEligibility.reason || websocketQualification.reason),
      }),
    }),
  })
}
