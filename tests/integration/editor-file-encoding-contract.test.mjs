import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const storeSource = fs.readFileSync(
  path.resolve('src/renderer/store/useEditorStore.js'),
  'utf8',
)

const preloadSource = fs.readFileSync(
  path.resolve('src/preload/index.mjs'),
  'utf8',
)

test('editor store preserves detected file encoding through read and save', () => {
  assert.match(storeSource, /fileEncoding:\s*String\(result\.encoding \|\| 'utf8'\)/)
  assert.match(storeSource, /saveFile\(projectFolder,\s*tab\.filePath,\s*content,\s*tab\.fileEncoding \|\| 'utf8'\)/)
  assert.match(preloadSource, /saveFile:\s*\(project,\s*filePath,\s*content,\s*encoding = ''\)/)
})
