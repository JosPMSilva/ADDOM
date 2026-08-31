import { app, BrowserWindow, Tray, Menu, nativeImage, shell, session, protocol, net, screen } from 'electron'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { recoverPersistedOpenAIBackgroundJobs } from './api-clients/openai-background-jobs.mjs'
import {
  finalizeRecoveredOpenAIBackgroundJobFailure,
  finalizeRecoveredOpenAIBackgroundJobSuccess,
} from './api-clients/openai-background-job-recovery.mjs'
import { closeDb } from './memory/db.mjs'
import { createWorkspaceFileWatcher } from './workspace/file-watcher.mjs'
import {
  cleanupAttachmentCacheOrphans,
  resolveCachedAttachmentFilePath,
  ATTACHMENT_PREVIEW_SCHEME,
} from './attachments/attachment-cache.mjs'
import { cleanupAttachmentAgentMirrorOrphans } from './attachments/attachment-agent-mirror.mjs'
import {
  cleanupAttachmentTempDir,
  DEFAULT_ATTACHMENT_TEMP_MAX_AGE_MS,
} from './attachments/attachment-temp-cleanup.mjs'
import { createAttachmentPreviewRateLimiter } from './attachments/attachment-preview-guard.mjs'
import { validateExternalHttpUrl } from './utils/shell-open-guards.mjs'
import { sendVersioned } from './ipc/ipc-versioning.mjs'
import { ATTACHMENT_TEMP_DIR } from './attachment-open-handler.mjs'
import { buildStartupSplashHtml } from './startup-splash-html.mjs'
import { registerMainProcessIpcHandlers } from './main-ipc-registration.mjs'
import { createAppQuitCoordinator } from './app-quit-coordinator.mjs'
import { registerPrivilegedSchemes } from './main-protocol-registration.mjs'
import { runPackagedRuntimeSmoke } from './packaged-smoke-startup.mjs'
import { closeAllBrowserTools } from './tools/browser-tool.mjs'
import { createTerminalSessionManager } from './tools/terminal-session-manager.mjs'
import { setTerminalSessionManagerForChat } from './chat/terminal-session-events.mjs'
import { archiveTerminalSession } from './terminal/terminal-session-archive-store.mjs'
import { reconcileWorkspaceTurnsOnStartup } from './workspace/workspace-store.mjs'
import { prepareAppRuntimeShutdown } from './app-runtime-shutdown.mjs'
import { resolveThemePalette } from '../common/ui/theme-color-contract.mjs'
import { getSettings } from './settings.mjs'
import { getNativeResolvedAppearance, startNativeAppearanceSync } from './native-appearance.mjs'
import { installBrokenConsolePipeGuards } from './utils/safe-console.mjs'
const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)
installBrokenConsolePipeGuards()
// IS_DEV: true when running via `npm run dev` (Vite dev server is up).
// Set ADDOM_DEV=1 explicitly, or it falls back to checking if app is packaged.
const IS_DEV = process.env.ADDOM_DEV === '1' || (!app.isPackaged && process.env.ADDOM_DEV !== '0')
const EXPLICIT_USER_DATA_PATH = String(process.env.ADDOM_USER_DATA_PATH || '').trim()
const IS_PACKAGED_BROWSER_SMOKE = app.isPackaged && process.env.ADDOM_PACKAGED_BROWSER_SMOKE === '1'
const IS_PACKAGED_TERMINAL_SMOKE = app.isPackaged && process.env.ADDOM_PACKAGED_TERMINAL_SMOKE === '1'
const IS_PACKAGED_SMOKE = IS_PACKAGED_BROWSER_SMOKE || IS_PACKAGED_TERMINAL_SMOKE
const SHOULD_OPEN_DEVTOOLS = process.env.ADDOM_OPEN_DEVTOOLS === '1'
const ELECTRON_DEBUG_PORT = Number(process.env.ADDOM_ELECTRON_DEBUG_PORT || 0)
const SHOULD_LOG_STARTUP_EVENTS = IS_DEV
  || IS_PACKAGED_SMOKE
  || process.env.ADDOM_STARTUP_LOGS === '1'
