import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  groupPatchSegments,
  parseChatRenderSegments,
} from '../../src/renderer/components/chat/chat-render-segments.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = path.resolve(__dirname, '../fixtures/chat-rendering')
const FIXTURE_RAW = readFileSync(path.join(FIXTURE_DIR, 'moa-review-multifile-diff.raw.txt'), 'utf8')
const FIXTURE_META = JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'moa-review-multifile-diff.meta.json'), 'utf8'))

test('parseChatRenderSegments keeps normal markdown bullet lists as prose', () => {
  const input = [
    'What I did',
    '- Reviewed accessibility issues',
    '- Checked performance basics',
    '- Confirmed no blocking errors',
  ].join('\n')

  const { segments, meta } = parseChatRenderSegments(input)
  assert.equal(meta.fastPath, true)
  assert.equal(segments.length, 1)
  assert.equal(segments[0].type, 'prose_markdown')
  assert.equal(segments[0].text, input)
})

test('parseChatRenderSegments preserves fenced code as code_block and prose', () => {
  const input = [
    'Here is the code:',
    '```html',
    '<div>Hello</div>',
    '```',
    'Thanks.',
  ].join('\n')
  const { segments } = parseChatRenderSegments(input)
  assert.equal(segments.some((s) => s.type === 'code_block'), true)
  const code = segments.find((s) => s.type === 'code_block')
  assert.equal(code.language, 'html')
  assert.equal(code.text, '<div>Hello</div>')
  assert.equal(segments.some((s) => s.type === 'prose_markdown' && s.text.includes('Here is the code:')), true)
})

test('parseChatRenderSegments treats fenced markdown as prose_markdown instead of code_block', () => {
  const input = [
    '```markdown',
    '| Category | Item |',
    '| --- | --- |',
    '| Access Check | Homepage |',
    '```',
  ].join('\n')
  const { segments } = parseChatRenderSegments(input)
  assert.equal(segments.some((s) => s.type === 'code_block'), false)
  assert.equal(segments.some((s) => s.type === 'prose_markdown'), true)
  const prose = segments.find((s) => s.type === 'prose_markdown')
  assert.match(String(prose?.text || ''), /\|\s*Category\s*\|\s*Item\s*\|/)
})

test('parseChatRenderSegments can extract standalone unfenced js code conservatively', () => {
  const input = [
    'Suggested script update:',
    'function initTheme() {',
    '  const themeToggle = document.getElementById("themeToggle");',
    '  if (!themeToggle) return;',
    '  themeToggle.addEventListener("click", () => {',
    '    document.body.classList.toggle("dark");',
    '  });',
    '}',
    '',
    'Let me know if you want this applied.',
  ].join('\n')

  const { segments } = parseChatRenderSegments(input)
  assert.equal(segments.some((s) => s.type === 'code_block'), true)
  assert.equal(segments.some((s) => s.type === 'prose_markdown' && s.text.includes('Suggested script update:')), true)
  assert.equal(segments.some((s) => s.type === 'prose_markdown' && s.text.includes('Let me know')), true)
})

test('parseChatRenderSegments extracts file labels and diff blocks from captured raw fixture', () => {
  const { segments, meta } = parseChatRenderSegments(FIXTURE_RAW, { mode: 'final' })
  assert.equal(meta.confidence, 'high')
  assert.equal(meta.segmentCount, segments.length)
  assert.equal(segments.length > 0, true)

  const emptySegments = segments.filter((s) => {
    if (s.type === 'file_label') return !String(s.filePath || '').trim()
    return typeof s.text === 'string' && s.text.length === 0
  })
  assert.equal(emptySegments.length, 0)

  const fileLabels = segments.filter((s) => s.type === 'file_label').map((s) => s.filePath)
  const diffBlocks = segments.filter((s) => s.type === 'diff_block')
  assert.deepEqual(segments.map((s) => s.type), FIXTURE_META.expectedSegmentOrder)
  assert.deepEqual(fileLabels, FIXTURE_META.expectedPatchFiles)
  assert.equal(diffBlocks.length, 3)

  const firstProse = segments.find((s) => s.type === 'prose_markdown')
  assert.ok(firstProse)
  assert.match(firstProse.text, /Manual quick review \(since MoA wasn’t available\)/)
  assert.match(firstProse.text, /- Accessibility: Good landmarks/)

  const proseJoined = segments.filter((s) => s.type === 'prose_markdown').map((s) => s.text).join('\n')
  assert.match(proseJoined, /Want me to apply these patches now and reload the page\?/)

  const accessibilityAsDiff = diffBlocks.some((b) => String(b.text || '').includes('- Accessibility: Good landmarks'))
  assert.equal(accessibilityAsDiff, false)

  const scriptDiff = diffBlocks.find((b) => String(b.filePathHint || '').includes('script.js'))
  assert.ok(scriptDiff)
  assert.match(scriptDiff.text, /function updateMenuA11y\(\)/)
  assert.match(scriptDiff.text, /\/\/ Current year in footer/)
})

