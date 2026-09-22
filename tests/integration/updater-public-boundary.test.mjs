import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')

test('public updater excludes private rehearsal surfaces and feed credentials', () => {
  const forbiddenPaths = [
    'src/main/updater/dev-update-simulator.mjs',
    'src/main/updater/packaged-update-feed-policy.mjs',
    'src/renderer/components/settings/DevUpdaterLab.jsx',
  ]
  for (const relativePath of forbiddenPaths) {
    assert.equal(fs.existsSync(path.join(ROOT, relativePath)), false, `${relativePath} must remain private`)
  }

  const productionSources = [
    'src/main/ipc-handlers/updater.mjs',
    'src/main/updater/application-updater-ipc.mjs',
    'src/preload/index.mjs',
    'src/preload/preload-misc-apis.cjs',
  ].map((relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8')).join('\n')

  assert.doesNotMatch(productionSources, /ADDOM-AGENTIC|ADDOM_PRIVATE_UPDATE_TOKEN|GH_TOKEN|updaterDev|updater-dev:/)
})
