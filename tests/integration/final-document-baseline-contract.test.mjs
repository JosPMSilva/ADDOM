import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import React from 'react'
import ReactMarkdown from 'react-markdown'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  getSharedMarkdownRehypePlugins,
  getSharedMarkdownRemarkPlugins,
} from '../../src/renderer/components/markdown/markdown-plugin-config.mjs'
import { sanitizePreviewHref } from '../../src/renderer/components/editor/editor-markdown-preview-utils.mjs'
import {
  buildNormalizedFinalDocumentSemanticSnapshot,
} from '../helpers/final-document-semantic-snapshot.mjs'

const remarkPlugins = getSharedMarkdownRemarkPlugins()
const rehypePlugins = getSharedMarkdownRehypePlugins()
const helperSource = fs.readFileSync(new URL('../helpers/final-document-semantic-snapshot.mjs', import.meta.url), 'utf8')

function renderMarkdownHtml(markdown) {
  return renderToStaticMarkup(
    React.createElement(
      ReactMarkdown,
      {
        remarkPlugins,
        rehypePlugins,
        urlTransform: sanitizePreviewHref,
      },
      markdown,
    ),
  )
}

function makeTextNode(text) {
  return { nodeType: 3, textContent: text, nodeValue: text }
}

function makeElementNode(tagName, attrs = {}, children = []) {
  return {
    nodeType: 1,
    tagName,
    nodeName: tagName,
    attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
    childNodes: children,
    getAttributeNames() {
      return Object.keys(attrs)
    },
    getAttribute(name) {
      return attrs[name]
    },
  }
}

function makeDomRoot(children) {
  return {
    nodeType: 1,
    tagName: 'div',
    nodeName: 'div',
    childNodes: children,
  }
}

function serializeDomLikeNode(node) {
  if (!node || typeof node !== 'object') return ''
  if (Number(node.nodeType) === 3) {
    return escapeHtml(String(node.textContent ?? node.nodeValue ?? ''))
  }
  if (Number(node.nodeType) !== 1) return ''
  const tagName = String(node.tagName || node.nodeName || '').toLowerCase()
  const attrs = []
  if (typeof node.getAttributeNames === 'function') {
    for (const name of node.getAttributeNames().sort()) {
      attrs.push(`${name}="${escapeHtmlAttribute(String(node.getAttribute(name) ?? ''))}"`)
    }
  } else if (Array.isArray(node.attributes)) {
    for (const attr of node.attributes) {
      if (!attr) continue
      attrs.push(`${String(attr.name || '').toLowerCase()}="${escapeHtmlAttribute(String(attr.value ?? ''))}"`)
    }
  }
  const open = attrs.length > 0 ? `<${tagName} ${attrs.join(' ')}>` : `<${tagName}>`
  const children = Array.from(node.childNodes || []).map((child) => serializeDomLikeNode(child)).join('')
  return `${open}${children}</${tagName}>`
}

function serializeDomRoot(root) {
  return serializeDomLikeNode(root)
}

