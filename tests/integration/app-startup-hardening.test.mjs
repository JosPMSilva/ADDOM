import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

const startup = await import('../../src/main/app-startup-hardening.mjs').catch(() => ({}))

test('startup creates visible feedback before waiting for workspace reconciliation', async () => {
  assert.equal(typeof startup.prepareStartupWindows, 'function')
  const order = []
  let finishReconciliation
  const reconciliation = new Promise((resolve) => { finishReconciliation = resolve })

  const preparing = startup.prepareStartupWindows({
    createSplash: () => order.push('splash'),
    reconcileWorkspaceTurns: async () => {
      order.push('reconcile')
      await reconciliation
    },
    createMainWindow: () => order.push('main'),
  })

  await Promise.resolve()
  assert.deepEqual(order, ['splash', 'reconcile'])
  finishReconciliation()
  await preparing
  assert.deepEqual(order, ['splash', 'reconcile', 'main'])
})

test('startup continues to the main window when reconciliation fails', async () => {
  assert.equal(typeof startup.prepareStartupWindows, 'function')
  const warnings = []
  let mainWindows = 0

  await startup.prepareStartupWindows({
    createSplash: () => {},
    reconcileWorkspaceTurns: async () => { throw new Error('database unavailable') },
    createMainWindow: () => { mainWindows += 1 },
    warn: (message) => warnings.push(message),
  })

  assert.equal(mainWindows, 1)
  assert.match(warnings[0], /database unavailable/i)
})

test('renderer load recovery ignores subframes and aborted navigations, then offers one retry for a main-frame failure', async () => {
  assert.equal(typeof startup.installRendererLoadFailureRecovery, 'function')
  const webContents = new EventEmitter()
  const dialogResolvers = []
  let retries = 0
  let quits = 0
  const failures = []

  startup.installRendererLoadFailureRecovery({
    webContents,
    showFailureDialog: (failure) => {
      failures.push(failure)
      return new Promise((resolve) => dialogResolvers.push(resolve))
    },
    retryRenderer: () => { retries += 1 },
    quitApp: () => { quits += 1 },
  })

  webContents.emit('did-fail-load', {}, -105, 'NAME_NOT_RESOLVED', 'https://subframe.invalid', false)
  webContents.emit('did-fail-load', {}, -3, 'ERR_ABORTED', 'addom-app://renderer/index.html', true)
  webContents.emit('did-fail-load', {}, -2, 'FAILED', 'addom-app://renderer/index.html', true)
  webContents.emit('did-fail-load', {}, -2, 'FAILED AGAIN', 'addom-app://renderer/index.html', true)

  assert.equal(failures.length, 1)
  assert.equal(failures[0].errorCode, -2)
  dialogResolvers[0]({ response: 0 })
  await Promise.resolve()

  assert.equal(retries, 1)
  assert.equal(quits, 0)
})

test('renderer load recovery quits when the user declines a retry', async () => {
  assert.equal(typeof startup.installRendererLoadFailureRecovery, 'function')
  const webContents = new EventEmitter()
  let quits = 0

  startup.installRendererLoadFailureRecovery({
    webContents,
    showFailureDialog: async () => ({ response: 1 }),
    retryRenderer: () => {},
    quitApp: () => { quits += 1 },
  })

  webContents.emit('did-fail-load', {}, -2, 'FAILED', 'addom-app://renderer/index.html', true)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(quits, 1)
})
