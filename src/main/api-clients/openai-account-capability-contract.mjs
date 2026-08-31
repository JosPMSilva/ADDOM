import { buildOpenAIAccountProtocolCapabilitySnapshot } from './ai-provider-openai-account-protocol-registry.mjs'

function normalizeBoolean(value) {
  return value === true
}

function createCapabilityStatus(status, {
  supported = false,
  reason = '',
  source = '',
  nativeSurface = '',
  handlerId = '',
  qualificationStatus = '',
  qualificationFixtureId = '',
} = {}) {
  return Object.freeze({
    status,
    supported: normalizeBoolean(supported),
    reason: String(reason || '').trim(),
    source: String(source || '').trim(),
    nativeSurface: String(nativeSurface || '').trim(),
    handlerId: String(handlerId || '').trim(),
    qualificationStatus: String(qualificationStatus || '').trim(),
    qualificationFixtureId: String(qualificationFixtureId || '').trim(),
  })
}

export const OPENAI_ACCOUNT_CAPABILITY_STATUSES = Object.freeze({
  PARITY: 'parity',
  EQUIVALENT_NATIVE: 'equivalent_native',
  EXCEPTION: 'exception',
  PARTIALLY_SUPPORTED: 'partially_supported',
  UNSUPPORTED: 'unsupported',
})

export const OPENAI_ACCOUNT_CAPABILITY_SOURCES = Object.freeze({
  AUTHENTICATION_MODES: 'https://developers.openai.com/codex/app-server/#authentication-modes',
  API_OVERVIEW: 'https://developers.openai.com/codex/app-server/#api-overview',
  ITEMS: 'https://developers.openai.com/codex/app-server/#items',
  APPROVALS: 'https://developers.openai.com/codex/app-server/#approvals',
  PARITY_CONTRACT: 'src/main/api-clients/openai-account-capability-contract.mjs',
})

export const OPENAI_ACCOUNT_CAPABILITY_EXCEPTION_IDS = Object.freeze({
})

export const OPENAI_ACCOUNT_CAPABILITY_EXCEPTION_REGISTRY = Object.freeze([
])

const OPENAI_ACCOUNT_PARITY_CAPABILITY_ORDER = Object.freeze([
  'web_search',
  'file_search',
  'code_interpreter',
  'image_generation',
  'mcp',
  'shell',
  'apply_patch',
  'question_user',
  'chat_tool_surface',
  'delegated_tool_surface',
  'collab_agent_activities',
  'addom_moa_delegation',
  'approvals',
  'background_mode',
  'compaction',
])

function normalizeSupportBoolean(value) {
  return value === true
}

function createParityCapabilityRow(capabilityId, {
  apiKeySupported = false,
  accountSupported = false,
  accountStatus = OPENAI_ACCOUNT_CAPABILITY_STATUSES.PARITY,
  nativeSurface = '',
  source = '',
  exception = null,
} = {}) {
  const normalizedException = exception && typeof exception === 'object'
    ? exception
    : null
  return Object.freeze({
    capabilityId: String(capabilityId || '').trim(),
    apiKeySupported: normalizeSupportBoolean(apiKeySupported),
    accountSupported: normalizeSupportBoolean(accountSupported),
    accountStatus: String(accountStatus || '').trim().toLowerCase() || OPENAI_ACCOUNT_CAPABILITY_STATUSES.PARITY,
    nativeSurface: String(nativeSurface || '').trim(),
    source: String(source || '').trim(),
    exceptionId: String(normalizedException?.id || '').trim(),
  })
}

function getRegisteredExceptionByCapabilityId(exceptions = []) {
  const index = new Map()
  for (const exception of Array.isArray(exceptions) ? exceptions : []) {
    if (!exception || typeof exception !== 'object') continue
    const capabilityIds = Array.isArray(exception.capabilityIds) ? exception.capabilityIds : []
    for (const rawCapabilityId of capabilityIds) {
      const capabilityId = String(rawCapabilityId || '').trim()
      if (!capabilityId) continue
      index.set(capabilityId, exception)
    }
  }
  return index
}

