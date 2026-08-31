import path from 'node:path'
import { ensurePlaywrightChromiumRuntime } from '../src/main/tools/browser-runtime-installer.mjs'

const ROOT = process.cwd()
const PLAYWRIGHT_BROWSER_ROOT = path.join(ROOT, '.playwright-browsers')
const runtime = await ensurePlaywrightChromiumRuntime({
  installRoot: PLAYWRIGHT_BROWSER_ROOT,
  cwd: ROOT,
})

if (runtime.installed) {
  console.log(`Bundled Playwright Chromium ready: ${runtime.executablePath}`)
} else {
  console.log(`Bundled Playwright Chromium already prepared: ${runtime.executablePath}`)
}
