import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('TurnFileChangesCard open action routes to editor panel and opens selected file', () => {
  const source = fs.readFileSync(
    path.resolve('src/renderer/components/chat/TurnFileChangesCard.jsx'),
    'utf8',
  )

  assert.match(source, /const\s+handleOpenFile\s*=\s*async\s*\(row\)\s*=>/)
  assert.match(source, /setActivePanel\('editor'\)/)
  assert.match(source, /openFile\(projectFolder,\s*filePath,\s*\{ source: 'chat_file_changes' \}\)/)
  assert.match(source, /onOpen=\{\(\)\s*=>\s*\{\s*void\s+handleOpenFile\(row\)\s*\}\}/)
})
