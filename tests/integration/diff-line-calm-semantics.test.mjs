import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let DiffLine = null

before(async () => {
  const module = await ssrLoadRendererModule('/components/diff/DiffComponents.jsx')
  DiffLine = module?.DiffLine || null
})

after(closeViteSsrLoader)

test('DiffLine exposes change meaning to assistive technology without visible marker chrome', () => {
  const html = renderToStaticMarkup(React.createElement(DiffLine, {
    type: 'added',
    newLine: 4,
    text: 'const ready = true',
    gridTemplate: '3rem 0.125rem minmax(0, 1fr)',
    changeLabel: 'Added line',
  }))

  assert.match(html, /class="sr-only">Added line: <\/span>/)
  assert.doesNotMatch(html, />\+<\/span>/)
})