function resolveApiKeyCapabilityMatrix(apiKeySupport = {}) {
  const support = apiKeySupport && typeof apiKeySupport === 'object' ? apiKeySupport : {}
  const hostedToolSupport = support.hostedToolSupport && typeof support.hostedToolSupport === 'object'
    ? support.hostedToolSupport
    : {}
  return {
    web_search: normalizeSupportBoolean(hostedToolSupport.web_search),
    file_search: normalizeSupportBoolean(hostedToolSupport.file_search),
    code_interpreter: normalizeSupportBoolean(hostedToolSupport.code_interpreter),
    image_generation: normalizeSupportBoolean(hostedToolSupport.image_generation),
    mcp: normalizeSupportBoolean(hostedToolSupport.mcp),
    shell: normalizeSupportBoolean(hostedToolSupport.shell),
    apply_patch: normalizeSupportBoolean(hostedToolSupport.apply_patch),
    question_user: true,
    chat_tool_surface: normalizeSupportBoolean(support.supportsChatToolSurface),
    delegated_tool_surface: normalizeSupportBoolean(support.supportsDelegatedToolSurface),
    collab_agent_activities: normalizeSupportBoolean(support.supportsCollabAgentActivities),
    addom_moa_delegation: normalizeSupportBoolean(support.supportsAddomMoaDelegation),
    approvals: normalizeSupportBoolean(hostedToolSupport.shell) || normalizeSupportBoolean(hostedToolSupport.apply_patch),
    background_mode: normalizeSupportBoolean(support.supportsBackgroundMode),
    compaction: normalizeSupportBoolean(support.supportsProviderChainCompaction) || normalizeSupportBoolean(support.supportsProviderTruncation),
  }
}

function getContractCapabilityEntry(contract = {}, capabilityId = '') {
  const normalizedCapabilityId = String(capabilityId || '').trim()
  if (!normalizedCapabilityId) return null
  const hostedToolEntry = contract?.hostedTools?.[normalizedCapabilityId]
  if (hostedToolEntry && typeof hostedToolEntry === 'object') return hostedToolEntry
  const capabilityEntry = contract?.capabilities?.[normalizedCapabilityId]
  if (capabilityEntry && typeof capabilityEntry === 'object') return capabilityEntry
  return null
}

export function resolveOpenAIAuthCapabilitySupport({
  capabilityId = '',
  authMethod = 'api_key',
  apiKeySupport = {},
  accountSupport = {},
  contract = null,
} = {}) {
  const normalizedCapabilityId = String(capabilityId || '').trim().toLowerCase()
  const normalizedAuthMethod = String(authMethod || '').trim().toLowerCase()
  if (!normalizedCapabilityId) return false
  if (normalizedAuthMethod === 'account') {
    const resolvedContract = contract && typeof contract === 'object'
      ? contract
      : (
        accountSupport?.accountCapabilityContract
        && typeof accountSupport.accountCapabilityContract === 'object'
          ? accountSupport.accountCapabilityContract
          : null
      )
    const contractEntry = getContractCapabilityEntry(resolvedContract, normalizedCapabilityId)
    return contractEntry?.supported === true
  }
  const apiKeyMatrix = resolveApiKeyCapabilityMatrix(apiKeySupport)
  return apiKeyMatrix[normalizedCapabilityId] === true
}

export function getOpenAIAccountCapabilityExceptionRegistry() {
  return OPENAI_ACCOUNT_CAPABILITY_EXCEPTION_REGISTRY.map((exception) => ({
    ...exception,
    capabilityIds: Array.isArray(exception.capabilityIds) ? [...exception.capabilityIds] : [],
    testCoverage: Array.isArray(exception.testCoverage) ? [...exception.testCoverage] : [],
  }))
}

