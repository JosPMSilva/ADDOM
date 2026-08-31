import test from 'node:test'
import assert from 'node:assert/strict'

import {
  cleanupPackagedTerminalSmokeRun,
  isPackagedTerminalSmokeEnabled,
  runPackagedTerminalRuntimeSmoke,
} from './packaged-terminal-runtime-smoke-helpers.mjs'

test('opt-in packaged terminal runtime smoke suite', async (t) => {
  if (!isPackagedTerminalSmokeEnabled(process.env)) {
    await t.test('packaged terminal runtime smoke disabled', { skip: true }, () => {})
    return
  }

  let run = null
  try {
    run = await runPackagedTerminalRuntimeSmoke({ env: process.env })
    t.diagnostic(`packaged_terminal_smoke_executable: ${run.executablePath}`)
    if (run.stdout) t.diagnostic(`packaged_terminal_smoke_stdout:\n${run.stdout}`)
    if (run.stderr) t.diagnostic(`packaged_terminal_smoke_stderr:\n${run.stderr}`)

    assert.equal(run.exitCode, 0, run.stderr || run.stdout)
    assert.equal(run.result?.ok, true, JSON.stringify(run.result, null, 2))
    assert.equal(run.result?.preload?.hasAddom, true)
    assert.equal(run.result?.preload?.hasTerminalApi, true)
    assert.equal(run.result?.preload?.runtimeHealth?.status, 'supported', JSON.stringify(run.result, null, 2))
    assert.equal(Boolean(String(run.result?.preload?.runtimeHealth?.dependency?.version || '').trim()), true)
    assert.equal(run.result?.preload?.runtimeHealth?.rollout?.policy, 'windows_only')
    assert.equal(run.result?.preload?.runtimeHealth?.rollout?.status, 'enabled')
    assert.equal(run.result?.preload?.runtimeHealth?.rollout?.platformEnabled, true)
    assert.deepEqual(run.result?.preload?.runtimeHealth?.rollout?.allowedPlatforms, ['win32'])
    assert.equal(Boolean(String(run.result?.preload?.sessionSmoke?.echo?.sessionId || '').trim()), true)
    assert.match(String(run.result?.preload?.sessionSmoke?.echo?.outputTail || ''), /ADDOM_PACKAGED_TERMINAL_OK/)
    assert.equal(Boolean(String(run.result?.preload?.sessionSmoke?.redraw?.sessionId || '').trim()), true)
    assert.match(String(run.result?.preload?.sessionSmoke?.redraw?.outputTail || ''), /ADDOM_PACKAGED_REDRAW_OK/)
    assert.equal(Boolean(String(run.result?.preload?.sessionSmoke?.tui?.sessionId || '').trim()), true)
    assert.match(String(run.result?.preload?.sessionSmoke?.tui?.outputTail || ''), /ADDOM_TUI_READY/)
    assert.match(String(run.result?.preload?.sessionSmoke?.tui?.outputTail || ''), /ADDOM_TUI_EXIT/)
  } finally {
    await cleanupPackagedTerminalSmokeRun(run)
  }
})
