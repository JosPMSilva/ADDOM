import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const STORE_ID = '9N3MG7BJRSRB'
const STORE_URL = `https://apps.microsoft.com/detail/${STORE_ID}`
const WINGET_INSTALL = `winget install --id ${STORE_ID} --exact --source msstore`

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

test('README presents the published Store channel and exact WinGet command', () => {
  const source = read('README.md')
  assert.match(source, new RegExp(STORE_URL.replaceAll('/', '\\/')))
  assert.ok(source.includes(WINGET_INSTALL))
  assert.match(source, /GitHub release.+unsigned/isu)
})

test('Store and WinGet guide stays user-facing and covers lifecycle commands', () => {
  const source = read('docs/windows-store-and-winget.md')
  assert.ok(source.includes(STORE_URL))
  assert.ok(source.includes(WINGET_INSTALL))
  assert.match(source, /winget upgrade --id 9N3MG7BJRSRB --exact --source msstore/u)
  assert.match(source, /winget uninstall --id 9N3MG7BJRSRB --exact/u)
  assert.doesNotMatch(source, /Partner Center|certification|publication checklist|Publish now/iu)
})

test('readiness probe uses exact Store-ID lookup', () => {
  const source = read('scripts/check-winget-store.ps1')
  assert.match(source, /'search',[\s\S]*'--id',[\s\S]*\$StoreId,[\s\S]*'--exact',[\s\S]*'--source',[\s\S]*'msstore'/u)
  assert.match(source, /'show',[\s\S]*'--id',[\s\S]*\$StoreId,[\s\S]*'--exact',[\s\S]*'--source',[\s\S]*'msstore'/u)
})
