import { runPackagedBrowserRuntimeSmoke } from './packaged-smoke/packaged-browser-runtime-smoke.mjs'
import { runPackagedTerminalRuntimeSmoke } from './packaged-smoke/packaged-terminal-runtime-smoke.mjs'

export function runPackagedRuntimeSmoke({
  app,
  mainWindow,
  isBrowserSmoke = false,
} = {}) {
  const runner = isBrowserSmoke
    ? runPackagedBrowserRuntimeSmoke
    : runPackagedTerminalRuntimeSmoke
  const resultPath = isBrowserSmoke
    ? process.env.ADDOM_PACKAGED_BROWSER_SMOKE_RESULT_PATH
    : process.env.ADDOM_PACKAGED_TERMINAL_SMOKE_RESULT_PATH
  const timeoutMs = isBrowserSmoke
    ? process.env.ADDOM_PACKAGED_BROWSER_SMOKE_TIMEOUT_MS
    : process.env.ADDOM_PACKAGED_TERMINAL_SMOKE_TIMEOUT_MS

  void runner({
    app,
    mainWindow,
    resultPath,
    timeoutMs,
  }).then((result) => {
    app.exit(result?.ok ? 0 : 1)
  }).catch((error) => {
    const smokeLabel = isBrowserSmoke ? 'browser' : 'terminal'
    console.error(
      `[packaged-smoke] ${smokeLabel} runtime smoke failed: ${String(error?.message || error || 'packaged_smoke_failed')}`,
    )
    app.exit(1)
  })
}
