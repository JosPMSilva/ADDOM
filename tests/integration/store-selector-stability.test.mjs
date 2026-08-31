import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const RENDERER_ROOT = path.resolve('src/renderer')
const OBJECT_SELECTOR_PATTERN = /use[A-Za-z0-9]*Store\s*\(\s*(?:\(\s*(?:state|s)\s*\)|(?:state|s))\s*=>\s*\(\s*\{/gm
const ALLOW_MARKER = '@allow-unstable-zustand-selector'

function collectSourceFiles(rootDir) {
  const stack = [rootDir]
  const files = []
  while (stack.length > 0) {
    const current = stack.pop()
    const entries = fs.readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue
        stack.push(absolute)
        continue
      }
      if (!/\.(jsx?|mjs)$/.test(entry.name)) continue
      files.push(absolute)
    }
  }
  return files
}

test('renderer does not introduce unstable zustand object selectors without explicit allow marker', () => {
  const offenders = []
  for (const filePath of collectSourceFiles(RENDERER_ROOT)) {
    const source = fs.readFileSync(filePath, 'utf8')
    if (source.includes(ALLOW_MARKER)) continue
    const match = OBJECT_SELECTOR_PATTERN.exec(source)
    OBJECT_SELECTOR_PATTERN.lastIndex = 0
    if (!match) continue
    offenders.push(path.relative(process.cwd(), filePath))
  }

  assert.deepEqual(
    offenders,
    [],
    `Unstable zustand object selectors detected. Refactor selectors or add ${ALLOW_MARKER} with justification:\n${offenders.join('\n')}`,
  )
})
