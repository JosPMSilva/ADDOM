import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const repoRoot = process.cwd()
const desiredHooksPath = '.githooks'
const desiredHookFile = path.join(repoRoot, desiredHooksPath, 'pre-commit')

function runGit(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8'
  }).trim()
}

function tryRunGit(args) {
  try {
    return { ok: true, output: runGit(args) }
  } catch {
    return { ok: false, output: '' }
  }
}

if (process.env.CI) {
  console.log('Skipping git hook install in CI environment.')
  process.exit(0)
}

if (!fs.existsSync(path.join(repoRoot, '.git'))) {
  console.log('Skipping git hook install: not inside a git repository.')
  process.exit(0)
}

let currentHooksPath = ''
const repoCheck = tryRunGit(['rev-parse', '--is-inside-work-tree'])
if (!repoCheck.ok) {
  console.log('Skipping git hook install: git metadata unavailable.')
  process.exit(0)
}
const hooksPathResult = tryRunGit(['config', '--local', '--get', 'core.hooksPath'])
currentHooksPath = hooksPathResult.ok ? hooksPathResult.output : ''

if (currentHooksPath && currentHooksPath !== desiredHooksPath) {
  console.log(`Skipping git hook install: core.hooksPath is already set to "${currentHooksPath}".`)
  process.exit(0)
}

runGit(['config', '--local', 'core.hooksPath', desiredHooksPath])
console.log(`Configured core.hooksPath to "${desiredHooksPath}".`)

if (fs.existsSync(desiredHookFile)) {
  try {
    fs.chmodSync(desiredHookFile, 0o755)
  } catch {
    // On Windows and restricted filesystems, chmod may be a no-op.
  }
}