test('final Markdown preserves provider-authored encoded Windows file targets', () => {
  const html = renderMarkdownHtml(
    '[View the revised HARDWARE_TOOL_IMPROVEMENT_PLAN.md](<C:\\Users\\example\\Documents\\Codex Testing\\Codex test subagents\\HARDWARE_TOOL_IMPROVEMENT_PLAN.md>)',
  )

  assert.doesNotMatch(html, /href="#"/)
  assert.match(html, /href="C:%5CUsers%5Cexample%5CDocuments%5CCodex%20Testing%5CCodex%20test%20subagents%5CHARDWARE_TOOL_IMPROVEMENT_PLAN\.md"/)
})

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeHtmlAttribute(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

test('buildNormalizedFinalDocumentSemanticSnapshot preserves final-document semantics and ownership', () => {
  const markdown = [
    '# Final answer title',
    '',
    'Intro paragraph with **strong**, *emphasis*, `inline code`, [external](https://example.com/docs), [anchor](#section), [relative](./docs/spec.md), [drive](C:/Users/example/Documents/ADDOM/readme.md), [mail](mailto:test@example.com), [file](file:///tmp/readme.md), [vscode](vscode://file/readme.md), [js](javascript:alert(1)), [data](data:text/plain,hello), and [custom](custom:scheme).',
    '',
    '> Blockquote line with a [local anchor](#section).',
    '',
    '- Parent item',
    '  - Child item',
    '    - Grandchild item',
    '- [x] Done task',
    '- [ ] Open task',
    '',
    '| Name | Value |',
    '| --- | --- |',
    '| Alpha | Beta |',
    '| Gamma | Delta |',
    '',
    '---',
    '',
    '```js',
    'const value = 1',
    'console.log(value)',
    '```',
  ].join('\n')

  const html = [
    '<div data-live-execution-stream-root="true">',
    '<p>Reasoning row should not count.</p>',
    '<button aria-label="Skip stream" data-action="skip-stream">Skip</button>',
    '</div>',
    '<div data-turn-shell-slot="execution">',
    '<button aria-label="Execution control" data-action="exec-control">Exec</button>',
    '</div>',
    '<section data-chat-render="patch-group">',
    '<div data-chat-render="diff-block">diff</div>',
    '<div data-chat-render="file-label">file.ts</div>',
    '</section>',
    '<aside data-chat-render="plan-card">plan</aside>',
    '<div data-chat-render="delegation">delegation</div>',
    '<div data-chat-render="role">role</div>',
    '<div data-chat-render="dispatch">dispatch</div>',
    '<div data-chat-render="council">council</div>',
    '<div data-chat-render="review">review</div>',
    renderMarkdownHtml(markdown),
    '<button aria-label="Copy answer" data-action="copy-answer">Copy</button>',
  ].join('')

  const snapshot = buildNormalizedFinalDocumentSemanticSnapshot({
    html,
    source: 'ssr',
    messageMeta: {
      messageId: 'message-1',
      turnId: 'turn-1',
      threadId: 'thread-1',
      providerId: 'openai',
      modelId: 'gpt-5.4',
    },
  })

  assert.equal(snapshot.schemaVersion, 1)
  assert.equal(snapshot.scope, 'final_document')
  assert.equal(snapshot.source.captureMode, 'ssr')
  assert.equal(snapshot.source.renderMode, 'final')
  assert.equal(snapshot.source.messageId, 'message-1')
  assert.equal(snapshot.source.turnId, 'turn-1')
  assert.equal(snapshot.source.threadId, 'thread-1')
  assert.equal(snapshot.source.providerId, 'openai')
  assert.equal(snapshot.source.modelId, 'gpt-5.4')
  assert.equal(snapshot.stats.sourceCharacterCount, html.length)

  const kinds = snapshot.document.blocks.map((block) => block.kind)
  assert.deepEqual(kinds, ['heading', 'paragraph', 'blockquote', 'list', 'table', 'thematic_break', 'code_block'])
  assert.deepEqual(snapshot.document.blocks.map((block) => block.index), [0, 1, 2, 3, 4, 5, 6])

  const paragraph = snapshot.document.blocks[1]
  assert.equal(paragraph.inlines.some((token) => token.kind === 'strong'), true)
  assert.equal(paragraph.inlines.some((token) => token.kind === 'emphasis'), true)
  assert.equal(paragraph.inlines.some((token) => token.kind === 'inline_code'), true)

  const linkByText = Object.fromEntries(snapshot.annotations.links.map((link) => [link.text, link]))
  assert.deepEqual(
    Object.keys(linkByText).sort(),
    ['anchor', 'custom', 'data', 'drive', 'external', 'file', 'js', 'local anchor', 'mail', 'relative', 'vscode'],
  )
  assert.equal(linkByText.external.safe, true)
  assert.equal(linkByText.external.targetClass, 'external')
  assert.equal(linkByText.anchor.safe, true)
  assert.equal(linkByText.anchor.targetClass, 'anchor')
  assert.equal(linkByText.relative.safe, true)
  assert.equal(linkByText.relative.targetClass, 'internal_file')
  assert.equal(linkByText.drive.safe, true)
  assert.equal(linkByText.drive.targetClass, 'internal_file')
  assert.equal(linkByText.mail.safe, false)
  assert.equal(linkByText.mail.targetClass, 'unsafe')
  assert.equal(linkByText.file.safe, false)
  assert.equal(linkByText.vscode.safe, false)
  assert.equal(linkByText.js.safe, false)
  assert.equal(linkByText.data.safe, false)
  assert.equal(linkByText.custom.safe, false)
  assert.equal(linkByText.external.ownership, 'final_document')
  assert.equal(Array.isArray(linkByText.external.path), true)
  assert.equal(linkByText.external.path.includes('inlines'), true)
  assert.equal(linkByText.external.path.some((part) => typeof part === 'number'), true)

  const blockquote = snapshot.document.blocks[2]
  assert.equal(blockquote.kind, 'blockquote')
  assert.equal(blockquote.blocks[0].kind, 'paragraph')
  assert.equal(blockquote.blocks[0].inlines.some((token) => token.kind === 'link' && token.targetClass === 'anchor'), true)

  const list = snapshot.document.blocks[3]
  assert.equal(list.kind, 'list')
  assert.equal(list.index, 3)
  assert.equal(list.items.length, 3)
  assert.equal(list.items[0].index, 0)
  assert.equal(list.items[0].blocks[0].kind, 'paragraph')
  assert.equal(list.items[0].blocks[1].kind, 'list')
  assert.equal(list.items[0].blocks[1].index, 1)
  assert.equal(list.items[1].task, true)
  assert.equal(list.items[1].checked, true)
  assert.equal(list.items[2].task, true)
  assert.equal(list.items[2].checked, false)

  const table = snapshot.document.blocks[4]
  assert.equal(table.kind, 'table')
  assert.equal(table.index, 4)
  assert.equal(table.headerRowCount, 1)
  assert.equal(table.rowCount, 2)
  assert.equal(table.columnCount, 2)
  assert.equal(table.header[0].text, 'Name')
  assert.equal(table.rows[1][1].text, 'Delta')

  const code = snapshot.document.blocks[6]
  assert.equal(code.kind, 'code_block')
  assert.equal(code.index, 6)
  assert.equal(code.language, 'js')
  assert.equal(code.lineCount, 2)
  assert.match(code.text, /const value = 1/)

  assert.equal(snapshot.annotations.controls.length, 1)
  assert.equal(snapshot.annotations.controls[0].id, 'control-1')
  assert.equal(snapshot.annotations.controls[0].role, 'button')
  assert.equal(snapshot.annotations.controls[0].name, 'Copy answer')
  assert.equal(snapshot.annotations.controls[0].action, 'copy-answer')
  assert.equal(snapshot.annotations.controls[0].ownership, 'renderer')
  assert.equal(Array.isArray(snapshot.annotations.controls[0].path), true)
  assert.equal(snapshot.annotations.controls[0].path.length, 1)
  assert.equal(typeof snapshot.annotations.controls[0].path[0], 'number')
  assert.equal(snapshot.stats.controlCount, 1)
  assert.equal(snapshot.stats.linkCount, snapshot.annotations.links.length)
  assert.equal(snapshot.stats.codeBlockCount, 1)
  assert.equal(snapshot.stats.maxListDepth, 3)
  assert.equal(snapshot.document.blocks.some((block) => block.kind === 'paragraph' && /Reasoning row should not count/.test(block.text)), false)
  assert.equal(snapshot.document.blocks.some((block) => block.kind === 'paragraph' && /plan/.test(block.text)), false)
  assert.equal(snapshot.document.blocks.some((block) => block.kind === 'paragraph' && /file\.ts/.test(block.text)), false)
})

test('buildNormalizedFinalDocumentSemanticSnapshot counts root input deterministically when a DOM root is supplied', () => {
  const root = makeDomRoot([
    makeElementNode('h2', {}, [makeTextNode('DOM root title')]),
    makeElementNode('p', {}, [
      makeTextNode('DOM body with '),
      makeElementNode('strong', {}, [makeTextNode('strong text')]),
      makeTextNode(', '),
      makeElementNode('em', {}, [makeTextNode('emphasis')]),
      makeTextNode(', '),
      makeElementNode('code', {}, [makeTextNode('inline')]),
      makeTextNode(', and '),
      makeElementNode('a', { href: 'https://example.com/path?q=1>2' }, [makeTextNode('link')]),
      makeTextNode('.'),
    ]),
  ])

  const snapshot = buildNormalizedFinalDocumentSemanticSnapshot({
    root,
    html: '<h1>ignored</h1>',
    source: 'dom',
    messageMeta: {
      messageId: 'message-2',
      turnId: 'turn-2',
      threadId: 'thread-2',
      providerId: 'cursor',
      modelId: 'composer-2.5',
    },
    includeInlineAnnotations: false,
  })

  assert.equal(snapshot.source.captureMode, 'dom')
  assert.equal(snapshot.source.renderMode, 'final')
  assert.equal(snapshot.source.messageId, 'message-2')
  assert.equal(snapshot.source.turnId, 'turn-2')
  assert.equal(snapshot.source.threadId, 'thread-2')
  assert.equal(snapshot.stats.sourceCharacterCount, serializeDomRoot(root).length)
  assert.equal(snapshot.document.blocks[0].kind, 'heading')
  assert.equal(snapshot.document.blocks[0].level, 2)
  assert.equal(snapshot.document.blocks[1].kind, 'paragraph')
  assert.equal(snapshot.document.blocks[1].inlines.some((token) => token.kind === 'strong'), true)
  assert.equal(snapshot.document.blocks[1].inlines.some((token) => token.kind === 'emphasis'), true)
  assert.equal(snapshot.document.blocks[1].inlines.some((token) => token.kind === 'inline_code'), true)
  assert.equal(snapshot.document.blocks[1].inlines.some((token) => token.kind === 'link' && token.href === 'https://example.com/path?q=1>2'), true)
  assert.equal(Array.isArray(snapshot.annotations.links[0].path), true)
  assert.equal(snapshot.annotations.links[0].path.includes('inlines'), true)
  assert.equal(snapshot.annotations.links[0].path.some((part) => typeof part === 'number'), true)
  assert.equal(snapshot.annotations.links[0].ownership, 'final_document')
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot.document.blocks[1].inlines.find((token) => token.kind === 'link'), 'annotationId'), false)
})

