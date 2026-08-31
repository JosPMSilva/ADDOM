import { openai } from '@ai-sdk/openai'
import {
  getOpenAIHostedToolCatalogEntry,
  sanitizeOpenAIHostedToolIdsForMutualExclusion,
} from '../../common/api-clients/openai-hosted-tool-catalog.mjs'
import {
  normalizeOpenAIProviderRuntimeSettings,
  sanitizeOpenAIHostedToolsForModel,
} from './openai-runtime-types.mjs'
import { resolveProviderModelAdapter } from './provider-model-adapters.mjs'
import { resolveOpenAIMcpRuntimeServers } from './openai-mcp-config.mjs'

function normalizeLowerString(value = '') {
  return String(value || '').trim().toLowerCase()
}

function resolveApproximateLocation() {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return timezone
      ? { type: 'approximate', timezone }
      : { type: 'approximate' }
  } catch {
    return { type: 'approximate' }
  }
}

function buildOpenAIMcpToolDefinitions(runtimeSettings = null) {
  const servers = resolveOpenAIMcpRuntimeServers(runtimeSettings)
  const tools = {}
  let activeCount = 0

  for (const server of servers) {
    if (!server || typeof server !== 'object' || server.enabled !== true) continue
    const serverId = String(server.id || '').trim()
    const serverLabel = String(server.label || '').trim()
    const serverUrl = String(server.serverUrl || '').trim()
    if (!serverId || !serverLabel || !serverUrl) continue
    activeCount += 1
    tools[`mcp_${serverId}`] = openai.tools.mcp({
      serverLabel,
      serverUrl,
      serverDescription: String(server.serverDescription || '').trim() || undefined,
      allowedTools: Array.isArray(server.allowedTools) && server.allowedTools.length > 0
        ? server.allowedTools
        : [],
      ...(server.authorization
        ? { authorization: String(server.authorization) }
        : {}),
      ...(server.headers && typeof server.headers === 'object'
        ? { headers: { ...server.headers } }
        : {}),
      requireApproval: String(server.requireApproval || '').trim().toLowerCase() === 'always'
        ? 'always'
        : 'never',
    })
  }

  return {
    tools,
    activeCount,
  }
}

function buildGenericOpenAIHostedToolExposureNotice() {
  return {
    type: 'info',
    text: 'OpenAI hosted tools are disabled for non-curated models. Switch to a curated OpenAI model to use provider-native tools.',
    meta: {
      providerId: 'openai',
      reason: 'generic_adapter_no_provider_tools',
    },
  }
}

function buildUnsupportedHostedToolSelectionState({
  support = null,
  selectedToolIds = [],
} = {}) {
  const excludedToolReasons = []
  const notices = []
  const contractTools = support?.apiCapabilityContract?.hostedTools
    && typeof support.apiCapabilityContract.hostedTools === 'object'
    ? support.apiCapabilityContract.hostedTools
    : {}

  for (const toolId of selectedToolIds) {
    const capability = contractTools[toolId] && typeof contractTools[toolId] === 'object'
      ? contractTools[toolId]
      : null
    if (capability?.supported === true) continue
    const reason = capability?.modelEligibility?.eligible === false
      ? 'model_not_eligible'
      : (
          capability?.implementation?.supported === false
            ? 'implementation_unavailable'
            : 'capability_unqualified'
        )
    const detail = String(
      capability?.reason
      || 'The selected model does not expose this OpenAI hosted tool through ADDOM.',
    ).trim()
    excludedToolReasons.push({ toolId, reason, detail })
    notices.push({
      type: 'info',
      text: detail,
      meta: {
        providerId: 'openai',
        hostedToolId: toolId,
        reason,
      },
    })
  }
  return { excludedToolReasons, notices }
}

function normalizeVectorStoreIds(vectorStoreIds = []) {
  return Array.isArray(vectorStoreIds)
    ? vectorStoreIds.map((value) => String(value || '').trim()).filter(Boolean)
    : []
}

