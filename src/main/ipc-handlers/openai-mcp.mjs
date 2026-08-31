import { ipcMain } from 'electron'
import { handleVersioned } from '../ipc/ipc-versioning.mjs'
import {
  deleteOpenAIMcpServer,
  listOpenAIMcpServers,
  saveOpenAIMcpServer,
  setOpenAIMcpServerSecret,
  testOpenAIMcpServer,
} from '../api-clients/openai-mcp-config.mjs'

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function asTrimmedString(value) {
  return String(value || '').trim()
}

export function registerOpenAIMcpHandlers() {
  handleVersioned(ipcMain, 'openai-mcp:list-servers', async () => {
    return listOpenAIMcpServers()
  })

  handleVersioned(ipcMain, 'openai-mcp:save-server', async (_event, payload = {}) => {
    const source = asObject(payload)
    return saveOpenAIMcpServer({
      id: asTrimmedString(source.id),
      label: asTrimmedString(source.label),
      enabled: source.enabled === true,
      serverUrl: asTrimmedString(source.serverUrl),
      serverDescription: asTrimmedString(source.serverDescription),
      allowedTools: Array.isArray(source.allowedTools)
        ? source.allowedTools.map((value) => asTrimmedString(value)).filter(Boolean)
        : [],
      requireApproval: String(source.requireApproval || 'always').trim().toLowerCase() === 'never'
        ? 'never'
        : 'always',
    })
  })

  handleVersioned(ipcMain, 'openai-mcp:delete-server', async (_event, payload = {}) => {
    const source = asObject(payload)
    return {
      ok: await deleteOpenAIMcpServer(asTrimmedString(source.serverId || source.id || '')),
    }
  })

  handleVersioned(ipcMain, 'openai-mcp:set-server-secret', async (_event, payload = {}) => {
    const source = asObject(payload)
    const secret = asObject(source.secret)
    return setOpenAIMcpServerSecret(
      asTrimmedString(source.serverId),
      {
        type: asTrimmedString(secret.type) || 'bearer',
        bearerToken: asTrimmedString(secret.bearerToken),
        headers: Array.isArray(secret.headers)
          ? secret.headers.map((row) => ({
            name: asTrimmedString(row?.name),
            value: String(row?.value || ''),
          }))
          : [],
      },
    )
  })

  handleVersioned(ipcMain, 'openai-mcp:test-server', async (_event, payload = {}) => {
    const source = asObject(payload)
    return testOpenAIMcpServer(asTrimmedString(source.serverId || source.id || ''))
  })
}
