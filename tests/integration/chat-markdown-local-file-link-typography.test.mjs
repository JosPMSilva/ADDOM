import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

test('final-answer file references use restrained inline-code typography', () => {
  const finalAnswerSource = readSource('src/renderer/styles/final-answer-document.css')

  assert.match(finalAnswerSource, /\.final-answer-link\[data-chat-file-reference="true"\] \{/)
  assert.match(finalAnswerSource, /font-family: var\(--font-mono\);/)
  assert.match(finalAnswerSource, /font-size: var\(--chat-prose-inline-code-size\);/)
  assert.match(finalAnswerSource, /overflow-wrap: anywhere;/)
})