function resolveSupportedOpenAIToolIds({
  adapterProfile = null,
  vectorStoreIds = [],
  includeLocalRuntimeTools = true,
} = {}) {
  const support = adapterProfile?.openaiRuntimeSupport || null
  if (!support || String(adapterProfile?.toolFamily || '').trim().toLowerCase() !== 'openai_hosted') {
    return {
      toolIds: [],
      activeVectorStoreIds: [],
    }
  }

  const preferredToolIds = []
  if (support.hostedToolSupport?.web_search === true) {
    preferredToolIds.push('web_search')
  }
  if (support.hostedToolSupport?.code_interpreter === true) {
    preferredToolIds.push('code_interpreter')
  }
  if (support.hostedToolSupport?.image_generation === true) {
    preferredToolIds.push('image_generation')
  }
  if (support.hostedToolSupport?.shell === true) {
    preferredToolIds.push('shell')
  }
  if (includeLocalRuntimeTools && support.hostedToolSupport?.apply_patch === true) {
    preferredToolIds.push('apply_patch')
  }

  const activeVectorStoreIds = normalizeVectorStoreIds(vectorStoreIds)
  if (support.hostedToolSupport?.file_search === true) {
    preferredToolIds.push('file_search')
  }

  if (support.hostedToolSupport?.mcp === true) {
    preferredToolIds.push('mcp')
  }

  return {
    toolIds: [...new Set(preferredToolIds)],
    activeVectorStoreIds,
  }
}

function resolveOpenAIHostedToolExposureState({
  modelId = '',
  runtimeSettings = null,
  vectorStoreIds = [],
  includeLocalRuntimeTools = true,
  authMethod = 'api_key',
} = {}) {
  const adapterProfile = resolveProviderModelAdapter('openai', modelId, { authMethod })
  const toolFamily = normalizeLowerString(adapterProfile?.toolFamily)
  const normalizedSettings = normalizeOpenAIProviderRuntimeSettings(runtimeSettings || {})
  const settings = sanitizeOpenAIHostedToolsForModel(
    normalizedSettings,
    modelId,
  )
  const requestedHostedToolIds = normalizedSettings.hostedToolsEnabled === true
    ? sanitizeOpenAIHostedToolIdsForMutualExclusion(normalizedSettings.enabledHostedTools, { maxItems: 16 })
    : []
  const support = adapterProfile?.openaiRuntimeSupport || null

  if (toolFamily !== 'openai_hosted') {
    const unsupportedSelection = buildUnsupportedHostedToolSelectionState({
      support,
      selectedToolIds: requestedHostedToolIds,
    })
    if (toolFamily !== 'generic_addom_native') {
      return {
        adapterProfile,
        toolFamily,
        settings,
        support,
        activeVectorStoreIds: [],
        enabledToolIds: [],
        defaultSupportedToolIds: [],
        excludedToolReasons: unsupportedSelection.excludedToolReasons,
        notices: unsupportedSelection.notices,
      }
    }
    return {
      adapterProfile,
      toolFamily,
      settings,
      support: null,
      activeVectorStoreIds: [],
      enabledToolIds: [],
      defaultSupportedToolIds: [],
      excludedToolReasons: unsupportedSelection.excludedToolReasons,
      notices: [
        buildGenericOpenAIHostedToolExposureNotice(),
        ...unsupportedSelection.notices,
      ],
    }
  }

  const {
    toolIds: defaultSupportedToolIds,
    activeVectorStoreIds,
  } = resolveSupportedOpenAIToolIds({
    adapterProfile,
    vectorStoreIds,
    includeLocalRuntimeTools,
  })
  const selectedHostedToolIds = requestedHostedToolIds
  const supportedToolIdSet = new Set(defaultSupportedToolIds)
  const enabledToolIds = []
  const notices = []
  const excludedToolReasons = []

  for (const toolId of selectedHostedToolIds) {
    if (support?.hostedToolSupport?.[toolId] === false) {
      const capability = support?.apiCapabilityContract?.hostedTools?.[toolId]
      const reason = capability?.modelEligibility?.eligible === false
        ? 'model_not_eligible'
        : (
            capability?.implementation?.supported === false
              ? 'implementation_unavailable'
              : 'capability_unqualified'
          )
      const detail = String(
        capability?.reason
        || 'The selected model does not expose this OpenAI hosted tool through ADDOM.',
      ).trim()
      excludedToolReasons.push({
        toolId,
        reason,
        detail,
      })
      notices.push({
        type: 'info',
        text: detail,
        meta: {
          providerId: 'openai',
          hostedToolId: toolId,
          reason,
        },
      })
      continue
    }
    if (toolId === 'apply_patch' && !includeLocalRuntimeTools) {
      excludedToolReasons.push({
        toolId,
        reason: 'local_runtime_tools_disabled',
      })
      continue
    }
    if (!supportedToolIdSet.has(toolId)) continue
    if (toolId === 'file_search' && activeVectorStoreIds.length === 0) {
      excludedToolReasons.push({
        toolId: 'file_search',
        reason: 'missing_vector_store',
      })
      notices.push({
        type: 'info',
        text: 'OpenAI file search is enabled, but no project vector store is configured yet.',
        meta: {
          providerId: 'openai',
          hostedToolId: toolId,
          reason: 'missing_vector_store',
        },
      })
      continue
    }
    if (toolId === 'mcp') {
      const mcpDefinitions = buildOpenAIMcpToolDefinitions(settings)
      if (mcpDefinitions.activeCount === 0) {
        excludedToolReasons.push({
          toolId: 'mcp',
          reason: 'missing_mcp_server',
        })
        notices.push({
          type: 'info',
          text: 'OpenAI MCP is enabled, but no MCP servers are configured yet.',
          meta: {
            providerId: 'openai',
            hostedToolId: 'mcp',
            reason: 'missing_mcp_server',
          },
        })
        continue
      }
    }
    enabledToolIds.push(toolId)
  }

  return {
    adapterProfile,
    toolFamily,
    settings,
    support,
    activeVectorStoreIds,
    enabledToolIds,
    defaultSupportedToolIds,
    excludedToolReasons,
    notices,
  }
}

