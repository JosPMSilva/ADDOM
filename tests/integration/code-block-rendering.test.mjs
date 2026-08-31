import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CHAT_SNIPPET_MAX_HIGHLIGHT_CHARS,
  CHAT_SNIPPET_MAX_HIGHLIGHT_LINES,
  CODE_BLOCK_MAX_HIGHLIGHT_CHARS,
  CODE_BLOCK_MAX_HIGHLIGHT_LINES,
  countBlockLines,
  countDisplayLines,
  getBlockRenderMetrics,
  shouldHighlightBlockText,
} from '../../src/renderer/components/chat/code-block-rendering.mjs'

test('code-block rendering helper counts lines safely', () => {
  assert.equal(countBlockLines(''), 0)
  assert.equal(countBlockLines('one'), 1)
  assert.equal(countBlockLines('one\ntwo\nthree'), 3)
})

test('display line count ignores trailing empty fence newline for layout', () => {
  assert.equal(countDisplayLines('python calculator.py'), 1)
  assert.equal(countDisplayLines('python calculator.py\n'), 1)
  assert.equal(countDisplayLines('line one\nline two'), 2)
  assert.equal(countDisplayLines('line one\nline two\n'), 2)
  assert.equal(countBlockLines('python calculator.py\n'), 2)
})

test('getBlockRenderMetrics exposes display line count for snippet layout', () => {
  const metrics = getBlockRenderMetrics('python -m unittest -v\n')
  assert.equal(metrics.lineCount, 2)
  assert.equal(metrics.displayLineCount, 1)
})

test('code-block rendering helper disables highlight for oversized text by chars', () => {
  const text = 'x'.repeat(CODE_BLOCK_MAX_HIGHLIGHT_CHARS + 1)
  assert.equal(shouldHighlightBlockText(text), false)
  const metrics = getBlockRenderMetrics(text)
  assert.equal(metrics.highlightEnabled, false)
  assert.equal(metrics.content.length, CODE_BLOCK_MAX_HIGHLIGHT_CHARS + 1)
})

test('code-block rendering helper disables highlight for oversized text by lines', () => {
  const text = Array.from({ length: CODE_BLOCK_MAX_HIGHLIGHT_LINES + 1 }, (_, i) => `line_${i}`).join('\n')
  const metrics = getBlockRenderMetrics(text)
  assert.equal(metrics.lineCount, CODE_BLOCK_MAX_HIGHLIGHT_LINES + 1)
  assert.equal(metrics.highlightEnabled, false)
})

test('code-block rendering helper keeps highlight enabled under limits', () => {
  const text = Array.from({ length: 20 }, (_, i) => `const v${i} = ${i};`).join('\n')
  const metrics = getBlockRenderMetrics(text)
  assert.equal(metrics.highlightEnabled, true)
  assert.equal(metrics.lineCount, 20)
})

test('code-block rendering helper supports larger chat snippet highlight budgets via overrides', () => {
  const text = Array.from({ length: 275 }, (_, i) => `CREATE TABLE table_${i} (id uuid primary key, note text not null);`).join('\n')
  const defaultMetrics = getBlockRenderMetrics(text)
  const snippetMetrics = getBlockRenderMetrics(text, {
    maxChars: CHAT_SNIPPET_MAX_HIGHLIGHT_CHARS,
    maxLines: CHAT_SNIPPET_MAX_HIGHLIGHT_LINES,
  })

  assert.equal(defaultMetrics.highlightEnabled, false)
  assert.equal(snippetMetrics.highlightEnabled, true)
  assert.equal(snippetMetrics.lineCount, 275)
})
