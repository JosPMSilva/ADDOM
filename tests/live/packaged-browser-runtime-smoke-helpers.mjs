import fs from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

function trimString(value = '') {
  return String(value || '').trim()
}

function parseBooleanFlag(value = '') {
  const normalized = trimString(value).toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function readPackageJson(cwd = process.cwd()) {
  return JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'))
}

export function isPackagedBrowserSmokeEnabled(env = process.env) {
  return parseBooleanFlag(env?.ADDOM_PACKAGED_BROWSER_SMOKE)
}

export function resolvePackagedBrowserSmokeTimeoutMs(env = process.env) {
  const raw = Number(env?.ADDOM_PACKAGED_BROWSER_SMOKE_TIMEOUT_MS)
  if (!Number.isFinite(raw) || raw <= 0) return 180_000
  return Math.max(30_000, Math.round(raw))
}

export function shouldDisablePackagedBrowserSmokeSandbox({
  env = process.env,
  platform = process.platform,
} = {}) {
  if (platform !== 'linux') return false
  if (parseBooleanFlag(env?.ADDOM_PACKAGED_BROWSER_SMOKE_NO_SANDBOX)) return true
  return parseBooleanFlag(env?.CI)
}

export function resolvePackagedBrowserSmokeArgs({
  env = process.env,
  platform = process.platform,
} = {}) {
  return shouldDisablePackagedBrowserSmokeSandbox({ env, platform })
    ? ['--no-sandbox']
    : []
}

export function resolvePackagedBrowserSmokeExecutablePath({
  env = process.env,
  cwd = process.cwd(),
  platform = process.platform,
} = {}) {
  const override = trimString(env?.ADDOM_PACKAGED_BROWSER_SMOKE_EXECUTABLE)
  if (override) return path.resolve(cwd, override)

  const packageJson = readPackageJson(cwd)
  const outputDir = trimString(packageJson?.build?.directories?.output) || 'dist-electron'
  const productName = trimString(packageJson?.build?.productName || packageJson?.productName || packageJson?.name) || 'ADDOM'
  const linuxExecutableName = trimString(
    packageJson?.build?.linux?.executableName
    || packageJson?.build?.executableName
    || packageJson?.name,
  ) || productName

  switch (platform) {
    case 'win32':
      return path.join(cwd, outputDir, 'win-unpacked', `${productName}.exe`)
    case 'darwin':
      return path.join(cwd, outputDir, `${productName}.app`, 'Contents', 'MacOS', productName)
    default:
      return path.join(cwd, outputDir, 'linux-unpacked', linuxExecutableName)
  }
}

export async function runPackagedBrowserRuntimeSmoke({
  env = process.env,
  cwd = process.cwd(),
  platform = process.platform,
  spawnImpl = spawn,
} = {}) {
  const executablePath = resolvePackagedBrowserSmokeExecutablePath({ env, cwd, platform })
  const executableArgs = resolvePackagedBrowserSmokeArgs({ env, platform })
  const timeoutMs = resolvePackagedBrowserSmokeTimeoutMs(env)
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'addom-packaged-browser-smoke-'))
  const userDataPath = path.join(tempRoot, 'userData')
  const resultPath = path.join(tempRoot, 'packaged-browser-runtime-smoke.json')

  const stdoutChunks = []
  const stderrChunks = []

  try {
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawnImpl(executablePath, executableArgs, {
        cwd,
        env: {
          ...process.env,
          ...env,
          ADDOM_PACKAGED_BROWSER_SMOKE: '1',
          ADDOM_USER_DATA_PATH: userDataPath,
          ADDOM_PACKAGED_BROWSER_SMOKE_RESULT_PATH: resultPath,
          ADDOM_PACKAGED_BROWSER_SMOKE_TIMEOUT_MS: String(timeoutMs),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })

      child.stdout?.on('data', (chunk) => stdoutChunks.push(Buffer.from(chunk).toString('utf8')))
      child.stderr?.on('data', (chunk) => stderrChunks.push(Buffer.from(chunk).toString('utf8')))
      child.on('error', reject)

      const timer = setTimeout(() => {
        child.kill()
        reject(new Error(`Packaged browser runtime smoke timed out after ${timeoutMs}ms.`))
      }, timeoutMs)

      child.on('exit', (code) => {
        clearTimeout(timer)
        resolve(Number(code))
      })
    })

    const result = JSON.parse(await readFile(resultPath, 'utf8'))
    return {
      executablePath,
      executableArgs,
      tempRoot,
      userDataPath,
      resultPath,
      exitCode,
      stdout: stdoutChunks.join(''),
      stderr: stderrChunks.join(''),
      result,
    }
  } catch (error) {
    throw Object.assign(error, {
      executablePath,
      executableArgs,
      tempRoot,
      userDataPath,
      resultPath,
      stdout: stdoutChunks.join(''),
      stderr: stderrChunks.join(''),
    })
  }
}

export async function cleanupPackagedBrowserSmokeRun(run = {}) {
  const tempRoot = trimString(run?.tempRoot)
  if (!tempRoot) return
  await rm(tempRoot, { recursive: true, force: true })
}