const SHOULD_REDIRECT_CHROMIUM_LOGS = app.isPackaged
  && !IS_PACKAGED_SMOKE
  && process.env.ADDOM_CHROMIUM_LOG_TO_STDERR !== '1'
function getElectronRemoteAllowOrigins(debugPort) {
  if (!Number.isFinite(debugPort) || debugPort <= 0) return ''
  return [
    `http://127.0.0.1:${debugPort}`,
    `http://localhost:${debugPort}`,
  ].join(',')
}
if (Number.isFinite(ELECTRON_DEBUG_PORT) && ELECTRON_DEBUG_PORT > 0) {
  app.commandLine.appendSwitch('remote-debugging-port', String(ELECTRON_DEBUG_PORT))
  // Chromium blocks DevTools websocket upgrades unless the inspector origin is allowed.
  app.commandLine.appendSwitch('remote-allow-origins', getElectronRemoteAllowOrigins(ELECTRON_DEBUG_PORT))
}

if (SHOULD_REDIRECT_CHROMIUM_LOGS) {
  app.commandLine.appendSwitch('enable-logging', 'file')
  app.commandLine.appendSwitch('log-file', path.join(app.getPath('userData'), 'chromium.log'))
}

// Use a separate user data directory in dev so the dev instance never
// conflicts with the installed production app's cache/db locks.
if (EXPLICIT_USER_DATA_PATH) {
  app.setPath('userData', path.resolve(EXPLICIT_USER_DATA_PATH))
} else if (IS_DEV) {
  app.setPath('userData', path.join(app.getPath('appData'), 'addom-dev'))
}
const WINDOW_WIDTH  = 1280
const WINDOW_HEIGHT = 820
const MIN_WIDTH     = 1000
const MIN_HEIGHT    = 600
const SHOULD_LAUNCH_FULLSCREEN = process.platform === 'linux'
const IS_LINUX_WAYLAND = process.platform === 'linux'
  && (String(process.env.XDG_SESSION_TYPE || '').trim().toLowerCase() === 'wayland'
    || String(process.env.WAYLAND_DISPLAY || '').trim().length > 0)
const ATTACHMENT_PREVIEW_RATE_CAPACITY = 180
const ATTACHMENT_PREVIEW_RATE_REFILL_PER_SECOND = 60
const ATTACHMENT_TEMP_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000
const RENDERER_APP_SCHEME = 'addom-app'
const RENDERER_APP_HOST = 'renderer'
const LEGAL_DOCUMENTS = new Map([
  ['third-party-notices', 'THIRD_PARTY_NOTICES.txt'],
  ['oss-inventory', 'shipped-third-party-inventory.json'],
])

function getProjectRootPath() {
  return path.resolve(__dirname, '..', '..')
}

function getRendererDistPath() {
  return path.join(getProjectRootPath(), 'dist')
}

function buildRendererAppUrl(relativePath = 'index.html') {
  const normalizedPath = String(relativePath || '').replace(/^\/+/, '').trim() || 'index.html'
  return `${RENDERER_APP_SCHEME}://${RENDERER_APP_HOST}/${normalizedPath}`
}

function resolveLegalDocumentPath(documentId = '') {
  const normalizedId = String(documentId || '').trim().toLowerCase()
  const fileName = LEGAL_DOCUMENTS.get(normalizedId)
  if (!fileName) return { ok: false, error: 'unknown_legal_document', documentId: normalizedId }
  const baseDir = app.isPackaged
    ? path.join(process.resourcesPath, 'legal')
    : path.join(getProjectRootPath(), 'build', 'legal')
  const absolutePath = path.join(baseDir, fileName)
  return { ok: true, documentId: normalizedId, absolutePath, fileName }
}

registerPrivilegedSchemes({
  protocol,
  rendererAppScheme: RENDERER_APP_SCHEME,
  attachmentPreviewScheme: ATTACHMENT_PREVIEW_SCHEME,
})

