import test from 'node:test'
import assert from 'node:assert/strict'

import { savePermissionModeSelection } from '../../src/renderer/components/permission-mode-persistence.mjs'

test('savePermissionModeSelection persists the requested mode and returns the saved value', async () => {
  const calls = []
  const result = await savePermissionModeSelection({
    nextMode: 'autonomy',
    currentPermissionMode: 'ask',
    settingsApi: {
      async set(patch) {
        calls.push(patch)
        return { permissionMode: 'autonomy' }
      },
    },
  })

  assert.deepEqual(calls, [{ permissionMode: 'autonomy' }])
  assert.equal(result.status, 'saved')
  assert.equal(result.permissionMode, 'autonomy')
  assert.equal(result.error, null)
})

test('savePermissionModeSelection restores the last persisted mode after a save failure', async () => {
  const result = await savePermissionModeSelection({
    nextMode: 'autonomy',
    currentPermissionMode: 'ask',
    settingsApi: {
      async set() {
        throw new Error('disk full')
      },
      async get() {
        return { permissionMode: 'ask' }
      },
    },
  })

  assert.equal(result.status, 'failed')
  assert.equal(result.permissionMode, 'ask')
  assert.match(String(result.error?.message || ''), /disk full/i)
})

test('savePermissionModeSelection reports unchanged when the requested mode already matches', async () => {
  const result = await savePermissionModeSelection({
    nextMode: 'ask',
    currentPermissionMode: 'ask',
    settingsApi: null,
  })

  assert.equal(result.status, 'unchanged')
  assert.equal(result.permissionMode, 'ask')
  assert.equal(result.error, null)
})

test('savePermissionModeSelection normalizes legacy full_permissions alias to full_access', async () => {
  const calls = []
  const result = await savePermissionModeSelection({
    nextMode: 'full_permissions',
    currentPermissionMode: 'ask',
    settingsApi: {
      async set(patch) {
        calls.push(patch)
        return { permissionMode: 'full_access' }
      },
    },
  })

  assert.deepEqual(calls, [{ permissionMode: 'full_access' }])
  assert.equal(result.status, 'saved')
  assert.equal(result.permissionMode, 'full_access')
  assert.equal(result.error, null)
})
