import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { safePath, sameProjectRoot } from '../../src/main/tools/path-guards.mjs'

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function tryCreateDirectoryLink(targetPath, linkPath) {
  try {
    fs.symlinkSync(targetPath, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
    return true
  } catch {
    return false
  }
}

test('safePath resolves normal in-project paths and preserves non-existent targets', () => {
  const projectRoot = createTempDir('addom-path-guards-')
  const nestedPath = safePath(projectRoot, 'src/components/App.jsx')
  assert.equal(nestedPath, path.resolve(projectRoot, 'src/components/App.jsx'))

  assert.equal(safePath(projectRoot, ''), path.resolve(projectRoot))
  assert.equal(safePath(projectRoot, null), path.resolve(projectRoot))
})

test('safePath rejects traversal and absolute paths outside the project root', () => {
  const projectRoot = createTempDir('addom-path-guards-')
  const outsidePath = process.platform === 'win32'
    ? path.resolve(process.env.SystemRoot || 'C:\\Windows')
    : '/etc'

  assert.throws(() => safePath(projectRoot, '../outside.txt'), /escapes the project root/i)
  assert.throws(() => safePath(projectRoot, outsidePath), /escapes the project root/i)
})

test('safePath allows host paths when allowOutsideProjectRoot is explicitly enabled', () => {
  const projectRoot = createTempDir('addom-path-guards-')
  const outsidePath = process.platform === 'win32'
    ? path.resolve(process.env.SystemRoot || 'C:\\Windows')
    : '/etc'

  assert.equal(
    safePath(projectRoot, outsidePath, { allowOutsideProjectRoot: true }),
    path.resolve(outsidePath),
  )
})

test('safePath accepts normalized paths that stay inside the project root', () => {
  const projectRoot = createTempDir('addom-path-guards-')
  const resolved = safePath(projectRoot, 'src/../docs/readme.md')
  assert.equal(resolved, path.resolve(projectRoot, 'docs/readme.md'))
})

test('safePath rejects null bytes in the requested file path', () => {
  const projectRoot = createTempDir('addom-path-guards-')
  assert.throws(
    () => safePath(projectRoot, `docs${'\0'}readme.md`),
    /null bytes/i,
  )
})

test('safePath rejects null bytes in the project root input', () => {
  const projectRoot = createTempDir('addom-path-guards-')
  assert.throws(
    () => safePath(`${projectRoot}${'\0'}suffix`, 'docs/readme.md'),
    /null bytes/i,
  )
})

test('safePath rejects symlinked paths that resolve outside the project root', (t) => {
  const projectRoot = createTempDir('addom-path-guards-')
  const outsideRoot = createTempDir('addom-path-guards-outside-')
  const linkPath = path.join(projectRoot, 'linked-outside')
  const linkCreated = tryCreateDirectoryLink(outsideRoot, linkPath)
  if (!linkCreated) {
    t.skip('symlink creation is unavailable in this environment')
    return
  }

  assert.throws(
    () => safePath(projectRoot, 'linked-outside/secret.txt'),
    /resolves outside the project root via symlink/i,
  )
})

test('sameProjectRoot compares canonical roots and remains case-insensitive on Windows', (t) => {
  const projectRoot = createTempDir('addom-path-guards-')
  const aliasRoot = path.join(path.dirname(projectRoot), `${path.basename(projectRoot)}-alias`)
  const linkCreated = tryCreateDirectoryLink(projectRoot, aliasRoot)
  if (linkCreated) {
    assert.equal(sameProjectRoot(projectRoot, aliasRoot), true)
    fs.rmSync(aliasRoot, { recursive: true, force: true })
  }

  if (process.platform !== 'win32') {
    t.skip('mixed-case comparison only applies on Windows')
    return
  }

  const chars = projectRoot.split('')
  const mixedCaseRoot = chars.map((char, index) => (index % 2 === 0 ? char.toUpperCase() : char.toLowerCase())).join('')
  assert.equal(sameProjectRoot(projectRoot, mixedCaseRoot), true)
})