export function resolveOpenAIHostedToolExposure({
  modelId = '',
  runtimeSettings = null,
  vectorStoreIds = [],
  includeLocalRuntimeTools = true,
  authMethod = 'api_key',
} = {}) {
  const exposure = resolveOpenAIHostedToolExposureState({
    modelId,
    runtimeSettings,
    vectorStoreIds,
    includeLocalRuntimeTools,
    authMethod,
  })
  return {
    enabledToolIds: [...exposure.enabledToolIds],
    defaultSupportedToolIds: [...exposure.defaultSupportedToolIds],
    excludedToolReasons: [...exposure.excludedToolReasons],
    notices: [...exposure.notices],
  }
}

export function buildOpenAIHostedToolBundle({
  modelId = '',
  runtimeSettings = null,
  vectorStoreIds = [],
  includeLocalRuntimeTools = true,
} = {}) {
  const exposure = resolveOpenAIHostedToolExposureState({
    modelId,
    runtimeSettings,
    vectorStoreIds,
    includeLocalRuntimeTools,
    authMethod: 'api_key',
  })
  const {
    toolFamily,
    settings,
    support,
    activeVectorStoreIds,
    enabledToolIds,
    defaultSupportedToolIds,
    excludedToolReasons,
    notices,
  } = exposure

  if (toolFamily !== 'openai_hosted') {
    return {
      tools: {},
      notices,
      enabledToolIds,
      defaultSupportedToolIds,
      excludedToolReasons,
    }
  }

  const tools = {}

  for (const toolId of enabledToolIds) {
    const catalogEntry = getOpenAIHostedToolCatalogEntry(toolId)
    if (!catalogEntry) continue

    if (toolId === 'web_search') {
      tools.web_search = openai.tools.webSearch({
        searchContextSize: settings.webSearchContextSize,
        ...(settings.webSearchApproximateLocationEnabled === true
          ? { userLocation: resolveApproximateLocation() }
          : {}),
      })
      continue
    }

    if (toolId === 'code_interpreter') {
      tools.code_interpreter = openai.tools.codeInterpreter({
        container: {},
      })
      continue
    }

    if (toolId === 'image_generation') {
      tools.image_generation = openai.tools.imageGeneration({
        outputFormat: settings.imageGenerationOutputFormat,
        quality: settings.imageGenerationQuality,
      })
      continue
    }

    if (toolId === 'file_search') {
      tools.file_search = openai.tools.fileSearch({
        vectorStoreIds: activeVectorStoreIds,
        maxNumResults: settings.fileSearchMaxNumResults,
      })
      continue
    }

    if (toolId === 'mcp') {
      const mcpDefinitions = buildOpenAIMcpToolDefinitions(settings, notices)
      Object.assign(tools, mcpDefinitions.tools)
      continue
    }

    if (toolId === 'shell') {
      tools.shell = openai.tools.shell(
        support.supportsShellEnvironment === true
          ? {
            environment: {
              type: 'containerAuto',
            },
          }
          : {},
      )
      continue
    }

    if (toolId === 'apply_patch') {
      if (!includeLocalRuntimeTools) {
        continue
      }
      tools.apply_patch = openai.tools.applyPatch({})
      continue
    }
  }

  return {
    tools,
    notices,
    enabledToolIds: Object.keys(tools),
    defaultSupportedToolIds,
    excludedToolReasons,
  }
}
