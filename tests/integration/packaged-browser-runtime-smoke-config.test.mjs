import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  isPackagedBrowserSmokeEnabled,
  resolvePackagedBrowserSmokeArgs,
  resolvePackagedBrowserSmokeExecutablePath,
  resolvePackagedBrowserSmokeTimeoutMs,
  shouldDisablePackagedBrowserSmokeSandbox,
} from '../../tests/live/packaged-browser-runtime-smoke-helpers.mjs'

test('packaged browser runtime smoke helpers stay opt-in by default', () => {
  assert.equal(isPackagedBrowserSmokeEnabled({}), false)
  assert.equal(resolvePackagedBrowserSmokeTimeoutMs({}), 180_000)
  assert.equal(shouldDisablePackagedBrowserSmokeSandbox({ env: {}, platform: 'linux' }), false)
  assert.deepEqual(resolvePackagedBrowserSmokeArgs({ env: {}, platform: 'linux' }), [])
})

test('packaged browser runtime smoke helpers resolve host-specific unpacked executable paths', () => {
  const cwd = process.cwd()
  const packageJson = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'))

  assert.equal(
    resolvePackagedBrowserSmokeExecutablePath({ cwd, platform: 'win32', env: {} }),
    path.join(cwd, 'dist-electron', 'win-unpacked', 'ADDOM.exe'),
  )
  assert.equal(
    resolvePackagedBrowserSmokeExecutablePath({ cwd, platform: 'darwin', env: {} }),
    path.join(cwd, 'dist-electron', 'ADDOM.app', 'Contents', 'MacOS', 'ADDOM'),
  )
  assert.equal(
    resolvePackagedBrowserSmokeExecutablePath({ cwd, platform: 'linux', env: {} }),
    path.join(cwd, 'dist-electron', 'linux-unpacked', String(packageJson.name || 'addom')),
  )
})

test('packaged browser runtime smoke helpers honor explicit executable and timeout overrides', () => {
  const cwd = process.cwd()
  const env = {
    ADDOM_PACKAGED_BROWSER_SMOKE: '1',
    ADDOM_PACKAGED_BROWSER_SMOKE_EXECUTABLE: 'custom\\ADDOM.exe',
    ADDOM_PACKAGED_BROWSER_SMOKE_TIMEOUT_MS: '45000',
  }

  assert.equal(isPackagedBrowserSmokeEnabled(env), true)
  assert.equal(resolvePackagedBrowserSmokeTimeoutMs(env), 45_000)
  assert.equal(
    resolvePackagedBrowserSmokeExecutablePath({ cwd, platform: 'win32', env }),
    path.resolve(cwd, 'custom\\ADDOM.exe'),
  )
})

test('packaged browser runtime smoke helpers disable the Linux sandbox only for CI or explicit overrides', () => {
  assert.equal(
    shouldDisablePackagedBrowserSmokeSandbox({ env: { CI: 'true' }, platform: 'linux' }),
    true,
  )
  assert.deepEqual(
    resolvePackagedBrowserSmokeArgs({ env: { CI: 'true' }, platform: 'linux' }),
    ['--no-sandbox'],
  )
  assert.equal(
    shouldDisablePackagedBrowserSmokeSandbox({ env: { ADDOM_PACKAGED_BROWSER_SMOKE_NO_SANDBOX: '1' }, platform: 'linux' }),
    true,
  )
  assert.deepEqual(
    resolvePackagedBrowserSmokeArgs({ env: { ADDOM_PACKAGED_BROWSER_SMOKE_NO_SANDBOX: '1' }, platform: 'linux' }),
    ['--no-sandbox'],
  )
  assert.equal(
    shouldDisablePackagedBrowserSmokeSandbox({ env: { CI: 'true' }, platform: 'darwin' }),
    false,
  )
})
