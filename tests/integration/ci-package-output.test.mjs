import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { findPrimaryPackageOutputs } from '../../scripts/check-ci-package-output.mjs'

test('CI package output gate recognizes each platform primary installer', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-ci-package-output-'))
  try {
    for (const name of [
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
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('CI package output gate fails closed for absent and unsupported outputs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-ci-package-output-empty-'))
  try {
    assert.deepEqual(findPrimaryPackageOutputs({ directory: root, platform: 'linux' }), [])
    assert.throws(
      () => findPrimaryPackageOutputs({ directory: root, platform: 'freebsd' }),
      /Unsupported package platform/,
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
