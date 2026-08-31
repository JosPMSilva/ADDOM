import fs from 'node:fs/promises'
import path from 'node:path'

const repoRoot = process.cwd()
const scanRoots = [
  path.join(repoRoot, 'src'),
  path.join(repoRoot, 'scripts'),
  path.join(repoRoot, 'tests'),
]
const extraFiles = [
  path.join(repoRoot, 'package.json'),
  path.join(repoRoot, 'knip.json'),
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

async function collectJsonFiles(dirPath, out = []) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name)) continue
        await collectJsonFiles(fullPath, out)
        continue
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        out.push(fullPath)
      }
    }
  } catch {
    return out
  }
  return out
}

function normalizeCliFilePath(inputPath = '') {
  const resolved = path.resolve(repoRoot, String(inputPath || ''))
  return resolved.toLowerCase().endsWith('.json') ? resolved : ''
}

async function main() {
  const fileSet = new Set(
    cliTargets.length > 0
      ? cliTargets.map(normalizeCliFilePath).filter(Boolean)
      : [],
  )
  if (cliTargets.length === 0) {
    for (const root of scanRoots) {
      const files = await collectJsonFiles(root)
      for (const filePath of files) fileSet.add(filePath)
    }
    for (const filePath of extraFiles) {
      try {
        await fs.access(filePath)
        fileSet.add(filePath)
      } catch {
        // Optional root config file missing.
      }
    }
  }

  const files = [...fileSet].sort((left, right) => left.localeCompare(right))
  const failures = []
  for (const filePath of files) {
    try {
      JSON.parse(await fs.readFile(filePath, 'utf8'))
    } catch (error) {
      failures.push({
        filePath: path.relative(repoRoot, filePath),
        message: error?.message || String(error),
      })
    }
  }

  if (failures.length > 0) {
    process.stderr.write(`JSON syntax check failed for ${failures.length} file(s).\n`)
    for (const failure of failures) {
      process.stderr.write(`- ${failure.filePath}: ${failure.message}\n`)
    }
    process.exit(1)
  }

  process.stdout.write(`JSON syntax OK (${files.length} files)\n`)
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error?.message || String(error)}\n`)
  process.exit(1)
})
