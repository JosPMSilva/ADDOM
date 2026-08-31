import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'

import {
  isNativeRuntimePrepared,
  readNativeRuntimeMarker,
  writeNativeRuntimeMarker,
} from '../../scripts/ensure-native-runtime.mjs'

function writeBinding(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, 'binding')
}

test('native runtime marker validates prepared node runtime only when portable prebuilds exist', async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'addom-native-runtime-node-'))
  try {
    const betterSqliteBinding = path.join(repoRoot, 'node_modules', 'better-sqlite3', 'prebuilds', 'win32-x64.node')
    const nodePtyBinding = path.join(repoRoot, 'node_modules', 'node-pty', 'prebuilds', 'win32-x64', 'pty.node')
    const nodePtyConptyBinding = path.join(repoRoot, 'node_modules', 'node-pty', 'prebuilds', 'win32-x64', 'conpty.node')
    const nodePtyConptyDll = path.join(repoRoot, 'node_modules', 'node-pty', 'prebuilds', 'win32-x64', 'conpty', 'conpty.dll')
    const nodePtyOpenConsole = path.join(repoRoot, 'node_modules', 'node-pty', 'prebuilds', 'win32-x64', 'conpty', 'OpenConsole.exe')
    const target = '99.0.0'

    assert.equal(isNativeRuntimePrepared('node', {
      repoRoot,
      target,
      platform: 'win32',
      arch: 'x64',
    }), false)

    writeNativeRuntimeMarker('node', { repoRoot, target })
    assert.equal(isNativeRuntimePrepared('node', {
      repoRoot,
      target,
      platform: 'win32',
      arch: 'x64',
    }), false)

    writeBinding(betterSqliteBinding)
    writeBinding(nodePtyBinding)
    writeBinding(nodePtyConptyBinding)
    writeBinding(nodePtyConptyDll)
    writeBinding(nodePtyOpenConsole)
    assert.equal(isNativeRuntimePrepared('node', {
      repoRoot,
      target,
      platform: 'win32',
      arch: 'x64',
    }), true)

    const marker = readNativeRuntimeMarker(repoRoot)
    assert.equal(marker.runtime, 'node')
    assert.equal(marker.target, target)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test('native runtime marker accepts electron runtime on Windows when portable native artifacts exist', async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'addom-native-runtime-electron-'))
  try {
    const target = '44.1.0'
    const betterSqliteBinding = path.join(repoRoot, 'node_modules', 'better-sqlite3', 'prebuilds', 'win32-x64.node')
    const nodePtyBinding = path.join(repoRoot, 'node_modules', 'node-pty', 'prebuilds', 'win32-x64', 'pty.node')
    const nodePtyConptyBinding = path.join(repoRoot, 'node_modules', 'node-pty', 'prebuilds', 'win32-x64', 'conpty.node')
    const nodePtyConptyDll = path.join(repoRoot, 'node_modules', 'node-pty', 'prebuilds', 'win32-x64', 'conpty', 'conpty.dll')
    const nodePtyOpenConsole = path.join(repoRoot, 'node_modules', 'node-pty', 'prebuilds', 'win32-x64', 'conpty', 'OpenConsole.exe')

    writeNativeRuntimeMarker('electron', {
      repoRoot,
      target,
      platform: 'win32',
      arch: 'x64',
    })

    writeBinding(betterSqliteBinding)
    assert.equal(isNativeRuntimePrepared('electron', {
      repoRoot,
      target,
      platform: 'win32',
      arch: 'x64',
    }), false)

    writeBinding(nodePtyBinding)
    writeBinding(nodePtyConptyBinding)
    writeBinding(nodePtyConptyDll)
    writeBinding(nodePtyOpenConsole)
    assert.equal(isNativeRuntimePrepared('electron', {
      repoRoot,
      target,
      platform: 'win32',
      arch: 'x64',
    }), true)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})