let mainWindow = null
let startupSplashWindow = null
let tray = null
let dbClosed = false
let attachmentTempCleanupTimer = null
let attachmentCacheOrphanCleanupScheduled = false
let attachmentCacheOrphanCleanupInFlight = false
let openAIBackgroundRecoveryStarted = false
let startupSplashComplete = false
let rendererStartupReady = false
let mainWindowReadyToShow = false
let startupRevealFallbackTimer = null
let startupBoundsEnforcementTimer = null
const workspaceFileWatcher = createWorkspaceFileWatcher({
  onChange: (payload = {}) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win?.isDestroyed?.()) continue
      sendVersioned(win.webContents, 'file:tree-changed', payload)
      sendVersioned(win.webContents, 'file:external-change', payload)
    }
  },
  onStatus: (payload = {}) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win?.isDestroyed?.()) continue
      sendVersioned(win.webContents, 'file:watcher-status', payload)
    }
  },
})
const attachmentPreviewRateLimiter = createAttachmentPreviewRateLimiter({
  capacity: ATTACHMENT_PREVIEW_RATE_CAPACITY,
  refillPerSecond: ATTACHMENT_PREVIEW_RATE_REFILL_PER_SECOND,
})
const terminalSessionManager = createTerminalSessionManager({
  archiveClosedSession: (snapshot) => {
    archiveTerminalSession(snapshot)
  },
})
setTerminalSessionManagerForChat(terminalSessionManager)
let terminalSessionHandlers = null

function logStartupEvent(eventName, details = {}) {
  if (!SHOULD_LOG_STARTUP_EVENTS) return
  try {
    console.info(`[startup] ${String(eventName || 'event')}`, {
      appIsPackaged: app.isPackaged,
      platform: process.platform,
      mainWindowReadyToShow,
      rendererStartupReady,
      startupSplashComplete,
      ...details,
    })
  } catch {
    // Best-effort startup diagnostics only.
  }
}

async function closeRuntimeResources() {
  if (dbClosed) return
  dbClosed = true
  try { startupSplashWindow?.destroy?.() } catch { /* best-effort splash cleanup during shutdown */ }
  if (attachmentTempCleanupTimer) {
    try { clearInterval(attachmentTempCleanupTimer) } catch { /* best-effort timer cleanup */ } attachmentTempCleanupTimer = null
  }
  try { await closeAllBrowserTools() } catch { /* best-effort browser cleanup during shutdown */ }
  try { terminalSessionHandlers?.dispose?.() } catch { /* best-effort terminal IPC cleanup */ }
  try { terminalSessionManager.dispose() } catch { /* best-effort terminal cleanup */ }
  try { workspaceFileWatcher.dispose() } catch { /* best-effort watcher cleanup */ }
  try { closeDb() } catch { /* best-effort database shutdown */ }
}
const appQuitCoordinator = createAppQuitCoordinator({ app, closeResources: closeRuntimeResources, prepareRuntime: () => prepareAppRuntimeShutdown(terminalSessionHandlers?.chatRunRegistry) })

async function runAttachmentTempCleanup(reason = 'startup') {
  const result = await cleanupAttachmentTempDir(ATTACHMENT_TEMP_DIR, {
    olderThanMs: DEFAULT_ATTACHMENT_TEMP_MAX_AGE_MS,
  })
  if (result?.deletedEntries > 0 || result?.errorCount > 0) {
    console.info(
      `[attachments] temp cleanup (${reason}): scanned=${Number(result.scannedEntries || 0)} deleted=${Number(result.deletedEntries || 0)} errors=${Number(result.errorCount || 0)}`,
    )
  }
}

function scheduleAttachmentTempCleanup() {
  runAttachmentTempCleanup('startup').catch(() => {})
  if (attachmentTempCleanupTimer) return
  attachmentTempCleanupTimer = setInterval(() => {
    runAttachmentTempCleanup('interval').catch(() => {})
  }, ATTACHMENT_TEMP_CLEANUP_INTERVAL_MS)
  if (attachmentTempCleanupTimer && typeof attachmentTempCleanupTimer.unref === 'function') {
    attachmentTempCleanupTimer.unref()
  }
}

