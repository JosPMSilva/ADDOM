import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveSpawnCommand } from './lib/resolve-spawn-command.mjs'

const INSTALL_FLAG = '--install'
const HELP_FLAGS = new Set(['-h', '--help'])
const WINDOWS_PLATFORM = 'win32'

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function parseOptions(argv = process.argv.slice(2)) {
  let includeInstall = false

  for (const arg of argv) {
    if (HELP_FLAGS.has(arg)) {
      return { help: true, includeInstall: false }
    }

    if (arg === INSTALL_FLAG) {
      includeInstall = true
      continue
    }

    throw new Error(`Unknown argument "${arg}". Supported flags: ${INSTALL_FLAG}, --help.`)
  }

  return { help: false, includeInstall }
}

function createNpmStep(name, args) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  return {
    name,
    command: npmCommand,
    args,
    display: `npm ${args.join(' ')}`,
  }
}

export function buildReleaseFreezeSteps({ includeInstall = false, platform = process.platform } = {}) {
  const steps = []

  if (includeInstall) {
    steps.push(createNpmStep('install', ['install']))
  }

  steps.push(
    createNpmStep('release reproducibility', ['run', 'check:release-reproducibility']),
    createNpmStep('native electron runtime', ['run', 'native:electron']),
    createNpmStep('integration tests', ['run', 'test:integration']),
    createNpmStep('directory build', ['run', 'build:dir']),
  )

  if (platform === WINDOWS_PLATFORM) {
    steps.push(createNpmStep('packaged terminal runtime smoke', ['run', 'test:live-smoke:packaged:terminal']))
  }

  return steps
}

function getPolicyNotes(platform = process.platform) {
  if (platform === WINDOWS_PLATFORM) {
    return ['Windows host detected: packaged terminal smoke is required release evidence and will run after build:dir.']
  }

  return ['Packaged terminal smoke is Windows-only release evidence and is not required on this host platform.']
}

function formatDuration(durationMs) {
  if (durationMs < 1000) {
    return `${durationMs}ms`
  }

  return `${(durationMs / 1000).toFixed(1)}s`
}

function runStep(step, { repoRoot }) {
  const startedAt = Date.now()
  console.log(`[release-freeze] running ${step.display}`)

  const resolved = resolveSpawnCommand(step.command, step.args, process.platform, process.env)
  const result = spawnSync(resolved.command, resolved.args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
    ...resolved.options,
  })

  const durationMs = Date.now() - startedAt

  if (result.error) {
    throw new Error(`Failed to start ${step.display}: ${result.error.message}`)
  }

  if (result.status !== 0) {
    throw new Error(`${step.display} failed with exit code ${result.status ?? 'unknown'}.`)
  }

  if (result.signal) {
    throw new Error(`${step.display} terminated with signal ${result.signal}.`)
  }

  return {
    ...step,
    durationMs,
  }
}

function printSummary(results, { platform = process.platform } = {}) {
  const totalDurationMs = results.reduce((sum, result) => sum + result.durationMs, 0)

  console.log('[release-freeze] evidence summary')
  for (const result of results) {
    console.log(`[release-freeze] ${result.display}: pass (${formatDuration(result.durationMs)})`)
  }
  for (const note of getPolicyNotes(platform)) {
    console.log(`[release-freeze] note: ${note}`)
  }
  console.log(`[release-freeze] total: ${formatDuration(totalDurationMs)}`)
}

function printHelp() {
  console.log('Usage: node scripts/check-release-freeze.mjs [--install]')
  console.log('')
  console.log('Runs the repo-owned release-freeze gate from the current workspace.')
  console.log(`Use ${INSTALL_FLAG} to prepend npm install for clean-clone validation.`)
}

export function runReleaseFreeze({ repoRoot = resolveRepoRoot(), includeInstall = false, platform = process.platform } = {}) {
  const results = []

  for (const step of buildReleaseFreezeSteps({ includeInstall, platform })) {
    results.push(runStep(step, { repoRoot }))
  }

  printSummary(results, { platform })
  return results
}

async function main() {
  const options = parseOptions()
  if (options.help) {
    printHelp()
    return
  }

  runReleaseFreeze({ includeInstall: options.includeInstall })
}

const isEntrypoint = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false

if (isEntrypoint) {
  await main()
}
