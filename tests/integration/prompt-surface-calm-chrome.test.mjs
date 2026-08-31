import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let PromptSurface = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/ui/PromptSurface.jsx')
  PromptSurface = mod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('PromptSurface calm chrome: borderless tonal shell with semantic leads', () => {
  assert.equal(typeof PromptSurface, 'function')

  const neutral = renderToStaticMarkup(React.createElement(PromptSurface, {
    tone: 'neutral',
    'data-ui': 'prompt-surface-test',
  }, 'Neutral body'))
  assert.match(neutral, /data-ui="prompt-surface-test"/)
  assert.match(neutral, /data-tone="neutral"/)
  assert.match(neutral, /bg-surface-panel-alt/)
  assert.match(neutral, /border-0/)
  assert.doesNotMatch(neutral, /inset_0_1px_0/)
  assert.doesNotMatch(neutral, /border-surface-border/)

  const warning = renderToStaticMarkup(React.createElement(PromptSurface, { tone: 'warning' }, 'Warn'))
  assert.match(warning, /data-tone="warning"/)
  assert.match(warning, /bg-surface-panel-alt/)
  assert.match(warning, /inset_2px_0_0/)
  assert.doesNotMatch(warning, /border-warning-border/)
  assert.doesNotMatch(warning, /bg-danger-bg/)

  const decision = renderToStaticMarkup(React.createElement(PromptSurface, { tone: 'decision' }, 'Decide'))
  assert.match(decision, /bg-surface-panel/)
  assert.doesNotMatch(decision, /border-border-strong/)

  const danger = renderToStaticMarkup(React.createElement(PromptSurface, { tone: 'danger' }, 'Danger'))
  assert.match(danger, /inset_2px_0_0/)
  assert.doesNotMatch(danger, /bg-danger-bg/)
})
