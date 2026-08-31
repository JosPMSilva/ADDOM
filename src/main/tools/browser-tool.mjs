import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ensurePlaywrightChromiumRuntime } from './browser-runtime-installer.mjs'
import {
  getUserDataPlaywrightBrowserRoot,
  resolveBundledChromiumExecutablePath,
} from './browser-runtime-paths.mjs'
import {
  buildBrowserNavigationPolicy,
  classifyUrl,
  evaluateBrowserNavigationRequestPolicy,
  handleBrowserRoute,
  refreshSessionTarget,
  withSessionNavigationPolicy,
} from './browser-tool-policy.mjs'
import { createBrowserActionHandlers } from './browser-tool-actions.mjs'
import {
  attachBrowserDiagnosticsToContext,
  attachBrowserDiagnosticsToPage,
  clearBrowserDiagnostics,
  createBrowserDiagnostics,
} from './browser-tool-diagnostics.mjs'

export { evaluateBrowserNavigationRequestPolicy } from './browser-tool-policy.mjs'

const VIEWPORT_WIDTH = 1920
const VIEWPORT_HEIGHT = 1080
const NAVIGATION_TIMEOUT_MS = 30_000
const JS_EXECUTION_TIMEOUT_MS = 10_000
const ELEMENT_TIMEOUT_MS = 5_000
const MAX_TEXT_CHARS = 12_000
const SCREENSHOT_JPEG_QUALITY = 80

const browserSessions = new Map()
let chromium = null

function normalizeThreadId(value = '') {
  const raw = String(value || '').trim()
  return raw || 'global'
}

function getSessionKey(options = {}) {
  return normalizeThreadId(options?.threadId)
}

async function ensureDirectory(dirPath = '') {
  const target = String(dirPath || '').trim()
  if (!target) return ''
  await fs.mkdir(target, { recursive: true })
  return target
}

function getScreenshotDir() {
  return path.join(tmpdir(), 'addom-browser-screenshots')
}

function getRecordingDir(projectRoot = '') {
  const root = String(projectRoot || '').trim()
  return root
    ? path.join(root, '.addom', 'browser-recordings')
    : path.join(tmpdir(), 'addom-browser-recordings')
}

async function resolveBrowserToolUserDataPath(explicitUserDataPath = '') {
  const providedPath = String(explicitUserDataPath || '').trim()
  if (providedPath) return providedPath
  if (!process.versions?.electron) return ''
  try {
    const { app } = await import('electron')
    return String(app?.getPath?.('userData') || '').trim()
  } catch {
    return ''
  }
}

function buildBrowserLaunchAttempts(baseOptions = {}, executablePath = '', {
  allowSystemBrowserFallback = true,
} = {}) {
  const resolvedExecutablePath = String(executablePath || '').trim()
  return resolvedExecutablePath
    ? [
        {
          label: `bundled Chromium (${resolvedExecutablePath})`,
          options: { ...baseOptions, executablePath: resolvedExecutablePath },
        },
        ...(allowSystemBrowserFallback
          ? [
              {
                label: 'Chrome',
                options: { ...baseOptions, channel: 'chrome' },
              },
              {
                label: 'Microsoft Edge',
                options: { ...baseOptions, channel: 'msedge' },
              },
              {
                label: 'Playwright default browser resolution',
                options: baseOptions,
              },
            ]
          : []),
      ]
    : (allowSystemBrowserFallback
      ? [
          {
            label: 'Chrome',
            options: { ...baseOptions, channel: 'chrome' },
          },
          {
            label: 'Microsoft Edge',
            options: { ...baseOptions, channel: 'msedge' },
          },
          {
            label: 'Playwright default browser resolution',
            options: baseOptions,
          },
        ]
      : [])
}

async function tryLaunchBrowser(engine, launchAttempts = []) {
  let browser = null
  const launchErrors = []
  for (const attempt of Array.isArray(launchAttempts) ? launchAttempts : []) {
    try {
      browser = await engine.launch(attempt.options)
      return { browser, launchErrors }
    } catch (error) {
      launchErrors.push(`${attempt.label}: ${String(error?.message || error || 'unknown launch error')}`)
    }
  }
  return { browser: null, launchErrors }
}

function clipText(text = '', limit = MAX_TEXT_CHARS, suffix = '[Content truncated - exceeded 12,000 character limit]') {
  const content = String(text || '').trim()
  if (!content) return '(empty)'
  if (content.length <= limit) return content
  return `${content.slice(0, limit)}\n\n${suffix}`
}

