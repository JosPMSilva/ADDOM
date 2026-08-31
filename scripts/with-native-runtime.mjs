import { spawn } from 'node:child_process'
import { resolveSpawnCommand } from './lib/resolve-spawn-command.mjs'

const VALID_RUNTIMES = new Set(['node', 'electron'])
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function usage() {
  console.error(
    'Usage: node scripts/with-native-runtime.mjs <node|electron> [--restore <node|electron>] -- <command> [args...]',
  )
}

function parseArgs(argv) {
  const args = [...argv]
  const target = String(args.shift() || '').trim()
  if (!VALID_RUNTIMES.has(target)) {
    throw new Error(`Invalid target runtime: ${target || '(missing)'}`)
  }

  let restore = ''
  while (args.length > 0 && args[0] !== '--') {
    const flag = String(args.shift() || '').trim()
    if (flag !== '--restore') {
      throw new Error(`Unknown flag: ${flag}`)
    }
    const runtime = String(args.shift() || '').trim()
    if (!VALID_RUNTIMES.has(runtime)) {
      throw new Error(`Invalid restore runtime: ${runtime || '(missing)'}`)
    }
    restore = runtime
  }

  if (args[0] !== '--') {
    throw new Error('Missing "--" command separator.')
  }
  args.shift()

  if (args.length === 0) {
    throw new Error('Missing command to run after the runtime switch.')
  }

  const command = args.shift()
  const commandArgs = args
  return { target, restore, command, commandArgs }
}

function normalizeCommand(command) {
  return command === 'npm' ? npmCommand : command
}

function runCommand(command, args, label) {
  return new Promise((resolve, reject) => {
    const resolved = resolveSpawnCommand(command, args)
    const child = spawn(resolved.command, resolved.args, {
      stdio: 'inherit',
      ...resolved.options,
    })

    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code: Number(code ?? 0), signal }))

    const forwardSignal = (signalName) => {
      if (!child.killed) {
        try { child.kill(signalName) } catch {
          // Process may have already exited between the signal check and kill attempt.
        }
      }
    }

    process.once('SIGINT', forwardSignal)
    process.once('SIGTERM', forwardSignal)

    child.once('close', (_code, signal) => {
      process.removeListener('SIGINT', forwardSignal)
      process.removeListener('SIGTERM', forwardSignal)
      if (signal) {
        console.error(`[native-runtime] ${label} exited with signal ${signal}.`)
      }
    })
  })
}

async function runNativeSwitch(runtime) {
  const scriptName = `native:${runtime}`
  console.log(`[native-runtime] Switching native module build to ${runtime}.`)
  const result = await runCommand(npmCommand, ['run', scriptName], scriptName)
  if (result.code !== 0) {
    throw new Error(`npm run ${scriptName} failed with exit code ${result.code}.`)
  }
}

async function main() {
  let parsed
  try {
    parsed = parseArgs(process.argv.slice(2))
  } catch (error) {
    usage()
    console.error(String(error?.message || error))
    process.exit(1)
  }

  const { target, restore, command, commandArgs } = parsed
  const resolvedCommand = normalizeCommand(command)

  await runNativeSwitch(target)

  let mainResult = { code: 0, signal: null }
  let restoreError = null

  try {
    mainResult = await runCommand(resolvedCommand, commandArgs, 'wrapped command')
  } finally {
    if (restore) {
      try {
        await runNativeSwitch(restore)
      } catch (error) {
        restoreError = error
      }
    }
  }

  if (restoreError) {
    console.error(String(restoreError?.message || restoreError))
    if (mainResult.code === 0) {
      process.exit(1)
    }
  }

  if (mainResult.signal) {
    process.exit(1)
  }

  process.exit(mainResult.code)
}

await main()
