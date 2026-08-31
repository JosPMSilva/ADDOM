import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let FileTree = null
let OutlinePanel = null

before(async () => {
  const [fileTreeMod, diagnosticsMod] = await Promise.all([
    ssrLoadRendererModule('/components/editor/EditorFileTree.jsx'),
    ssrLoadRendererModule('/components/editor/EditorDiagnosticsPanels.jsx'),
  ])
  FileTree = fileTreeMod?.FileTree || null
  OutlinePanel = diagnosticsMod?.OutlinePanel || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('FileTree exposes tree semantics, labeled header actions, and left-edge active highlighting', () => {
  assert.equal(typeof FileTree, 'function')

  const html = renderToStaticMarkup(React.createElement(FileTree, {
    tree: [
      { name: 'build-electron.log', path: 'build-electron.log', type: 'file', isText: true, ext: '.log' },
    ],
    loading: false,
    projectFolder: 'C:/workspace/addom',
    activeFilePath: 'build-electron.log',
    onOpenFile: () => {},
    onOpenProjectFolder: () => {},
    onRefresh: () => {},
  }))

  assert.match(html, /role="tree"/)
  assert.match(html, /aria-label="Open project folder"/)
  assert.match(html, /aria-label="Refresh file tree"/)
  assert.match(html, /border-l-2 border-accent text-accent/)
  assert.doesNotMatch(html, /border-r-2 border-accent/)
})

test('OutlinePanel renders a real label for the symbol filter input', () => {
  assert.equal(typeof OutlinePanel, 'function')

  const html = renderToStaticMarkup(React.createElement(OutlinePanel, {
    filePath: 'src/example.ts',
    outline: {
      supported: true,
      available: false,
      loading: false,
      reason: 'service_unavailable',
      message: 'RAW ENGLISH SHOULD NOT LEAK',
      items: [],
    },
    setupHints: [{
      id: 'workspace::formatting::clang-format::clang_format_not_installed',
      actionLabel: 'Format',
      capabilityKey: 'formatting',
      providerId: 'clang-format',
      providerLabel: 'clang-format',
      reason: 'clang_format_not_installed',
      message: 'RAW ENGLISH SHOULD NOT LEAK',
    }],
    onSelectSymbol: () => {},
    onDismissSetupHint: () => {},
  }))

  assert.match(html, /<label[^>]*for="editor-outline-filter-input"[^>]*>Filter symbols<\/label>/)
  assert.match(html, /id="editor-outline-filter-input"/)
  assert.match(html, /aria-label="Filter symbols"/)
  assert.match(html, />Setup<\/p>/)
  assert.match(html, />clang-format<\/span>/)
  assert.match(html, /title="Dismiss format setup hint"/)
  assert.match(html, /Symbols are unavailable because the editor service is not ready\./)
  assert.match(html, /clang-format was not found in this project or on PATH\./)
  assert.doesNotMatch(html, /RAW ENGLISH SHOULD NOT LEAK/)
})
