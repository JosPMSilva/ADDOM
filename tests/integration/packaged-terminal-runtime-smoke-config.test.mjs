import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import {
  isPackagedTerminalSmokeEnabled,
  resolvePackagedTerminalSmokeArgs,
  resolvePackagedTerminalSmokeExecutablePath,
  resolvePackagedTerminalSmokeTimeoutMs,
} from '../../tests/live/packaged-terminal-runtime-smoke-helpers.mjs'

test('packaged terminal runtime smoke helpers stay opt-in by default', () => {
  assert.equal(isPackagedTerminalSmokeEnabled({}), false)
  assert.equal(resolvePackagedTerminalSmokeTimeoutMs({}), 180_000)
})

test('packaged terminal runtime smoke helpers resolve unpacked executable paths through the shared packaged app lane', () => {
  const cwd = process.cwd()

  assert.equal(
    resolvePackagedTerminalSmokeExecutablePath({ cwd, platform: 'win32', env: {} }),
    path.join(cwd, 'dist-electron', 'win-unpacked', 'ADDOM.exe'),
  )
  assert.deepEqual(
    resolvePackagedTerminalSmokeArgs({ env: {}, platform: 'linux' }),
    [],
  )
})

test('packaged terminal runtime smoke helpers honor explicit enable and timeout overrides', () => {
  const cwd = process.cwd()
  const env = {
    ADDOM_PACKAGED_TERMINAL_SMOKE: '1',
    ADDOM_PACKAGED_TERMINAL_SMOKE_TIMEOUT_MS: '45000',
  }

  assert.equal(isPackagedTerminalSmokeEnabled(env), true)
  assert.equal(resolvePackagedTerminalSmokeTimeoutMs(env), 45_000)
  assert.equal(
    resolvePackagedTerminalSmokeExecutablePath({ cwd, platform: 'win32', env }),
    path.join(cwd, 'dist-electron', 'win-unpacked', 'ADDOM.exe'),
  )
})
