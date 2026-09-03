import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('updater accepts only the official ADDOM GitHub release feed', () => {
  const source = fs.readFileSync(path.resolve('src/main/ipc-handlers/updater.mjs'), 'utf8')

  assert.match(source, /function readPackagedUpdateConfig\(\)/)
  assert.match(source, /path\.join\(resourcesPath, 'app-update\.yml'\)/)
  assert.match(source, /ALLOWED_PACKAGED_UPDATE_PROVIDER = 'github'/)
  assert.match(source, /ALLOWED_GITHUB_OWNER = 'JosPMSilva'/)
  assert.match(source, /ALLOWED_GITHUB_REPOSITORY = 'ADDOM'/)
  assert.match(source, /function hasSupportedPackagedUpdateConfig\(\)/)
  assert.match(source, /if \(!hasSupportedPackagedUpdateConfig\(\)\) return null/)
  assert.match(source, /if \(IS_DEV \|\| !hasSupportedPackagedUpdateConfig\(\)\)/)
  assert.match(source, /status: 'disabled'/)
  assert.doesNotMatch(source, /message:\s*err\.message/)
  assert.doesNotMatch(source, /error:\s*err\.message/)
  assert.match(source, /classifyUpdaterFailure\(err\)/)
})