function createQualifiedNativeToolStatus({
  modelSupported = false,
  nativeSurface = '',
  protocolCapabilities = null,
  source = OPENAI_ACCOUNT_CAPABILITY_SOURCES.ITEMS,
  reason = '',
} = {}) {
  const entry = protocolCapabilities?.itemTypes?.[nativeSurface]
  const qualified = entry?.status === 'supported'
  const supported = modelSupported === true && qualified
  const status = supported
    ? OPENAI_ACCOUNT_CAPABILITY_STATUSES.EQUIVALENT_NATIVE
    : (
        modelSupported === true
          ? OPENAI_ACCOUNT_CAPABILITY_STATUSES.PARTIALLY_SUPPORTED
          : OPENAI_ACCOUNT_CAPABILITY_STATUSES.UNSUPPORTED
      )
  return createCapabilityStatus(status, {
    supported,
    nativeSurface,
    source,
    reason: supported
      ? reason
      : (
          modelSupported === true
            ? `The ${nativeSurface} handler is not backed by a matching qualification fixture.`
            : 'The selected model is not eligible for this capability.'
        ),
    handlerId: entry?.handlerId,
    qualificationStatus: entry?.qualification?.status,
    qualificationFixtureId: entry?.qualification?.fixtureId,
  })
}

function buildHostedToolCapabilityContract(hostedToolSupport = {}, protocolCapabilities = null) {
  return Object.freeze({
    web_search: createQualifiedNativeToolStatus({
      modelSupported: hostedToolSupport.web_search,
      nativeSurface: 'webSearch',
      protocolCapabilities,
      source: OPENAI_ACCOUNT_CAPABILITY_SOURCES.ITEMS,
      reason: 'Codex app-server surfaces web search through native webSearch items instead of the Responses hosted tool id.',
    }),
    file_search: createCapabilityStatus(OPENAI_ACCOUNT_CAPABILITY_STATUSES.PARITY, {
      supported: hostedToolSupport.file_search,
      source: OPENAI_ACCOUNT_CAPABILITY_SOURCES.PARITY_CONTRACT,
      reason: 'Account auth is parity-by-default unless a narrower exception is documented explicitly.',
    }),
    code_interpreter: createCapabilityStatus(OPENAI_ACCOUNT_CAPABILITY_STATUSES.PARITY, {
      supported: hostedToolSupport.code_interpreter,
      source: OPENAI_ACCOUNT_CAPABILITY_SOURCES.PARITY_CONTRACT,
      reason: 'Account auth is parity-by-default unless a narrower exception is documented explicitly.',
    }),
    image_generation: createQualifiedNativeToolStatus({
      modelSupported: hostedToolSupport.image_generation,
      nativeSurface: 'imageGeneration',
      protocolCapabilities,
      source: OPENAI_ACCOUNT_CAPABILITY_SOURCES.PARITY_CONTRACT,
      reason: 'Codex app-server surfaces image generation through qualified native imageGeneration items.',
    }),
    mcp: createQualifiedNativeToolStatus({
      modelSupported: hostedToolSupport.mcp,
      nativeSurface: 'mcpToolCall',
      protocolCapabilities,
      source: OPENAI_ACCOUNT_CAPABILITY_SOURCES.ITEMS,
      reason: 'Codex app-server reports connector and MCP execution through native mcpToolCall items.',
    }),
    shell: createQualifiedNativeToolStatus({
      modelSupported: hostedToolSupport.shell,
      nativeSurface: 'commandExecution',
      protocolCapabilities,
      source: OPENAI_ACCOUNT_CAPABILITY_SOURCES.ITEMS,
      reason: 'Codex app-server routes command execution through native commandExecution items.',
    }),
    apply_patch: createQualifiedNativeToolStatus({
      modelSupported: hostedToolSupport.apply_patch,
      nativeSurface: 'fileChange',
      protocolCapabilities,
      source: OPENAI_ACCOUNT_CAPABILITY_SOURCES.ITEMS,
      reason: 'Codex app-server routes file edits through native fileChange items instead of the Responses apply_patch tool id.',
    }),
  })
}

