import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let EditorTabBar = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/editor/EditorTabBar.jsx')
  EditorTabBar = mod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

function renderTabBar(overrides = {}) {
  return renderToStaticMarkup(React.createElement(EditorTabBar, {
    tabs: [{
      id: 'fixture-tab',
      label: 'editor_fixture_markdown.md',
      dirty: false,
      externalChanged: false,
    }],
    activeTab: 'fixture-tab',
    problemsByTab: {},
    onActivate: () => {},
    onClose: () => {},
    onSave: () => {},
    onFormatActive: () => {},
    onFixActive: () => {},
    onTogglePreview: () => {},
    onAiSelectionAction: () => {},
    onToggleFormatOnSave: () => {},
    ...overrides,
  }))
}

test('EditorTabBar enables Format and keeps Fix disabled for format-only toolbar state', () => {
  assert.equal(typeof EditorTabBar, 'function')

  const html = renderTabBar({
    canFormatActive: true,
    canFixActive: false,
    canPreviewActive: true,
  })

  assert.match(html, /<button[^>]*disabled=""[^>]*title="Apply auto-fixable issues from the active code-action provider"/)
  assert.doesNotMatch(html, /title="Format document with the active formatter route \(Shift\+Alt\+F\)"[^>]*disabled=""/)
  assert.match(html, /role="tablist"/)
  assert.match(html, /<button[^>]*role="tab"[^>]*aria-selected="true"/)
  assert.match(html, />Fix<\/button>/)
  assert.match(html, />Format<\/button>/)
})

test('EditorTabBar keeps Format and Fix enabled when semantic languages expose both actions', () => {
  const html = renderTabBar({
    canFormatActive: true,
    canFixActive: true,
  })

  assert.doesNotMatch(html, /title="Apply auto-fixable issues from the active code-action provider"[^>]*disabled=""/)
  assert.doesNotMatch(html, /title="Format document with the active formatter route \(Shift\+Alt\+F\)"[^>]*disabled=""/)
})

test('EditorTabBar surfaces provider-aware disabled titles for setup gaps', () => {
  const html = renderTabBar({
    canFormatActive: false,
    canFixActive: false,
    formatActionTitle: 'Format unavailable: uses clang-format. clang-format was not found on PATH.',
    fixActionTitle: 'Fix unavailable: uses ESLint. Code actions require a project-configured ESLint provider.',
  })

  assert.match(html, /title="Fix unavailable: uses ESLint\. Code actions require a project-configured ESLint provider\."/)
  assert.match(html, /title="Format unavailable: uses clang-format\. clang-format was not found on PATH\."/)
})
