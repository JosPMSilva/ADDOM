import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let OpenRouterModelRow = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/settings/OpenRouterModelRow.jsx')
  OpenRouterModelRow = mod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

function renderRow(model = {}) {
  return renderToStaticMarkup(React.createElement(OpenRouterModelRow, {
    model: {
      id: 'openai/gpt-5.4',
      label: 'GPT-5.4',
      visibilityBaseVisible: true,
      ...model,
    },
    namespace: 'openai',
    onToggleVisibility: () => {},
  }))
}

test('openrouter model row does not expose internal provenance labels in the default settings surface', () => {
  assert.ok(OpenRouterModelRow)

  const html = renderRow({
    visibilityFieldProvenance: {
      tools: {
        source: 'addom_openrouter_reviewed_route',
        trustLevel: 'verified',
        reason: 'resolved_from_addom_reviewed_openrouter_route',
      },
      reasoning: {
        source: 'models.dev',
        trustLevel: 'estimated',
        reason: 'resolved_from_catalog_match',
      },
      vision: {
        source: 'openrouter_live',
        trustLevel: 'estimated',
        reason: 'inferred_from_openrouter_architecture',
      },
    },
  })

  assert.doesNotMatch(html, /Tools: reviewed/)
  assert.doesNotMatch(html, /Reasoning: catalog/)
  assert.doesNotMatch(html, /Vision: live estimate/)
  assert.doesNotMatch(html, /Evidence pending/)
  assert.doesNotMatch(html, /Reviewed/)
  assert.match(html, /role="switch"/)
  assert.match(html, /aria-checked="true"/)
})

test('openrouter model row stays clean when provenance is missing', () => {
  const html = renderRow({
    visibilityFieldProvenance: {
      tools: { source: 'unknown' },
      reasoning: { source: 'unknown' },
      vision: { source: 'unknown' },
    },
  })

  assert.doesNotMatch(html, /Evidence pending/)
  assert.doesNotMatch(html, /Reviewed/)
})
