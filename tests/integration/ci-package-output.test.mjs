import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  assertPrimaryPackageOutputVersions,
  findPrimaryPackageOutputs,
  findUpdateMetadataOutput,
} from '../../scripts/check-ci-package-output.mjs'
import { cleanPackageOutput } from '../../scripts/clean-package-output.mjs'

test('CI package output gate recognizes each platform primary installer', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-ci-package-output-'))
  try {
    for (const name of [
      'ADDOM 1.1.3.0.appx',
      'ADDOM-1.0.0-mac-x64.dmg',
      'ADDOM-1.0.0-linux-x86_64.AppImage',
      'ADDOM Setup 1.0.0.exe',
      'latest.yml',
    ]) {
      fs.writeFileSync(path.join(root, name), '')
    }

    assert.deepEqual(
      findPrimaryPackageOutputs({ directory: root, platform: 'darwin' }).map((filePath) => path.basename(filePath)),
      ['ADDOM-1.0.0-mac-x64.dmg'],
    )
    assert.deepEqual(
      findPrimaryPackageOutputs({ directory: root, platform: 'linux' }).map((filePath) => path.basename(filePath)),
      ['ADDOM-1.0.0-linux-x86_64.AppImage'],
    )
    assert.deepEqual(
      findPrimaryPackageOutputs({ directory: root, platform: 'win32' }).map((filePath) => path.basename(filePath)),
      ['ADDOM Setup 1.0.0.exe'],
    )
    assert.deepEqual(
      findPrimaryPackageOutputs({
        directory: root,
        distributionChannel: 'microsoft-store',
        platform: 'win32',
      }).map((filePath) => path.basename(filePath)),
      ['ADDOM 1.1.3.0.appx'],
    )
    assert.equal(
      path.basename(findUpdateMetadataOutput({ directory: root, platform: 'win32' })),
      'latest.yml',
    )
    assert.equal(findUpdateMetadataOutput({ directory: root, platform: 'darwin' }), '')
    assert.doesNotThrow(() => assertPrimaryPackageOutputVersions({
      expectedVersion: '1.0.0',
      outputs: findPrimaryPackageOutputs({ directory: root, platform: 'win32' }),
    }))
    assert.throws(
      () => assertPrimaryPackageOutputVersions({
        expectedVersion: '1.1.0',
        outputs: findPrimaryPackageOutputs({ directory: root, platform: 'win32' }),
      }),
      /Stale or mixed-version package output/,
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('CI package output gate fails closed for absent and unsupported outputs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-ci-package-output-empty-'))
  try {
    assert.deepEqual(findPrimaryPackageOutputs({ directory: root, platform: 'linux' }), [])
    assert.equal(findUpdateMetadataOutput({ directory: root, platform: 'win32' }), '')
    assert.throws(
      () => findPrimaryPackageOutputs({ directory: root, platform: 'freebsd' }),
      /Unsupported package platform/,
    )
    assert.throws(
      () => findUpdateMetadataOutput({ directory: root, platform: 'freebsd' }),
      /Unsupported package platform/,
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('package output cleanup stays inside the selected release channel', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-package-clean-'))
  try {
    const githubArtifact = path.join(root, 'dist-electron', 'ADDOM-Setup-old.exe')
    const storeArtifact = path.join(root, 'dist-electron', 'store', 'ADDOM-Store-old.appx')
    const preserved = path.join(root, 'preserved.txt')
    fs.mkdirSync(path.dirname(storeArtifact), { recursive: true })
    fs.writeFileSync(githubArtifact, '')
    fs.writeFileSync(storeArtifact, '')
    fs.writeFileSync(preserved, '')

    cleanPackageOutput('microsoft-store', { repoRoot: root })
    assert.equal(fs.existsSync(githubArtifact), true)
    assert.equal(fs.existsSync(storeArtifact), false)
    assert.equal(fs.existsSync(preserved), true)

    cleanPackageOutput('github', { repoRoot: root })
    assert.equal(fs.existsSync(githubArtifact), false)
    assert.equal(fs.existsSync(preserved), true)
    assert.throws(() => cleanPackageOutput('unknown', { repoRoot: root }), /Unsupported package output channel/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