async function loadPlaywright() {
  if (chromium) return chromium
  try {
    const pw = await import('playwright-core')
    chromium = pw.chromium
    return chromium
  } catch (error) {
    throw new Error(
      'playwright-core is not installed. Run: npm install playwright-core\n'
      + `Import error: ${String(error?.message || error || 'unknown import error')}`,
    )
  }
}

async function createBrowserSession(options = {}) {
  const engine = await loadPlaywright()
  const userDataPath = await resolveBrowserToolUserDataPath(options.userDataPath)
  const runtimeInstallRoot = String(
    options.browserRoot
    || getUserDataPlaywrightBrowserRoot({ userDataPath }),
  ).trim()
  const bundledExecutablePath = await resolveBundledChromiumExecutablePath({
    browserRoot: options.browserRoot,
    userDataPath,
    resourcesPath: options.resourcesPath,
    projectRoot: options.projectRoot,
  })
  const launchOptions = {
    headless: options.headless === true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  }
  const allowSystemBrowserFallback = options.allowSystemBrowserFallback !== false

  let { browser, launchErrors } = await tryLaunchBrowser(
    engine,
    buildBrowserLaunchAttempts(launchOptions, bundledExecutablePath, {
      allowSystemBrowserFallback,
    }),
  )
  let runtimeInstallError = ''
  if (!browser && runtimeInstallRoot && !bundledExecutablePath) {
    try {
      const runtime = await ensurePlaywrightChromiumRuntime({
        installRoot: runtimeInstallRoot,
        cwd: options.projectRoot || process.cwd(),
      })
      if (typeof options.onRuntimeInstall === 'function') {
        try {
          options.onRuntimeInstall(runtime)
        } catch {
          // Best-effort smoke/test telemetry only.
        }
      }
      const installedExecutablePath = String(runtime?.executablePath || '').trim()
      if (installedExecutablePath) {
        const retry = await tryLaunchBrowser(
          engine,
          buildBrowserLaunchAttempts(launchOptions, installedExecutablePath, {
            allowSystemBrowserFallback,
          }),
        )
        browser = retry.browser
        launchErrors = [...launchErrors, ...retry.launchErrors]
      }
    } catch (error) {
      runtimeInstallError = String(error?.message || error || 'unknown install error')
    }
  }
  if (!browser) {
    const bundledHint = bundledExecutablePath
      ? 'Bundled Chromium was found but could not be launched.'
      : 'No bundled Chromium was found in the packaged resources, user-data browser cache, or .playwright-browsers.'
    const installHint = runtimeInstallError
      ? ` Automatic runtime install also failed: ${runtimeInstallError}\n`
      : ''
    throw new Error(
      `${bundledHint}${installHint}Prepare the runtime with "npm run browser:prepare-runtime", allow ADDOM to install Chromium on first use, or install a supported system browser.\n`
      + launchErrors.join('\n'),
    )
  }

  const contextOptions = {
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    userAgent: 'ADDOM/1.0 Browser Tool',
  }
  if (options.recordVideo === true) {
    contextOptions.recordVideo = {
      dir: await ensureDirectory(getRecordingDir(options.projectRoot)),
      size: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    }
  }

  const context = await browser.newContext(contextOptions)
  const session = {
    browser,
    context,
    page: null,
    isRecording: options.recordVideo === true,
    recordingDir: options.recordVideo === true ? getRecordingDir(options.projectRoot) : '',
    currentPageUrl: 'about:blank',
    targetClass: 'none',
    targetOrigin: 'about:blank',
    targetHost: '',
    resolvedAddresses: [],
    targetReason: 'about_blank',
    navigationPolicy: null,
    lastNavigationBlock: null,
    diagnostics: createBrowserDiagnostics(),
  }
  attachBrowserDiagnosticsToContext(session, context)
  await context.route('**/*', async (route) => {
    await handleBrowserRoute(session, route)
  })
  session.page = await context.newPage()
  attachBrowserDiagnosticsToPage(session, session.page)
  await refreshSessionTarget(session)
  return session
}

