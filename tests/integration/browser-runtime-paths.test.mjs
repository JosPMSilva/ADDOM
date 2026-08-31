import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  getUserDataPlaywrightBrowserRoot,
  resolveBundledChromiumExecutablePath,
} from '../../src/main/tools/browser-runtime-paths.mjs'

async function createChromiumInstall(rootDir, installDir, executableSegments) {
  const executablePath = path.join(rootDir, installDir, ...executableSegments)
  await fs.mkdir(path.dirname(executablePath), { recursive: true })
  await fs.writeFile(executablePath, 'browser')
  return executablePath
}

test('resolveBundledChromiumExecutablePath prefers packaged resources over user-data and repo-local runtimes', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'addom-browser-runtime-'))
  const resourcesRoot = path.join(tempRoot, 'resources')
  const userDataRoot = path.join(tempRoot, 'userData')
  const projectRoot = path.join(tempRoot, 'project')
  const packagedBrowserRoot = path.join(resourcesRoot, 'playwright-browsers')
  const userDataBrowserRoot = getUserDataPlaywrightBrowserRoot({ userDataPath: userDataRoot })
  const projectBrowserRoot = path.join(projectRoot, '.playwright-browsers')
  await createChromiumInstall(
    packagedBrowserRoot,
    'chromium-2000',
    ['chrome-win', 'chrome.exe'],
  )
  await createChromiumInstall(
    userDataBrowserRoot,
    'chromium-3000',
    ['chrome-win', 'chrome.exe'],
  )
  const packagedExecutable = await createChromiumInstall(
    packagedBrowserRoot,
    'chromium-2000',
    ['chrome-win', 'chrome.exe'],
  )
  await createChromiumInstall(projectBrowserRoot, 'chromium-1000', ['chrome-win', 'chrome.exe'])

  try {
    const resolved = await resolveBundledChromiumExecutablePath({
      resourcesPath: resourcesRoot,
      userDataPath: userDataRoot,
      projectRoot,
      platform: 'win32',
    })
    assert.equal(resolved, packagedExecutable)
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
})

test('resolveBundledChromiumExecutablePath prefers user-data runtime over repo-local runtime when no packaged runtime exists', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'addom-browser-runtime-packaged-'))
  const projectRoot = path.join(tempRoot, 'project')
  const userDataRoot = path.join(tempRoot, 'userData')
  const userDataBrowserRoot = getUserDataPlaywrightBrowserRoot({ userDataPath: userDataRoot })
  const projectBrowserRoot = path.join(projectRoot, '.playwright-browsers')
  const userDataExecutable = await createChromiumInstall(userDataBrowserRoot, 'chromium-2000', ['chrome-win', 'chrome.exe'])
  await createChromiumInstall(projectBrowserRoot, 'chromium-1000', ['chrome-win', 'chrome.exe'])

  try {
    const resolved = await resolveBundledChromiumExecutablePath({
      userDataPath: userDataRoot,
      projectRoot,
      platform: 'win32',
    })
    assert.equal(resolved, userDataExecutable)
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
})

test('resolveBundledChromiumExecutablePath prefers an explicit browser root over all fallback locations', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'addom-browser-runtime-explicit-'))
  const explicitBrowserRoot = path.join(tempRoot, 'explicit')
  const resourcesRoot = path.join(tempRoot, 'resources')
  const userDataRoot = path.join(tempRoot, 'userData')
  const projectRoot = path.join(tempRoot, 'project')
  const packagedBrowserRoot = path.join(resourcesRoot, 'playwright-browsers')
  const userDataBrowserRoot = getUserDataPlaywrightBrowserRoot({ userDataPath: userDataRoot })
  const projectBrowserRoot = path.join(projectRoot, '.playwright-browsers')
  const explicitExecutable = await createChromiumInstall(explicitBrowserRoot, 'chromium-4000', ['chrome-win', 'chrome.exe'])
  await createChromiumInstall(packagedBrowserRoot, 'chromium-3000', ['chrome-win', 'chrome.exe'])
  await createChromiumInstall(userDataBrowserRoot, 'chromium-2000', ['chrome-win', 'chrome.exe'])
  await createChromiumInstall(projectBrowserRoot, 'chromium-1000', ['chrome-win', 'chrome.exe'])

  try {
    const resolved = await resolveBundledChromiumExecutablePath({
      browserRoot: explicitBrowserRoot,
      resourcesPath: resourcesRoot,
      userDataPath: userDataRoot,
      projectRoot,
      platform: 'win32',
    })
    assert.equal(resolved, explicitExecutable)
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
})

test('resolveBundledChromiumExecutablePath returns empty string when no bundled browser exists', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'addom-browser-runtime-empty-'))
  try {
    const resolved = await resolveBundledChromiumExecutablePath({
      resourcesPath: path.join(tempRoot, 'resources'),
      projectRoot: path.join(tempRoot, 'project'),
      platform: 'linux',
    })
    assert.equal(resolved, '')
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
})

test('resolveBundledChromiumExecutablePath resolves current Playwright Linux chromium installs', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'addom-browser-runtime-linux-'))
  const userDataRoot = path.join(tempRoot, 'userData')
  const userDataBrowserRoot = getUserDataPlaywrightBrowserRoot({ userDataPath: userDataRoot })
  const linuxExecutable = await createChromiumInstall(
    userDataBrowserRoot,
    'chromium-2000',
    ['chrome-linux64', 'chrome'],
  )

  try {
    const resolved = await resolveBundledChromiumExecutablePath({
      userDataPath: userDataRoot,
      platform: 'linux',
    })
    assert.equal(resolved, linuxExecutable)
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
})