export function resolveOpenAIAccountCapabilityContract(baseSupport = {}, {
  protocolCapabilities = buildOpenAIAccountProtocolCapabilitySnapshot(),
} = {}) {
  const hostedToolSupport = baseSupport?.hostedToolSupport && typeof baseSupport.hostedToolSupport === 'object'
    ? baseSupport.hostedToolSupport
    : {}
  const hostedTools = buildHostedToolCapabilityContract(hostedToolSupport, protocolCapabilities)
  const exceptions = OPENAI_ACCOUNT_CAPABILITY_EXCEPTION_REGISTRY
  const canonicalDelegationBackend = baseSupport?.supportsAddomMoaDelegation === true ? 'addom_moa' : 'none'

  return Object.freeze({
    authMethod: 'account',
    defaultStatus: OPENAI_ACCOUNT_CAPABILITY_STATUSES.PARITY,
    runtimeStatus: 'parity',
    providerNativeRuntime: Object.freeze({
      supported: true,
      family: 'openai_codex_app_server',
      mode: 'provider_owned_runtime',
      source: OPENAI_ACCOUNT_CAPABILITY_SOURCES.API_OVERVIEW,
      reason: 'Account auth runs through Codex app-server rather than the raw OpenAI Responses hosted-tool transport.',
    }),
    delegationPolicy: Object.freeze({
      canonicalDelegationBackend,
      visibleEntryPointPolicy: canonicalDelegationBackend !== 'none'
        ? 'canonical_addom_delegation_entry_points'
        : 'none',
      nativeCollaborationBackend: 'openai_native',
      backendSelectionSeparatedFromVisibility: true,
      reason: 'Canonical delegation parity tracks the ADDOM delegation floor and visible entry points separately from the account-only native collaboration backend.',
    }),
    capabilities: Object.freeze({
      chat_tool_surface: createCapabilityStatus(OPENAI_ACCOUNT_CAPABILITY_STATUSES.PARITY, {
        supported: true,
        source: OPENAI_ACCOUNT_CAPABILITY_SOURCES.API_OVERVIEW,
        reason: 'thread/start and turn/start are authentication-mode agnostic in the Codex app-server contract.',
      }),
      delegated_tool_surface: createCapabilityStatus(OPENAI_ACCOUNT_CAPABILITY_STATUSES.PARITY, {
        supported: true,
        source: OPENAI_ACCOUNT_CAPABILITY_SOURCES.API_OVERVIEW,
        reason: 'Account auth should preserve the same canonical delegation entry points unless a narrower visibility exception is documented explicitly.',
      }),
      collab_agent_activities: createCapabilityStatus(OPENAI_ACCOUNT_CAPABILITY_STATUSES.EQUIVALENT_NATIVE, {
        supported: true,
        nativeSurface: 'collabToolCall',
        source: OPENAI_ACCOUNT_CAPABILITY_SOURCES.ITEMS,
        reason: 'Codex app-server reports native collaboration activity through collabToolCall items; that additive backend capability is separate from the canonical delegation floor.',
      }),
      addom_moa_delegation: createCapabilityStatus(OPENAI_ACCOUNT_CAPABILITY_STATUSES.PARITY, {
        supported: baseSupport?.supportsAddomMoaDelegation,
        source: OPENAI_ACCOUNT_CAPABILITY_SOURCES.PARITY_CONTRACT,
        reason: 'API-key ADDOM delegation remains the canonical delegation floor and should not regress under account auth.',
      }),
      question_user: createCapabilityStatus(OPENAI_ACCOUNT_CAPABILITY_STATUSES.PARITY, {
        supported: true,
        source: OPENAI_ACCOUNT_CAPABILITY_SOURCES.APPROVALS,
        reason: 'Account auth now bridges clarification prompts through Codex app-server `tool/requestUserInput`, so `question_user` is parity-complete.',
      }),
      background_mode: createCapabilityStatus(OPENAI_ACCOUNT_CAPABILITY_STATUSES.PARITY, {
        supported: baseSupport?.supportsBackgroundMode,
        source: OPENAI_ACCOUNT_CAPABILITY_SOURCES.API_OVERVIEW,
        reason: 'Codex app-server thread and turn lifecycle is not restricted by authentication mode in the documented API overview.',
      }),
      approvals: createCapabilityStatus(OPENAI_ACCOUNT_CAPABILITY_STATUSES.PARITY, {
        supported: hostedToolSupport.shell === true || hostedToolSupport.apply_patch === true,
        source: OPENAI_ACCOUNT_CAPABILITY_SOURCES.APPROVALS,
        reason: 'Command execution and file change approval requests are documented as auth-mode-agnostic app-server flows.',
      }),
      compaction: createCapabilityStatus(OPENAI_ACCOUNT_CAPABILITY_STATUSES.PARITY, {
        supported: baseSupport?.supportsProviderChainCompaction === true || baseSupport?.supportsProviderTruncation === true,
        nativeSurface: 'contextCompaction',
        source: OPENAI_ACCOUNT_CAPABILITY_SOURCES.ITEMS,
        reason: 'Codex app-server emits native contextCompaction items rather than making compaction depend on the API-key hosted transport.',
      }),
    }),
    hostedTools,
    exceptions,
  })
}

