import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]):)/, '$1:'))
const require = createRequire(import.meta.url)

function readPngDimensions(buffer) {
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG')
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR')
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

test('Microsoft Store package versions remain monotonic and Store-valid', () => {
  const {
    resolveMicrosoftStorePackageVersion,
    validateMicrosoftStorePackageVersion,
  } = require('../../scripts/prepare-microsoft-store-manifest.cjs')

  assert.equal(resolveMicrosoftStorePackageVersion('0.1.2-alpha'), '1.1.2.0')
  assert.equal(resolveMicrosoftStorePackageVersion('1.0.0'), '2.0.0.0')
  assert.equal(validateMicrosoftStorePackageVersion('1.1.2.0'), '1.1.2.0')
  assert.throws(() => validateMicrosoftStorePackageVersion('0.1.2.0'), /first field/i)
  assert.throws(() => validateMicrosoftStorePackageVersion('1.1.2.1'), /fourth field/i)
  assert.throws(() => validateMicrosoftStorePackageVersion('1.1.2'), /four numeric fields/i)
})

test('Microsoft Store manifest hook replaces only the package identity version', async () => {
  const prepareManifest = require('../../scripts/prepare-microsoft-store-manifest.cjs')
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'addom-store-manifest-'))
  const manifestPath = path.join(tempDir, 'AppxManifest.xml')
  await writeFile(manifestPath, [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<Package>',
    '  <Identity Name="JosPMSilva.Addom" Publisher="CN=example" Version="0.1.2.0" />',
    '  <Properties><DisplayName>ADDOM 0.1.2-alpha</DisplayName></Properties>',
    '</Package>',
  ].join('\n'), 'utf8')

  try {
    await prepareManifest(manifestPath, { appVersion: '0.1.2-alpha' })
    const result = await readFile(manifestPath, 'utf8')
    assert.match(result, /Version="1\.1\.2\.0"/)
    assert.match(result, /ADDOM 0\.1\.2-alpha/)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('Microsoft Store builder flavor uses the reserved identity without GitHub updater metadata', () => {
  const script = [
    "process.env.ADDOM_DISTRIBUTION_CHANNEL = 'microsoft-store'",
    "const config = require('./electron-builder.config.cjs')",
    'process.stdout.write(JSON.stringify(config))',
  ].join(';')
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ADDOM_UPDATE_PROVIDER: '' },
  })

  assert.equal(result.status, 0, result.stderr)
  const config = JSON.parse(result.stdout)
  assert.deepEqual(config.win.target, [{ target: 'appx', arch: ['x64'] }])
  assert.equal(config.directories.output, 'dist-electron/store')
  assert.equal(config.extraMetadata.addomDistributionChannel, 'microsoft-store')
  assert.deepEqual(config.publish, [])
  assert.deepEqual(config.appx, {
    applicationId: 'ADDOM',
    artifactName: 'ADDOM-Store-${version}-${arch}.${ext}',
    backgroundColor: '#0b0c0c',
    capabilities: ['runFullTrust'],
    displayName: 'ADDOM',
    identityName: 'JosPMSilva.Addom',
    publisher: 'CN=931991DE-381E-4CC4-92BD-C38FE9044DA5',
    publisherDisplayName: 'JosPMSilva',
    setBuildNumber: false,
  })
  assert.match(config.appxManifestCreated, /prepare-microsoft-store-manifest\.cjs$/)
  assert.match(config.afterPack, /after-pack\.cjs$/)
})

test('Microsoft Store and GitHub update ownership cannot be enabled together', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./electron-builder.config.cjs')"], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      ADDOM_DISTRIBUTION_CHANNEL: 'microsoft-store',
      ADDOM_UPDATE_PROVIDER: 'github',
    },
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Microsoft Store builds cannot embed a GitHub update provider/i)
})

test('Microsoft Store package uses ADDOM-branded AppX assets at required dimensions', async () => {
  const expectedAssets = new Map([
    ['StoreLogo.png', { width: 50, height: 50 }],
    ['Square44x44Logo.png', { width: 44, height: 44 }],
    ['Square150x150Logo.png', { width: 150, height: 150 }],
    ['Wide310x150Logo.png', { width: 310, height: 150 }],
  ])

  for (const [name, dimensions] of expectedAssets) {
    const buffer = await readFile(path.join(ROOT, 'assets', 'appx', name))
    assert.deepEqual(readPngDimensions(buffer), dimensions, name)
  }
})
