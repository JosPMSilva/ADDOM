import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const {
  createOpenAIAccountRuntimeManager,
  __testOpenAIAccountRuntimeManagerInternals,
} = await import('../../src/main/openai-account/openai-account-runtime-manager.mjs')

test('runtime manager resolves the pinned Windows asset for x64', () => {
  const spec = __testOpenAIAccountRuntimeManagerInternals.resolvePinnedAssetSpec({
    platform: 'win32',
    arch: 'x64',
  })

  assert.deepEqual(spec, {
    platform: 'win32',
    arch: 'x64',
    packageAssetName: 'codex-package-x86_64-pc-windows-msvc.tar.gz',
    legacyAssetName: 'codex-x86_64-pc-windows-msvc.exe',
    packageExecutablePath: ['bin', 'codex.exe'],
    legacyExecutablePath: ['codex.exe'],
    codeModeHostPath: ['bin', 'codex-code-mode-host.exe'],
  })
})

test('runtime manager reports runtime_missing until the pinned binary exists', () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-runtime-missing-'))
  const manager = createOpenAIAccountRuntimeManager({
    userDataPath,
    platform: 'win32',
    arch: 'x64',
  })

  const state = manager.refreshState()

  assert.equal(state.status, 'runtime_missing')
  assert.equal(state.reason, 'runtime_missing')
  assert.match(state.message, /downloaded when sign-in starts/i)

  fs.rmSync(userDataPath, { recursive: true, force: true })
})

test('runtime manager downloads, verifies, and installs the pinned runtime into ADDOM-owned storage', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-runtime-ready-'))
  const archiveContents = Buffer.from('codex-runtime-package', 'utf8')
  const digest = `sha256:${crypto.createHash('sha256').update(archiveContents).digest('hex')}`
  const progressStates = []

  const manager = createOpenAIAccountRuntimeManager({
    userDataPath,
    platform: 'win32',
    arch: 'x64',
    fetchJsonImpl: async () => ({
      assets: [{
        name: 'codex-package-x86_64-pc-windows-msvc.tar.gz',
        browser_download_url: 'https://example.com/codex-package.tar.gz',
        digest,
        size: archiveContents.length,
      }],
    }),
    downloadFileImpl: async ({ destinationPath, onProgress }) => {
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true })
      onProgress?.({ bytesDownloaded: Math.floor(archiveContents.length / 2), totalBytes: archiveContents.length })
      fs.writeFileSync(destinationPath, archiveContents)
      onProgress?.({ bytesDownloaded: archiveContents.length, totalBytes: archiveContents.length })
      return {
        bytesDownloaded: archiveContents.length,
        totalBytes: archiveContents.length,
      }
    },
    extractArchiveImpl: async ({ destinationPath }) => {
      const binPath = path.join(destinationPath, 'bin')
      fs.mkdirSync(binPath, { recursive: true })
      fs.writeFileSync(path.join(binPath, 'codex.exe'), 'codex-runtime-binary')
      fs.writeFileSync(path.join(binPath, 'codex-code-mode-host.exe'), 'codex-code-mode-host-binary')
    },
  })
  manager.on('state-updated', (state) => {
    progressStates.push(state.status)
  })

  const state = await manager.ensureRuntimeReady()
  const executablePath = state.executablePath

  assert.equal(state.status, 'runtime_ready')
  assert.equal(state.assetName, 'codex-package-x86_64-pc-windows-msvc.tar.gz')
  assert.equal(state.source, 'managed')
  assert.equal(fs.existsSync(executablePath), true)
  assert.equal(fs.readFileSync(executablePath, 'utf8'), 'codex-runtime-binary')
  assert.equal(fs.existsSync(path.join(path.dirname(executablePath), 'codex-code-mode-host.exe')), true)
  assert.ok(progressStates.includes('runtime_downloading'))
  assert.ok(progressStates.includes('runtime_verifying'))
  assert.ok(progressStates.includes('runtime_ready'))

  fs.rmSync(userDataPath, { recursive: true, force: true })
})

test('runtime manager rejects a current Codex cache that is missing its required code-mode host', () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-runtime-incomplete-'))
  const manager = createOpenAIAccountRuntimeManager({ userDataPath, platform: 'win32', arch: 'x64' })
  manager.writeActiveRuntimeVersion('rust-v0.147.0')
  const paths = manager.getPaths({ version: 'rust-v0.147.0' })
  fs.mkdirSync(paths.runtimeVersionPath, { recursive: true })
  fs.writeFileSync(paths.runtimeMetadataFilePath, JSON.stringify({
    version: 'rust-v0.147.0',
    assetName: 'codex-x86_64-pc-windows-msvc.exe',
    executablePath: paths.legacyRuntimeExecutablePath,
  }))
  fs.writeFileSync(paths.legacyRuntimeExecutablePath, 'legacy-codex-only')

  const state = manager.refreshState()

  assert.equal(state.status, 'runtime_missing')
  assert.equal(state.reason, 'runtime_package_incomplete')
  assert.match(state.message, /repair/i)
  fs.rmSync(userDataPath, { recursive: true, force: true })
})

