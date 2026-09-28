function focusWindow(windowRef = null) {
  if (!windowRef || windowRef?.isDestroyed?.()) return false
  if (windowRef?.isMinimized?.()) windowRef.restore?.()
  windowRef.show?.()
  windowRef.focus?.()
  return true
}

export function installSingleInstanceGuard({
  app,
  getMainWindow = () => null,
  getStartupSplashWindow = () => null,
  onSecondInstance = () => {},
} = {}) {
  if (!app || typeof app.requestSingleInstanceLock !== 'function') {
    throw new TypeError('Electron app with single-instance support is required.')
  }

  const acquired = app.requestSingleInstanceLock()
  if (!acquired) {
    app.quit?.()
    return false
  }

  app.on?.('second-instance', () => {
    let focusedTarget = 'none'
    if (focusWindow(getMainWindow?.())) {
      focusedTarget = 'main'
    } else if (focusWindow(getStartupSplashWindow?.())) {
      focusedTarget = 'splash'
    }
    onSecondInstance?.({ focusedTarget })
  })
  return true
}

export function createSecondInstanceNoticeDelivery({ deliver = () => true } = {}) {
  let rendererReady = false
  let pending = false

  const flush = () => {
    if (!rendererReady || !pending) return false
    if (deliver?.() === false) return false
    pending = false
    return true
  }

  return {
    flush,
    markRendererReady() {
      rendererReady = true
      return flush()
    },
    markRendererUnavailable() {
      rendererReady = false
      return false
    },
    notify() {
      pending = true
      return flush()
    },
  }
}

export function installSingleInstanceBehavior({
  app,
  enabled = true,
  getMainWindow = () => null,
  getStartupSplashWindow = () => null,
  sendNotice = () => {},
  openWindow = () => {},
} = {}) {
  if (!enabled) {
    return {
      acquired: true,
      markRendererReady: () => false,
      markRendererUnavailable: () => false,
    }
  }
  const noticeDelivery = createSecondInstanceNoticeDelivery({
    deliver: () => {
      const windowRef = getMainWindow?.()
      if (!windowRef || windowRef.isDestroyed?.() || windowRef.webContents?.isDestroyed?.()) {
        return false
      }
      sendNotice(windowRef.webContents)
      return true
    },
  })
  const acquired = installSingleInstanceGuard({
    app,
    getMainWindow,
    getStartupSplashWindow,
    onSecondInstance: ({ focusedTarget }) => {
      if (focusedTarget === 'none') openWindow()
      noticeDelivery.notify()
    },
  })
  return {
    acquired,
    markRendererReady: noticeDelivery.markRendererReady,
    markRendererUnavailable: noticeDelivery.markRendererUnavailable,
  }
}
