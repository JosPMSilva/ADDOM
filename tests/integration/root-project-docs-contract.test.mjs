import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readFile(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

test('root project docs exist', () => {
  assert.equal(fs.existsSync(path.resolve('README.md')), true)
  assert.equal(fs.existsSync(path.resolve('CONTRIBUTING.md')), true)
  assert.equal(fs.existsSync(path.resolve('CHANGELOG.md')), true)
})

test('README includes the required landing-page sections and links', () => {
  const source = readFile('README.md')

  assert.match(source, /^# ADDOM/m)
  assert.match(source, /^## Quick Start$/m)
  assert.match(source, /^## Documentation$/m)
  assert.match(source, /^## Architecture At A Glance$/m)
  assert.match(source, /\[docs\/README\.md\]\(\.\/docs\/README\.md\)/)
  assert.match(source, /\[CONTRIBUTING\.md\]\(\.\/CONTRIBUTING\.md\)/)
  assert.match(source, /\[CHANGELOG\.md\]\(\.\/CHANGELOG\.md\)/)
})

test('CONTRIBUTING includes the contributor workflow commands', () => {
  const source = readFile('CONTRIBUTING.md')

  assert.match(source, /npm run dev/)
  assert.match(source, /npm run test:integration/)
  assert.match(source, /npm run check:docs-links/)
  assert.match(source, /npm run check:max-lines/)
  assert.match(source, /800-line source guard/)
  assert.match(source, /STRICT_MAX_LINES/)
})

test('CHANGELOG includes the baseline structure', () => {
  const source = readFile('CHANGELOG.md')

  assert.match(source, /^# Changelog$/m)
  assert.match(source, /^## Unreleased$/m)
})

test('docs link checker includes the new root docs', () => {
  const source = readFile('scripts/check-doc-links.mjs')

  assert.match(source, /README\.md/)
  assert.match(source, /CONTRIBUTING\.md/)
  assert.match(source, /CHANGELOG\.md/)
})
