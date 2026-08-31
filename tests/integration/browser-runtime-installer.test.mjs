import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'

import {
  ensurePlaywrightChromiumRuntime,
  installPlaywrightChromiumRuntime,
  resolvePlaywrightCliPath,
} from '../../src/main/tools/browser-runtime-installer.mjs'

async function createChromiumInstall(rootDir, installDir = 'chromium-3000') {
  const executablePath = path.join(rootDir, installDir, 'chrome-win', 'chrome.exe')
  await fs.mkdir(path.dirname(executablePath), { recursive: true })
  await fs.writeFile(executablePath, 'browser')
  return executablePath
}

function createSpawnStub(handler) {
  const calls = []
  const spawnImpl = (command, args, options) => {
    const child = new EventEmitter()
    calls.push({ command, args, options })
    queueMicrotask(async () => {
      try {
        await handler({ command, args, options, child, callCount: calls.length })
      } catch (error) {
        child.emit('error', error)
      }
    })
    return child
  }
  return { spawnImpl, calls }
}

test('ensurePlaywrightChromiumRuntime returns an existing runtime without spawning an install', async () => {
  const installRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'addom-browser-runtime-existing-'))
  const executablePath = await createChromiumInstall(installRoot)
  const { spawnImpl, calls } = createSpawnStub(async () => {
    throw new Error('spawn should not be called when a runtime already exists')
  })

  try {
    const runtime = await ensurePlaywrightChromiumRuntime({
      installRoot,
      spawnImpl,
      platform: 'win32',
    })

    assert.equal(runtime.installed, false)
    assert.equal(runtime.executablePath, executablePath)
    assert.equal(calls.length, 0)
  } finally {
    await fs.rm(installRoot, { recursive: true, force: true })
  }
})

test('resolvePlaywrightCliPath derives the CLI from the Playwright package root', async () => {
  const cliPath = resolvePlaywrightCliPath()
  assert.match(cliPath, /playwright-core[\\/]+cli\.js$/i)
  const stats = await fs.stat(cliPath)
  assert.equal(stats.isFile(), true)
})

test('ensurePlaywrightChromiumRuntime shares one install and sets the Playwright browser env for Electron', async () => {
  const installRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'addom-browser-runtime-install-'))
  const { spawnImpl, calls } = createSpawnStub(async ({ options, child }) => {
    await createChromiumInstall(options.env.PLAYWRIGHT_BROWSERS_PATH)
    setTimeout(() => child.emit('exit', 0), 10)
  })

  try {
    const [first, second] = await Promise.all([
      ensurePlaywrightChromiumRuntime({
        installRoot,
        cliPath: 'playwright-core/cli.js',
        spawnImpl,
        platform: 'win32',
        processVersions: { electron: '40.6.0' },
      }),
      ensurePlaywrightChromiumRuntime({
        installRoot,
        cliPath: 'playwright-core/cli.js',
        spawnImpl,
        platform: 'win32',
        processVersions: { electron: '40.6.0' },
      }),
    ])

    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].args, ['playwright-core/cli.js', 'install', 'chromium'])
    assert.equal(calls[0].options.env.PLAYWRIGHT_BROWSERS_PATH, installRoot)
    assert.equal(calls[0].options.env.ELECTRON_RUN_AS_NODE, '1')
    assert.equal(first.installed, true)
    assert.equal(second.installed, true)
    assert.equal(first.executablePath, second.executablePath)
  } finally {
    await fs.rm(installRoot, { recursive: true, force: true })
  }
})

test('installPlaywrightChromiumRuntime fails when Playwright exits successfully but no browser executable is produced', async () => {
  const installRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'addom-browser-runtime-missing-exe-'))
  const { spawnImpl } = createSpawnStub(async ({ child }) => {
    setTimeout(() => child.emit('exit', 0), 10)
  })

  try {
    await assert.rejects(
      () => installPlaywrightChromiumRuntime({
        installRoot,
        cliPath: 'playwright-core/cli.js',
        spawnImpl,
        platform: 'win32',
      }),
      /no browser executable was found/i,
    )
  } finally {
    await fs.rm(installRoot, { recursive: true, force: true })
  }
})
