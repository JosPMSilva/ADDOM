import test from 'node:test'
import assert from 'node:assert/strict'

import { filterEligibleEditorPreludeEntries } from '../../src/renderer/components/chat/composer-hidden-prelude.mjs'

function codeBlock(id, language = 'py', code = 'print(1)') {
  return { id, type: 'code', language, code }
}

test('prelude is included when bound code block exists', () => {
  const entries = [{ id: 'p1', blockIds: ['code_a'] }]
  const result = filterEligibleEditorPreludeEntries(entries, [codeBlock('code_a')], '')
  assert.equal(result.length, 1)
  assert.equal(result[0].id, 'p1')
})

test('prelude remains eligible after code content edit when block id is unchanged', () => {
  const entries = [{ id: 'p1', blockIds: ['code_a'] }]
  const result = filterEligibleEditorPreludeEntries(entries, [codeBlock('code_a', 'py', 'print(2)')], '')
  assert.equal(result.length, 1)
})

test('prelude is dropped after bound code block delete', () => {
  const entries = [{ id: 'p1', blockIds: ['code_a'] }]
  const result = filterEligibleEditorPreludeEntries(entries, [codeBlock('code_b')], '')
  assert.equal(result.length, 0)
})

test('multiple injected code blocks map to independent preludes', () => {
  const entries = [
    { id: 'p1', blockIds: ['code_a'] },
    { id: 'p2', blockIds: ['code_b'] },
  ]
  const result = filterEligibleEditorPreludeEntries(entries, [codeBlock('code_b')], '')
  assert.deepEqual(result.map((r) => r.id), ['p2'])
})

test('text edits do not affect code-block-bound preludes', () => {
  const entries = [{ id: 'p1', blockIds: ['code_a'] }]
  const blocks = [
    { id: 'text_1', type: 'text', text: 'edited interleaved text' },
    codeBlock('code_a'),
  ]
  const result = filterEligibleEditorPreludeEntries(entries, blocks, 'completely different composer text')
  assert.equal(result.length, 1)
})

test('legacy string guard fallback still works when no block ids are present', () => {
  const entries = [{ id: 'legacy', guardVisibleText: '```py\nprint(1)\n```' }]
  const result = filterEligibleEditorPreludeEntries(entries, [], 'prefix\n```py\nprint(1)\n```\nsuffix')
  assert.equal(result.length, 1)
  assert.equal(result[0].id, 'legacy')
})

