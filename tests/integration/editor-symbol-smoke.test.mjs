import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { __testEditorLspProviderSessionInternals } from '../../src/main/editor/editor-lsp-provider-session.mjs'
import { __testPyrightProviderInternals } from '../../src/main/editor/editor-pyright-provider.mjs'
import { __testTsServerProviderInternals } from '../../src/main/editor/editor-tsserver-provider.mjs'
import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let MonacoPane = null
let ChatComposer = null
let EditorMarkdownPreviewPane = null

before(async () => {
  const [monacoMod, composerMod, markdownPreviewMod] = await Promise.all([
    ssrLoadRendererModule('/components/editor/EditorMonacoPane.jsx'),
    ssrLoadRendererModule('/components/chat/ChatComposer.jsx'),
    ssrLoadRendererModule('/components/editor/EditorMarkdownPreviewPane.jsx'),
  ])
  MonacoPane = monacoMod?.MonacoPane || null
  ChatComposer = composerMod?.default || null
  EditorMarkdownPreviewPane = markdownPreviewMod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('editor and composer shells render in SSR smoke checks', () => {
  assert.equal(typeof MonacoPane, 'function')
  assert.equal(typeof ChatComposer, 'function')
  assert.equal(typeof EditorMarkdownPreviewPane, 'function')

  const monacoSource = fs.readFileSync(
    path.resolve('src/renderer/components/editor/EditorMonacoPane.jsx'),
    'utf8',
  )
  const monacoInlineSource = fs.readFileSync(
    path.resolve('src/renderer/components/editor/editor-monaco-inline-completions.mjs'),
    'utf8',
  )
  assert.match(monacoSource, /import\s+\{\s*LoadingPane\s*\}\s+from\s+'\.\/EditorFileTree\.jsx'/)
  assert.match(monacoSource, /loading=\{<LoadingPane\s*\/>\}/)
  assert.match(monacoSource, /onToggleMarkdownPreview/)
  assert.match(monacoSource, /registerMonacoEditorCommands/)
  assert.match(monacoInlineSource, /markdownPreviewShortcutEnabled/)
  assert.match(monacoInlineSource, /if\s*\(\s*markdownPreviewShortcutEnabled\s*\)/)
  assert.match(monacoInlineSource, /KeyMod\.CtrlCmd\s*\|\s*monaco\.KeyMod\.Shift\s*\|\s*monaco\.KeyCode\.KeyV/)

  const chatComposerHtml = renderToStaticMarkup(React.createElement(ChatComposer, {
    contextUsage: {},
    costEstimate: null,
    continuityStatus: null,
    composerInputRef: { current: null },
    composerBlocks: [],
    composerDraftText: 'hello',
    onDraftTextChange: () => {},
    onBlocksChange: () => {},
    onKeyDown: () => {},
    placeholder: 'Type...',
    disabled: false,
    isStreaming: false,
    canSend: true,
    onSend: () => {},
    onStop: () => {},
    attachedImages: [],
    onImagesAttached: () => {},
    onImageRemove: () => {},
    visionSupported: false,
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.2',
    projectFolder: 'C:/repo',
    inlineCompletionEnabled: true,
  }))
  assert.match(chatComposerHtml, /chat-composer-row/)

  const markdownPreviewHtml = renderToStaticMarkup(React.createElement(EditorMarkdownPreviewPane, {
    markdownText: '# Hello',
    currentFilePath: 'docs/guide.md',
    projectFolder: 'C:/repo',
    onOpenWorkspaceFile: async () => ({ ok: true }),
  }))
  assert.match(markdownPreviewHtml, /Markdown Preview/i)
})

test('tsserver outline symbols preserve navtree line locations', () => {
  const {
    createLineMap,
    createOutlineNode,
  } = __testTsServerProviderInternals
  const source = [
    "import tool from 'tool'",
    '',
    'function buildRendererCsp({ isProd }) {',
    '  return isProd',
    '}',
    '',
  ].join('\n')
  const lineMap = createLineMap(source)

  const node = createOutlineNode({
    text: 'buildRendererCsp',
    kind: 'function',
    kindModifiers: '',
    spans: [{
      start: { line: 3, offset: 1 },
      end: { line: 5, offset: 2 },
    }],
    nameSpan: {
      start: { line: 3, offset: 10 },
      end: { line: 3, offset: 26 },
    },
  }, lineMap, [0])

  assert.equal(node.name, 'buildRendererCsp')
  assert.equal(node.startLineNumber, 3)
  assert.equal(node.startColumn, 1)
  assert.equal(node.selectionLineNumber, 3)
  assert.equal(node.selectionColumn, 10)
  assert.ok(node.rangeStartOffset > 0)
  assert.ok(node.selectionStartOffset > node.rangeStartOffset)
})

test('pyright outline symbols preserve LSP line locations', () => {
  const {
    createLineMap,
    createOutlineNode,
  } = __testPyrightProviderInternals
  const source = [
    'class Greeter:',
    '    def greet(self, name: str) -> str:',
    '        return f"Hello, {name}"',
    '',
  ].join('\n')
  const lineMap = createLineMap(source)

  const node = createOutlineNode({
    name: 'greet',
    kind: 12,
    range: {
      start: { line: 1, character: 4 },
      end: { line: 2, character: 31 },
    },
    selectionRange: {
      start: { line: 1, character: 8 },
      end: { line: 1, character: 13 },
    },
  }, lineMap, [0])

  assert.equal(node.name, 'greet')
  assert.equal(node.startLineNumber, 2)
  assert.equal(node.startColumn, 5)
  assert.equal(node.selectionLineNumber, 2)
  assert.equal(node.selectionColumn, 9)
  assert.ok(node.rangeStartOffset > 0)
  assert.ok(node.selectionStartOffset > node.rangeStartOffset)
})

test('shared LSP outline symbols preserve documentSymbol line locations', () => {
  const {
    createLineMap,
    createOutlineNode,
  } = __testEditorLspProviderSessionInternals
  const source = [
    '#include <string>',
    '',
    'std::string greet(const std::string& name) {',
    '  return "Hello " + name;',
    '}',
    '',
  ].join('\n')
  const lineMap = createLineMap(source)

  const node = createOutlineNode({
    name: 'greet',
    kind: 12,
    range: {
      start: { line: 2, character: 0 },
      end: { line: 4, character: 1 },
    },
    selectionRange: {
      start: { line: 2, character: 12 },
      end: { line: 2, character: 17 },
    },
  }, lineMap, [0])

  assert.equal(node.name, 'greet')
  assert.equal(node.startLineNumber, 3)
  assert.equal(node.startColumn, 1)
  assert.equal(node.selectionLineNumber, 3)
  assert.equal(node.selectionColumn, 13)
  assert.ok(node.rangeStartOffset > 0)
  assert.ok(node.selectionStartOffset > node.rangeStartOffset)
})
