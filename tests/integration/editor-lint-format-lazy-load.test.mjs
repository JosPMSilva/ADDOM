import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readSource(relativePath) {
  const abs = path.join(process.cwd(), relativePath)
  return fs.readFileSync(abs, 'utf8')
}

test('editor lint worker lazy-loads eslint and related lint deps at runtime', () => {
  const source = readSource('src/main/ipc-handlers/editor-lint-worker.mjs')

  assert.doesNotMatch(source, /import\s+.*from\s+['"]eslint['"]/)
  assert.doesNotMatch(source, /import\s+.*from\s+['"]@eslint\/js['"]/)
  assert.doesNotMatch(source, /import\s+.*from\s+['"]@typescript-eslint\/parser['"]/)
  assert.doesNotMatch(source, /import\s+.*from\s+['"]@typescript-eslint\/eslint-plugin['"]/)
  assert.doesNotMatch(source, /import\s+.*from\s+['"]eslint-plugin-react['"]/)
  assert.doesNotMatch(source, /import\s+.*from\s+['"]eslint-plugin-react-hooks['"]/)

  assert.match(source, /import\('eslint'\)/)
  assert.match(source, /import\('@eslint\/js'\)/)
  assert.match(source, /const MAX_ESLINT_INSTANCE_CACHE_SIZE = 20/)
  assert.match(source, /while \(eslintInstanceCache\.size > MAX_ESLINT_INSTANCE_CACHE_SIZE\)/)
  assert.match(source, /eslintInstanceCache\.delete\(cacheKey\)\s*eslintInstanceCache\.set\(cacheKey,\s*cached\)/)
  assert.match(source, /export const __testEditorLintWorkerInternals = Object\.freeze\(/)
})

test('editor formatter resolves biome binary on demand (no eager biome import)', () => {
  const source = readSource('src/main/ipc-handlers/editor-format.mjs')

  assert.doesNotMatch(source, /import\s+.*from\s+['"]@biomejs\/biome['"]/)
  assert.doesNotMatch(source, /import\s+.*from\s+['"]prettier['"]/)
  assert.match(source, /require\.resolve\('@biomejs\/biome\/bin\/biome'\)/)
  assert.match(source, /require\.resolve\('prettier'\)/)
  assert.match(source, /import\('prettier'\)/)
})
