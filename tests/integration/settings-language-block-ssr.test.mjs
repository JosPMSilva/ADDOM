import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let LanguageBlock = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/settings/SettingsBlocks.jsx')
  LanguageBlock = mod?.LanguageBlock || null
})

after(async () => {
  await closeViteSsrLoader()
})

function renderLanguageBlock(props = {}) {
  assert.equal(typeof LanguageBlock, 'function')
  return renderToStaticMarkup(React.createElement(LanguageBlock, {
    uiLocale: 'en',
    onChangeUiLocale: () => {},
    ...props,
  }))
}

test('LanguageBlock exposes shipped release locales in the selector', () => {
  const html = renderLanguageBlock({ uiLocale: 'pt-BR' })

  assert.equal((html.match(/<option\b/g) || []).length, 16)
  assert.match(html, /<option[^>]*>System default<\/option>/)
  assert.match(html, /<option[^>]*>English<\/option>/)
  assert.match(html, /<option[^>]*>Spanish<\/option>/)
  assert.match(html, /<option[^>]*>Portuguese \(Brazil\)<\/option>/)
  assert.match(html, /<option[^>]*>French<\/option>/)
  assert.match(html, /<option[^>]*>German<\/option>/)
  assert.match(html, /<option[^>]*>Japanese<\/option>/)
  assert.match(html, /<option[^>]*>Chinese \(Simplified\)<\/option>/)
  assert.match(html, /<option[^>]*>Korean<\/option>/)
  assert.match(html, /<option[^>]*>Italian<\/option>/)
  assert.match(html, /<option[^>]*>Dutch<\/option>/)
  assert.match(html, /<option[^>]*>Polish<\/option>/)
  assert.match(html, /<option[^>]*>Turkish<\/option>/)
  assert.match(html, /<option[^>]*>Ukrainian<\/option>/)
  assert.match(html, /<option[^>]*>Indonesian<\/option>/)
  assert.match(html, /<option[^>]*>Vietnamese<\/option>/)
  assert.doesNotMatch(html, /saved only/i)
  assert.doesNotMatch(html, /currently ships English renderer strings only/i)
})

test('LanguageBlock keeps the pseudo locale hidden from normal release exposure', () => {
  const html = renderLanguageBlock({ uiLocale: 'en-XA' })

  assert.equal((html.match(/<option\b/g) || []).length, 16)
  assert.doesNotMatch(html, /<option[^>]*>Pseudo \(Accented\)<\/option>/)
  assert.match(html, /validation locale/i)
})
