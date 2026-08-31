import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function collectMainSourceFiles(dirPath) {
  const out = []
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const absolutePath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      out.push(...collectMainSourceFiles(absolutePath))
      continue
    }
    if (entry.isFile() && absolutePath.endsWith('.mjs')) {
      out.push(absolutePath)
    }
  }
  return out
}

test('src/main contains no bare empty catch blocks', () => {
  const root = path.resolve('src/main')
  const offenders = []

  for (const absolutePath of collectMainSourceFiles(root)) {
    const source = fs.readFileSync(absolutePath, 'utf8')
    if (/catch\s*\{\s*\}/.test(source)) {
      offenders.push(path.relative(process.cwd(), absolutePath))
    }
  }

  assert.deepEqual(offenders, [])
})
