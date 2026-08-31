import { normalizeRequestedTools, normalizeRole } from './openai-websocket-request-content-utils.mjs'

export function serializeStructuredValue(value) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value ?? null)
  } catch {
    return String(value ?? '')
  }
}

export function serializeToolResultOutput(output = null) {
  const payload = output && typeof output === 'object' ? output : {}
  const type = normalizeRole(payload.type)
  if (type === 'text' || type === 'error-text') {
    return String(payload.value ?? '')
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'value')) {
    return serializeStructuredValue(payload.value)
  }
  return serializeStructuredValue(output)
}

function normalizeProviderToolId(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeArrayOfStrings(value = []) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
    : []
}

function normalizeProviderToolDefinition(rawDefinition = {}) {
  return rawDefinition && typeof rawDefinition === 'object' ? rawDefinition : {}
}

function mapOpenAIProviderTool(definition = {}) {
  const tool = normalizeProviderToolDefinition(definition)
  if (String(tool.type || '').trim().toLowerCase() !== 'provider') {
    return { ok: false, tool: null, reason: 'unsupported_tool_definition' }
  }

  const id = normalizeProviderToolId(tool.id)
  const args = tool.args && typeof tool.args === 'object' ? tool.args : {}

  if (id === 'openai.web_search' || id === 'openai.web_search_preview') {
    const allowedDomains = normalizeArrayOfStrings(args?.filters?.allowedDomains)
    return {
      ok: true,
      tool: {
        type: id === 'openai.web_search' ? 'web_search' : 'web_search_preview',
        ...(allowedDomains.length > 0 ? { filters: { allowed_domains: allowedDomains } } : {}),
        ...(typeof args.externalWebAccess === 'boolean'
          ? { external_web_access: args.externalWebAccess }
          : {}),
        ...(String(args.searchContextSize || '').trim()
          ? { search_context_size: String(args.searchContextSize || '').trim().toLowerCase() }
          : {}),
        ...(args.userLocation && typeof args.userLocation === 'object'
          ? { user_location: { ...args.userLocation } }
          : {}),
      },
      reason: '',
    }
  }

  if (id === 'openai.file_search') {
    const vectorStoreIds = normalizeArrayOfStrings(args.vectorStoreIds)
    return {
      ok: true,
      tool: {
        type: 'file_search',
        ...(vectorStoreIds.length > 0 ? { vector_store_ids: vectorStoreIds } : {}),
        ...(Number.isFinite(Number(args.maxNumResults)) && Number(args.maxNumResults) > 0
          ? { max_num_results: Math.round(Number(args.maxNumResults)) }
          : {}),
        ...(args.ranking && typeof args.ranking === 'object'
          ? {
              ranking_options: {
                ...(String(args.ranking.ranker || '').trim()
                  ? { ranker: String(args.ranking.ranker || '').trim() }
                  : {}),
                ...(Number.isFinite(Number(args.ranking.scoreThreshold))
                  ? { score_threshold: Number(args.ranking.scoreThreshold) }
                  : {}),
              },
            }
          : {}),
        ...(args.filters && typeof args.filters === 'object' ? { filters: args.filters } : {}),
      },
      reason: '',
    }
  }

  if (id === 'openai.code_interpreter') {
    const container = args.container
    return {
      ok: true,
      tool: {
        type: 'code_interpreter',
        ...(container == null
          ? {}
          : typeof container === 'string'
            ? { container }
            : {
                container: {
                  type: 'auto',
                  ...(Array.isArray(container.fileIds) && container.fileIds.length > 0
                    ? { file_ids: normalizeArrayOfStrings(container.fileIds) }
                    : {}),
                },
              }),
      },
      reason: '',
    }
  }

  if (id === 'openai.image_generation') {
    return {
      ok: true,
      tool: {
        type: 'image_generation',
        ...(typeof args.background === 'boolean' ? { background: args.background } : {}),
        ...(String(args.inputFidelity || '').trim()
          ? { input_fidelity: String(args.inputFidelity || '').trim().toLowerCase() }
          : {}),
        ...(args.inputImageMask && typeof args.inputImageMask === 'object'
          ? {
              input_image_mask: {
                ...(String(args.inputImageMask.fileId || '').trim()
                  ? { file_id: String(args.inputImageMask.fileId || '').trim() }
                  : {}),
                ...(String(args.inputImageMask.imageUrl || '').trim()
                  ? { image_url: String(args.inputImageMask.imageUrl || '').trim() }
                  : {}),
              },
            }
          : {}),
        ...(String(args.model || '').trim() ? { model: String(args.model || '').trim() } : {}),
        ...(String(args.moderation || '').trim()
          ? { moderation: String(args.moderation || '').trim().toLowerCase() }
          : {}),
        ...(Number.isFinite(Number(args.partialImages)) && Number(args.partialImages) >= 0
          ? { partial_images: Math.round(Number(args.partialImages)) }
          : {}),
        ...(String(args.quality || '').trim()
          ? { quality: String(args.quality || '').trim().toLowerCase() }
          : {}),
        ...(Number.isFinite(Number(args.outputCompression)) && Number(args.outputCompression) >= 0
          ? { output_compression: Math.round(Number(args.outputCompression)) }
          : {}),
        ...(String(args.outputFormat || '').trim()
          ? { output_format: String(args.outputFormat || '').trim().toLowerCase() }
          : {}),
        ...(String(args.size || '').trim() ? { size: String(args.size || '').trim().toLowerCase() } : {}),
      },
      reason: '',
    }
  }

  if (id === 'openai.mcp') {
    return {
      ok: true,
      tool: {
        type: 'mcp',
        ...(String(args.serverLabel || '').trim()
          ? { server_label: String(args.serverLabel || '').trim() }
          : {}),
        ...(args.allowedTools
          ? {
              allowed_tools: Array.isArray(args.allowedTools)
                ? normalizeArrayOfStrings(args.allowedTools)
                : {
                    ...(typeof args.allowedTools.readOnly === 'boolean'
                      ? { read_only: args.allowedTools.readOnly }
                      : {}),
                    ...(Array.isArray(args.allowedTools.toolNames)
                      ? { tool_names: normalizeArrayOfStrings(args.allowedTools.toolNames) }
                      : {}),
                  },
            }
          : {}),
        ...(String(args.authorization || '').trim()
          ? { authorization: String(args.authorization || '').trim() }
          : {}),
        ...(String(args.connectorId || '').trim()
          ? { connector_id: String(args.connectorId || '').trim() }
          : {}),
        ...(args.headers && typeof args.headers === 'object' ? { headers: { ...args.headers } } : {}),
        ...(typeof args.requireApproval === 'string'
          ? { require_approval: String(args.requireApproval || '').trim().toLowerCase() }
          : {}),
        ...(String(args.serverDescription || '').trim()
          ? { server_description: String(args.serverDescription || '').trim() }
          : {}),
        ...(String(args.serverUrl || '').trim()
          ? { server_url: String(args.serverUrl || '').trim() }
          : {}),
      },
      reason: '',
    }
  }

  if (id === 'openai.shell') {
    return {
      ok: true,
      tool: {
        type: 'shell',
        ...(args.environment && typeof args.environment === 'object'
          ? { environment: { ...args.environment } }
          : {}),
      },
      reason: '',
    }
  }

  if (id === 'openai.local_shell') {
    return {
      ok: true,
      tool: { type: 'local_shell' },
      reason: '',
    }
  }

  if (id === 'openai.apply_patch') {
    return {
      ok: true,
      tool: { type: 'apply_patch' },
      reason: '',
    }
  }

  return { ok: false, tool: null, reason: 'unsupported_provider_tool' }
}

export function normalizeRequestedToolDefinitions(tools = {}) {
  const rows = []
  for (const [toolName, rawDefinition] of Object.entries(normalizeRequestedTools(tools))) {
    const definition = rawDefinition && typeof rawDefinition === 'object' ? rawDefinition : {}
    const name = String(toolName || '').trim()
    if (!name) {
      return { ok: false, tools: [], reason: 'unsupported_tool_definition' }
    }
    if (String(definition.type || '').trim().toLowerCase() === 'provider') {
      const mappedProviderTool = mapOpenAIProviderTool(definition)
      if (!mappedProviderTool.ok) {
        return { ok: false, tools: [], reason: mappedProviderTool.reason }
      }
      rows.push(mappedProviderTool.tool)
      continue
    }
    const parameters = definition?.inputSchema?.jsonSchema
    if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
      return { ok: false, tools: [], reason: 'unsupported_tool_schema' }
    }
    rows.push({
      type: 'function',
      name,
      parameters,
      strict: true,
      ...(String(definition.description || '').trim()
        ? { description: String(definition.description || '').trim() }
        : {}),
    })
  }
  return { ok: true, tools: rows, reason: '' }
}
