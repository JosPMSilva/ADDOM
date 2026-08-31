import test from 'node:test'
import assert from 'node:assert/strict'

import {
  cleanupPackagedBrowserSmokeRun,
  isPackagedBrowserSmokeEnabled,
  runPackagedBrowserRuntimeSmoke,
} from './packaged-browser-runtime-smoke-helpers.mjs'

test('opt-in packaged browser runtime smoke suite', async (t) => {
  if (!isPackagedBrowserSmokeEnabled(process.env)) {
    await t.test('packaged browser runtime smoke disabled', { skip: true }, () => {})
    return
  }

  let run = null
  try {
    run = await runPackagedBrowserRuntimeSmoke({ env: process.env })
    t.diagnostic(`packaged_browser_smoke_executable: ${run.executablePath}`)
    if (run.stdout) t.diagnostic(`packaged_browser_smoke_stdout:\n${run.stdout}`)
    if (run.stderr) t.diagnostic(`packaged_browser_smoke_stderr:\n${run.stderr}`)

    assert.equal(run.exitCode, 0, run.stderr || run.stdout)
    assert.equal(run.result?.ok, true, JSON.stringify(run.result, null, 2))
    assert.equal(run.result?.preload?.hasAddom, true)
    assert.equal(run.result?.preload?.hasLocalData, true)
    assert.match(String(run.result?.renderer?.locationHref || ''), /^addom-app:\/\/renderer\//)
    assert.equal(
      Array.isArray(run.result?.renderer?.stylesheets)
      && run.result.renderer.stylesheets.some((entry) => Number(entry?.cssRuleCount || 0) > 0),
      true,
      JSON.stringify(run.result, null, 2),
    )
    assert.equal(run.result?.firstLaunch?.installed, true, JSON.stringify(run.result, null, 2))
    assert.equal(Array.isArray(run.result?.secondLaunch?.installEvents), true)
    assert.equal(run.result.secondLaunch.installEvents.length, 0, JSON.stringify(run.result, null, 2))
    assert.equal(Boolean(String(run.result?.cachedExecutablePath || '').trim()), true)
  } finally {
    await cleanupPackagedBrowserSmokeRun(run)
  }
})
