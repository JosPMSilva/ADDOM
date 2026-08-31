import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let EditorMarkdownPreviewPane = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/editor/EditorMarkdownPreviewPane.jsx')
  EditorMarkdownPreviewPane = mod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('markdown preview SSR renders GFM and heading anchors with safe links', () => {
  assert.equal(typeof EditorMarkdownPreviewPane, 'function')
  const markdownText = [
    '# Hello World',
    '',
    '| Col A | Col B |',
    '| --- | --- |',
    '| 1 | 2 |',
    '',
    '- [x] Task done',
    '',
    '~~deprecated~~',
    '',
    '[External](https://example.com)',
    '[Unsafe](javascript:alert(1))',
  ].join('\n')
  const html = renderToStaticMarkup(React.createElement(EditorMarkdownPreviewPane, {
    markdownText,
    currentFilePath: 'docs/guide.md',
    projectFolder: 'C:/repo',
    onOpenWorkspaceFile: async () => ({ ok: true }),
  }))

  assert.match(html, /<h1 id="hello-world"/)
  assert.match(html, /<table/)
  assert.match(html, /type="checkbox"/)
  assert.match(html, /<del>deprecated<\/del>/)
  assert.match(html, /href="https:\/\/example\.com"/)
  assert.match(html, /target="_blank"/)
  assert.match(html, /rel="noreferrer"/)
  assert.match(html, /href="#"/)
})

test('markdown preview SSR shows placeholder for local workspace image paths', () => {
  const html = renderToStaticMarkup(React.createElement(EditorMarkdownPreviewPane, {
    markdownText: '![Diagram](./images/architecture.png)',
    currentFilePath: 'docs/guide.md',
    projectFolder: 'C:/repo',
    onOpenWorkspaceFile: async () => ({ ok: true }),
  }))
  assert.match(html, /Local workspace image preview will be supported in a follow-up/i)
})

test('markdown preview SSR inline code does not serialize react-markdown node onto the DOM', () => {
  const html = renderToStaticMarkup(React.createElement(EditorMarkdownPreviewPane, {
    markdownText: 'Use `pdfa_checker.py` for validation.',
    currentFilePath: 'docs/guide.md',
    projectFolder: 'C:/repo',
    onOpenWorkspaceFile: async () => ({ ok: true }),
  }))
  assert.match(html, /<code\b[^>]*>pdfa_checker\.py<\/code>/i)
  assert.doesNotMatch(html, /\bnode="/)
  assert.doesNotMatch(html, /\[object Object\]/)
})
