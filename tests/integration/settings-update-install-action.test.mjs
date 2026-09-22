import test from 'node:test'
import assert from 'node:assert/strict'

import { runConfirmedSettingsUpdateInstall } from '../../src/renderer/components/settings/settings-update-install-action.mjs'

test('Settings install action requires confirmation before invoking the updater', async () => {
  const calls = []
  const result = await runConfirmedSettingsUpdateInstall({
    title: 'Restart and Install',
    message: 'v0.1.2-alpha ready to install',
    confirm: async (request) => {
      calls.push(['confirm', request])
      return true
    },
    install: async () => {
      calls.push(['install'])
      return { ok: true }
    },
  })

  assert.deepEqual(result, { ok: true })
  assert.deepEqual(calls, [
    ['confirm', {
      title: 'Restart and Install',
      message: 'v0.1.2-alpha ready to install',
      confirmLabel: 'Restart and Install',
      tone: 'warning',
    }],
    ['install'],
  ])
})

test('Settings install action leaves the updater untouched when confirmation is cancelled', async () => {
  let installCalls = 0
  const result = await runConfirmedSettingsUpdateInstall({
    title: 'Restart and Install',
    message: 'Ready',
    confirm: async () => false,
    install: async () => { installCalls += 1 },
  })

  assert.deepEqual(result, { ok: false, code: 'cancelled' })
  assert.equal(installCalls, 0)
})
