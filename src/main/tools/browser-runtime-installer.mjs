import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolveChromiumExecutablePathInRoot } from './browser-runtime-paths.mjs'

const require = createRequire(import.meta.url)
const installPromisesByRoot = new Map()

export function resolvePlaywrightCliPath() {
  try {
    const packageJsonPath = require.resolve('playwright-core/package.json')
    return path.join(path.dirname(packageJsonPath), 'cli.js')
  } catch {
    return ''
  }
}

export async function installPlaywrightChromiumRuntime({
  installRoot = '',
  cliPath = resolvePlaywrightCliPath(),
  spawnImpl = spawn,
  execPath = process.execPath,
  cwd = process.cwd(),
  env = process.env,
  processVersions = process.versions,
  platform = process.platform,
} = {}) {
  const targetRoot = path.resolve(String(installRoot || '').trim())
  if (!targetRoot) {
    throw new Error('A browser runtime install root is required.')
  }
  if (!cliPath) {
    throw new Error(
      'playwright-core is required before installing the browser runtime. Run npm install first.',
    )
  }

  await fs.mkdir(targetRoot, { recursive: true })

  await new Promise((resolve, reject) => {
    const child = spawnImpl(
      execPath,
      [cliPath, 'install', 'chromium'],
      {
        cwd,
        stdio: 'inherit',
        windowsHide: true,
        env: {
          ...env,
          PLAYWRIGHT_BROWSERS_PATH: targetRoot,
          ...(processVersions?.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        },
      },
    )
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`Playwright Chromium install failed with exit code ${code || 1}.`))
    })
  })

  const executablePath = await resolveChromiumExecutablePathInRoot(targetRoot, { platform })
  if (!executablePath) {
    throw new Error('Playwright Chromium install completed but no browser executable was found.')
  }
  return executablePath
}

export async function ensurePlaywrightChromiumRuntime({
  installRoot = '',
  platform = process.platform,
  ...options
} = {}) {
  const targetRoot = path.resolve(String(installRoot || '').trim())
  if (!targetRoot) {
    throw new Error('A browser runtime install root is required.')
  }

  const existingExecutablePath = await resolveChromiumExecutablePathInRoot(targetRoot, { platform })
  if (existingExecutablePath) {
    return {
      executablePath: existingExecutablePath,
      installed: false,
    }
  }

  const existingInstallPromise = installPromisesByRoot.get(targetRoot)
  if (existingInstallPromise) {
    return await existingInstallPromise
  }

  const installPromise = (async () => {
    const executablePath = await installPlaywrightChromiumRuntime({
      installRoot: targetRoot,
      platform,
      ...options,
    })
    return {
      executablePath,
      installed: true,
    }
  })()

  installPromisesByRoot.set(targetRoot, installPromise)
  try {
    return await installPromise
  } finally {
    installPromisesByRoot.delete(targetRoot)
  }
}
