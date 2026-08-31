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
  assert.match(source, /^## Project Status$/m)
  assert.match(source, /^## Why ADDOM$/m)
  assert.match(source, /^## Run From Source$/m)
  assert.match(source, /^## First Run$/m)
  assert.match(source, /^## Privacy And Provider Boundaries$/m)
  assert.match(source, /^## Documentation$/m)
  assert.match(source, /^## Architecture At A Glance$/m)
  assert.match(source, /Node\.js 24/)
  assert.match(source, /npm ci/)
  assert.match(source, /\[docs\/README\.md\]\(\.\/docs\/README\.md\)/)
  assert.match(source, /\[CONTRIBUTING\.md\]\(\.\/CONTRIBUTING\.md\)/)
  assert.match(source, /\[CHANGELOG\.md\]\(\.\/CHANGELOG\.md\)/)
  assert.doesNotMatch(source, /switch(?:es|ing)? `?better-sqlite3`?/i)
})

test('CONTRIBUTING includes the contributor workflow commands', () => {
  const source = readFile('CONTRIBUTING.md')

  assert.match(source, /npm run dev/)
  assert.match(source, /npm run test:integration/)
  assert.match(source, /npm run check:docs-links/)
  assert.match(source, /npm run check:max-lines/)
  assert.match(source, /Node\.js 24/)
  assert.match(source, /npm ci/)
  assert.match(source, /800-line source guard/)
  assert.match(source, /STRICT_MAX_LINES/)
  assert.doesNotMatch(source, /runtime switch|switches? .*native/i)
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

test('public documentation does not advertise removed surfaces or commands', () => {
  const markdownFiles = [
    'README.md',
    'CONTRIBUTING.md',
    ...fs.readdirSync(path.resolve('docs'), { recursive: true })
      .filter((entry) => String(entry).endsWith('.md'))
      .map((entry) => path.join('docs', String(entry))),
  ]
  const source = markdownFiles.map(readFile).join('\n')

  assert.doesNotMatch(source, /Providers & Models|Tools & Safety|Data & Privacy|Guardrails & Diagnostics/)
  assert.doesNotMatch(source, /delegate_to_workers|worker-runtime-tooling|worker-runtime\.mjs/)
  assert.doesNotMatch(source, /design:spec|design:diff|coverage-matrix\.md/)
  assert.doesNotMatch(source, /latest Phase \d|latest Windows validation machine|follow-up release|planned separately/i)
})
