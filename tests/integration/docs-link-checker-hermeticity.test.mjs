import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const checkerSource = fs.readFileSync(
  path.resolve('scripts/check-doc-links.mjs'),
  'utf8'
)

function run(root, command, args) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8'
  })
}

function createFixture({ trackTarget }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-doc-links-'))
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
  fs.mkdirSync(path.join(root, 'ignored'), { recursive: true })
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'docs', 'review.md'),
    '# Review\n\n[Local evidence](../ignored/evidence.txt)\n'
  )
  fs.writeFileSync(path.join(root, 'ignored', 'evidence.txt'), 'evidence\n')
  fs.writeFileSync(
    path.join(root, 'scripts', 'check-doc-links.mjs'),
    checkerSource
  )
  fs.writeFileSync(path.join(root, '.gitignore'), trackTarget ? '' : '/ignored/\n')

  assert.equal(run(root, 'git', ['init', '--quiet']).status, 0)
  const tracked = [
    '.gitignore',
    'docs/review.md',
    'scripts/check-doc-links.mjs'
  ]
  if (trackTarget) tracked.push('ignored/evidence.txt')
  assert.equal(run(root, 'git', ['add', '--', ...tracked]).status, 0)
  return root
}

test('docs link checker rejects local targets that are absent from a clean checkout', () => {
  const root = createFixture({ trackTarget: false })
  try {
    const result = run(root, process.execPath, ['scripts/check-doc-links.mjs'])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /\[untracked_file\]/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('docs link checker accepts tracked local targets', () => {
  const root = createFixture({ trackTarget: true })
  try {
    const result = run(root, process.execPath, ['scripts/check-doc-links.mjs'])
    assert.equal(result.status, 0, result.stderr)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
