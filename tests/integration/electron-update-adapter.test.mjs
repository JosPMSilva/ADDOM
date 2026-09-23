import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import {
  classifyUpdaterFailure,
  createElectronUpdateAdapter,
} from '../../src/main/updater/electron-update-adapter.mjs'

class FakeAutoUpdater extends EventEmitter {
  autoDownload = true
  autoInstallOnAppQuit = true
  allowPrerelease = false
  installArguments = null

  async checkForUpdates() {
    queueMicrotask(() => this.emit('update-available', { version: '2.0.0' }))
  }

  async downloadUpdate() {
    queueMicrotask(() => {
      this.emit('download-progress', { percent: 48.6 })
      this.emit('update-downloaded', { version: '2.0.0' })
    })
  }

  quitAndInstall(...args) {
    this.installArguments = args
  }
}

test('production adapter disables implicit downloading and install-on-quit', () => {
  const updater = new FakeAutoUpdater()
  createElectronUpdateAdapter(updater, { allowPrerelease: true })

  assert.equal(updater.autoDownload, false)
  assert.equal(updater.autoInstallOnAppQuit, false)
  assert.equal(updater.allowPrerelease, true)
})

test('production adapter resolves check and download events into controller results', async () => {
  const updater = new FakeAutoUpdater()
  const adapter = createElectronUpdateAdapter(updater)
  const progress = []

  assert.deepEqual(await adapter.checkForUpdates(), { available: true, version: '2.0.0' })
  assert.deepEqual(
    await adapter.downloadUpdate({ onProgress: (percent) => progress.push(percent) }),
    { version: '2.0.0' },
  )
  assert.deepEqual(progress, [49])
  assert.equal(updater.listenerCount('update-available'), 0)
  assert.equal(updater.listenerCount('download-progress'), 0)
})

test('production adapter treats update-not-available as a completed check', async () => {
  const updater = new FakeAutoUpdater()
  updater.checkForUpdates = async () => {
    queueMicrotask(() => updater.emit('update-not-available', { version: '1.0.0' }))
  }
  const adapter = createElectronUpdateAdapter(updater)

  assert.deepEqual(await adapter.checkForUpdates(), { available: false })
})

test('production installation is explicit, silent, and forces one post-update restart', async () => {
  const updater = new FakeAutoUpdater()
  const adapter = createElectronUpdateAdapter(updater)

  assert.deepEqual(await adapter.installUpdate(), { ok: true, simulated: false })
  assert.deepEqual(updater.installArguments, [true, true])
})

test('updater failures are reduced to stable public error codes', () => {
  assert.equal(classifyUpdaterFailure({ statusCode: 404 }), 'unavailable')
  assert.equal(classifyUpdaterFailure({ code: 'ENOTFOUND' }), 'network')
  assert.equal(classifyUpdaterFailure({ message: 'private response body' }), 'generic')
})
