import { getPersistedSettings, getSettings, setSettingsPatch } from '../settings.mjs'
import {
  DEFAULT_OPENAI_PROVIDER_RUNTIME_SETTINGS,
  normalizeOpenAIProviderRuntimeSettings,
} from './openai-runtime-types.mjs'
import * as vault from '../vault.mjs'

const OPENAI_MCP_SECRET_PREFIX = 'openai:mcp:'
const MCP_HTTP_TIMEOUT_MS = 12_000

function normalizeId(value = '') {
  return String(value || '').trim()
}

function slugifyId(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
}

function buildServerId(config = {}) {
  const explicit = slugifyId(config.id)
  if (explicit) return explicit
  const label = slugifyId(config.label)
  if (label) return label
  try {
    const host = new URL(String(config.serverUrl || '')).hostname
    return slugifyId(host) || `server_${Date.now()}`
  } catch {
    return `server_${Date.now()}`
  }
}

function getNormalizedOpenAISettings({ persisted = false } = {}) {
  const settings = persisted ? getPersistedSettings() : getSettings()
  return normalizeOpenAIProviderRuntimeSettings(
    settings?.providerRuntimeSettings?.openai,
    DEFAULT_OPENAI_PROVIDER_RUNTIME_SETTINGS,
  )
}

function buildRuntimeSettingsWithServers(servers = []) {
  const current = getNormalizedOpenAISettings({ persisted: true })
  return {
    ...current,
    hostedToolConfig: {
      ...(current.hostedToolConfig && typeof current.hostedToolConfig === 'object'
        ? current.hostedToolConfig
        : DEFAULT_OPENAI_PROVIDER_RUNTIME_SETTINGS.hostedToolConfig),
      mcp: {
        servers,
      },
    },
  }
}

function buildSettingsPatchForServers(servers = []) {
  return {
    providerRuntimeSettings: {
      openai: buildRuntimeSettingsWithServers(servers),
    },
  }
}

function buildSecretRef(serverId = '') {
  return `${OPENAI_MCP_SECRET_PREFIX}${normalizeId(serverId)}`
}

function normalizeSecretPayload(secret = {}) {
  const source = secret && typeof secret === 'object' ? secret : {}
  const type = String(source.type || 'bearer').trim().toLowerCase()
  if (type === 'headers') {
    const headers = Array.isArray(source.headers)
      ? source.headers
        .map((row) => ({
          name: String(row?.name || '').trim(),
          value: String(row?.value || ''),
        }))
        .filter((row) => row.name)
      : []
    if (headers.length === 0) {
      throw new Error('At least one header is required for MCP header authentication.')
    }
    return {
      type: 'headers',
      headers,
    }
  }

  const bearerToken = String(source.bearerToken || '').trim()
  if (!bearerToken) {
    throw new Error('A bearer token is required for MCP authentication.')
  }
  return {
    type: 'bearer',
    bearerToken,
  }
}

function mergeSecretIntoServer(server = null) {
  if (!server || typeof server !== 'object') return null
  const authSecretRef = normalizeId(server.authSecretRef || buildSecretRef(server.id))
  const secret = authSecretRef ? vault.getSecretJson(authSecretRef) : null
  const runtime = {
    ...server,
    authSecretRef,
  }
  if (secret?.type === 'bearer' && secret.bearerToken) {
    runtime.authorization = `Bearer ${String(secret.bearerToken)}`
  } else if (secret?.type === 'headers' && Array.isArray(secret.headers)) {
    runtime.headers = Object.fromEntries(
      secret.headers
        .map((row) => [String(row?.name || '').trim(), String(row?.value || '')])
        .filter(([name]) => name),
    )
  }
  runtime.hasSecret = !!secret
  return runtime
}

