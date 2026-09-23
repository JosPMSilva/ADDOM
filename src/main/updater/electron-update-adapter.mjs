const UNAVAILABLE_HTTP_STATUS_CODES = new Set([401, 403, 404])
const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETDOWN',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ERR_INTERNET_DISCONNECTED',
  'ERR_NETWORK',
])

function readUpdaterHttpStatus(error) {
  const candidates = [error?.statusCode, error?.status, error?.response?.statusCode, error?.response?.status]
  for (const value of candidates) {
    const status = Number(value)
    if (Number.isInteger(status) && status >= 100 && status <= 599) return status
  }
  const message = String(error?.message || '')
  const match = message.match(/(?:status(?:Code)?["']?\s*[:=]\s*|\bHTTP\s+)(\d{3})\b/i)
    || message.match(/^\s*(\d{3})\b/)
  return match ? Number(match[1]) : null
}

export function classifyUpdaterFailure(error) {
  const errorCode = String(error?.code || '').trim().toUpperCase()
  const statusCode = readUpdaterHttpStatus(error)
  if (UNAVAILABLE_HTTP_STATUS_CODES.has(statusCode)
    || errorCode === 'ERR_UPDATER_NO_PUBLISHED_VERSIONS'
    || errorCode === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND') {
    return 'unavailable'
  }
  if (NETWORK_ERROR_CODES.has(errorCode)) return 'network'
  return 'generic'
}

export function createElectronUpdateAdapter(autoUpdater, { allowPrerelease = false } = {}) {
  const activeCleanups = new Set()
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = allowPrerelease === true

  function registerOperation(executor) {
    return new Promise((resolve, reject) => {
      let settled = false
      const cleanups = []
      const cleanup = () => {
        for (const remove of cleanups.splice(0)) remove()
        activeCleanups.delete(cleanup)
      }
      const settle = (callback, value) => {
        if (settled) return
        settled = true
        cleanup()
        callback(value)
      }
      const listen = (eventName, listener) => {
        autoUpdater.on(eventName, listener)
        cleanups.push(() => autoUpdater.removeListener(eventName, listener))
      }
      activeCleanups.add(cleanup)
      executor({
        listen,
        resolve: (value) => settle(resolve, value),
        reject: (error) => settle(reject, error),
      })
    })
  }

  return {
    simulation: false,
    classifyError: classifyUpdaterFailure,
    checkForUpdates() {
      return registerOperation(({ listen, resolve, reject }) => {
        listen('update-available', (info) => resolve({ available: true, version: String(info?.version || '') }))
        listen('update-not-available', () => resolve({ available: false }))
        listen('error', reject)
        Promise.resolve(autoUpdater.checkForUpdates()).catch(reject)
      })
    },
    downloadUpdate({ onProgress } = {}) {
      return registerOperation(({ listen, resolve, reject }) => {
        listen('download-progress', (progress) => onProgress?.(Math.round(Number(progress?.percent) || 0)))
        listen('update-downloaded', (info) => resolve({ version: String(info?.version || '') }))
        listen('error', reject)
        Promise.resolve(autoUpdater.downloadUpdate()).catch(reject)
      })
    },
    async installUpdate() {
      autoUpdater.quitAndInstall(true, true)
      return { ok: true, simulated: false }
    },
    dispose() {
      for (const cleanup of [...activeCleanups]) cleanup()
    },
  }
}
