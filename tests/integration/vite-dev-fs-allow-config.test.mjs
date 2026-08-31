import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('vite dev server fs.allow includes project root and node_modules for Monaco assets', () => {
  const source = fs.readFileSync(path.resolve('vite.config.js'), 'utf8')
  assert.match(source, /server\s*:\s*\{/)
  assert.match(source, /fs\s*:\s*\{/)
  assert.match(source, /allow\s*:\s*\[/)
  assert.match(source, /path\.resolve\(__dirname\)/)
  assert.match(source, /path\.resolve\(__dirname,\s*'node_modules'\)/)
})
