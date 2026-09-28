const ABORTED_NAVIGATION_ERROR_CODE = -3

export async function prepareStartupWindows({
  createSplash = () => {},
  reconcileWorkspaceTurns = async () => {},
  createMainWindow = () => {},
  warn = (message) => console.warn(message),
} = {}) {
  try {
    createSplash()
  } catch (error) {
    warn(`[startup] failed to create splash window: ${String(error?.message || error || 'unknown error')}`)
  }
  try {
    await reconcileWorkspaceTurns()
  } catch (error) {
    warn(`[workspace] failed to reconcile interrupted turns: ${String(error?.message || error || 'recovery_failed')}`)
  }
  return createMainWindow()
}

export function installRendererLoadFailureRecovery({
  webContents,
  showFailureDialog = async () => ({ response: 1 }),
  retryRenderer = () => {},
  quitApp = () => {},
  logFailure = () => {},
} = {}) {
  if (!webContents || typeof webContents.on !== 'function') {
    throw new TypeError('Renderer web contents are required.')
  }
  let handlingFailure = false
  const handleFailure = (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame === false || Number(errorCode) === ABORTED_NAVIGATION_ERROR_CODE || handlingFailure) return
    handlingFailure = true
    const failure = {
      errorCode: Number(errorCode || 0),
      errorDescription: String(errorDescription || 'Renderer failed to load.'),
      validatedURL: String(validatedURL || ''),
    }
    logFailure(failure)
    void Promise.resolve(showFailureDialog(failure))
      .then((result) => {
        handlingFailure = false
        if (Number(result?.response) === 0) {
          retryRenderer()
          return
        }
        quitApp()
      })
      .catch(() => {
        handlingFailure = false
        quitApp()
      })
  }
  webContents.on('did-fail-load', handleFailure)
  return () => webContents.removeListener?.('did-fail-load', handleFailure)
}
