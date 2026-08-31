import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import { validateReleaseReproducibility } from '../../scripts/check-release-reproducibility.mjs'
import { writeNativeRuntimeMarker } from '../../scripts/ensure-native-runtime.mjs'

const CHECK_RELEASE_FREEZE_SCRIPT = path.join(process.cwd(), 'scripts', 'check-release-freeze.mjs')

async function seedFixtureRepo() {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'addom-release-repro-'))
  const packageJson = {
    name: 'addom-fixture',
    version: '1.0.0',
    scripts: {
      postinstall: 'node node_modules/electron/install.js && npm run native:electron',
      'native:electron': 'node scripts/ensure-native-runtime.mjs electron',
      'test:integration': 'node scripts/with-native-runtime.mjs node --restore electron -- npm run test:integration:raw',
      'build:dir': 'npm run build:runtime-assets && node scripts/run-electron-builder-host-check.mjs --dir --config electron-builder.config.cjs && npm run test:live-smoke:packaged',
    },
  }
  const packageLock = {
    name: 'addom-fixture',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: {
      '': { name: 'addom-fixture', version: '1.0.0' },
      'node_modules/better-sqlite3': { version: '13.0.3' },
      'node_modules/electron': { version: '44.1.0' },
    },
  }

  await writeFile(path.join(repoRoot, 'package.json'), JSON.stringify(packageJson, null, 2))
  await writeFile(path.join(repoRoot, 'package-lock.json'), JSON.stringify(packageLock, null, 2))
  await fs.promises.mkdir(path.join(repoRoot, 'node_modules', 'electron'), { recursive: true })
  await writeFile(path.join(repoRoot, 'node_modules', 'electron', 'package.json'), JSON.stringify({ version: '44.1.0' }, null, 2))

  const bindings = [
    path.join(repoRoot, 'node_modules', 'better-sqlite3', 'prebuilds', 'win32-x64.node'),
    path.join(repoRoot, 'node_modules', 'node-pty', 'prebuilds', 'win32-x64', 'pty.node'),
    path.join(repoRoot, 'node_modules', 'node-pty', 'prebuilds', 'win32-x64', 'conpty.node'),
    path.join(repoRoot, 'node_modules', 'node-pty', 'prebuilds', 'win32-x64', 'conpty', 'conpty.dll'),
    path.join(repoRoot, 'node_modules', 'node-pty', 'prebuilds', 'win32-x64', 'conpty', 'OpenConsole.exe'),
  ]
  for (const bindingPath of bindings) {
    await fs.promises.mkdir(path.dirname(bindingPath), { recursive: true })
    await writeFile(bindingPath, 'binding')
  }

  writeNativeRuntimeMarker('electron', {
    repoRoot,
    platform: 'win32',
    arch: 'x64',
    target: '44.1.0',
  })
  return repoRoot
}

test('release reproducibility validation accepts portable native prebuilds', async () => {
  const repoRoot = await seedFixtureRepo()
  try {
    const summary = validateReleaseReproducibility({ repoRoot })
    assert.equal(summary.lockedBetterSqliteVersion, '13.0.3')
    assert.equal(summary.lockedElectronVersion, '44.1.0')
    assert.equal(summary.nativeRuntimeMarker.runtime, 'electron')
    assert.equal(summary.nativeRuntimeMarker.target, '44.1.0')
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test('release freeze script exists and protects the documented platform-specific command order', async () => {
  assert.equal(fs.existsSync(CHECK_RELEASE_FREEZE_SCRIPT), true, 'scripts/check-release-freeze.mjs must exist.')

  const { buildReleaseFreezeSteps } = await import(pathToFileURL(CHECK_RELEASE_FREEZE_SCRIPT).href)

  assert.deepEqual(
    buildReleaseFreezeSteps({ platform: 'linux' }).map((step) => step.display),
    [
      'npm run check:release-reproducibility',
      'npm run native:electron',
      'npm run test:integration',
      'npm run build:dir',
    ],
  )
  assert.deepEqual(
    buildReleaseFreezeSteps({ includeInstall: true, platform: 'linux' }).map((step) => step.display),
    [
      'npm install',
      'npm run check:release-reproducibility',
      'npm run native:electron',
      'npm run test:integration',
      'npm run build:dir',
    ],
  )
  assert.deepEqual(
    buildReleaseFreezeSteps({ platform: 'win32' }).map((step) => step.display),
    [
      'npm run check:release-reproducibility',
      'npm run native:electron',
      'npm run test:integration',
      'npm run build:dir',
      'npm run test:live-smoke:packaged:terminal',
    ],
  )
})
