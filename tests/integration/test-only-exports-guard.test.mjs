import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

test('vault test helpers reject non-test environments', async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-test-only-guards-'))
  const previousNodeEnv = process.env.NODE_ENV
  const previousUserDataPath = process.env.ADDOM_USER_DATA_PATH

  process.env.NODE_ENV = 'test'
  process.env.ADDOM_USER_DATA_PATH = userDataPath

  try {
    const mod = await import(`${pathToFileURL(path.resolve('src/main/vault.mjs')).href}?guard_test=${Date.now()}`)

    assert.doesNotThrow(() => mod.__resetVaultStateForTests())
    assert.doesNotThrow(() => mod.__setSafeStorageForTests(null))

    process.env.NODE_ENV = 'production'
    delete process.env.ADDOM_USER_DATA_PATH

    assert.throws(() => mod.__resetVaultStateForTests(), /Test-only vault helper/)
    assert.throws(() => mod.__setSafeStorageForTests(null), /Test-only vault helper/)
  } finally {
    if (previousNodeEnv == null) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
    if (previousUserDataPath == null) delete process.env.ADDOM_USER_DATA_PATH
    else process.env.ADDOM_USER_DATA_PATH = previousUserDataPath
    try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})

test('editor completion test internals are wrapped in a test-only guard', () => {
  const source = readSource('src/main/ipc-handlers/editor-completion.mjs')

  assert.match(source, /function assertTestOnlyEditorCompletionAccess\(\)/)
  assert.match(source, /missingApiKeyResponse:\s*\(\.\.\.args\)\s*=>\s*\{/)
  assert.match(source, /requestInlineCompletion:\s*async\s*\(\.\.\.args\)\s*=>\s*\{/)
  assert.match(source, /assertTestOnlyEditorCompletionAccess\(\)/)
})
