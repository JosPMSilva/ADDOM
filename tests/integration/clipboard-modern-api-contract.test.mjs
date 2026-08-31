import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

test('clipboard helpers rely on the modern clipboard API without execCommand fallback', () => {
  const copyBlockButtonSource = readSource('src/renderer/components/chat/CopyBlockButton.jsx')

  assert.match(copyBlockButtonSource, /navigator\?\.clipboard\?\.writeText/)
  assert.doesNotMatch(copyBlockButtonSource, /execCommand\('copy'\)/)
})
