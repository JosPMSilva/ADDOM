import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { normalizeUpdateInstallPreflight } = require('../../src/preload/preload-normalizers.cjs')
const { createUpdaterApi } = require('../../src/preload/preload-misc-apis.cjs')

test('updater preload sends only a valid dirty-editor preflight', async () => {
  const calls = []
  const updater = createUpdaterApi({
    invokeVersioned: async (...args) => { calls.push(args); return { ok: true } },
    subVersioned: () => () => {},
    normalizeUpdateInstallPreflight,
  })

  await updater.installUpdate({ dirtyTabCount: 3, capturedAt: 9_000, privatePath: 'C:\\private' })
  await updater.refreshInstallReadiness({ dirtyTabCount: 1, capturedAt: 9_100, privatePath: 'C:\\private' })

  assert.deepEqual(calls, [
    ['updater:installUpdate', { dirtyTabCount: 3, capturedAt: 9_000 }],
    ['updater:refreshInstallReadiness', { dirtyTabCount: 1, capturedAt: 9_100 }],
  ])
})

test('updater preload preserves invalid preflight as null so main fails closed', async () => {
  const calls = []
  const updater = createUpdaterApi({
    invokeVersioned: async (...args) => { calls.push(args); return { ok: true } },
    subVersioned: () => () => {},
    normalizeUpdateInstallPreflight,
  })

  await updater.installUpdate({ dirtyTabCount: -1, capturedAt: 9_000 })
  await updater.installUpdate()

  assert.deepEqual(calls, [
    ['updater:installUpdate', null],
    ['updater:installUpdate', null],
  ])
})
