import { BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, session, shell } from 'electron'
import fs from 'node:fs/promises'
import { registerVaultHandlers }    from './ipc-handlers/vault.mjs'
import { registerChatHandlers }     from './ipc-handlers/chat.mjs'
import { registerMemoryHandlers }   from './ipc-handlers/memory.mjs'
import { registerArtifactHandlers } from './ipc-handlers/artifacts.mjs'
import { registerFileHandlers }     from './ipc-handlers/file.mjs'
import { registerDocumentHandlers } from './ipc-handlers/documents.mjs'
import { registerEditorServiceHandlers } from './ipc-handlers/editor-service.mjs'
import { registerEditorCompletionHandlers } from './ipc-handlers/editor-completion.mjs'
import { registerUpdaterHandlers }  from './ipc-handlers/updater.mjs'
import { registerSettingsHandlers } from './ipc-handlers/settings.mjs'
import { registerAdvancedConfigHandlers } from './ipc-handlers/advanced-config.mjs'
import { registerProcessHandlers }  from './ipc-handlers/processes.mjs'
import { registerTerminalSessionHandlers } from './ipc-handlers/terminal-session.mjs'
import { registerTerminalSessionArchiveHandlers } from './ipc-handlers/terminal-session-archive.mjs'
import { registerWorkspaceHandlers } from './ipc-handlers/workspace.mjs'
import { registerAgentHandlers } from './ipc-handlers/agents.mjs'
import { registerCreateRoleHandler } from './ipc-handlers/create-role-from-chat.mjs'
import { registerSkillHandlers } from './ipc-handlers/skills.mjs'
import { registerPipelineHandlers } from './ipc-handlers/pipelines.mjs'
import { registerCouncilHandlers } from './ipc-handlers/council.mjs'
import { registerAgentMemoryHandlers } from './ipc-handlers/agent-memory-handlers.mjs'
import { registerAttachmentHandlers } from './ipc-handlers/attachments.mjs'
import { registerLocalDataHandlers } from './ipc-handlers/local-data.mjs'
import { registerOpenAIAssetHandlers } from './ipc-handlers/openai-assets.mjs'
import { registerOpenAIMcpHandlers } from './ipc-handlers/openai-mcp.mjs'
import { registerOpenAIAccountHandlers } from './ipc-handlers/openai-account.mjs'
import { registerCursorAgentHandlers } from './ipc-handlers/cursor-agent.mjs'
import { registerAgentRunHandlers } from './ipc-handlers/agent-runs.mjs'
import { getCursorAgentSessionRegistry } from './cursor-agent/cursor-agent-session-registry.mjs'
import { registerGitHandlers } from './ipc-handlers/git.mjs'
import { closeAllBrowserTools, closeBrowserTool } from './tools/browser-tool.mjs'
import { listProjects } from './workspace/workspace-store.mjs'
import { onVersioned, handleVersioned } from './ipc/ipc-versioning.mjs'
import { validateExternalHttpUrl, validateOpenDirectoryPath } from './utils/shell-open-guards.mjs'
import { getEditorLanguageServiceManager } from './editor/editor-language-service-manager.mjs'
import { probeTerminalSessionRuntimeHealth } from './tools/terminal-session-runtime-health.mjs'
import { registerAttachmentOpenHandler } from './attachment-open-handler.mjs'
import { ensureAdvancedConfigBootstrap } from './advanced-config.mjs'

