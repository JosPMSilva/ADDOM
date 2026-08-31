import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const scanRoots = [
  path.join(repoRoot, 'scripts'),
  path.join(repoRoot, 'tests'),
]
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

async function collectPs1Files(dirPath, out = []) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name)) continue
        await collectPs1Files(fullPath, out)
        continue
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.ps1')) {
        out.push(fullPath)
      }
    }
  } catch {
    return out
  }
  return out
}

function checkPowerShellFile(filePath = '') {
  const parserScript = `
$errors = @()
[void][System.Management.Automation.Language.Parser]::ParseFile('${String(filePath).replace(/'/g, "''")}', [ref]$null, [ref]$errors)
if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Error $_.Message }
  exit 1
}
`
  return spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', parserScript], {
    encoding: 'utf8',
  })
}

function normalizeCliFilePath(inputPath = '') {
  const resolved = path.resolve(repoRoot, String(inputPath || ''))
  return resolved.toLowerCase().endsWith('.ps1') ? resolved : ''
}

async function main() {
  if (process.platform !== 'win32') {
    process.stdout.write('PowerShell syntax check skipped on non-Windows host.\n')
    return
  }

  const files = cliTargets.length > 0
    ? cliTargets.map(normalizeCliFilePath).filter(Boolean)
    : []
  if (cliTargets.length === 0) {
    for (const root of scanRoots) {
      await collectPs1Files(root, files)
    }
  }
  files.sort((left, right) => left.localeCompare(right))

  const failures = []
  for (const filePath of files) {
    const result = checkPowerShellFile(filePath)
    if (result.status === 0) continue
    failures.push({
      filePath: path.relative(repoRoot, filePath),
      message: String(result.stderr || result.stdout || '').trim() || 'PowerShell parse failed.',
    })
  }

  if (failures.length > 0) {
    process.stderr.write(`PowerShell syntax check failed for ${failures.length} file(s).\n`)
    for (const failure of failures) {
      process.stderr.write(`\n${failure.filePath}\n${failure.message}\n`)
    }
    process.exit(1)
  }

  process.stdout.write(`PowerShell syntax OK (${files.length} files)\n`)
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error?.message || String(error)}\n`)
  process.exit(1)
})