async function runAttachmentCacheOrphanCleanup(reason = 'startup') {
  try {
    const [result] = await Promise.all([cleanupAttachmentCacheOrphans(), cleanupAttachmentAgentMirrorOrphans()])
    if (!result || typeof result !== 'object') return
    const scannedRows = Number(result.scannedRows || 0)
    const scannedFiles = Number(result.scannedFiles || 0)
    const deletedRows = Number(result.deletedRows || 0)
    const deletedFiles = Number(result.deletedFiles || 0)
    const errorCount = Number(result.errorCount || 0)
    if (deletedRows > 0 || deletedFiles > 0 || errorCount > 0) {
      console.info(
        `[attachments] cache orphan cleanup (${reason}): scannedRows=${scannedRows} scannedFiles=${scannedFiles} deletedRows=${deletedRows} deletedFiles=${deletedFiles} errors=${errorCount}`,
      )
      if (Array.isArray(result.deletedRowIds) || Array.isArray(result.deletedFilePaths) || Array.isArray(result.errors)) {
        console.info('[attachments] cache orphan cleanup details', {
          deletedRowIds: Array.isArray(result.deletedRowIds) ? result.deletedRowIds : [],
          deletedFilePaths: Array.isArray(result.deletedFilePaths) ? result.deletedFilePaths : [],
          errors: Array.isArray(result.errors) ? result.errors : [],
        })
      }
    }
  } catch (error) {
    console.warn(
      `[attachments] cache orphan cleanup (${reason}) failed: ${String(error?.message || error || 'cleanup_failed')}`,
    )
  }
}

function scheduleAttachmentCacheOrphanCleanup(reason = 'startup') {
  if (attachmentCacheOrphanCleanupScheduled || attachmentCacheOrphanCleanupInFlight) return
  attachmentCacheOrphanCleanupScheduled = true
  const timer = setTimeout(() => {
    attachmentCacheOrphanCleanupScheduled = false
    attachmentCacheOrphanCleanupInFlight = true
    runAttachmentCacheOrphanCleanup(reason)
      .catch(() => {})
      .finally(() => {
        attachmentCacheOrphanCleanupInFlight = false
      })
  }, 0)
  if (timer && typeof timer.unref === 'function') {
    timer.unref()
  }
}

function broadcastVersioned(channel, payload = {}) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win?.webContents || win.webContents.isDestroyed()) continue
    try {
      sendVersioned(win.webContents, channel, payload)
    } catch {
      // Best-effort only.
    }
  }
}

async function recoverOpenAIBackgroundJobsOnStartup() {
  if (openAIBackgroundRecoveryStarted) return
  openAIBackgroundRecoveryStarted = true
  try {
    await recoverPersistedOpenAIBackgroundJobs({
      onCompleted: async ({ job, payload }) => {
        finalizeRecoveredOpenAIBackgroundJobSuccess({
          job,
          payload,
          broadcast: broadcastVersioned,
        })
      },
      onFailed: async ({ job, cancelled, message }) => {
        finalizeRecoveredOpenAIBackgroundJobFailure({
          job,
          cancelled,
          message,
          broadcast: broadcastVersioned,
        })
      },
    })
  } catch (error) {
    console.warn(
      `[openai] failed to recover background jobs on startup: ${String(error?.message || error || 'recovery_failed')}`,
    )
  }
}

function closeStartupSplashWindow() {
  if (!startupSplashWindow || startupSplashWindow.isDestroyed()) {
    startupSplashWindow = null
    return
  }
  logStartupEvent('splash.close')
  startupSplashWindow.destroy()
  startupSplashWindow = null
}

function clearStartupRevealFallbackTimer() {
  if (!startupRevealFallbackTimer) return
  try { clearTimeout(startupRevealFallbackTimer) } catch { /* best-effort timeout cleanup */ }
  startupRevealFallbackTimer = null
}