export function registerMainProcessIpcHandlers({
  getMainWindow,
  isPackagedSmoke,
  terminalSessionManager,
  workspaceFileWatcher,
  attachmentTempDir,
  prepareForExit,
  logStartupEvent,
  setRendererStartupReady,
  tryFinishStartupTransition,
  resolveLegalDocumentPath,
} = {}) {
  registerVaultHandlers()
  const chatRunRegistry = registerChatHandlers()
  registerMemoryHandlers(() => getMainWindow())
  registerArtifactHandlers()
  registerFileHandlers()
  registerDocumentHandlers({ listProjects })
  registerEditorServiceHandlers()
  registerEditorCompletionHandlers()
  if (!isPackagedSmoke) {
    registerUpdaterHandlers(() => getMainWindow())
  }
  ensureAdvancedConfigBootstrap()
  registerSettingsHandlers()
  registerAdvancedConfigHandlers()
  registerProcessHandlers()
  const terminalSessionHandlers = registerTerminalSessionHandlers({
    sessionManager: terminalSessionManager,
  })
  registerTerminalSessionArchiveHandlers()
  registerWorkspaceHandlers({
    runRegistry: chatRunRegistry,
    onActiveProjectPathChanged: (projectPath = '') => {
      workspaceFileWatcher.setProjectPath(projectPath)
      getEditorLanguageServiceManager().handleActiveWorkspaceChanged(projectPath)
    },
    onThreadDisposed: async ({ action = '', threadId } = {}) => {
      const normalizedThreadId = String(threadId || '').trim()
      if (normalizedThreadId) {
        terminalSessionManager.closeSessionsForThread(normalizedThreadId, {
          archive: String(action || '').trim() !== 'delete-thread',
          closedBy: 'workspace_reset',
        })
        await closeBrowserTool({ threadId: normalizedThreadId })
        if (String(action || '').trim() === 'delete-thread') {
          getCursorAgentSessionRegistry().deleteThread(normalizedThreadId)
        }
      }
    },
    onWorkspaceReset: async ({ scope = '', projectId = '', projectPath = '' } = {}) => {
      const normalizedScope = String(scope || '').trim().toLowerCase()
      const normalizedProjectPath = String(projectPath || '').trim()
      if (normalizedScope === 'project' && normalizedProjectPath) {
        terminalSessionManager.closeSessionsForProject(normalizedProjectPath, {
          closedBy: 'workspace_reset',
        })
      } else {
        terminalSessionManager.closeAllSessions({
          closedBy: 'workspace_reset',
        })
      }
      await closeAllBrowserTools()
      if (normalizedScope === 'project' && String(projectId || '').trim()) {
        getCursorAgentSessionRegistry().deleteProject(projectId)
      }
    },
  })
  registerAgentHandlers()
  registerCreateRoleHandler()
  registerSkillHandlers()
  registerPipelineHandlers()
  registerCouncilHandlers()
  registerAgentMemoryHandlers()
  registerAttachmentHandlers({
    clipboard,
    dialog,
    getMainWindow,
    ipcMain,
    nativeImage,
    shell,
  })
  registerLocalDataHandlers({
    getElectronSession: () => session.defaultSession,
    getTempAttachmentPath: () => attachmentTempDir,
    beforeReset: prepareForExit,
  })
  registerOpenAIAccountHandlers()
  registerCursorAgentHandlers()
  registerAgentRunHandlers({ ipcMain })
  registerOpenAIAssetHandlers()
  registerOpenAIMcpHandlers()
  registerGitHandlers()

  handleVersioned(ipcMain, 'clipboard:readText', () => clipboard.readText())
  handleVersioned(ipcMain, 'clipboard:writeText', (_event, value = '') => {
    clipboard.writeText(String(value ?? ''))
    return true
  })

  // Window controls (custom titlebar)
  onVersioned(ipcMain, 'window:minimize', () => getMainWindow()?.minimize())
  onVersioned(ipcMain, 'window:maximize', () => {
    if (getMainWindow()?.isMaximized()) getMainWindow().unmaximize()
    else getMainWindow()?.maximize()
  })
  onVersioned(ipcMain, 'window:close', () => getMainWindow()?.hide()) // hide to tray, not quit
  onVersioned(ipcMain, 'app:startup-ready', () => {
    setRendererStartupReady()
    logStartupEvent('renderer.startup-ready-ipc')
    tryFinishStartupTransition()
  })


  handleVersioned(ipcMain, 'terminal:runtime-health', async () => {
    return await probeTerminalSessionRuntimeHealth()
  })

  // Project folder selection
  handleVersioned(ipcMain, 'dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openDirectory'],
      title: 'Select Project Folder',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  handleVersioned(ipcMain, 'dialog:openFiles', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openFile', 'multiSelections'],
      title: 'Select Files',
    })
    if (result.canceled || result.filePaths.length === 0) return []
    return result.filePaths
  })

  // Open a path in the OS file explorer
  handleVersioned(ipcMain, 'shell:openPath', async (_event, folderPath) => {
    const allowedProjectPaths = listProjects().map((project) => String(project?.path || '').trim()).filter(Boolean)
    const validation = await validateOpenDirectoryPath(folderPath, allowedProjectPaths)
    if (!validation.ok) return validation

    const openError = await shell.openPath(validation.path)
    if (openError) return { ok: false, error: String(openError) }
    return { ok: true, path: validation.path }
  })

  handleVersioned(ipcMain, 'shell:showOpenContainingFolderMenu', async (event, folderPath) => {
    const allowedProjectPaths = listProjects().map((project) => String(project?.path || '').trim()).filter(Boolean)
    const validation = await validateOpenDirectoryPath(folderPath, allowedProjectPaths)
    if (!validation.ok) return validation

    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (!browserWindow) return { ok: false, error: 'window_not_found' }

    const menu = Menu.buildFromTemplate([
      {
        label: 'Open containing folder',
        click: async () => {
          const openError = await shell.openPath(validation.path)
          if (openError) {
            console.warn(`[shell] failed to open containing folder: ${String(openError)}`)
          }
        },
      },
    ])
    menu.popup({ window: browserWindow })
    return { ok: true, path: validation.path }
  })

  // Open a URL in the default OS browser
  handleVersioned(ipcMain, 'shell:openExternal', async (_event, url) => {
    const validation = validateExternalHttpUrl(url)
    if (!validation.ok) return validation
    await shell.openExternal(validation.url)
    return { ok: true }
  })

  handleVersioned(ipcMain, 'app:openLegalDocument', async (_event, documentId) => {
    const resolved = resolveLegalDocumentPath(documentId)
    if (!resolved.ok) return resolved
    try {
      await fs.access(resolved.absolutePath)
    } catch {
      return {
        ok: false,
        error: 'legal_document_not_found',
        documentId: resolved.documentId,
        path: resolved.absolutePath,
      }
    }

    const openError = await shell.openPath(resolved.absolutePath)
    if (openError) {
      return {
        ok: false,
        error: String(openError),
        documentId: resolved.documentId,
        path: resolved.absolutePath,
      }
    }
    return {
      ok: true,
      documentId: resolved.documentId,
      path: resolved.absolutePath,
    }
  })

  // Git status for the header bar — branch name and working-tree diff stat.
  // Resolve the git global user name for welcome-screen personalisation.
  handleVersioned(ipcMain, 'system:getGitUserName', async () => {
    try {
      const { execFile } = await import('node:child_process')
      return new Promise((resolve) => {
        execFile('git', ['config', '--global', 'user.name'], { timeout: 3000 }, (err, stdout) => {
          if (err) return resolve('')
          resolve(String(stdout || '').trim())
        })
      })
    } catch {
      return ''
    }
  })


  registerAttachmentOpenHandler({
    ipcMain,
    attachmentTempDir,
    openPath: (filePath) => shell.openPath(filePath),
  })
  return {
    ...terminalSessionHandlers,
    chatRunRegistry,
  }
}
