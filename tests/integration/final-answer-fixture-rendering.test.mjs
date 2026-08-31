import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { buildNormalizedFinalDocumentSemanticSnapshot } from '../helpers/final-document-semantic-snapshot.mjs'
import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

const fixtureRoot = path.resolve('tests/fixtures/cross-provider-final-answer')
const manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'manifest.json'), 'utf8'))
const finalAnswerFixtures = manifest.fixtures
  .map((entry) => {
    const metaPath = path.join(fixtureRoot, entry.metaFile)
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    return { meta, metaPath }
  })
  .filter(({ meta }) => meta.semanticOwnership === 'final-answer')

let MessageBubble = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/MessageBubble.jsx')
  MessageBubble = mod?.MessageBubble || null
})

after(async () => {
  await closeViteSsrLoader()
})

for (const { meta, metaPath } of finalAnswerFixtures) {
  test(`final-answer fixture preserves authored semantics: ${meta.fixtureId}`, () => {
    const content = fs.readFileSync(path.join(path.dirname(metaPath), meta.contentFile), 'utf8')
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: {
        id: `fixture:${meta.fixtureId}`,
        role: 'assistant',
        content,
        finalDocument: { schemaVersion: 1, text: content, parts: [] },
        status: 'done',
      },
    }))
    const snapshot = buildNormalizedFinalDocumentSemanticSnapshot({
      html,
      source: 'ssr',
      messageMeta: {
        messageId: `fixture:${meta.fixtureId}`,
        providerId: meta.provider,
        modelId: meta.model,
      },
    })

    assert.match(html, /data-final-answer-document="true"/)
    assert.ok(snapshot.document.blocks.length > 0)
    assert.doesNotMatch(html, /data-chat-render="(?:plan-card|delegation|role|dispatch|council|review|patch-group)"/)
    assert.doesNotMatch(html, /chat-markdown-record-(?:list|card)/)

    if (meta.fixtureId === 'markdown-tables') {
      assert.ok(snapshot.document.blocks.some((block) => block.kind === 'table'))
      assert.match(html, /data-final-answer-table-scroll="true"/)
    }
    if (meta.fixtureId === 'markdown-literal-json') {
      assert.ok(snapshot.document.blocks.some((block) => block.kind === 'code_block'))
    }
  })
}

test('final-answer document preserves non-Latin authored text', () => {
  const content = [
    '## 多言語の確認',
    '',
    '日本語の本文と `設定値` をそのまま表示します。',
    '',
    'مرحبا بالعالم — هذا نص عربي للاختبار.',
  ].join('\n')
  const html = renderToStaticMarkup(React.createElement(MessageBubble, {
    message: {
      id: 'fixture:non-latin',
      role: 'assistant',
      content,
      finalDocument: { schemaVersion: 1, text: content, parts: [] },
      status: 'done',
    },
  }))

  assert.match(html, /多言語の確認/)
  assert.match(html, /日本語の本文/)
  assert.match(html, /مرحبا بالعالم/)
  assert.doesNotMatch(html, /\ufffd/)
  assert.match(html, /final-answer-inline-code/)
})
