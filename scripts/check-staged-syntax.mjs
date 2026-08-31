import fs from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const repoRoot = process.cwd()
const maxForwardedArgumentChars = 24_000

export function shouldUseFullSyntaxScan(files = [], maxArgumentChars = maxForwardedArgumentChars) {
  const argumentChars = files.reduce((total, file) => total + String(file || '').length + 1, 0)
  return argumentChars > maxArgumentChars
}

function runNodeScript(scriptName, files = []) {
  if (!Array.isArray(files) || files.length === 0) return
  const forwardedFiles = shouldUseFullSyntaxScan(files) ? [] : files
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', scriptName), ...forwardedFiles], {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  if (result.error) {
    process.stderr.write(`${result.error.message || String(result.error)}\n`)
  }
  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

function readStagedFiles() {
  try {
    const output = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return output
      .split(/\r?\n/)
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  } catch (error) {
    process.stderr.write(`${error?.message || String(error)}\n`)
    process.exit(1)
  }
}

function toPosix(value = '') {
  return String(value || '').replace(/\\/g, '/')
}

export function groupFiles(files = [], options = {}) {
  const root = path.resolve(options.repoRoot || repoRoot)
  const groups = {
    node: new Set(),
    renderer: new Set(),
    json: new Set(),
    powershell: new Set(),
  }
  for (const rawFile of files) {
    const file = toPosix(rawFile)
    if (!file || file.startsWith('dist/') || file.startsWith('dist-electron/')) continue
    const absolutePath = path.join(root, file)
    if (!fs.existsSync(absolutePath)) continue
    if (file.startsWith('src/renderer/') && /\.(js|jsx|mjs)$/i.test(file)) {
      groups.renderer.add(file)
      continue
    }
    if (/\.(js|mjs|cjs)$/i.test(file)) {
      groups.node.add(file)
      continue
    }
    if (/\.json$/i.test(file)) {
      groups.json.add(file)
      continue
    }
    if (/\.ps1$/i.test(file)) {
      groups.powershell.add(file)
    }
  }
  return {
    node: Array.from(groups.node),
    renderer: Array.from(groups.renderer),
    json: Array.from(groups.json),
    powershell: Array.from(groups.powershell),
  }
}

export function main() {
  const stagedFiles = readStagedFiles()
  const groups = groupFiles(stagedFiles)
  const totalRelevantFiles = Object.values(groups).reduce((sum, files) => sum + files.length, 0)

  if (totalRelevantFiles === 0) {
    process.stdout.write('No staged syntax-relevant files.\n')
    return 0
  }

  runNodeScript('check-node-syntax.mjs', groups.node)
  runNodeScript('check-renderer-jsx-syntax.mjs', groups.renderer)
  runNodeScript('check-json-syntax.mjs', groups.json)
  runNodeScript('check-powershell-syntax.mjs', groups.powershell)

  process.stdout.write(`Staged syntax OK (${totalRelevantFiles} files)\n`)
  return 0
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false

if (isDirectRun) {
  process.exitCode = main()
}
