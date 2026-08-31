import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('updater stays disabled when packaged update config is absent', () => {
  const source = fs.readFileSync(path.resolve('src/main/ipc-handlers/updater.mjs'), 'utf8')

  assert.match(source, /function readPackagedUpdateConfig\(\)/)
  assert.match(source, /path\.join\(resourcesPath, 'app-update\.yml'\)/)
  assert.match(source, /ALLOWED_PACKAGED_UPDATE_PROVIDER = 'generic'/)
  assert.match(source, /function hasSupportedPackagedUpdateConfig\(\)/)
  assert.match(source, /if \(!hasSupportedPackagedUpdateConfig\(\)\) return null/)
  assert.match(source, /if \(IS_DEV \|\| !hasSupportedPackagedUpdateConfig\(\)\)/)
  assert.match(source, /status: 'disabled'/)
})
