import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseMarkdownReferenceExamples,
  shouldRenderMarkdownReferenceExamples,
  resolveMarkdownReferenceKeyInsertText,
  appendComposerSnippet,
} from '../../src/renderer/components/chat/markdown-reference-example-cells.mjs'

test('parseMarkdownReferenceExamples splits comma-separated expression arrows', () => {
  const examples = parseMarkdownReferenceExamples('cbrt(27) → 3, cbrt(-8) → -2')
  assert.deepEqual(examples, [
    { expression: 'cbrt(27)', result: '3' },
    { expression: 'cbrt(-8)', result: '-2' },
  ])
})

test('parseMarkdownReferenceExamples accepts ascii arrows and fenced expressions', () => {
  assert.deepEqual(parseMarkdownReferenceExamples('`sinh(0)` -> 0'), [
    { expression: 'sinh(0)', result: '0' },
  ])
  assert.deepEqual(parseMarkdownReferenceExamples('log2(8) => 3'), [
    { expression: 'log2(8)', result: '3' },
  ])
})

test('parseMarkdownReferenceExamples returns null for non-example prose', () => {
  assert.equal(parseMarkdownReferenceExamples('Cube root (cbrt)'), null)
  assert.equal(parseMarkdownReferenceExamples(''), null)
  assert.equal(shouldRenderMarkdownReferenceExamples('Hyperbolic sine'), false)
  assert.equal(shouldRenderMarkdownReferenceExamples('sinh(0) → 0'), true)
})

test('resolveMarkdownReferenceKeyInsertText prefers function ids over glyphs', () => {
  assert.equal(
    resolveMarkdownReferenceKeyInsertText({
      keyCell: { text: '∛', children: [] },
      nameCell: {
        text: 'Cube root (cbrt)',
        children: [
          { type: 'text', value: 'Cube root (' },
          { tagName: 'code', children: [{ type: 'text', value: 'cbrt' }] },
          { type: 'text', value: ')' },
        ],
      },
    }),
    'cbrt',
  )
  assert.equal(
    resolveMarkdownReferenceKeyInsertText({
      keyCell: { text: 'sinh', children: [] },
      nameCell: { text: 'Hyperbolic sine', children: [] },
    }),
    'sinh',
  )
})

test('appendComposerSnippet joins with spacing without paragraph breaks', () => {
  assert.equal(appendComposerSnippet('', 'cbrt'), 'cbrt')
  assert.equal(appendComposerSnippet('use ', 'cbrt'), 'use cbrt')
  assert.equal(appendComposerSnippet('use', 'cbrt'), 'use cbrt')
})
