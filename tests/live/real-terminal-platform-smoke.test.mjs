import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isRealTerminalPlatformSmokeEnabled,
  runRealTerminalPlatformSmoke,
} from './real-terminal-platform-smoke-helpers.mjs'

test('opt-in real terminal platform smoke suite', { timeout: 120_000 }, async (t) => {
  if (!isRealTerminalPlatformSmokeEnabled(process.env)) {
    await t.test('real terminal platform smoke disabled', { skip: true }, () => {})
    return
  }

  const result = await runRealTerminalPlatformSmoke({
    env: process.env,
    cwd: process.cwd(),
    platform: process.platform,
  })

  t.diagnostic(`real_terminal_platform_smoke_result:\n${JSON.stringify(result, null, 2)}`)

  assert.equal(result.runtimeHealth?.status, 'supported', JSON.stringify(result.runtimeHealth, null, 2))
  assert.equal(result.redraw?.status, 'passed', JSON.stringify(result.redraw, null, 2))
  assert.equal(result.tui?.status, 'passed', JSON.stringify(result.tui, null, 2))
  assert.equal(result.internationalInput?.status, 'passed', JSON.stringify(result.internationalInput, null, 2))
  assert.equal(result.ok, true, JSON.stringify(result, null, 2))
})
