import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const DISALLOWED_SYNC_FS_PATTERN = /\bfs\.(?:existsSync|statSync|readFileSync|writeFileSync|readdirSync|mkdirSync|unlinkSync|renameSync)\b/

function readSource(relPath = '') {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

test('file-tools and artifact-apply paths avoid sync fs APIs on main thread', () => {
  const fileToolsSource = readSource('src/main/tools/file-tools.mjs')
  const artifactApplySource = readSource('src/main/tools/artifact-apply-tool.mjs')

  assert.doesNotMatch(
    fileToolsSource,
    DISALLOWED_SYNC_FS_PATTERN,
    'file-tools should avoid sync fs calls to reduce main-thread blocking',
  )
  assert.doesNotMatch(
    artifactApplySource,
    DISALLOWED_SYNC_FS_PATTERN,
    'artifact apply should avoid sync fs calls to reduce main-thread blocking',
  )
})
