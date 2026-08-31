import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

import {
  resolvePackagedBrowserSmokeArgs,
  resolvePackagedBrowserSmokeExecutablePath,
} from './packaged-browser-runtime-smoke-helpers.mjs'

function trimString(value = '') {
  return String(value || '').trim()
}

function parseBooleanFlag(value = '') {
  const normalized = trimString(value).toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

export function isPackagedTerminalSmokeEnabled(env = process.env) {
  return parseBooleanFlag(env?.ADDOM_PACKAGED_TERMINAL_SMOKE)
}

export function resolvePackagedTerminalSmokeTimeoutMs(env = process.env) {
  const raw = Number(env?.ADDOM_PACKAGED_TERMINAL_SMOKE_TIMEOUT_MS)
  if (!Number.isFinite(raw) || raw <= 0) return 180_000
  return Math.max(30_000, Math.round(raw))
}

export function resolvePackagedTerminalSmokeExecutablePath({
  env = process.env,
  cwd = process.cwd(),
  platform = process.platform,
} = {}) {
  return resolvePackagedBrowserSmokeExecutablePath({ env, cwd, platform })
}

export function resolvePackagedTerminalSmokeArgs({
  env = process.env,
  platform = process.platform,
} = {}) {
  return resolvePackagedBrowserSmokeArgs({ env, platform })
}

export async function runPackagedTerminalRuntimeSmoke({
  env = process.env,
  cwd = process.cwd(),
  platform = process.platform,
  spawnImpl = spawn,
} = {}) {
  const executablePath = resolvePackagedTerminalSmokeExecutablePath({ env, cwd, platform })
  const executableArgs = resolvePackagedTerminalSmokeArgs({ env, platform })
  const timeoutMs = resolvePackagedTerminalSmokeTimeoutMs(env)
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'addom-packaged-terminal-smoke-'))
  const userDataPath = path.join(tempRoot, 'userData')
  const resultPath = path.join(tempRoot, 'packaged-terminal-runtime-smoke.json')

  const stdoutChunks = []
  const stderrChunks = []

  try {
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawnImpl(executablePath, executableArgs, {
        cwd,
        env: {
          ...process.env,
          ...env,
          ADDOM_PACKAGED_TERMINAL_SMOKE: '1',
          ADDOM_USER_DATA_PATH: userDataPath,
          ADDOM_PACKAGED_TERMINAL_SMOKE_RESULT_PATH: resultPath,
          ADDOM_PACKAGED_TERMINAL_SMOKE_TIMEOUT_MS: String(timeoutMs),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })

      child.stdout?.on('data', (chunk) => stdoutChunks.push(Buffer.from(chunk).toString('utf8')))
      child.stderr?.on('data', (chunk) => stderrChunks.push(Buffer.from(chunk).toString('utf8')))
      child.on('error', reject)

      const timer = setTimeout(() => {
        child.kill()
        reject(new Error(`Packaged terminal runtime smoke timed out after ${timeoutMs}ms.`))
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

export async function cleanupPackagedTerminalSmokeRun(run = {}) {
  const tempRoot = trimString(run?.tempRoot)
  if (!tempRoot) return
  await rm(tempRoot, { recursive: true, force: true })
}