export function listOpenAIAccountCapabilityExceptions(contract = null) {
  return Array.isArray(contract?.exceptions)
    ? contract.exceptions.map((exception) => ({
      ...exception,
      capabilityIds: Array.isArray(exception.capabilityIds) ? [...exception.capabilityIds] : [],
      testCoverage: Array.isArray(exception.testCoverage) ? [...exception.testCoverage] : [],
    }))
    : []
}

export function findOpenAIAccountCapabilityExceptionForCapabilityId(contract = null, capabilityId = '') {
  const normalizedCapabilityId = String(capabilityId || '').trim().toLowerCase()
  if (!normalizedCapabilityId) return null
  return listOpenAIAccountCapabilityExceptions(contract)
    .find((exception) => Array.isArray(exception?.capabilityIds) && exception.capabilityIds.includes(normalizedCapabilityId))
    || null
}

export function resolveOpenAIAuthParityReport({
  modelId = '',
  apiKeySupport = {},
  accountSupport = {},
  contract = null,
} = {}) {
  const resolvedContract = contract && typeof contract === 'object'
    ? contract
    : (
      accountSupport?.accountCapabilityContract
      && typeof accountSupport.accountCapabilityContract === 'object'
        ? accountSupport.accountCapabilityContract
        : resolveOpenAIAccountCapabilityContract(apiKeySupport)
    )
  const exceptions = listOpenAIAccountCapabilityExceptions(resolvedContract)
  const exceptionsByCapabilityId = getRegisteredExceptionByCapabilityId(exceptions)
  const apiKeyMatrix = resolveApiKeyCapabilityMatrix(apiKeySupport)
  const parityRows = {}
  const mismatches = []
  const coveredExceptions = []

  for (const capabilityId of OPENAI_ACCOUNT_PARITY_CAPABILITY_ORDER) {
    const contractEntry = getContractCapabilityEntry(resolvedContract, capabilityId)
    const registeredException = exceptionsByCapabilityId.get(capabilityId) || null
    const row = createParityCapabilityRow(capabilityId, {
      apiKeySupported: apiKeyMatrix[capabilityId] === true,
      accountSupported: resolveOpenAIAuthCapabilitySupport({
        capabilityId,
        authMethod: 'account',
        apiKeySupport,
        accountSupport,
        contract: resolvedContract,
      }),
      accountStatus: contractEntry?.status || OPENAI_ACCOUNT_CAPABILITY_STATUSES.PARITY,
      nativeSurface: contractEntry?.nativeSurface || '',
      source: contractEntry?.source || '',
      exception: registeredException,
    })
    parityRows[capabilityId] = row
    if (row.apiKeySupported !== true || row.accountSupported === true) continue
    if (registeredException) {
      coveredExceptions.push(Object.freeze({
        ...row,
        exceptionId: registeredException.id,
      }))
      continue
    }
    mismatches.push(row)
  }

  const status = mismatches.length > 0
    ? 'mismatch'
    : (coveredExceptions.length > 0 ? 'exception' : 'parity')

  return Object.freeze({
    modelId: String(modelId || '').trim(),
    status,
    capabilities: Object.freeze(parityRows),
    mismatchCount: mismatches.length,
    mismatches: Object.freeze(mismatches),
    exceptionCount: coveredExceptions.length,
    exceptions: Object.freeze(coveredExceptions),
    registeredExceptions: Object.freeze(exceptions),
  })
}
