import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  createCursorAgentRuntimeManager,
  CURSOR_AGENT_PINNED_RUNTIME,
} from '../../src/main/cursor-agent/cursor-agent-runtime-manager.mjs'

test('Cursor runtime manager installs the pinned official package into ADDOM-owned storage', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-cursor-runtime-'))
  const archive = Buffer.from('cursor-agent-archive')
  const checksum = crypto.createHash('sha256').update(archive).digest('hex')
  const manager = createCursorAgentRuntimeManager({
    userDataPath,
    platform: 'win32',
    arch: 'x64',
    runtimeSpec: { ...CURSOR_AGENT_PINNED_RUNTIME, checksum },
    downloadFile: async ({ destinationPath }) => fs.writeFileSync(destinationPath, archive),
    extractArchive: async ({ destinationPath }) => {
      const packagePath = path.join(destinationPath, 'dist-package')
      fs.mkdirSync(packagePath, { recursive: true })
      fs.writeFileSync(path.join(packagePath, 'cursor-agent.cmd'), '@echo off')
    },
    verifyRuntimeVersion: async ({ expectedVersion }) => expectedVersion,
  })

  const state = await manager.ensureRuntimeReady()

  assert.equal(state.status, 'runtime_ready')
  assert.equal(state.version, CURSOR_AGENT_PINNED_RUNTIME.version)
  assert.equal(fs.existsSync(state.commandPath), true)
  assert.equal(manager.refreshState().status, 'runtime_ready')
  fs.rmSync(userDataPath, { recursive: true, force: true })
})

test('Cursor runtime manager rejects a package with the wrong checksum', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-cursor-runtime-digest-'))
  const manager = createCursorAgentRuntimeManager({
    userDataPath,
    platform: 'win32',
    arch: 'x64',
    downloadFile: async ({ destinationPath }) => fs.writeFileSync(destinationPath, 'wrong'),
    extractArchive: async () => assert.fail('archive must not be extracted'),
    verifyRuntimeVersion: async () => assert.fail('runtime must not be verified'),
  })

  const state = await manager.ensureRuntimeReady()

  assert.equal(state.status, 'runtime_failed')
  assert.equal(state.reason, 'runtime_checksum_mismatch')
  assert.equal(state.commandPath, '')
  fs.rmSync(userDataPath, { recursive: true, force: true })
})

test('Cursor runtime manager checks the official installer for a newer runtime', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-cursor-runtime-update-check-'))
  const manager = createCursorAgentRuntimeManager({
    userDataPath,
    platform: 'win32',
    arch: 'x64',
    fetchLatestInstaller: async () => 'DOWNLOAD_URL="https://downloads.cursor.com/lab/2026.08.11-e8db854/linux/x64/agent-cli-package.tar.gz"',
  })

  const state = await manager.checkForUpdates()

  assert.equal(state.updateStatus, 'available')
  assert.equal(state.updateAvailable, true)
  assert.equal(state.latestVersion, '2026.08.11-e8db854')
  assert.match(state.updateMessage, /2026\.08\.11-e8db854/)
  fs.rmSync(userDataPath, { recursive: true, force: true })
})

test('Cursor runtime manager installs and persists the latest official runtime', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-cursor-runtime-update-install-'))
  const archive = Buffer.from('latest-cursor-agent-archive')
  const downloadedUrls = []
  const manager = createCursorAgentRuntimeManager({
    userDataPath,
    platform: 'win32',
    arch: 'x64',
    fetchLatestInstaller: async () => 'DOWNLOAD_URL="https://downloads.cursor.com/lab/2026.08.11-e8db854/linux/x64/agent-cli-package.tar.gz"',
    downloadFile: async ({ url, destinationPath }) => {
      downloadedUrls.push(url)
      fs.writeFileSync(destinationPath, archive)
    },
    extractArchive: async ({ destinationPath }) => {
      const packagePath = path.join(destinationPath, 'dist-package')
      fs.mkdirSync(packagePath, { recursive: true })
      fs.writeFileSync(path.join(packagePath, 'cursor-agent.cmd'), '@echo off')
      fs.writeFileSync(path.join(packagePath, 'cursor-agent.ps1'), '')
    },
    verifyRuntimeVersion: async ({ expectedVersion }) => expectedVersion,
  })

  const state = await manager.installLatestRuntime()
  const reloaded = createCursorAgentRuntimeManager({ userDataPath, platform: 'win32', arch: 'x64' })

  assert.equal(state.status, 'runtime_ready')
  assert.equal(state.version, '2026.08.11-e8db854')
  assert.equal(state.updateStatus, 'current')
  assert.equal(state.updateAvailable, false)
  assert.match(downloadedUrls[0], /2026\.08\.11-e8db854\/windows\/x64\/agent-cli-package\.zip$/)
  assert.equal(reloaded.refreshState().version, '2026.08.11-e8db854')
  fs.rmSync(userDataPath, { recursive: true, force: true })
})
