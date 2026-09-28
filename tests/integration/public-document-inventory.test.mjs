import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  collectPublicMarkdownPaths,
  validatePublicDocumentInventory,
} from '../../scripts/check-public-documents.mjs'

async function createFixture() {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'addom-public-docs-'))
  await mkdir(path.join(repoRoot, 'config'), { recursive: true })
  await mkdir(path.join(repoRoot, 'docs'), { recursive: true })
  await writeFile(path.join(repoRoot, 'README.md'), '# Project\n', 'utf8')
  await writeFile(path.join(repoRoot, 'docs', 'guide.md'), '# Guide\n', 'utf8')
  return repoRoot
}

async function writeInventory(repoRoot, documents) {
  await writeFile(
    path.join(repoRoot, 'config', 'public-documents.json'),
    `${JSON.stringify({ schemaVersion: 1, documents }, null, 2)}\n`,
    'utf8',
  )
}

test('public document inventory accepts explicitly classified root and docs Markdown', async () => {
  const repoRoot = await createFixture()
  try {
    await writeInventory(repoRoot, [
      { path: 'README.md', audience: 'users', purpose: 'Project overview and installation.' },
      { path: 'docs/guide.md', audience: 'contributors', purpose: 'Contributor workflow reference.' },
    ])

    assert.deepEqual(collectPublicMarkdownPaths(repoRoot), ['README.md', 'docs/guide.md'])
    assert.deepEqual(validatePublicDocumentInventory({ repoRoot }), [])
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test('public document inventory rejects unclassified and stale entries', async () => {
  const repoRoot = await createFixture()
  try {
    await writeInventory(repoRoot, [
      { path: 'README.md', audience: 'users', purpose: 'Project overview and installation.' },
      { path: 'docs/missing.md', audience: 'reference', purpose: 'Stale documentation entry.' },
    ])

    const issues = validatePublicDocumentInventory({ repoRoot })
    assert.ok(issues.includes('docs/guide.md is public Markdown but is missing from config/public-documents.json.'))
    assert.ok(issues.includes('docs/missing.md is registered but does not exist.'))
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test('public document inventory rejects internal categories, paths, and release-control prose', async () => {
  const repoRoot = await createFixture()
  try {
    await mkdir(path.join(repoRoot, 'docs', 'audits'), { recursive: true })
    await writeFile(
      path.join(repoRoot, 'docs', 'audits', 'store.md'),
      '# Partner Center Submission Hold\n\nThis does not authorize a public release.\n',
      'utf8',
    )
    await writeInventory(repoRoot, [
      { path: 'README.md', audience: 'users', purpose: 'Project overview and installation.' },
      { path: 'docs/guide.md', audience: 'internal', purpose: 'Maintainer-only release procedure.' },
      { path: 'docs/audits/store.md', audience: 'contributors', purpose: 'Store certification checklist.' },
    ])

    const issues = validatePublicDocumentInventory({ repoRoot })
    assert.ok(issues.some((issue) => issue.includes('docs/guide.md has unsupported audience "internal"')))
    assert.ok(issues.some((issue) => issue.includes('docs/audits/store.md uses an internal-only documentation path')))
    assert.ok(issues.some((issue) => issue.includes('docs/audits/store.md contains internal release-control language')))
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
})

test('repository public documentation inventory stays complete', () => {
  const issues = validatePublicDocumentInventory({ repoRoot: path.resolve('.') })
  assert.deepEqual(issues, [])
  assert.equal(fs.existsSync(path.resolve('docs/microsoft-store-packaging.md')), false)
})
