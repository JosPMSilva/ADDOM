import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('memory export source writes JSON with owner-only mode and hardens permissions', () => {
  const source = fs.readFileSync(path.resolve('src/main/ipc-handlers/memory.mjs'), 'utf8')

  assert.match(source, /applyOwnerOnlyFilePermissions/)
  assert.match(
    source,
    /fs\.writeFileSync\(result\.filePath,\s*json,\s*\{\s*encoding:\s*'utf8',\s*mode:\s*0o600\s*\}\)/,
  )
  assert.match(source, /applyOwnerOnlyFilePermissions\(result\.filePath\)/)
})
