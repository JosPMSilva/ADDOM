import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readText(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

test('browser tool only auto-installs Chromium when no managed runtime is already present', () => {
  const source = readText('src/main/tools/browser-tool.mjs')

  assert.match(source, /getUserDataPlaywrightBrowserRoot/)
  assert.match(source, /ensurePlaywrightChromiumRuntime/)
  assert.match(source, /attachBrowserDiagnosticsToPage/)
  assert.match(source, /clearBrowserDiagnostics/)
  assert.match(source, /if \(!browser && runtimeInstallRoot && !bundledExecutablePath\)/)
  assert.match(source, /onRuntimeInstall:\s*createOptions\.onRuntimeInstall\s*\|\|\s*options\.onRuntimeInstall/)
  assert.match(source, /onRuntimeInstall:\s*options\.onRuntimeInstall/)
})
