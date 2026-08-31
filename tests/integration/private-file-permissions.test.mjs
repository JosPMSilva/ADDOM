import test from 'node:test'
import assert from 'node:assert/strict'

import { applyOwnerOnlyFilePermissions } from '../../src/main/utils/private-file-permissions.mjs'

test('applyOwnerOnlyFilePermissions uses chmod on unix-like platforms', () => {
  const calls = []
  const result = applyOwnerOnlyFilePermissions('/tmp/demo.txt', {
    platform: 'linux',
    chmodSyncImpl: (...args) => { calls.push(args) },
  })

  assert.equal(result, true)
  assert.deepEqual(calls, [['/tmp/demo.txt', 0o600]])
})

test('applyOwnerOnlyFilePermissions uses icacls on Windows', () => {
  const calls = []
  const result = applyOwnerOnlyFilePermissions('C:\\demo.txt', {
    platform: 'win32',
    username: 'demo-user',
    execFileSyncImpl: (...args) => { calls.push(args) },
  })

  assert.equal(result, true)
  assert.deepEqual(calls, [[
    'icacls',
    ['C:\\demo.txt', '/inheritance:r', '/grant:r', 'demo-user:(R,W)'],
    { stdio: 'ignore' },
  ]])
})

test('applyOwnerOnlyFilePermissions returns false for blank paths', () => {
  assert.equal(applyOwnerOnlyFilePermissions('   '), false)
})

test('applyOwnerOnlyFilePermissions swallows hardening errors', () => {
  const unixResult = applyOwnerOnlyFilePermissions('/tmp/demo.txt', {
    platform: 'linux',
    chmodSyncImpl: () => {
      throw new Error('chmod failed')
    },
  })
  assert.equal(unixResult, false)

  const windowsResult = applyOwnerOnlyFilePermissions('C:\\demo.txt', {
    platform: 'win32',
    username: 'demo-user',
    execFileSyncImpl: () => {
      throw new Error('icacls failed')
    },
  })
  assert.equal(windowsResult, false)
})
