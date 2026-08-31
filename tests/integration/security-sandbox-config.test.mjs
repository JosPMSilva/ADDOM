import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('main window webPreferences keep renderer sandbox boundary enabled', () => {
  const source = fs.readFileSync(path.resolve('src/main/index.mjs'), 'utf8')

  assert.match(
    source,
    /webPreferences\s*:\s*\{[\s\S]*?sandbox\s*:\s*true/,
    'BrowserWindow webPreferences should set sandbox: true',
  )
  assert.doesNotMatch(
    source,
    /webPreferences\s*:\s*\{[\s\S]*?sandbox\s*:\s*false/,
    'BrowserWindow webPreferences must not set sandbox: false',
  )
  assert.match(
    source,
    /webPreferences\s*:\s*\{[\s\S]*?contextIsolation\s*:\s*true/,
    'contextIsolation must stay enabled',
  )
  assert.match(
    source,
    /webPreferences\s*:\s*\{[\s\S]*?nodeIntegration\s*:\s*false/,
    'nodeIntegration must stay disabled',
  )
})
