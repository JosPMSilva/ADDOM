import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('preload approval respond reports invalid response channels instead of silently succeeding', () => {
  const source = fs.readFileSync(path.resolve('src/preload/index.mjs'), 'utf8')

  assert.match(source, /Rejected invalid tool approval response channel/)
  assert.match(source, /return false/)
  assert.match(source, /sendVersioned\(channel, payload\)\s*return true/s)
  assert.match(source, /sendVersioned\('tool:approval-response', payload\)\s*return true/s)
})
