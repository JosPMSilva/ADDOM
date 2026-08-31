import fs from 'node:fs/promises'
import path from 'node:path'

const PLAYWRIGHT_BROWSER_DIRNAME = 'playwright-browsers'
const DEV_PLAYWRIGHT_BROWSER_DIRNAME = '.playwright-browsers'

function uniquePaths(paths = []) {
  return Array.from(new Set(
    paths
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .map((value) => path.resolve(value)),
  ))
}

function getChromiumExecutableSegmentCandidates(platform = process.platform) {
  switch (platform) {
    case 'win32':
      return [
        ['chrome-win64', 'chrome.exe'],
        ['chrome-win', 'chrome.exe'],
      ]
    case 'darwin':
      return [['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium']]
    default:
      return [
        ['chrome-linux64', 'chrome'],
        ['chrome-linux', 'chrome'],
      ]
  }
}

async function pathExists(targetPath = '') {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function listChromiumInstallDirs(rootDir = '') {
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() && /^chromium-\d+/i.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left))
  } catch {
    return []
  }
}

export function getUserDataPlaywrightBrowserRoot({
  userDataPath = '',
} = {}) {
  const root = String(userDataPath || '').trim()
  return root ? path.join(root, PLAYWRIGHT_BROWSER_DIRNAME) : ''
}

export async function resolveChromiumExecutablePathInRoot(rootDir = '', {
  platform = process.platform,
} = {}) {
  const normalizedRoot = String(rootDir || '').trim()
  if (!normalizedRoot) return ''
  const executableSegmentCandidates = getChromiumExecutableSegmentCandidates(platform)
  const installDirs = await listChromiumInstallDirs(normalizedRoot)
  for (const installDir of installDirs) {
    for (const executableSegments of executableSegmentCandidates) {
      const executablePath = path.join(normalizedRoot, installDir, ...executableSegments)
      if (await pathExists(executablePath)) {
        return executablePath
      }
    }
  }
  return ''
}

export function getPlaywrightBrowserRoots({
  browserRoot = '',
  userDataPath = '',
  resourcesPath = process.resourcesPath,
  projectRoot = process.cwd(),
} = {}) {
  return uniquePaths([
    browserRoot,
    resourcesPath ? path.join(resourcesPath, PLAYWRIGHT_BROWSER_DIRNAME) : '',
    getUserDataPlaywrightBrowserRoot({ userDataPath }),
    projectRoot ? path.join(projectRoot, DEV_PLAYWRIGHT_BROWSER_DIRNAME) : '',
  ])
}

export async function resolveBundledChromiumExecutablePath({
  browserRoot = '',
  userDataPath = '',
  resourcesPath = process.resourcesPath,
  projectRoot = process.cwd(),
  platform = process.platform,
} = {}) {
  for (const rootDir of getPlaywrightBrowserRoots({ browserRoot, userDataPath, resourcesPath, projectRoot })) {
    const executablePath = await resolveChromiumExecutablePathInRoot(rootDir, { platform })
    if (executablePath) {
      return executablePath
    }
  }
  return ''
}