function clearStartupBoundsEnforcementTimer() {
  if (!startupBoundsEnforcementTimer) return
  try { clearTimeout(startupBoundsEnforcementTimer) } catch { /* best-effort timeout cleanup */ }
  startupBoundsEnforcementTimer = null
}

function resolvePrimaryWorkAreaBounds() {
  const workArea = screen?.getPrimaryDisplay?.()?.workArea
  if (!workArea) return null
  const width = Number(workArea.width || 0)
  const height = Number(workArea.height || 0)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return {
    x: Number(workArea.x || 0),
    y: Number(workArea.y || 0),
    width,
    height,
  }
}

function resolvePrimaryDisplayBounds() {
  const bounds = screen?.getPrimaryDisplay?.()?.bounds
  if (!bounds) return null
  const width = Number(bounds.width || 0)
  const height = Number(bounds.height || 0)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return {
    x: Number(bounds.x || 0),
    y: Number(bounds.y || 0),
    width,
    height,
  }
}

function enforceMainWindowLaunchBounds(reason = 'post-show') {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (SHOULD_LAUNCH_FULLSCREEN) {
    if (!mainWindow.isFullScreen?.()) {
      mainWindow.setFullScreen(true)
    }
    logStartupEvent('main.bounds.enforced', {
      reason: String(reason || 'post-show'),
      launchMode: 'fullscreen',
      currentBounds: mainWindow.getBounds?.(),
      isFullScreen: mainWindow.isFullScreen?.(),
      isMaximized: mainWindow.isMaximized?.(),
    })
    return
  }
  const workAreaBounds = resolvePrimaryWorkAreaBounds()
  if (!workAreaBounds) return
  mainWindow.setBounds(workAreaBounds)
  if (!mainWindow.isDestroyed() && !mainWindow.isMaximized()) {
    mainWindow.maximize()
  }
  logStartupEvent('main.bounds.enforced', {
    reason: String(reason || 'post-show'),
    launchMode: 'maximize',
    targetBounds: workAreaBounds,
    currentBounds: mainWindow.getBounds?.(),
    isFullScreen: mainWindow.isFullScreen?.(),
    isMaximized: mainWindow.isMaximized?.(),
  })
}

function finalizeStartupWindowReveal() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  logStartupEvent('main.reveal.begin', {
    isVisible: mainWindow.isVisible?.(),
    isFullScreen: mainWindow.isFullScreen?.(),
    isMinimized: mainWindow.isMinimized?.(),
    isMaximized: mainWindow.isMaximized?.(),
  })
  startupSplashComplete = true
  clearStartupRevealFallbackTimer()
  clearStartupBoundsEnforcementTimer()
  closeStartupSplashWindow()
  if (mainWindow.isMinimized?.()) mainWindow.restore()
  mainWindow.show()
  enforceMainWindowLaunchBounds('initial-show')
  startupBoundsEnforcementTimer = setTimeout(() => {
    startupBoundsEnforcementTimer = null
    enforceMainWindowLaunchBounds('delayed-show')
  }, 180)
  mainWindow.focus()
  logStartupEvent('main.reveal.end', {
    isVisible: mainWindow.isVisible?.(),
    isFullScreen: mainWindow.isFullScreen?.(),
    isMinimized: mainWindow.isMinimized?.(),
    isMaximized: mainWindow.isMaximized?.(),
    bounds: mainWindow.getBounds?.(),
  })
}

function tryFinishStartupTransition() {
  if (startupSplashComplete || IS_PACKAGED_SMOKE) return
  if (!rendererStartupReady || !mainWindowReadyToShow) return
  finalizeStartupWindowReveal()
}

function scheduleStartupRevealFallback() {
  if (startupSplashComplete || IS_PACKAGED_SMOKE) return
  if (!mainWindowReadyToShow) return
  if (startupRevealFallbackTimer) return
  startupRevealFallbackTimer = setTimeout(() => {
    startupRevealFallbackTimer = null
    if (startupSplashComplete || !mainWindow || mainWindow.isDestroyed()) return
    logStartupEvent('main.reveal.fallback-fired')
    finalizeStartupWindowReveal()
  }, 3500)
}

