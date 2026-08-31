import { useCallback, useState } from 'react'
import useSettingsStore from '../../store/useSettingsStore.js'

export default function useSettingsOpenAIAssetsMcp({
  activeProjectId,
  showSettingsAlert,
  requestAppConfirm,
}) {
  const openAIProjectAssets = useSettingsStore((s) => s.openAIProjectAssets)
  const openAIMcpServers = useSettingsStore((s) => s.openAIMcpServers)
  const refreshOpenAIProjectAssetsFromStore = useSettingsStore((s) => s.refreshOpenAIProjectAssets)
  const refreshOpenAIMcpServersFromStore = useSettingsStore((s) => s.refreshOpenAIMcpServers)
  const [openAIAssetsBusy, setOpenAIAssetsBusy] = useState(false)
  const [openAIMcpBusy, setOpenAIMcpBusy] = useState(false)

  const refreshOpenAIProjectAssets = useCallback(async (forceRemote = false) => {
    if (!activeProjectId) {
      return null
    }
    return refreshOpenAIProjectAssetsFromStore(activeProjectId, {
      forceRemote: forceRemote === true,
    })
  }, [activeProjectId, refreshOpenAIProjectAssetsFromStore])

  const withOpenAIAssetAction = useCallback(async (action) => {
    setOpenAIAssetsBusy(true)
    try {
      return await action()
    } finally {
      setOpenAIAssetsBusy(false)
    }
  }, [])

  const withOpenAIMcpAction = useCallback(async (action) => {
    setOpenAIMcpBusy(true)
    try {
      return await action()
    } finally {
      setOpenAIMcpBusy(false)
    }
  }, [])

  const refreshOpenAIMcpServers = useCallback(async () => {
    return refreshOpenAIMcpServersFromStore()
  }, [refreshOpenAIMcpServersFromStore])

  const handleRefreshOpenAIMcpServers = useCallback(async () => {
    try {
      await withOpenAIMcpAction(() => refreshOpenAIMcpServers())
    } catch (err) {
      await showSettingsAlert('MCP Refresh Failed', `Failed to refresh MCP servers: ${err.message}`, 'danger')
    }
  }, [refreshOpenAIMcpServers, showSettingsAlert, withOpenAIMcpAction])

  const handleAddOpenAIMcpServer = useCallback(async () => {
    const openAIMcpApi = window?.addom?.openaiMcp
    if (!openAIMcpApi || typeof openAIMcpApi.saveServer !== 'function') {
      await showSettingsAlert('OpenAI MCP Unavailable', 'OpenAI MCP APIs are unavailable.', 'danger')
      return
    }

    const label = String(window?.prompt?.('MCP server label', '') || '').trim()
    if (!label) return
    const serverUrl = String(window?.prompt?.('MCP server URL (https://...)', '') || '').trim()
    if (!serverUrl) return
    const description = String(window?.prompt?.('Server description (optional)', '') || '').trim()
    const allowedToolsRaw = String(window?.prompt?.('Allowlisted tool names (comma separated, optional)', '') || '').trim()
    const allowedTools = allowedToolsRaw
      ? allowedToolsRaw.split(',').map((value) => String(value || '').trim()).filter(Boolean)
      : []
    const requireApprovalNever = await requestAppConfirm({
      title: 'MCP Approval Policy',
      message: 'Allow this MCP server to run without approval?\n\nRecommended: keep approval required.',
      confirmLabel: 'Allow Without Approval',
      cancelLabel: 'Keep Approval Required',
      tone: 'warning',
    })

    try {
      await withOpenAIMcpAction(async () => {
        await openAIMcpApi.saveServer({
          label,
          serverUrl,
          serverDescription: description,
          allowedTools,
          enabled: true,
          requireApproval: requireApprovalNever ? 'never' : 'always',
        })
        await refreshOpenAIMcpServers()
      })
    } catch (err) {
      await showSettingsAlert('MCP Save Failed', `Failed to save MCP server: ${err.message}`, 'danger')
    }
  }, [refreshOpenAIMcpServers, requestAppConfirm, showSettingsAlert, withOpenAIMcpAction])

  const handleDeleteOpenAIMcpServer = useCallback(async (serverId) => {
    const id = String(serverId || '').trim()
    if (!id) return
    const openAIMcpApi = window?.addom?.openaiMcp
    if (!openAIMcpApi || typeof openAIMcpApi.deleteServer !== 'function') {
      await showSettingsAlert('OpenAI MCP Unavailable', 'OpenAI MCP APIs are unavailable.', 'danger')
      return
    }
    const confirmed = await requestAppConfirm({
      title: 'Delete MCP Server',
      message: `Delete MCP server "${id}" and remove its stored secret?`,
      confirmLabel: 'Delete Server',
      cancelLabel: 'Cancel',
      tone: 'danger',
    })
    if (!confirmed) return
    try {
      await withOpenAIMcpAction(async () => {
        await openAIMcpApi.deleteServer(id)
        await refreshOpenAIMcpServers()
      })
    } catch (err) {
      await showSettingsAlert('MCP Delete Failed', `Failed to delete MCP server: ${err.message}`, 'danger')
    }
  }, [refreshOpenAIMcpServers, requestAppConfirm, showSettingsAlert, withOpenAIMcpAction])

  const handleEditOpenAIMcpServer = useCallback(async (serverId, serverRow = null) => {
    const id = String(serverId || '').trim()
    if (!id) return
    const openAIMcpApi = window?.addom?.openaiMcp
    if (!openAIMcpApi || typeof openAIMcpApi.saveServer !== 'function') {
      await showSettingsAlert('OpenAI MCP Unavailable', 'OpenAI MCP APIs are unavailable.', 'danger')
      return
    }

    const row = serverRow && typeof serverRow === 'object'
      ? serverRow
      : (Array.isArray(openAIMcpServers)
          ? openAIMcpServers.find((entry) => String(entry?.id || '').trim() === id)
          : null)
    if (!row) return

    const nextLabel = String(window?.prompt?.('MCP server label', String(row.label || id)) || '').trim()
    if (!nextLabel) return
    const nextServerUrl = String(window?.prompt?.('MCP server URL (https://...)', String(row.serverUrl || '')) || '').trim()
    if (!nextServerUrl) return
    const nextDescription = String(window?.prompt?.('Server description (optional)', String(row.serverDescription || '')) || '').trim()

    try {
      await withOpenAIMcpAction(async () => {
        await openAIMcpApi.saveServer({
          id,
          label: nextLabel,
          serverUrl: nextServerUrl,
          serverDescription: nextDescription,
          enabled: row.enabled === true,
          allowedTools: Array.isArray(row.allowedTools) ? row.allowedTools : [],
          requireApproval: String(row.requireApproval || 'always').trim().toLowerCase() === 'never'
            ? 'never'
            : 'always',
        })
        await refreshOpenAIMcpServers()
      })
    } catch (err) {
      await showSettingsAlert('MCP Update Failed', `Failed to edit MCP server: ${err.message}`, 'danger')
    }
  }, [openAIMcpServers, refreshOpenAIMcpServers, showSettingsAlert, withOpenAIMcpAction])

  const handleSetOpenAIMcpServerSecret = useCallback(async (serverId) => {
    const id = String(serverId || '').trim()
    if (!id) return
    const openAIMcpApi = window?.addom?.openaiMcp
    if (!openAIMcpApi || typeof openAIMcpApi.setServerSecret !== 'function') {
      await showSettingsAlert('OpenAI MCP Unavailable', 'OpenAI MCP APIs are unavailable.', 'danger')
      return
    }

    const authTypeRaw = String(window?.prompt?.('Secret type: bearer or headers', 'bearer') || '').trim().toLowerCase()
    const authType = authTypeRaw === 'headers' ? 'headers' : 'bearer'

    let secretPayload = null
    if (authType === 'headers') {
      const headersJson = String(window?.prompt?.('Headers JSON array, e.g. [{"name":"Authorization","value":"Bearer ..."}]', '[]') || '').trim()
      if (!headersJson) return
      try {
        const headers = JSON.parse(headersJson)
        secretPayload = {
          type: 'headers',
          headers,
        }
      } catch {
        await showSettingsAlert('Invalid Headers', 'Header JSON is invalid.', 'warning')
        return
      }
    } else {
      const bearerToken = String(window?.prompt?.('Bearer token', '') || '').trim()
      if (!bearerToken) return
      secretPayload = {
        type: 'bearer',
        bearerToken,
      }
    }

    try {
      await withOpenAIMcpAction(async () => {
        await openAIMcpApi.setServerSecret(id, secretPayload)
      })
      await showSettingsAlert('Secret Saved', `Saved MCP secret for ${id}.`)
    } catch (err) {
      await showSettingsAlert('MCP Secret Failed', `Failed to save MCP secret: ${err.message}`, 'danger')
    }
  }, [showSettingsAlert, withOpenAIMcpAction])

  const handleTestOpenAIMcpServer = useCallback(async (serverId) => {
    const id = String(serverId || '').trim()
    if (!id) return
    const openAIMcpApi = window?.addom?.openaiMcp
    if (!openAIMcpApi || typeof openAIMcpApi.testServer !== 'function') {
      await showSettingsAlert('OpenAI MCP Unavailable', 'OpenAI MCP APIs are unavailable.', 'danger')
      return
    }
    try {
      const result = await withOpenAIMcpAction(() => openAIMcpApi.testServer(id))
      if (result?.ok) {
        const tools = Array.isArray(result.toolNames) ? result.toolNames : []
        await showSettingsAlert(
          'MCP Test Succeeded',
          tools.length > 0
            ? `Server ${id} is reachable. Tools: ${tools.join(', ')}`
            : `Server ${id} is reachable. No tools reported.`,
        )
      } else {
        await showSettingsAlert(
          'MCP Test Failed',
          `Server ${id} test failed: ${String(result?.error || 'Unknown error')}`,
          'warning',
        )
      }
    } catch (err) {
      await showSettingsAlert('MCP Test Failed', `Failed to test MCP server: ${err.message}`, 'danger')
    }
  }, [showSettingsAlert, withOpenAIMcpAction])

  const handleToggleOpenAIMcpServerEnabled = useCallback(async (serverId, nextEnabled) => {
    const id = String(serverId || '').trim()
    if (!id) return
    const openAIMcpApi = window?.addom?.openaiMcp
    if (!openAIMcpApi || typeof openAIMcpApi.saveServer !== 'function') {
      await showSettingsAlert('OpenAI MCP Unavailable', 'OpenAI MCP APIs are unavailable.', 'danger')
      return
    }
    const currentServers = Array.isArray(openAIMcpServers)
      ? openAIMcpServers
      : []
    const target = currentServers.find((row) => String(row?.id || '').trim() === id)
    if (!target) return
    try {
      await withOpenAIMcpAction(async () => {
        await openAIMcpApi.saveServer({
          id,
          label: String(target.label || '').trim(),
          enabled: nextEnabled === true,
          serverUrl: String(target.serverUrl || '').trim(),
          serverDescription: String(target.serverDescription || '').trim(),
          allowedTools: Array.isArray(target.allowedTools) ? target.allowedTools : [],
          requireApproval: String(target.requireApproval || 'always').trim().toLowerCase() === 'never'
            ? 'never'
            : 'always',
        })
        await refreshOpenAIMcpServers()
      })
    } catch (err) {
      await showSettingsAlert('MCP Update Failed', `Failed to update MCP server: ${err.message}`, 'danger')
    }
  }, [openAIMcpServers, refreshOpenAIMcpServers, showSettingsAlert, withOpenAIMcpAction])

  const handleSetOpenAIMcpServerApprovalPolicy = useCallback(async (serverId, currentPolicy) => {
    const id = String(serverId || '').trim()
    if (!id) return
    const openAIMcpApi = window?.addom?.openaiMcp
    if (!openAIMcpApi || typeof openAIMcpApi.saveServer !== 'function') {
      await showSettingsAlert('OpenAI MCP Unavailable', 'OpenAI MCP APIs are unavailable.', 'danger')
      return
    }
    const currentServers = Array.isArray(openAIMcpServers)
      ? openAIMcpServers
      : []
    const target = currentServers.find((row) => String(row?.id || '').trim() === id)
    if (!target) return
    const normalizedCurrent = String(currentPolicy || target.requireApproval || 'always').trim().toLowerCase() === 'never'
      ? 'never'
      : 'always'
    const nextPolicy = normalizedCurrent === 'never' ? 'always' : 'never'

    if (nextPolicy === 'never') {
      const confirmed = await requestAppConfirm({
        title: 'Allow MCP Without Approval',
        message: 'Set this MCP server to run without approval?\n\nThis can allow provider-side MCP tool calls to execute automatically when selected by the model.',
        confirmLabel: 'Allow Without Approval',
        cancelLabel: 'Keep Approval Required',
        tone: 'warning',
      })
      if (!confirmed) return
    }

    try {
      await withOpenAIMcpAction(async () => {
        await openAIMcpApi.saveServer({
          id,
          label: String(target.label || '').trim(),
          enabled: target.enabled === true,
          serverUrl: String(target.serverUrl || '').trim(),
          serverDescription: String(target.serverDescription || '').trim(),
          allowedTools: Array.isArray(target.allowedTools) ? target.allowedTools : [],
          requireApproval: nextPolicy,
        })
        await refreshOpenAIMcpServers()
      })
    } catch (err) {
      await showSettingsAlert('MCP Update Failed', `Failed to update MCP server approval mode: ${err.message}`, 'danger')
    }
  }, [openAIMcpServers, refreshOpenAIMcpServers, requestAppConfirm, showSettingsAlert, withOpenAIMcpAction])

  const handleEditOpenAIMcpServerAllowlist = useCallback(async (serverId, currentAllowlist = []) => {
    const id = String(serverId || '').trim()
    if (!id) return
    const openAIMcpApi = window?.addom?.openaiMcp
    if (!openAIMcpApi || typeof openAIMcpApi.saveServer !== 'function') {
      await showSettingsAlert('OpenAI MCP Unavailable', 'OpenAI MCP APIs are unavailable.', 'danger')
      return
    }
    const currentServers = Array.isArray(openAIMcpServers)
      ? openAIMcpServers
      : []
    const target = currentServers.find((row) => String(row?.id || '').trim() === id)
    if (!target) return

    const currentValue = Array.isArray(currentAllowlist) && currentAllowlist.length > 0
      ? currentAllowlist.join(', ')
      : ''
    const nextValue = window?.prompt?.(
      'Allowlisted MCP tool names (comma separated). Leave empty to expose no MCP tools by default.',
      currentValue,
    )
    if (nextValue == null) return
    const allowedTools = String(nextValue || '')
      .split(',')
      .map((value) => String(value || '').trim())
      .filter(Boolean)

    try {
      await withOpenAIMcpAction(async () => {
        await openAIMcpApi.saveServer({
          id,
          label: String(target.label || '').trim(),
          enabled: target.enabled === true,
          serverUrl: String(target.serverUrl || '').trim(),
          serverDescription: String(target.serverDescription || '').trim(),
          allowedTools,
          requireApproval: String(target.requireApproval || 'always').trim().toLowerCase() === 'never'
            ? 'never'
            : 'always',
        })
        await refreshOpenAIMcpServers()
      })
    } catch (err) {
      await showSettingsAlert('MCP Update Failed', `Failed to update MCP allowlist: ${err.message}`, 'danger')
    }
  }, [openAIMcpServers, refreshOpenAIMcpServers, showSettingsAlert, withOpenAIMcpAction])

  const handleRefreshOpenAIProjectAssets = useCallback(async () => {
    if (!activeProjectId) {
      await showSettingsAlert('Project Required', 'No active project selected.', 'warning')
      return
    }
    try {
      await withOpenAIAssetAction(() => refreshOpenAIProjectAssets(true))
    } catch (err) {
      await showSettingsAlert('Refresh Failed', `Failed to refresh Project knowledge: ${err.message}`, 'danger')
    }
  }, [activeProjectId, refreshOpenAIProjectAssets, showSettingsAlert, withOpenAIAssetAction])

  const handleEnsureOpenAIProjectVectorStore = useCallback(async () => {
    const openaiAssetsApi = window?.addom?.openaiAssets
    if (!openaiAssetsApi || typeof openaiAssetsApi.ensureProjectVectorStore !== 'function') {
      await showSettingsAlert('Project Knowledge Unavailable', 'Project knowledge APIs are unavailable.', 'danger')
      return
    }
    if (!activeProjectId) {
      await showSettingsAlert('Project Required', 'No active project selected.', 'warning')
      return
    }
    try {
      await withOpenAIAssetAction(async () => {
        await openaiAssetsApi.ensureProjectVectorStore(activeProjectId)
        await refreshOpenAIProjectAssets(true)
      })
    } catch (err) {
      await showSettingsAlert('Project Knowledge Failed', `Failed to prepare Project knowledge: ${err.message}`, 'danger')
    }
  }, [activeProjectId, refreshOpenAIProjectAssets, showSettingsAlert, withOpenAIAssetAction])

  const handleUploadOpenAIFiles = useCallback(async () => {
    const dialogApi = window?.addom?.dialog
    const openaiAssetsApi = window?.addom?.openaiAssets
    if (!dialogApi || typeof dialogApi.openFiles !== 'function' || !openaiAssetsApi || typeof openaiAssetsApi.uploadFiles !== 'function') {
      await showSettingsAlert('Project Knowledge Unavailable', 'Project knowledge file upload APIs are unavailable.', 'danger')
      return
    }
    if (!activeProjectId) {
      await showSettingsAlert('Project Required', 'No active project selected.', 'warning')
      return
    }
    try {
      const filePaths = await dialogApi.openFiles()
      const normalizedPaths = Array.isArray(filePaths)
        ? filePaths.map((value) => String(value || '').trim()).filter(Boolean)
        : []
      if (normalizedPaths.length === 0) return
      await withOpenAIAssetAction(async () => {
        const uploaded = await openaiAssetsApi.uploadFiles({
          projectId: activeProjectId,
          files: normalizedPaths.map((filePath) => ({ path: filePath })),
        })
        await openaiAssetsApi.ensureProjectVectorStore(activeProjectId)
        if (Array.isArray(uploaded) && uploaded.length > 0) {
          await openaiAssetsApi.attachFilesToProjectVectorStore({
            projectId: activeProjectId,
            assetIds: uploaded.map((row) => String(row?.id || '').trim()).filter(Boolean),
          })
        }
        await refreshOpenAIProjectAssets(true)
      })
    } catch (err) {
      await showSettingsAlert('Upload Failed', `Failed to upload Project knowledge files: ${err.message}`, 'danger')
    }
  }, [
    activeProjectId,
    refreshOpenAIProjectAssets,
    showSettingsAlert,
    withOpenAIAssetAction,
  ])

  const handleAttachOpenAIProjectFiles = useCallback(async () => {
    const openaiAssetsApi = window?.addom?.openaiAssets
    if (!openaiAssetsApi || typeof openaiAssetsApi.attachFilesToProjectVectorStore !== 'function') {
      await showSettingsAlert('Project Knowledge Unavailable', 'Project knowledge APIs are unavailable.', 'danger')
      return
    }
    if (!activeProjectId) {
      await showSettingsAlert('Project Required', 'No active project selected.', 'warning')
      return
    }
    const assetIds = Array.isArray(openAIProjectAssets?.files)
      ? openAIProjectAssets.files.map((row) => String(row?.id || '').trim()).filter(Boolean)
      : []
    if (assetIds.length === 0) {
      await showSettingsAlert('No Files', 'No uploaded Project knowledge files are available for attachment.', 'warning')
      return
    }
    try {
      await withOpenAIAssetAction(async () => {
        await openaiAssetsApi.attachFilesToProjectVectorStore({
          projectId: activeProjectId,
          assetIds,
        })
        await refreshOpenAIProjectAssets(true)
      })
    } catch (err) {
      await showSettingsAlert('Attach Failed', `Failed to attach files to Project knowledge: ${err.message}`, 'danger')
    }
  }, [
    activeProjectId,
    openAIProjectAssets?.files,
    refreshOpenAIProjectAssets,
    showSettingsAlert,
    withOpenAIAssetAction,
  ])

  const handleRemoveOpenAIProjectAsset = useCallback(async (assetId) => {
    const openaiAssetsApi = window?.addom?.openaiAssets
    if (!openaiAssetsApi || typeof openaiAssetsApi.removeProjectAsset !== 'function') {
      await showSettingsAlert('Project Knowledge Unavailable', 'Project knowledge APIs are unavailable.', 'danger')
      return
    }
    const confirmed = await requestAppConfirm({
      title: 'Remove Project Knowledge File',
      message: 'Delete this remote OpenAI file and remove it from Project knowledge?\n\nThis also removes the file from project retrieval.',
      confirmLabel: 'Delete File',
      cancelLabel: 'Cancel',
      tone: 'danger',
    })
    if (!confirmed) return
    try {
      await withOpenAIAssetAction(async () => {
        await openaiAssetsApi.removeProjectAsset(assetId)
        await refreshOpenAIProjectAssets(true)
      })
    } catch (err) {
      await showSettingsAlert('Delete Failed', `Failed to remove the Project knowledge file: ${err.message}`, 'danger')
    }
  }, [refreshOpenAIProjectAssets, requestAppConfirm, showSettingsAlert, withOpenAIAssetAction])

  const handleDeleteOpenAIProjectVectorStore = useCallback(async () => {
    const openaiAssetsApi = window?.addom?.openaiAssets
    if (!openaiAssetsApi || typeof openaiAssetsApi.deleteProjectVectorStore !== 'function') {
      await showSettingsAlert('Project Knowledge Unavailable', 'Project knowledge APIs are unavailable.', 'danger')
      return
    }
    if (!activeProjectId) {
      await showSettingsAlert('Project Required', 'No active project selected.', 'warning')
      return
    }
    const confirmed = await requestAppConfirm({
      title: 'Reset Project Knowledge',
      message: 'Reset Project knowledge for this project?\n\nUploaded files remain in OpenAI storage unless you remove them individually.',
      confirmLabel: 'Reset Project Knowledge',
      cancelLabel: 'Cancel',
      tone: 'danger',
    })
    if (!confirmed) return
    try {
      await withOpenAIAssetAction(async () => {
        await openaiAssetsApi.deleteProjectVectorStore(activeProjectId)
        await refreshOpenAIProjectAssets(true)
      })
    } catch (err) {
      await showSettingsAlert('Delete Failed', `Failed to reset Project knowledge: ${err.message}`, 'danger')
    }
  }, [activeProjectId, refreshOpenAIProjectAssets, requestAppConfirm, showSettingsAlert, withOpenAIAssetAction])

  return {
    openAIProjectAssets,
    openAIAssetsBusy,
    openAIMcpBusy,
    refreshOpenAIProjectAssets,
    refreshOpenAIMcpServers,
    handleRefreshOpenAIMcpServers,
    handleAddOpenAIMcpServer,
    handleDeleteOpenAIMcpServer,
    handleEditOpenAIMcpServer,
    handleSetOpenAIMcpServerSecret,
    handleTestOpenAIMcpServer,
    handleToggleOpenAIMcpServerEnabled,
    handleSetOpenAIMcpServerApprovalPolicy,
    handleEditOpenAIMcpServerAllowlist,
    handleRefreshOpenAIProjectAssets,
    handleEnsureOpenAIProjectVectorStore,
    handleUploadOpenAIFiles,
    handleAttachOpenAIProjectFiles,
    handleRemoveOpenAIProjectAsset,
    handleDeleteOpenAIProjectVectorStore,
  }
}
