import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let ProviderTermsNoticeModal = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/ProviderTermsNoticeModal.jsx')
  ProviderTermsNoticeModal = mod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

function renderNotice(overrides = {}) {
  return renderToStaticMarkup(React.createElement(ProviderTermsNoticeModal, {
    open: true,
    provider: {
      id: 'openai',
      name: 'OpenAI',
      termsUrl: 'https://example.com/terms',
      termsVersion: '2024-05',
      ...overrides.provider,
    },
    mode: 'warn_only',
    onCancel: () => {},
    onAcknowledge: () => {},
    onOpenTerms: () => {},
    ...overrides,
  }))
}

test('ProviderTermsNoticeModal calm B: tonal shell, short copy, no checkbox or developer chips', () => {
  assert.equal(typeof ProviderTermsNoticeModal, 'function')
  const html = renderNotice()

  assert.match(html, /data-ui="provider-terms-notice"/)
  assert.match(html, /Before using OpenAI/)
  assert.match(html, /You(?:'|&#x27;)re responsible for this provider(?:'|&#x27;)s terms/)
  assert.match(html, /Continue/)
  assert.match(html, /Open terms/)
  assert.match(html, /Cancel/)
  assert.match(html, /bg-surface-panel/)
  assert.match(html, /bg-surface-panel-muted-strong/)

  assert.doesNotMatch(html, /Provider notice/)
  assert.doesNotMatch(html, /Review terms before using/)
  assert.doesNotMatch(html, /I Understand/)
  assert.doesNotMatch(html, /mode:\s*warn_only/)
  assert.doesNotMatch(html, /terms version/)
  assert.doesNotMatch(html, /type="checkbox"/)
  assert.doesNotMatch(html, /OpenAI usage reminder/)
  assert.doesNotMatch(html, /border-border-strong/)
  assert.doesNotMatch(html, /border-b border-surface-border/)
  assert.doesNotMatch(html, /border-t border-surface-border/)
  assert.doesNotMatch(html, /uppercase tracking-\[0\.14em\]/)
})

test('ProviderTermsNoticeModal calm B: Continue is enabled without checkbox acknowledgement', () => {
  const html = renderNotice()
  assert.match(html, /data-ui="provider-terms-continue"/)
  assert.doesNotMatch(html, /data-ui="provider-terms-continue"[^>]*disabled/)
})

test('ProviderTermsNoticeModal calm B: uses provider display name for any first-use provider', () => {
  const html = renderNotice({
    provider: {
      id: 'anthropic',
      name: 'Anthropic',
      termsUrl: 'https://example.com/anthropic-terms',
      termsVersion: '2025-01',
    },
  })
  assert.match(html, /Before using Anthropic/)
  assert.doesNotMatch(html, /Anthropic usage reminder/)
  assert.doesNotMatch(html, /type="checkbox"/)
})

test('ProviderTermsNoticeModal exposes modal state and locks every action while saving', () => {
  const html = renderNotice({ saving: true })
  assert.match(html, /role="dialog"/)
  assert.match(html, /aria-modal="true"/)
  assert.match(html, /aria-busy="true"/)
  assert.equal((html.match(/disabled=""/g) || []).length, 3)
})
