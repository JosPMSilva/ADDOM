import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

test('ArtifactsPanel loads tracked files when opened instead of waiting for a later update event', () => {
  const source = readSource('src/renderer/components/ArtifactsPanel.jsx')

  assert.match(source, /const loadFiles = useArtifactsStore\(\(s\) => s\.loadFiles\)/)
  assert.match(source, /window\.addom\.artifacts\.onUpdated\(\(\) => \{[\s\S]*void loadFiles\(projectFolder, \{ scope: artifactScope, threadId: activeThreadId \}\)[\s\S]*\}\)/)
  assert.match(source, /useEffect\(\(\) => \{\s+if \(!projectFolder\) return\s+void loadFiles\(projectFolder, \{ scope: artifactScope, threadId: activeThreadId \}\)/)
})
