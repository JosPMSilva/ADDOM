import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'dist-electron',
  'coverage',
])
const TARGET_FILES = new Set([
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
])
const BLOCKED_PATTERNS = [
  {
    label: 'axios@1.14.1',
    pattern: /["']axios["'][^:\n]*:\s*["'~^]*1\.14\.1["']|axios@1\.14\.1/g,
  },
  {
    label: 'axios@0.30.4',
    pattern: /["']axios["'][^:\n]*:\s*["'~^]*0\.30\.4["']|axios@0\.30\.4/g,
  },
  {
    label: 'plain-crypto-js',
    pattern: /plain-crypto-js/g,
  },
]

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/')
}

function collectTargetFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      collectTargetFiles(path.join(dir, entry.name), results)
      continue
    }
    if (!entry.isFile()) continue
    if (!TARGET_FILES.has(entry.name)) continue
    results.push(path.join(dir, entry.name))
  }
  return results
}

function findLineNumber(sourceText, matchIndex) {
  let line = 1
  for (let i = 0; i < matchIndex; i += 1) {
    if (sourceText.charCodeAt(i) === 10) line += 1
  }
  return line
}

const failures = []
for (const filePath of collectTargetFiles(ROOT)) {
  const sourceText = fs.readFileSync(filePath, 'utf8')
  for (const { label, pattern } of BLOCKED_PATTERNS) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(sourceText))) {
      failures.push({
        filePath: toPosix(path.relative(ROOT, filePath)),
        line: findLineNumber(sourceText, match.index),
        label,
        excerpt: match[0],
      })
    }
  }
}

if (failures.length > 0) {
  console.error('Blocked package reference detected:')
  for (const failure of failures) {
    console.error(`- ${failure.filePath}:${failure.line} -> ${failure.label} (${failure.excerpt})`)
  }
  process.exit(1)
}

console.log('Blocked package guard passed.')