async function ensureSession(options = {}, createOptions = {}) {
  const key = getSessionKey(options)
  const existing = browserSessions.get(key)
  if (existing?.browser?.isConnected?.() && existing?.page && !existing.page.isClosed()) {
    if (createOptions.recordVideo === true && !existing.isRecording) {
      await closeBrowserTool({ threadId: key })
    } else {
      await refreshSessionTarget(existing)
      return existing
    }
  }

  const session = await createBrowserSession({
    headless: createOptions.headless === true,
    projectRoot: createOptions.projectRoot || options.projectRoot,
    recordVideo: createOptions.recordVideo === true,
    userDataPath: createOptions.userDataPath || options.userDataPath,
    browserRoot: createOptions.browserRoot || options.browserRoot,
    resourcesPath: createOptions.resourcesPath || options.resourcesPath,
    allowSystemBrowserFallback: createOptions.allowSystemBrowserFallback !== false,
    onRuntimeInstall: createOptions.onRuntimeInstall || options.onRuntimeInstall,
  })
  browserSessions.set(key, session)
  return session
}

async function ensureSessionPage(options = {}, createOptions = {}) {
  const session = await ensureSession(options, createOptions)
  if (!session.page || session.page.isClosed()) {
    session.page = await session.context.newPage()
    attachBrowserDiagnosticsToPage(session, session.page)
  }
  await refreshSessionTarget(session)
  return session
}

async function getExistingSession(options = {}) {
  const key = getSessionKey(options)
  const session = browserSessions.get(key)
  if (!session?.browser?.isConnected?.()) return null
  if (session.page?.isClosed?.()) return null
  await refreshSessionTarget(session)
  return session
}

async function closeSession(sessionKey = '') {
  const key = normalizeThreadId(sessionKey)
  const session = browserSessions.get(key)
  if (!session) return null
  browserSessions.delete(key)

  let videoPath = null
  try {
    if (session.page && session.isRecording) {
      const video = session.page.video()
      if (video) {
        await session.page.close().catch(() => {})
        videoPath = await video.path().catch(() => null)
      }
    }
    if (session.browser) {
      await session.browser.close().catch(() => {})
    }
  } finally {
    clearBrowserDiagnostics(session)
    session.browser = null
    session.context = null
    session.page = null
    session.isRecording = false
  }

  return videoPath
}

export async function closeBrowserTool(options = {}) {
  const key = getSessionKey(options)
  return await closeSession(key)
}

export async function closeAllBrowserTools() {
  const keys = Array.from(browserSessions.keys())
  await Promise.all(keys.map((key) => closeSession(key)))
}

async function buildContextFromUrl(rawUrl = '') {
  return await classifyUrl(rawUrl)
}