test('buildNormalizedFinalDocumentSemanticSnapshot keeps quote-aware scanning intact for > inside quoted attribute values', () => {
  const html = '<p><a href="https://example.com/query?q=1>2" aria-label="Copy > link">Quoted</a></p>'
  const snapshot = buildNormalizedFinalDocumentSemanticSnapshot({ html, source: 'ssr' })

  assert.equal(snapshot.document.blocks.length, 1)
  assert.equal(snapshot.document.blocks[0].kind, 'paragraph')
  assert.equal(snapshot.document.blocks[0].inlines[0].kind, 'link')
  assert.equal(snapshot.document.blocks[0].inlines[0].href, 'https://example.com/query?q=1>2')
  assert.equal(snapshot.annotations.links[0].text, 'Quoted')
  assert.equal(snapshot.annotations.links[0].targetClass, 'external')
})

test('buildNormalizedFinalDocumentSemanticSnapshot skips execution and product-owned nodes instead of promoting them into document blocks', () => {
  const html = [
    '<div data-live-execution-stream-root="true"><p>streaming commentary</p></div>',
    '<div data-turn-shell-slot="execution"><p>turn shell execution</p></div>',
    '<section data-chat-render="patch-group"><div data-chat-render="diff-block">diff</div></section>',
    '<div data-chat-render="file-label">file.ts</div>',
    '<aside data-chat-render="plan-card">plan</aside>',
    '<div data-chat-render="delegation">delegation</div>',
    '<div data-chat-render="role">role</div>',
    '<div data-chat-render="dispatch">dispatch</div>',
    '<div data-chat-render="council">council</div>',
    '<div data-chat-render="review">review</div>',
    '<p>Final document paragraph only.</p>',
  ].join('')

  const snapshot = buildNormalizedFinalDocumentSemanticSnapshot({ html, source: 'ssr' })
  assert.deepEqual(snapshot.document.blocks.map((block) => block.kind), ['paragraph'])
  assert.equal(snapshot.document.blocks[0].text, 'Final document paragraph only.')
  assert.equal(snapshot.annotations.links.length, 0)
  assert.equal(snapshot.annotations.controls.length, 0)
})

