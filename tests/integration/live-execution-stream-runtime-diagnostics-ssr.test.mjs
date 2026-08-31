import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let LiveExecutionStreamBlock = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/LiveExecutionStreamBlock.jsx')
  LiveExecutionStreamBlock = mod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('runtime diagnostics rows stay out of the execution stream', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')

  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-runtime-diagnostics',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['runtime-warning'],
        eventsById: {
          'runtime-warning': {
            id: 'runtime-warning',
            kind: 'warning',
            detail: 'provider_model: openrouter/vendor/model\nmodel_tool_support: false\ncapability_block_reasons: model_no_tool_support',
            activity: {
              id: 'runtime-warning',
              type: 'warning',
              eventKind: 'runtime_diagnostics',
              label: 'Runtime diagnostics: model_no_tool_support',
              detail: 'provider_model: openrouter/vendor/model\nmodel_tool_support: false\ncapability_block_reasons: model_no_tool_support',
              createdAt: 160,
            },
          },
        },
      },
    }),
  )

  assert.doesNotMatch(html, /Runtime diagnostics: model_no_tool_support/)
  assert.doesNotMatch(html, /Show diagnostics/)
  assert.doesNotMatch(html, /provider_model: openrouter\/vendor\/model/)
  assert.doesNotMatch(html, /model_tool_support: false/)
})
