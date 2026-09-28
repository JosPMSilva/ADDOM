import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createSecondInstanceNoticeDelivery,
  installSingleInstanceBehavior,
  installSingleInstanceGuard,
} from '../../src/main/single-instance-guard.mjs'

function createAppDouble({ lockAcquired = true } = {}) {
  const listeners = new Map()
  return {
    quitCalls: 0,
    requestSingleInstanceLock() {
      return lockAcquired
    },
    quit() {
      this.quitCalls += 1
    },
    on(eventName, listener) {
      listeners.set(eventName, listener)
    },
    emit(eventName, ...args) {
      listeners.get(eventName)?.(...args)
    },
    hasListener(eventName) {
      return listeners.has(eventName)
    },
  }
}

function createWindowDouble({ minimized = false } = {}) {
  return {
    webContents: {},
    restoreCalls: 0,
    showCalls: 0,
    focusCalls: 0,
    isDestroyed: () => false,
    isMinimized: () => minimized,
    restore() {
      this.restoreCalls += 1
    },
    show() {
      this.showCalls += 1
    },
    focus() {
      this.focusCalls += 1
    },
  }
}

test('secondary ADDOM process quits without registering another activation handler', () => {
  const app = createAppDouble({ lockAcquired: false })

  const acquired = installSingleInstanceGuard({ app })

  assert.equal(acquired, false)
  assert.equal(app.quitCalls, 1)
  assert.equal(app.hasListener('second-instance'), false)
})

test('second launch restores and focuses the primary ADDOM window', () => {
  const app = createAppDouble()
  const mainWindow = createWindowDouble({ minimized: true })
  const activations = []

  const acquired = installSingleInstanceGuard({
    app,
    getMainWindow: () => mainWindow,
    onSecondInstance: (activation) => activations.push(activation),
  })
  app.emit('second-instance')

  assert.equal(acquired, true)
  assert.equal(app.quitCalls, 0)
  assert.equal(mainWindow.restoreCalls, 1)
  assert.equal(mainWindow.showCalls, 1)
  assert.equal(mainWindow.focusCalls, 1)
  assert.deepEqual(activations, [{ focusedTarget: 'main' }])
})

test('second launch focuses the startup splash while the main window is unavailable', () => {
  const app = createAppDouble()
  const splashWindow = createWindowDouble()
  const activations = []

  installSingleInstanceGuard({
    app,
    getMainWindow: () => null,
    getStartupSplashWindow: () => splashWindow,
    onSecondInstance: (activation) => activations.push(activation),
  })
  app.emit('second-instance')

  assert.equal(splashWindow.restoreCalls, 0)
  assert.equal(splashWindow.showCalls, 1)
  assert.equal(splashWindow.focusCalls, 1)
  assert.deepEqual(activations, [{ focusedTarget: 'splash' }])
})

test('second-instance notice waits for renderer readiness and collapses repeated launches', () => {
  const deliveries = []
  const delivery = createSecondInstanceNoticeDelivery({
    deliver: () => deliveries.push('delivered'),
  })

  assert.equal(delivery.notify(), false)
  assert.equal(delivery.notify(), false)
  assert.deepEqual(deliveries, [])

  assert.equal(delivery.markRendererReady(), true)
  assert.deepEqual(deliveries, ['delivered'])
  assert.equal(delivery.flush(), false)
})

test('second-instance notice delivers immediately after renderer readiness', () => {
  const deliveries = []
  const delivery = createSecondInstanceNoticeDelivery({
    deliver: () => deliveries.push('delivered'),
  })

  assert.equal(delivery.markRendererReady(), false)
  assert.equal(delivery.notify(), true)
  assert.equal(delivery.notify(), true)
  assert.deepEqual(deliveries, ['delivered', 'delivered'])
})

test('second-instance notice waits for the replacement renderer after the main window is recreated', () => {
  const deliveries = []
  const delivery = createSecondInstanceNoticeDelivery({
    deliver: () => deliveries.push('delivered'),
  })

  delivery.markRendererReady()
  delivery.markRendererUnavailable()

  assert.equal(delivery.notify(), false)
  assert.deepEqual(deliveries, [])
  assert.equal(delivery.markRendererReady(), true)
  assert.deepEqual(deliveries, ['delivered'])
})

test('single-instance behavior combines focus and renderer-ready notice delivery', () => {
  const app = createAppDouble()
  const mainWindow = createWindowDouble()
  const deliveries = []
  const behavior = installSingleInstanceBehavior({
    app,
    getMainWindow: () => mainWindow,
    sendNotice: () => deliveries.push('delivered'),
  })

  app.emit('second-instance')
  assert.deepEqual(deliveries, [])
  assert.equal(behavior.markRendererReady(), true)
  assert.deepEqual(deliveries, ['delivered'])
  assert.equal(behavior.acquired, true)
})

test('packaged smoke behavior bypasses the desktop instance lock', () => {
  const app = createAppDouble({ lockAcquired: false })
  let lockRequests = 0
  app.requestSingleInstanceLock = () => {
    lockRequests += 1
    return false
  }

  const behavior = installSingleInstanceBehavior({ app, enabled: false })

  assert.equal(behavior.acquired, true)
  assert.equal(lockRequests, 0)
  assert.equal(app.quitCalls, 0)
  assert.equal(app.hasListener('second-instance'), false)
  assert.equal(behavior.markRendererUnavailable(), false)
})

test('second launch reopens ADDOM when the primary process only remains in the tray', () => {
  const app = createAppDouble()
  let openCalls = 0
  installSingleInstanceBehavior({
    app,
    getMainWindow: () => null,
    getStartupSplashWindow: () => null,
    openWindow: () => { openCalls += 1 },
  })

  app.emit('second-instance')

  assert.equal(openCalls, 1)
})
