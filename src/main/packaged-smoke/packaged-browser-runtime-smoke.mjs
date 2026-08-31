import fs from 'node:fs/promises'
import path from 'node:path'
import { browserAction, closeBrowserTool } from '../tools/browser-tool.mjs'
import {
  getUserDataPlaywrightBrowserRoot,
  resolveBundledChromiumExecutablePath,
} from '../tools/browser-runtime-paths.mjs'

const SMOKE_THREAD_ID = 'packaged-browser-runtime-smoke'

function normalizeTimeoutMs(value, fallback = 180_000) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback
  return Math.max(10_000, Math.round(numeric))
}

async function pathExists(targetPath = '') {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function countChromiumRuntimeDirs(rootDir = '') {
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory() && /^chromium-\d+/i.test(entry.name)).length
  } catch {
    return 0
  }
}

async function waitForMainWindowLoad(mainWindow, timeoutMs) {
  if (!mainWindow?.webContents) {
    throw new Error('Main window was not created for packaged smoke.')
  }
  if (!mainWindow.webContents.isLoadingMainFrame()) return

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for the packaged window to finish loading after ${timeoutMs}ms.`))
    }, timeoutMs)
    const cleanup = () => {
      clearTimeout(timer)
      mainWindow.webContents.removeListener('did-finish-load', handleLoad)
      mainWindow.webContents.removeListener('did-fail-load', handleFailure)
    }
    const handleLoad = () => {
      cleanup()
      resolve()
    }
    const handleFailure = (_event, errorCode, errorDescription) => {
      cleanup()
      reject(new Error(`Packaged window failed to load (${errorCode}): ${String(errorDescription || 'unknown load failure')}`))
    }
    mainWindow.webContents.once('did-finish-load', handleLoad)
    mainWindow.webContents.once('did-fail-load', handleFailure)
  })
}

async function evaluatePreloadBridge(mainWindow) {
  return await mainWindow.webContents.executeJavaScript(`
    (async () => {
      try {
        const hasAddom = typeof window.addom === 'object' && window.addom !== null
        const hasLocalData = typeof window.addom?.localData?.getSummary === 'function'
        const summary = hasLocalData ? await window.addom.localData.getSummary() : null
        return {
          hasAddom,
          hasLocalData,
          ipcVersion: String(window.addom?._ipcVersion || ''),
          summary,
        }
      } catch (error) {
        return {
          hasAddom: false,
          hasLocalData: false,
          ipcVersion: '',
          summary: null,
          error: String(error?.message || error || 'preload_eval_failed'),
        }
      }
    })()
  `, true)
}

async function evaluateRendererStyles(mainWindow) {
  return await mainWindow.webContents.executeJavaScript(`
    (() => {
      try {
        const root = document.getElementById('root')
        const firstContainer = root?.firstElementChild || null
        const bodyStyle = window.getComputedStyle(document.body)
        const stylesheets = Array.from(document.styleSheets || []).map((sheet) => {
          let cssRuleCount = -1
          try {
            cssRuleCount = Number(sheet?.cssRules?.length || 0)
          } catch {
            cssRuleCount = -1
          }
          return {
            href: String(sheet?.href || ''),
            cssRuleCount,
          }
        })
        return {
          locationHref: String(window.location.href || ''),
          stylesheetCount: stylesheets.length,
          stylesheets,
          bodyBackgroundColor: String(bodyStyle.backgroundColor || ''),
          bodyColor: String(bodyStyle.color || ''),
          bodyFontFamily: String(bodyStyle.fontFamily || ''),
          rootChildCount: Number(root?.childElementCount || 0),
          firstContainerDisplay: firstContainer ? String(window.getComputedStyle(firstContainer).display || '') : '',
        }
      } catch (error) {
        return {
          locationHref: '',
          stylesheetCount: 0,
          stylesheets: [],
          bodyBackgroundColor: '',
          bodyColor: '',
          bodyFontFamily: '',
          rootChildCount: 0,
          firstContainerDisplay: '',
          error: String(error?.message || error || 'renderer_style_eval_failed'),
        }
      }
    })()
  `, true)
}

async function runBrowserLaunchCycle(projectRoot = '') {
  const installEvents = []
  await browserAction(projectRoot, {
    action: 'launch',
    headless: true,
  }, {
    threadId: SMOKE_THREAD_ID,
    allowSystemBrowserFallback: false,
    onRuntimeInstall: (runtime = {}) => {
      installEvents.push({
        installed: runtime?.installed === true,
        executablePath: String(runtime?.executablePath || '').trim(),
      })
    },
  })
  await closeBrowserTool({ threadId: SMOKE_THREAD_ID })
  return {
    installEvents,
    installed: installEvents.some((entry) => entry.installed === true),
  }
}

async function writeSmokeResult(resultPath = '', payload = {}) {
  const targetPath = String(resultPath || '').trim()
  if (!targetPath) return
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

export async function runPackagedBrowserRuntimeSmoke({
  app,
  mainWindow,
  resultPath = '',
  timeoutMs = process.env.ADDOM_PACKAGED_BROWSER_SMOKE_TIMEOUT_MS,
} = {}) {
  const effectiveTimeoutMs = normalizeTimeoutMs(timeoutMs)
  const userDataPath = String(app?.getPath?.('userData') || '').trim()
  const browserRoot = getUserDataPlaywrightBrowserRoot({ userDataPath })
  const smokeProjectRoot = path.join(userDataPath, 'packaged-browser-runtime-smoke-project')
  const result = {
    ok: false,
    startedAt: new Date().toISOString(),
    userDataPath,
    browserRoot,
    smokeProjectRoot,
    browserRootPresentBefore: await pathExists(browserRoot),
    browserRuntimeDirCountBefore: await countChromiumRuntimeDirs(browserRoot),
  }

  try {
    await fs.mkdir(smokeProjectRoot, { recursive: true })
    await waitForMainWindowLoad(mainWindow, effectiveTimeoutMs)
    result.preload = await evaluatePreloadBridge(mainWindow)
    result.renderer = await evaluateRendererStyles(mainWindow)

    const firstLaunch = await runBrowserLaunchCycle(smokeProjectRoot)
    const secondLaunch = await runBrowserLaunchCycle(smokeProjectRoot)
    const executablePath = await resolveBundledChromiumExecutablePath({
      userDataPath,
      projectRoot: smokeProjectRoot,
      platform: process.platform,
    })

    result.firstLaunch = firstLaunch
    result.secondLaunch = secondLaunch
    result.browserRootPresentAfter = await pathExists(browserRoot)
    result.browserRuntimeDirCountAfter = await countChromiumRuntimeDirs(browserRoot)
    result.cachedExecutablePath = executablePath

    const preloadReady = result.preload?.hasAddom === true && result.preload?.hasLocalData === true
    const localDataMatches = String(result.preload?.summary?.userDataPath || '').trim() === userDataPath
    const rendererLoadedViaAppScheme = String(result.renderer?.locationHref || '').startsWith('addom-app://renderer/')
    const rendererStylesheetReady = Array.isArray(result.renderer?.stylesheets)
      && result.renderer.stylesheets.some((entry) => Number(entry?.cssRuleCount || 0) > 0)
    const rendererMounted = Number(result.renderer?.rootChildCount || 0) > 0
    const firstInstalled = firstLaunch.installed === true
    const secondReusedCache = secondLaunch.installEvents.length === 0
    const executablePresent = !!String(executablePath || '').trim()

    if (!preloadReady) throw new Error('Packaged smoke did not observe a usable preload bridge.')
    if (!localDataMatches) throw new Error('Packaged smoke preload summary did not resolve the expected user-data path.')
    if (!rendererLoadedViaAppScheme) throw new Error('Packaged smoke did not load the renderer through the addom-app protocol.')
    if (!rendererStylesheetReady) throw new Error('Packaged smoke did not observe a loaded renderer stylesheet.')
    if (!rendererMounted) throw new Error('Packaged smoke did not observe a mounted renderer root.')
    if (!firstInstalled) throw new Error('Packaged smoke did not observe a first-use Chromium install into user data.')
    if (!secondReusedCache) throw new Error('Packaged smoke did not reuse the cached Chromium runtime on the second launch.')
    if (!executablePresent) throw new Error('Packaged smoke did not resolve an installed Chromium executable after launch.')

    result.ok = true
  } catch (error) {
    result.error = String(error?.message || error || 'packaged_browser_runtime_smoke_failed')
  } finally {
    result.finishedAt = new Date().toISOString()
    await closeBrowserTool({ threadId: SMOKE_THREAD_ID }).catch(() => {})
    await writeSmokeResult(resultPath, result)
  }

  return result
}