function markMainWindowReady(reason = 'ready') {
  if (IS_PACKAGED_SMOKE) return
  if (mainWindowReadyToShow) return
  mainWindowReadyToShow = true
  logStartupEvent('main.ready', { reason: String(reason || 'ready') })
  scheduleStartupRevealFallback()
  tryFinishStartupTransition()
}

function parseAttachmentIdFromPreviewUrl(rawUrl = '') {
  try {
    const parsed = new URL(String(rawUrl || ''))
    if (parsed.protocol !== `${ATTACHMENT_PREVIEW_SCHEME}:`) return ''
    if (String(parsed.hostname || '').trim().toLowerCase() !== 'attachment') return ''
    return decodeURIComponent(String(parsed.pathname || '').replace(/^\/+/, '').trim())
  } catch {
    return ''
  }
}

function createStartupSplashWindow() {
  if (startupSplashComplete || startupSplashWindow) return
  const primaryDisplayBounds = resolvePrimaryDisplayBounds()
  const splashWidth = IS_LINUX_WAYLAND
    ? Number(primaryDisplayBounds?.width || WINDOW_WIDTH)
    : 680
  const splashHeight = IS_LINUX_WAYLAND
    ? Number(primaryDisplayBounds?.height || WINDOW_HEIGHT)
    : 360
  const splashX = primaryDisplayBounds && !IS_LINUX_WAYLAND
    ? Math.round(primaryDisplayBounds.x + (primaryDisplayBounds.width - splashWidth) / 2)
    : Number(primaryDisplayBounds?.x)
  const splashY = primaryDisplayBounds && !IS_LINUX_WAYLAND
    ? Math.round(primaryDisplayBounds.y + (primaryDisplayBounds.height - splashHeight) / 2)
    : Number(primaryDisplayBounds?.y)
  startupSplashWindow = new BrowserWindow({
    width: splashWidth,
    height: splashHeight,
    ...(Number.isFinite(splashX) && Number.isFinite(splashY)
      ? { x: splashX, y: splashY }
      : { center: true }),
    minWidth: splashWidth,
    minHeight: splashHeight,
    maxWidth: splashWidth,
    maxHeight: splashHeight,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: true,
    backgroundColor: resolveThemePalette(getNativeResolvedAppearance()).colors.surface,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  startupSplashWindow.setMenuBarVisibility(false)
  logStartupEvent('splash.create', {
    launchMode: IS_LINUX_WAYLAND ? 'display-sized' : 'centered-window',
    splashBounds: startupSplashWindow.getBounds?.(),
  })
  startupSplashWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(buildStartupSplashHtml({
    resolvedAppearance: getNativeResolvedAppearance(),
  }))}`)
  startupSplashWindow.once('ready-to-show', () => {
    logStartupEvent('splash.ready-to-show', {
      splashBounds: startupSplashWindow?.getBounds?.(),
      isVisible: startupSplashWindow?.isVisible?.(),
    })
  })
  startupSplashWindow.on('closed', () => {
    logStartupEvent('splash.closed')
    startupSplashWindow = null
  })
}

function registerAttachmentPreviewProtocol() {
  if (!protocol || typeof protocol.handle !== 'function') return
  protocol.handle(ATTACHMENT_PREVIEW_SCHEME, async (request) => {
    const throttle = attachmentPreviewRateLimiter.consume(request)
    if (!throttle.ok) {
      return new Response('Too many attachment preview requests.', {
        status: 429,
        headers: {
          'Retry-After': String(Math.max(1, Math.ceil(Number(throttle.retryAfterMs || 0) / 1000))),
        },
      })
    }
    const attachmentId = parseAttachmentIdFromPreviewUrl(request?.url || '')
    if (!attachmentId) return new Response('Attachment not found.', { status: 404 })
    const resolved = await resolveCachedAttachmentFilePath(attachmentId)
    if (!resolved?.ok || !resolved.absolutePath) {
      return new Response('Attachment not found.', { status: 404 })
    }
    try {
      return await net.fetch(pathToFileURL(resolved.absolutePath).href)
    } catch {
      return new Response('Attachment not found.', { status: 404 })
    }
  })
}

function resolveRendererAssetPath(rawUrl = '') {
  try {
    const parsed = new URL(String(rawUrl || ''))
    if (parsed.protocol !== `${RENDERER_APP_SCHEME}:`) return ''
    if (String(parsed.hostname || '').trim().toLowerCase() !== RENDERER_APP_HOST) return ''

    const distRoot = getRendererDistPath()
    const relativePath = decodeURIComponent(String(parsed.pathname || ''))
      .replace(/^\/+/, '')
      .trim() || 'index.html'
    const absolutePath = path.resolve(distRoot, relativePath)
    const normalizedDistRoot = path.resolve(distRoot)
    const distPrefix = normalizedDistRoot.endsWith(path.sep)
      ? normalizedDistRoot
      : `${normalizedDistRoot}${path.sep}`

    if (absolutePath !== normalizedDistRoot && !absolutePath.startsWith(distPrefix)) return ''
    return absolutePath
  } catch {
    return ''
  }
}

function registerRendererAppProtocol() {
  if (!protocol || typeof protocol.handle !== 'function') return
  protocol.handle(RENDERER_APP_SCHEME, async (request) => {
    const resolvedPath = resolveRendererAssetPath(request?.url || '')
    if (!resolvedPath) {
      return new Response('Renderer asset not found.', { status: 404 })
    }
    try {
      return await net.fetch(pathToFileURL(resolvedPath).href)
    } catch {
      return new Response('Renderer asset not found.', { status: 404 })
    }
  })
}

// Window
function createMainWindow() {
  clearStartupRevealFallbackTimer()
  mainWindowReadyToShow = false
  rendererStartupReady = false
  const launchBounds = SHOULD_LAUNCH_FULLSCREEN ? resolvePrimaryDisplayBounds() : null
  mainWindow = new BrowserWindow({
    width: Number(launchBounds?.width || WINDOW_WIDTH),
    height: Number(launchBounds?.height || WINDOW_HEIGHT),
    ...(launchBounds ? { x: launchBounds.x, y: launchBounds.y } : {}),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    backgroundColor: resolveThemePalette(getNativeResolvedAppearance()).colors.surface,
    titleBarStyle: 'hiddenInset',
    frame: false,
    show: false, // show after ready-to-show to avoid flash
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'generated', 'index.cjs'),
      additionalArguments: [`--addom-app-version=${app.getVersion()}`, `--addom-initial-appearance=${getNativeResolvedAppearance()}`],
      contextIsolation: true,   // renderer cannot access Node APIs directly
      nodeIntegration: false,   // never enable â€” security boundary
      sandbox: true,            // enforce renderer sandbox with isolated preload bridge
    },
  })
  logStartupEvent('main.create', {
    show: false,
    launchMode: SHOULD_LAUNCH_FULLSCREEN ? 'fullscreen' : 'windowed',
    targetBounds: launchBounds,
    bounds: mainWindow.getBounds?.(),
  })

  // Load renderer
  if (IS_DEV) {
    mainWindow.loadURL('http://localhost:5173')
    if (SHOULD_OPEN_DEVTOOLS) {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    mainWindow.loadURL(buildRendererAppUrl())
  }

  mainWindow.once('ready-to-show', () => {
    logStartupEvent('main.ready-to-show')
    markMainWindowReady('ready-to-show')
  })

  mainWindow.webContents.once('did-finish-load', () => {
    logStartupEvent('main.did-finish-load', {
      url: mainWindow?.webContents?.getURL?.(),
    })
    markMainWindowReady('did-finish-load')
  })

  mainWindow.on('closed', () => {
    logStartupEvent('main.closed')
    clearStartupRevealFallbackTimer()
    clearStartupBoundsEnforcementTimer()
    closeStartupSplashWindow()
    mainWindow = null
  })

  // Open external links in the OS browser, not in the Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const validation = validateExternalHttpUrl(url)
    if (validation.ok) {
      void shell.openExternal(validation.url)
    }
    return { action: 'deny' }
  })
}

// Tray

function createTray() {
  // Load the bundled tray icon; fall back to empty image if missing (dev env)
  let icon
  try {
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath, 'assets', 'tray-icon.png')
      : path.join(__dirname, '..', '..', 'assets', 'tray-icon.png')
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) icon = nativeImage.createEmpty()
  } catch {
    icon = nativeImage.createEmpty()
  }
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open ADDOM',
      click: () => {
        if (mainWindow) {
          logStartupEvent('tray.open.click')
          closeStartupSplashWindow()
          mainWindow.show()
          mainWindow.focus()
        } else {
          createMainWindow()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ])

  tray.setToolTip('ADDOM')
  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    if (mainWindow) {
      logStartupEvent('tray.double-click')
      closeStartupSplashWindow()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// CSP header injection
// In PRODUCTION: inject a strict CSP HTTP header on every response so Electron
// sees it as a real header (meta tags alone don't satisfy Electron's check).
//
// In DEV: Vite's dev server injects its own HMR bootstrap as an inline script
// which would be blocked by any script-src that lacks 'unsafe-inline'. Rather
// than fighting Vite, we skip header injection entirely in dev and instead
// silence Electron's cosmetic warning with the env var â€” the warning explicitly
// says it won't appear in packaged builds anyway.

function installCSPHeader() {
  if (IS_DEV) {
    // Suppress the dev-only security warning â€” it is cosmetic and irrelevant
    // for a locally running dev server that never ships to users.
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
    return
  }

  // Tight production CSP. Monaco is bundled as local ESM plus dedicated agents,
  // so the packaged renderer does not need an eval allowance.
  const PROD_CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src 'self' data: blob: ${ATTACHMENT_PREVIEW_SCHEME}:`,
    "connect-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [PROD_CSP],
      },
    })
  })
}