test('groupPatchSegments groups file labels with adjacent diff blocks', () => {
  const { segments } = parseChatRenderSegments(FIXTURE_RAW)
  const grouped = groupPatchSegments(segments)
  const patchGroups = grouped.filter((s) => s.type === 'patch_file_group')
  assert.equal(patchGroups.length, 3)
  assert.deepEqual(patchGroups.map((g) => g.filePath), FIXTURE_META.expectedPatchFiles)
  assert.deepEqual(grouped.map((s) => s.type), [
    'prose_markdown',
    'patch_file_group',
    'patch_file_group',
    'patch_file_group',
    'prose_markdown',
  ])
})

test('parseChatRenderSegments keeps CSS selector context inside a single diff block', () => {
  const input = [
    'styles.css',
    '--- a/styles.css',
    '+++ b/styles.css',
    '@@',
    ' :root {',
    '+  color-scheme: dark light;',
    '   --bg: #0b1020;',
    '@@',
    ' :root.light {',
    '+  color-scheme: light dark;',
    ' }',
  ].join('\n')

  const { segments } = parseChatRenderSegments(input)
  const diff = segments.find((s) => s.type === 'diff_block')
  assert.ok(diff)
  assert.match(diff.text, /:root \{/)
  assert.match(diff.text, /:root\.light \{/)
  assert.equal(segments.filter((s) => s.type === 'diff_block').length, 1)
})

test('parseChatRenderSegments accepts line-suffixed file labels before diff blocks', () => {
  const input = [
    'src/renderer/components/chat/chat-rich-content-renderer.jsx:164',
    '--- a/src/renderer/components/chat/chat-rich-content-renderer.jsx',
    '+++ b/src/renderer/components/chat/chat-rich-content-renderer.jsx',
    '@@',
    '-old line',
    '+new line',
  ].join('\n')

  const { segments } = parseChatRenderSegments(input)
  assert.equal(segments[0]?.type, 'file_label')
  assert.equal(segments[0]?.filePath, 'src/renderer/components/chat/chat-rich-content-renderer.jsx:164')
  assert.equal(segments[1]?.type, 'diff_block')
})

test('parseChatRenderSegments streaming mode preserves partial tail as raw_fallback and final mode stabilizes', () => {
  const cutAt = FIXTURE_RAW.indexOf('updateMenuA11y();') + 10
  const partial = FIXTURE_RAW.slice(0, cutAt)
  const streaming = parseChatRenderSegments(partial, { mode: 'streaming', parseStablePrefixOnly: true })
  assert.equal(streaming.meta.mode, 'streaming')
  assert.equal(streaming.meta.truncatedTail, true)
  assert.equal(streaming.segments.at(-1)?.type, 'raw_fallback')
  assert.equal(streaming.segments.at(-1)?.reason, 'streaming_partial_tail')

  const finalized = parseChatRenderSegments(FIXTURE_RAW, { mode: 'final' })
  assert.equal(finalized.segments.some((s) => s.type === 'raw_fallback' && s.reason === 'streaming_partial_tail'), false)
  assert.equal(finalized.segments.filter((s) => s.type === 'diff_block').length, 3)
})

test('parseChatRenderSegments streaming mode renders an open fenced block as incomplete code', () => {
  const input = 'Before\n```python\nprint("hello")\n'
  const { segments, meta } = parseChatRenderSegments(input, { mode: 'streaming', parseStablePrefixOnly: true, tailStrategy: 'prose' })
  const code = segments.find((segment) => segment.type === 'code_block')
  assert.ok(code)
  assert.equal(code.language, 'python')
  assert.equal(code.incomplete, true)
  assert.equal(code.text, 'print("hello")\n')
  assert.equal(meta.hasIncompleteFence, true)
})

test('parseChatRenderSegments keeps a partial trailing line inside an open fenced block while streaming', () => {
  const input = '```python\nprint("hel'
  const { segments, meta } = parseChatRenderSegments(input, { mode: 'streaming', parseStablePrefixOnly: true, tailStrategy: 'prose' })
  assert.equal(segments.length, 1)
  assert.equal(segments[0].type, 'code_block')
  assert.equal(segments[0].incomplete, true)
  assert.equal(segments[0].text, 'print("hel')
  assert.equal(meta.truncatedTail, false)
  assert.equal(meta.hasIncompleteFence, true)
})

test('parseChatRenderSegments streaming prose tails stay as prose when no fence is open', () => {
  const input = 'Leading prose without newline'
  const { segments, meta } = parseChatRenderSegments(input, { mode: 'streaming', parseStablePrefixOnly: true, tailStrategy: 'prose' })
  assert.equal(segments.length, 1)
  assert.equal(segments[0].type, 'prose_markdown')
  assert.equal(segments[0].text, input)
  assert.equal(meta.hasIncompleteFence, false)
})

test('parseChatRenderSegments returns raw_fallback for malformed fence', () => {
  const input = 'Here:\n```js\nconst x = 1;\n'
  const { segments, meta } = parseChatRenderSegments(input)
  assert.equal(meta.confidence, 'low')
  assert.equal(segments.some((s) => s.type === 'raw_fallback'), true)
})
