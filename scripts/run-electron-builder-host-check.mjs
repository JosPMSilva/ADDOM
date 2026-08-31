import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { prepareElectronBuilderRuntime } from './prepare-electron-builder-runtime.mjs'
import { resolveSpawnCommand } from './lib/resolve-spawn-command.mjs'

const EXPLICIT_TARGET_FLAGS = new Set(['--win', '--mac', '--linux'])
const HOST_TARGET_FLAGS = Object.freeze({
  win32: ['--win'],
  darwin: ['--mac'],
  linux: ['--linux'],
})

export function resolveElectronBuilderArgs(args = [], platform = process.platform) {
  const hostTargets = HOST_TARGET_FLAGS[platform]
  if (!Array.isArray(hostTargets) || hostTargets.length === 0) {
    throw new Error(`Unsupported host platform for electron-builder wrapper: ${platform}`)
  }
  const passthroughArgs = (Array.isArray(args) ? args : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value) => !EXPLICIT_TARGET_FLAGS.has(value))
  return [...hostTargets, ...passthroughArgs]
}

export function resolveElectronBuilderCommand(platform = process.platform, cwd = process.cwd()) {
  const localBinary = path.join(
    cwd,
    'node_modules',
    '.bin',
    platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder',
  )
  if (fs.existsSync(localBinary)) return localBinary
  return platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder'
}

export async function runElectronBuilder(
  args = [],
  platform = process.platform,
  {
    cwd = process.cwd(),
    env = process.env,
    spawnImpl = spawn,
  } = {},
) {
  await prepareElectronBuilderRuntime({ cwd })
  const resolvedArgs = resolveElectronBuilderArgs(args, platform)
  const command = resolveElectronBuilderCommand(platform, cwd)
  const resolvedEnv = {
    ...env,
    ADDOM_ELECTRON_BUILDER_FORCE_TRAVERSAL:
      Object.prototype.hasOwnProperty.call(env, 'ADDOM_ELECTRON_BUILDER_FORCE_TRAVERSAL')
        ? String(env.ADDOM_ELECTRON_BUILDER_FORCE_TRAVERSAL)
        : '1',
  }
  const resolved = resolveSpawnCommand(command, resolvedArgs, platform, resolvedEnv)
  return new Promise((resolve, reject) => {
    const child = spawnImpl(resolved.command, resolved.args, {
      cwd,
      stdio: 'inherit',
      env: resolvedEnv,
      ...resolved.options,
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`electron-builder exited with code ${code}.`))
    })
  })
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === invokedPath) {
  await runElectronBuilder(process.argv.slice(2))
}