async function mcpHttpRequest(server = {}, secret = null, body = null, { expectJson = true } = {}) {
  const serverUrl = String(server.serverUrl || '').trim()
  const headers = {
    Accept: 'application/json, text/event-stream',
  }
  if (body != null) {
    headers['Content-Type'] = 'application/json'
  }
  if (secret?.type === 'bearer' && secret.bearerToken) {
    headers.Authorization = `Bearer ${String(secret.bearerToken)}`
  }
  if (secret?.type === 'headers' && Array.isArray(secret.headers)) {
    for (const row of secret.headers) {
      const name = String(row?.name || '').trim()
      if (!name) continue
      headers[name] = String(row?.value || '')
    }
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MCP_HTTP_TIMEOUT_MS)
  try {
    const response = await fetch(serverUrl, {
      method: body == null ? 'GET' : 'POST',
      headers,
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`)
    }
    if (!expectJson) return text
    if (!text) return null
    return JSON.parse(text)
  } finally {
    clearTimeout(timeout)
  }
}

async function probeMcpServer(server = null) {
  if (!server || typeof server !== 'object') {
    throw new Error('MCP server configuration not found.')
  }
  const secret = server.authSecretRef ? vault.getSecretJson(server.authSecretRef) : null
  const initializePayload = {
    jsonrpc: '2.0',
    id: 'initialize',
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: {
        name: 'ADDOM',
        version: '1.0.0',
      },
    },
  }
  const initializedPayload = {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  }
  const toolsListPayload = {
    jsonrpc: '2.0',
    id: 'tools-list',
    method: 'tools/list',
    params: {},
  }

  await mcpHttpRequest(server, secret, initializePayload)
  try {
    await mcpHttpRequest(server, secret, initializedPayload, { expectJson: false })
  } catch {
    // Some streamable HTTP servers do not require a separate initialized notification.
  }
  const toolsResponse = await mcpHttpRequest(server, secret, toolsListPayload)
  const tools = Array.isArray(toolsResponse?.result?.tools) ? toolsResponse.result.tools : []
  return tools
    .map((row) => String(row?.name || '').trim())
    .filter(Boolean)
}

export function listOpenAIMcpServers() {
  return getNormalizedOpenAISettings().hostedToolConfig.mcp.servers
}

export async function saveOpenAIMcpServer(config = {}) {
  const current = listOpenAIMcpServers()
  const nextId = buildServerId(config)
  const authSecretRef = buildSecretRef(nextId)
  const nextServer = {
    id: nextId,
    label: String(config.label || '').trim(),
    enabled: config.enabled === true,
    serverUrl: String(config.serverUrl || '').trim(),
    serverDescription: String(config.serverDescription || '').trim(),
    allowedTools: Array.isArray(config.allowedTools) ? config.allowedTools : [],
    requireApproval: String(config.requireApproval || 'always').trim().toLowerCase() === 'never'
      ? 'never'
      : 'always',
    authSecretRef,
  }
  const merged = current.filter((row) => row.id !== nextId)
  merged.push(nextServer)
  await setSettingsPatch(buildSettingsPatchForServers(merged))
  return listOpenAIMcpServers().find((row) => row.id === nextId) || nextServer
}

export async function deleteOpenAIMcpServer(serverId = '') {
  const id = normalizeId(serverId)
  if (!id) return false
  const current = listOpenAIMcpServers()
  const target = current.find((row) => row.id === id) || null
  const filtered = current.filter((row) => row.id !== id)
  await setSettingsPatch(buildSettingsPatchForServers(filtered))
  const secretRef = normalizeId(target?.authSecretRef || buildSecretRef(id))
  if (secretRef) {
    await vault.deleteSecret(secretRef)
  }
  return true
}

export async function setOpenAIMcpServerSecret(serverId = '', secret = {}) {
  const id = normalizeId(serverId)
  if (!id) throw new Error('serverId is required')
  const payload = normalizeSecretPayload(secret)
  await vault.setSecret(buildSecretRef(id), payload)
  return { ok: true, serverId: id }
}

export async function testOpenAIMcpServer(serverId = '') {
  const id = normalizeId(serverId)
  const server = listOpenAIMcpServers().find((row) => row.id === id) || null
  if (!server) {
    return {
      ok: false,
      serverId: id,
      toolNames: [],
      error: 'MCP server not found.',
    }
  }
  try {
    const toolNames = await probeMcpServer(server)
    return {
      ok: true,
      serverId: id,
      toolNames,
      error: '',
    }
  } catch (error) {
    return {
      ok: false,
      serverId: id,
      toolNames: [],
      error: String(error?.message || error || 'MCP probe failed.'),
    }
  }
}

export function resolveOpenAIMcpRuntimeServers(runtimeSettings = null) {
  const settings = normalizeOpenAIProviderRuntimeSettings(
    runtimeSettings || getNormalizedOpenAISettings(),
    DEFAULT_OPENAI_PROVIDER_RUNTIME_SETTINGS,
  )
  return settings.hostedToolConfig.mcp.servers
    .map((row) => mergeSecretIntoServer(row))
    .filter((row) => row && row.enabled === true && row.hasSecret === true)
}

export function buildOpenAIMcpSecretRef(serverId = '') {
  return buildSecretRef(serverId)
}

export function hasOpenAIMcpServerSecret(serverOrId = '') {
  const authSecretRef = typeof serverOrId === 'object' && serverOrId
    ? normalizeId(serverOrId.authSecretRef || buildSecretRef(serverOrId.id))
    : buildSecretRef(serverOrId)
  if (!authSecretRef) return false
  return Boolean(vault.getSecretJson(authSecretRef))
}