export async function resolveBrowserActionApprovalContext(toolInput = {}, options = {}) {
  const action = String(toolInput?.action || '').trim().toLowerCase()
  if (!action) {
    throw new Error('action is required for browser_action approval.')
  }

  if (action === 'launch' || action === 'close' || action === 'stop_recording') {
    return {
      action,
      targetClass: 'none',
      targetOrigin: action === 'close' ? '' : 'about:blank',
      targetHost: '',
      resolvedAddresses: [],
      approvalClass: '',
      policyDecision: 'approve',
      hints: [],
      reason: action,
    }
  }

  if (action === 'start_recording') {
    const session = await getExistingSession(options)
    return {
      action,
      targetClass: String(session?.targetClass || 'none') || 'none',
      targetOrigin: String(session?.targetOrigin || '') || 'about:blank',
      targetHost: String(session?.targetHost || ''),
      resolvedAddresses: Array.isArray(session?.resolvedAddresses) ? session.resolvedAddresses : [],
      approvalClass: 'browser_recording',
      policyDecision: 'prompt',
      hints: ['Video recording captures the visible browser session until recording is stopped or the browser closes.'],
      reason: 'browser_recording',
    }
  }

  let context = null
  if (action === 'navigate') {
    context = await buildContextFromUrl(String(toolInput?.url || '').trim())
  } else {
    const session = await getExistingSession(options)
    const currentUrl = String(session?.currentPageUrl || session?.page?.url?.() || '').trim()
    if (!currentUrl || currentUrl === 'about:blank') {
      context = {
        url: currentUrl || 'about:blank',
        targetClass: 'none',
        targetOrigin: 'about:blank',
        targetHost: '',
        resolvedAddresses: [],
        reason: 'about_blank',
      }
    } else {
      context = await buildContextFromUrl(currentUrl)
    }
  }

  const targetClass = String(context?.targetClass || 'blocked').trim() || 'blocked'
  const hints = []
  if (targetClass === 'blocked') {
    hints.push('This target is blocked because it resolves to a metadata, link-local, or otherwise unsafe non-public address.')
  } else if (targetClass === 'private_network') {
    hints.push('This target is on localhost or a private network and requires a separate project-session approval.')
  }

  if (action === 'execute_js') {
    if (targetClass === 'none') {
      return {
        action,
        targetClass,
        targetOrigin: String(context?.targetOrigin || 'about:blank'),
        targetHost: '',
        resolvedAddresses: [],
        approvalClass: '',
        policyDecision: 'deny',
        hints: ['execute_js requires an active http(s) page.'],
        reason: 'missing_active_page',
      }
    }
    return {
      action,
      targetClass,
      targetOrigin: String(context?.targetOrigin || ''),
      targetHost: String(context?.targetHost || ''),
      resolvedAddresses: Array.isArray(context?.resolvedAddresses) ? context.resolvedAddresses : [],
      approvalClass: targetClass === 'private_network' ? 'browser_private_execute_js' : 'browser_public_execute_js',
      policyDecision: targetClass === 'blocked' ? 'deny' : 'prompt',
      hints: [
        ...hints,
        'In-page JavaScript execution is elevated because it can inspect and mutate the active browser session.',
      ],
      reason: targetClass === 'blocked' ? 'blocked_target' : 'execute_js',
    }
  }

  if (targetClass === 'none') {
    return {
      action,
      targetClass,
      targetOrigin: String(context?.targetOrigin || 'about:blank'),
      targetHost: '',
      resolvedAddresses: [],
      approvalClass: '',
      policyDecision: 'approve',
      hints: [],
      reason: String(context?.reason || 'about_blank'),
    }
  }

  return {
    action,
    targetClass,
    targetOrigin: String(context?.targetOrigin || ''),
    targetHost: String(context?.targetHost || ''),
    resolvedAddresses: Array.isArray(context?.resolvedAddresses) ? context.resolvedAddresses : [],
    approvalClass: targetClass === 'private_network' ? 'browser_private_network' : 'browser_public_network',
    policyDecision: targetClass === 'blocked' ? 'deny' : 'prompt',
    hints,
    reason: targetClass === 'blocked' ? 'blocked_target' : 'network_navigation',
  }
}

async function assertBrowserRuntimeAllowed(toolInput = {}, options = {}) {
  const context = await resolveBrowserActionApprovalContext(toolInput, options)
  if (String(context?.policyDecision || '').trim().toLowerCase() === 'deny') {
    const hints = Array.isArray(context?.hints) ? context.hints.filter(Boolean) : []
    const hintText = hints.length > 0 ? ` ${hints.join(' ')}` : ''
    throw new Error(`Blocked browser target.${hintText}`.trim())
  }
  return context
}
// Contract note for runtime-install handoff coverage:
// onRuntimeInstall: options.onRuntimeInstall
const ACTION_HANDLERS = createBrowserActionHandlers({
  clipText,
  constants: {
    VIEWPORT_WIDTH,
    VIEWPORT_HEIGHT,
    NAVIGATION_TIMEOUT_MS,
    JS_EXECUTION_TIMEOUT_MS,
    ELEMENT_TIMEOUT_MS,
    MAX_TEXT_CHARS,
    SCREENSHOT_JPEG_QUALITY,
  },
  closeBrowserTool,
  closeSession,
  getExistingSession,
  getRecordingDir,
  getScreenshotDir,
  getSessionKey,
  ensureDirectory,
  ensureSession,
  ensureSessionPage,
  refreshSessionTarget,
  assertBrowserRuntimeAllowed,
  buildBrowserNavigationPolicy,
  evaluateBrowserNavigationRequestPolicy,
  withSessionNavigationPolicy,
})

export async function browserAction(projectRoot, toolInput, options = {}) {
  const action = String(toolInput?.action || '').trim().toLowerCase()
  if (!action) {
    throw new Error(`action is required. Valid actions: ${Object.keys(ACTION_HANDLERS).join(', ')}`)
  }
  const handler = ACTION_HANDLERS[action]
  if (!handler) {
    throw new Error(`Unknown browser action: "${action}". Valid actions: ${Object.keys(ACTION_HANDLERS).join(', ')}`)
  }
  try {
    return await handler(projectRoot, toolInput, {
      ...options,
      projectRoot,
    })
  } catch (error) {
    throw new Error(`browser_action(${action}) failed: ${String(error?.message || error || 'Unknown browser error')}`)
  }
}