// App lifecycle
app.whenReady().then(async () => {
  startNativeAppearanceSync(getSettings)
  registerRendererAppProtocol()
  registerAttachmentPreviewProtocol()
  installCSPHeader()
  if (!IS_PACKAGED_SMOKE) {
    await reconcileWorkspaceTurnsOnStartup().catch((error) => console.warn(`[workspace] failed to reconcile interrupted turns: ${String(error?.message || error || 'recovery_failed')}`))
    createStartupSplashWindow()
  }
  createMainWindow()
  if (!IS_PACKAGED_SMOKE) {
    createTray()
    scheduleAttachmentTempCleanup()
    scheduleAttachmentCacheOrphanCleanup('startup')
    void recoverOpenAIBackgroundJobsOnStartup()
  } else {
    runPackagedRuntimeSmoke({
      app,
      mainWindow,
      isBrowserSmoke: IS_PACKAGED_BROWSER_SMOKE,
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  // On macOS the convention is to keep the app in the dock
  // On Windows we keep it in the tray â€” do NOT quit
  // Only quit if the user explicitly chooses Quit from the tray menu
})

app.on('before-quit', appQuitCoordinator.handleBeforeQuit)

// IPC handlers
terminalSessionHandlers = registerMainProcessIpcHandlers({
  getMainWindow: () => mainWindow,
  isPackagedSmoke: IS_PACKAGED_SMOKE,
  terminalSessionManager,
  workspaceFileWatcher,
  attachmentTempDir: ATTACHMENT_TEMP_DIR,
  prepareForExit: appQuitCoordinator.prepareForExit,
  logStartupEvent,
  setRendererStartupReady: () => {
    rendererStartupReady = true
  },
  tryFinishStartupTransition,
  resolveLegalDocumentPath,
})
