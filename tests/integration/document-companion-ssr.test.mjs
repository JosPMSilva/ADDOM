import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let DocumentCompanionView = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/DocumentCompanionView.jsx')
  DocumentCompanionView = mod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('Document companion uses the final-answer Markdown presentation for rich plan content', () => {
  const html = renderToStaticMarkup(React.createElement(DocumentCompanionView, {
    view: {
      key: 'document:project_1:plan',
      type: 'document',
      projectId: 'project_1',
      filePath: 'docs/PLAN.md',
      label: 'PLAN.md',
      initialDocument: {
        ok: true,
        projectId: 'project_1',
        filePath: 'docs/PLAN.md',
        name: 'PLAN.md',
        content: '# Implementation Plan\n\n| Step | Status |\n| --- | --- |\n| Build | Ready |\n\n[Details](details.md)',
      },
    },
  }))

  assert.match(html, /data-ui="document-companion-view"/)
  assert.match(html, /data-document-reading-column="true"/)
  assert.match(html, /max-w-\[960px\]/)
  assert.match(html, /class="final-answer-heading final-answer-heading-1"/)
  assert.match(html, /class="final-answer-table"/)
  assert.match(html, />Details</)
  assert.match(html, /data-ui="document-companion-search"/)
  assert.match(html, /placeholder="Search document"/)
  assert.doesNotMatch(html, />docs\/PLAN\.md</)
})
