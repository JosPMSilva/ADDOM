import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const scanRoots = [
  path.join(repoRoot, 'src', 'main'),
  path.join(repoRoot, 'src', 'common'),
  path.join(repoRoot, 'src', 'preload'),
  path.join(repoRoot, 'scripts'),
  path.join(repoRoot, 'tests'),
]
const scanExtensions = new Set(['.js', '.mjs', '.cjs'])
const cliTargets = process.argv.slice(2)
const ignoreDirs = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-electron',
  '.vite',
  '.vite-test-cache',
  '.vite-check-renderer-jsx-syntax',
  '.vite-check-renderer-syntax',
  'coverage',
])

async function collectFiles(dirPath, out = []) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name)) continue
        await collectFiles(path.join(dirPath, entry.name), out)
        continue
      }
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (!scanExtensions.has(ext)) continue
      out.push(path.join(dirPath, entry.name))
    }
  } catch {
    return out
  }
  return out
}

function resolveModes(filePath = '') {
  const normalized = String(filePath || '').replace(/\\/g, '/')
  if (normalized.endsWith('.mjs')) return ['module']
  if (normalized.endsWith('.cjs')) return ['commonjs']
  if (normalized.includes('/src/renderer/')) return ['module', 'commonjs']
  return ['commonjs', 'module']
}

function checkSourceText(sourceText = '', mode = 'module') {
  return spawnSync(process.execPath, ['--check', `--input-type=${mode}`], {
    input: sourceText,
    encoding: 'utf8',
  })
}

function normalizeCliFilePath(inputPath = '') {
  const resolved = path.resolve(repoRoot, String(inputPath || ''))
  const ext = path.extname(resolved).toLowerCase()
  if (!scanExtensions.has(ext)) return ''
  if (resolved.includes(`${path.sep}src${path.sep}renderer${path.sep}`)) return ''
  return resolved
}

async function main() {
  const files = cliTargets.length > 0
    ? cliTargets
      .map(normalizeCliFilePath)
      .filter(Boolean)
    : []
  if (cliTargets.length === 0) {
    for (const root of scanRoots) {
      await collectFiles(root, files)
    }
  }
  files.sort((left, right) => left.localeCompare(right))

  const failures = []
  for (const filePath of files) {
    const sourceText = await fs.readFile(filePath, 'utf8')
    const modes = resolveModes(filePath)
    let passed = false
    let firstFailure = null
    for (const mode of modes) {
      const result = checkSourceText(sourceText, mode)
      if (result.status === 0) {
        passed = true
        break
      }
      if (!firstFailure) {
        firstFailure = {
          mode,
          stderr: String(result.stderr || '').trim(),
          stdout: String(result.stdout || '').trim(),
        }
      }
    }
    if (passed) continue
    failures.push({
      filePath: path.relative(repoRoot, filePath),
      mode: firstFailure?.mode || modes[0],
      message: firstFailure?.stderr || firstFailure?.stdout || 'Syntax check failed.',
    })
  }

  if (failures.length > 0) {
    process.stderr.write(`Node-side syntax check failed for ${failures.length} file(s).\n`)
    for (const failure of failures) {
      process.stderr.write(`\n[${failure.mode}] ${failure.filePath}\n${failure.message}\n`)
    }
    process.exit(1)
  }

  process.stdout.write(`Node-side syntax OK (${files.length} files)\n`)
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error?.message || String(error)}\n`)
  process.exit(1)
})