test('runtime manager offers and installs a same-version repair for an incomplete Codex package', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-runtime-repair-'))
  const archiveContents = Buffer.from('codex-runtime-repair-package', 'utf8')
  const digest = `sha256:${crypto.createHash('sha256').update(archiveContents).digest('hex')}`
  const release = {
    tag_name: 'rust-v0.147.0',
    assets: [{
      name: 'codex-package-x86_64-pc-windows-msvc.tar.gz',
      browser_download_url: 'https://example.com/codex-package.tar.gz',
      digest,
      size: archiveContents.length,
    }],
  }
  const manager = createOpenAIAccountRuntimeManager({
    userDataPath,
    platform: 'win32',
    arch: 'x64',
    fetchJsonImpl: async () => release,
    downloadFileImpl: async ({ destinationPath }) => fs.writeFileSync(destinationPath, archiveContents),
    extractArchiveImpl: async ({ destinationPath }) => {
      const binPath = path.join(destinationPath, 'bin')
      fs.mkdirSync(binPath, { recursive: true })
      fs.writeFileSync(path.join(binPath, 'codex.exe'), 'repaired-codex')
      fs.writeFileSync(path.join(binPath, 'codex-code-mode-host.exe'), 'repaired-host')
    },
  })
  manager.writeActiveRuntimeVersion('rust-v0.147.0')
  const paths = manager.getPaths({ version: 'rust-v0.147.0' })
  fs.mkdirSync(paths.runtimeVersionPath, { recursive: true })
  fs.writeFileSync(paths.runtimeMetadataFilePath, JSON.stringify({
    version: 'rust-v0.147.0',
    assetName: 'codex-x86_64-pc-windows-msvc.exe',
    executablePath: paths.legacyRuntimeExecutablePath,
  }))
  fs.writeFileSync(paths.legacyRuntimeExecutablePath, 'legacy-codex-only')

  const checked = await manager.checkForUpdates()
  const installed = await manager.installLatestRuntime()

  assert.equal(checked.updateStatus, 'available')
  assert.equal(checked.latestVersion, 'rust-v0.147.0')
  assert.match(checked.updateMessage, /repair/i)
  assert.equal(installed.status, 'runtime_ready')
  assert.equal(installed.version, 'rust-v0.147.0')
  assert.equal(fs.existsSync(path.join(path.dirname(installed.executablePath), 'codex-code-mode-host.exe')), true)
  fs.rmSync(userDataPath, { recursive: true, force: true })
})

test('runtime manager reports when a newer Codex runtime release is available', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-runtime-update-check-'))
  const manager = createOpenAIAccountRuntimeManager({
    userDataPath,
    platform: 'win32',
    arch: 'x64',
    fetchJsonImpl: async (url) => {
      assert.match(url, /\/releases\/latest$/)
      return {
        tag_name: 'rust-v0.117.0',
        assets: [{
          name: 'codex-package-x86_64-pc-windows-msvc.tar.gz',
          browser_download_url: 'https://example.com/codex-117.tar.gz',
          digest: 'sha256:unused',
          size: 12,
        }],
      }
    },
  })

  const state = await manager.checkForUpdates()

  assert.equal(state.updateStatus, 'available')
  assert.equal(state.updateAvailable, true)
  assert.equal(state.latestVersion, 'rust-v0.117.0')
  assert.match(state.updateMessage, /rust-v0\.117\.0/)

  fs.rmSync(userDataPath, { recursive: true, force: true })
})

test('runtime manager installs the latest available Codex runtime after user approval', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-runtime-update-install-'))
  const archiveContents = Buffer.from('codex-runtime-update-package', 'utf8')
  const digest = `sha256:${crypto.createHash('sha256').update(archiveContents).digest('hex')}`
  const requestedUrls = []

  const manager = createOpenAIAccountRuntimeManager({
    userDataPath,
    platform: 'win32',
    arch: 'x64',
    fetchJsonImpl: async (url) => {
      requestedUrls.push(url)
      if (url.endsWith('/releases/latest')) {
        return {
          tag_name: 'rust-v0.117.0',
          assets: [{
            name: 'codex-package-x86_64-pc-windows-msvc.tar.gz',
            browser_download_url: 'https://example.com/codex-117.tar.gz',
            digest,
            size: archiveContents.length,
          }],
        }
      }
      assert.match(url, /\/releases\/tags\/rust-v0\.117\.0$/)
      return {
        tag_name: 'rust-v0.117.0',
        assets: [{
          name: 'codex-package-x86_64-pc-windows-msvc.tar.gz',
          browser_download_url: 'https://example.com/codex-117.tar.gz',
          digest,
          size: archiveContents.length,
        }],
      }
    },
    downloadFileImpl: async ({ destinationPath, onProgress }) => {
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true })
      fs.writeFileSync(destinationPath, archiveContents)
      onProgress?.({ bytesDownloaded: archiveContents.length, totalBytes: archiveContents.length })
      return {
        bytesDownloaded: archiveContents.length,
        totalBytes: archiveContents.length,
      }
    },
    extractArchiveImpl: async ({ destinationPath }) => {
      const binPath = path.join(destinationPath, 'bin')
      fs.mkdirSync(binPath, { recursive: true })
      fs.writeFileSync(path.join(binPath, 'codex.exe'), 'codex-runtime-update-binary')
      fs.writeFileSync(path.join(binPath, 'codex-code-mode-host.exe'), 'codex-code-mode-host-update-binary')
    },
  })

  const state = await manager.installLatestRuntime()
  const executablePath = state.executablePath
  const refreshedState = manager.refreshState()

  assert.equal(state.status, 'runtime_ready')
  assert.equal(state.version, 'rust-v0.117.0')
  assert.equal(state.updateStatus, 'current')
  assert.equal(state.updateAvailable, false)
  assert.equal(refreshedState.version, 'rust-v0.117.0')
  assert.equal(fs.existsSync(executablePath), true)
  assert.equal(fs.readFileSync(executablePath, 'utf8'), 'codex-runtime-update-binary')
  assert.ok(requestedUrls.some((url) => url.endsWith('/releases/latest')))

  fs.rmSync(userDataPath, { recursive: true, force: true })
})
