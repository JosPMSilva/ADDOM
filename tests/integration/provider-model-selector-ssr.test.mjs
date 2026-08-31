import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readSource(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), 'utf8')
}

test('provider selector keeps main chat custom model input restricted to openrouter', () => {
  const railSource = [
    readSource('src/renderer/components/chat/ChatComposerControlRail.jsx'),
    readSource('src/renderer/components/chat/ChatComposerControlRailView.jsx'),
  ].join('\n')
  const selectorSource = readSource('src/renderer/components/chat/ChatHeaderControls.jsx')

  assert.match(railSource, /showCustomModelInput/)
  assert.match(railSource, /customModelInputMode="openrouter_only"/)
  assert.match(selectorSource, /customModelInputMode = 'always'/)
  assert.match(selectorSource, /customModelInputMode === 'openrouter_only'/)
  assert.match(selectorSource, /activeProvider\?\.id[\s\S]+=== 'openrouter'/)
})
