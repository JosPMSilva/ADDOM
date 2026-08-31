function waitWithTimeout(promise, timeoutMs) {
  const boundedMs = Math.max(1, Number(timeoutMs) || 1)
  let timer = null
  return Promise.race([
    Promise.resolve(promise),
    new Promise((resolve) => {
      timer = setTimeout(resolve, boundedMs)
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export function createAppQuitCoordinator({
  app,
  prepareRuntime = async () => {},
  closeResources = async () => {},
  timeoutMs = 7000,
} = {}) {
  if (!app || typeof app.quit !== 'function') {
    throw new Error('An Electron app with quit() is required.')
  }

  let preparationPromise = null
  let readyToExit = false
  let quitRequested = false

  const prepareForExit = () => {
    if (preparationPromise) return preparationPromise
    preparationPromise = (async () => {
      let preparationError = null
      try {
        await waitWithTimeout(Promise.resolve().then(() => prepareRuntime()), timeoutMs)
      } catch (error) {
        preparationError = error
      }

      try {
        await closeResources()
      } finally {
        readyToExit = true
      }

      if (preparationError) throw preparationError
    })()
    return preparationPromise
  }

  const handleBeforeQuit = (event) => {
    if (readyToExit) return
    event?.preventDefault?.()
    if (quitRequested) return
    quitRequested = true
    prepareForExit()
      .catch(() => {})
      .finally(() => app.quit())
  }

  return {
    handleBeforeQuit,
    prepareForExit,
    isReadyToExit: () => readyToExit,
  }
}