test('buildNormalizedFinalDocumentSemanticSnapshot keeps inline renderer controls out of document text', () => {
  const html = '<p>before <button aria-label="Inline action" data-action="inline-action">Click</button> after</p>'
  const snapshot = buildNormalizedFinalDocumentSemanticSnapshot({
    html,
    source: 'ssr',
    messageMeta: {
      messageId: 'message-3',
      turnId: 'turn-3',
      threadId: 'thread-3',
    },
  })

  assert.equal(snapshot.document.blocks.length, 1)
  assert.equal(snapshot.document.blocks[0].kind, 'paragraph')
  assert.equal(snapshot.document.blocks[0].text.includes('Click'), false)
  assert.equal(snapshot.document.blocks[0].text.includes('before'), true)
  assert.equal(snapshot.document.blocks[0].text.includes('after'), true)
  assert.equal(snapshot.annotations.controls.length, 1)
  assert.equal(snapshot.annotations.controls[0].name, 'Inline action')
  assert.equal(snapshot.annotations.controls[0].action, 'inline-action')
})

test('helper source stays independent of parseChatRenderSegments and groupPatchSegments', () => {
  assert.doesNotMatch(helperSource, /parseChatRenderSegments/)
  assert.doesNotMatch(helperSource, /groupPatchSegments/)
})
