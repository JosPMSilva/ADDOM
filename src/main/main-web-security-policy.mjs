import { validateExternalHttpUrl } from './utils/shell-open-guards.mjs'

const DEFAULT_DEV_RENDERER_URL = 'http://localhost:5173'
const DEFAULT_RENDERER_SCHEME = 'addom-app'
const DEFAULT_RENDERER_HOST = 'renderer'

export function isAllowedMainFrameNavigation(rawUrl = '', {
  isDev = false,
  devRendererUrl = DEFAULT_DEV_RENDERER_URL,
  rendererScheme = DEFAULT_RENDERER_SCHEME,
  rendererHost = DEFAULT_RENDERER_HOST,
} = {}) {
  try {
    const target = new URL(String(rawUrl || ''))
    if (target.username || target.password) return false

    if (isDev) {
      const expected = new URL(devRendererUrl)
      return target.protocol === expected.protocol
        && target.hostname === expected.hostname
        && target.port === expected.port
    }

    return target.protocol === `${String(rendererScheme || '').toLowerCase()}:`
      && target.hostname.toLowerCase() === String(rendererHost || '').toLowerCase()
      && !target.port
  } catch {
    return false
  }
}

export function installDenyAllWebPermissions(targetSession) {
  if (
    !targetSession
    || typeof targetSession.setPermissionCheckHandler !== 'function'
    || typeof targetSession.setPermissionRequestHandler !== 'function'
  ) {
    throw new TypeError('A web session with permission handlers is required.')
  }

  // Renderer capabilities use explicit preload IPC; Chromium web permissions fail closed.
  targetSession.setPermissionCheckHandler(() => false)
  targetSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
}

export function installMainWindowWebGuards(webContents, {
  isDev = false,
  openExternal,
} = {}) {
  if (
    !webContents
    || typeof webContents.on !== 'function'
    || typeof webContents.setWindowOpenHandler !== 'function'
    || typeof openExternal !== 'function'
  ) {
    throw new TypeError('Window web contents and an external opener are required.')
  }

  webContents.on('will-navigate', (event, url) => {
    if (isAllowedMainFrameNavigation(url, { isDev })) return
    event.preventDefault()
  })

  webContents.setWindowOpenHandler(({ url }) => {
    const validation = validateExternalHttpUrl(url)
    if (validation.ok) void openExternal(validation.url)
    return { action: 'deny' }
  })
}
