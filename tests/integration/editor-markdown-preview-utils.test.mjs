import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizePreviewHref,
  resolveProjectFileReference,
  resolveProjectMarkdownLink,
  resolveWorkspaceRelativeMarkdownHref,
  isExternalHttpHref,
  isSupportedPreviewImageSrc,
} from '../../src/renderer/components/editor/editor-markdown-preview-utils.mjs'

test('sanitizePreviewHref blocks unsafe schemes and allows expected targets', () => {
  assert.equal(sanitizePreviewHref('javascript:alert(1)'), '#')
  assert.equal(sanitizePreviewHref('data:text/html,hi'), '#')
  assert.equal(sanitizePreviewHref('https://example.com/docs'), 'https://example.com/docs')
  assert.equal(sanitizePreviewHref('./guide/intro.md'), './guide/intro.md')
  assert.equal(sanitizePreviewHref('#overview'), '#overview')
})

test('resolveWorkspaceRelativeMarkdownHref resolves relative and root-local paths', () => {
  const relative = resolveWorkspaceRelativeMarkdownHref({
    href: '../reference/api.md',
    currentFilePath: 'docs/guides/quickstart.md',
  })
  assert.equal(relative.ok, true)
  assert.equal(relative.kind, 'file')
  assert.equal(relative.filePath, 'docs/reference/api.md')

  const rootLocal = resolveWorkspaceRelativeMarkdownHref({
    href: '/README.md',
    currentFilePath: 'docs/guides/quickstart.md',
  })
  assert.equal(rootLocal.ok, true)
  assert.equal(rootLocal.kind, 'file')
  assert.equal(rootLocal.filePath, 'README.md')
})

test('resolveWorkspaceRelativeMarkdownHref rejects escape traversal', () => {
  const escaped = resolveWorkspaceRelativeMarkdownHref({
    href: '../../../outside.md',
    currentFilePath: 'docs/guides/quickstart.md',
  })
  assert.equal(escaped.ok, false)
  assert.equal(escaped.reason, 'path_escapes_project_root')
})

test('resolveWorkspaceRelativeMarkdownHref classifies external and anchor links', () => {
  const external = resolveWorkspaceRelativeMarkdownHref({
    href: 'https://example.com',
    currentFilePath: 'docs/guides/quickstart.md',
  })
  assert.equal(external.ok, true)
  assert.equal(external.kind, 'external')
  assert.equal(external.href, 'https://example.com')

  const anchor = resolveWorkspaceRelativeMarkdownHref({
    href: '#section-a',
    currentFilePath: 'docs/guides/quickstart.md',
  })
  assert.equal(anchor.ok, true)
  assert.equal(anchor.kind, 'anchor')
  assert.equal(anchor.anchor, 'section-a')
})

test('resolveProjectMarkdownLink resolves project-relative and Windows absolute file links', () => {
  const relative = resolveProjectMarkdownLink({
    href: 'src/renderer/components/chat/chat-rich-content-renderer.jsx#L164',
    projectFolder: 'C:/Users/example/Documents/ADDOM',
  })
  assert.equal(relative.ok, true)
  assert.equal(relative.kind, 'file')
  assert.equal(relative.filePath, 'src/renderer/components/chat/chat-rich-content-renderer.jsx')
  assert.equal(relative.line, 164)
  assert.equal(relative.column, 1)
  assert.equal(relative.directoryPath, 'C:/Users/example/Documents/ADDOM/src/renderer/components/chat')

  const absolute = resolveProjectMarkdownLink({
    href: '/C:/Users/example/Documents/ADDOM/src/main/index.mjs#L810',
    projectFolder: 'C:/Users/example/Documents/ADDOM',
  })
  assert.equal(absolute.ok, true)
  assert.equal(absolute.kind, 'file')
  assert.equal(absolute.filePath, 'src/main/index.mjs')
  assert.equal(absolute.line, 810)
})

test('resolveProjectMarkdownLink accepts react-markdown encoded Windows drive paths', () => {
  const encodedHref = 'C:%5CUsers%5Cexample%5CDocuments%5CCodex%20Testing%5CCodex%20test%20subagents%5CHARDWARE_TOOL_IMPROVEMENT_PLAN.md'
  assert.equal(sanitizePreviewHref(encodedHref), encodedHref)

  const resolved = resolveProjectMarkdownLink({
    href: encodedHref,
    projectFolder: 'C:/Users/example/Documents/Codex Testing/Codex test subagents',
  })
  assert.equal(resolved.ok, true)
  assert.equal(resolved.kind, 'file')
  assert.equal(resolved.filePath, 'HARDWARE_TOOL_IMPROVEMENT_PLAN.md')
})

test('resolveProjectMarkdownLink normalizes colon line suffixes across relative and absolute local hrefs', () => {
  const relative = resolveProjectMarkdownLink({
    href: 'src/main/index.mjs:810',
    projectFolder: 'C:/Users/example/Documents/ADDOM',
  })
  assert.equal(relative.ok, true)
  assert.equal(relative.kind, 'file')
  assert.equal(relative.filePath, 'src/main/index.mjs')
  assert.equal(relative.line, 810)
  assert.equal(relative.column, 1)

  const windowsAbsolute = resolveProjectMarkdownLink({
    href: '/C:/Users/example/Documents/ADDOM/README.md:12',
    projectFolder: 'C:/Users/example/Documents/ADDOM',
  })
  assert.equal(windowsAbsolute.ok, true)
  assert.equal(windowsAbsolute.kind, 'file')
  assert.equal(windowsAbsolute.filePath, 'README.md')
  assert.equal(windowsAbsolute.line, 12)
  assert.equal(windowsAbsolute.column, 1)

  const posixAbsolute = resolveProjectMarkdownLink({
    href: '/Users/example/Documents/ADDOM/README.md:12',
    projectFolder: '/Users/example/Documents/ADDOM',
  })
  assert.equal(posixAbsolute.ok, true)
  assert.equal(posixAbsolute.kind, 'file')
  assert.equal(posixAbsolute.filePath, 'README.md')
  assert.equal(posixAbsolute.line, 12)
  assert.equal(posixAbsolute.column, 1)
})

test('resolveProjectMarkdownLink preserves external links and blocks out-of-project absolute paths', () => {
  const external = resolveProjectMarkdownLink({
    href: 'https://example.com/docs',
    projectFolder: 'C:/Users/example/Documents/ADDOM',
  })
  assert.deepEqual(external, {
    ok: true,
    kind: 'external',
    href: 'https://example.com/docs',
  })

  const outside = resolveProjectMarkdownLink({
    href: '/C:/Users/example/Documents/Elsewhere/outside.md#L2',
    projectFolder: 'C:/Users/example/Documents/ADDOM',
  })
  assert.equal(outside.ok, false)
  assert.equal(outside.reason, 'path_not_allowed')
})

test('resolveProjectMarkdownLink accepts double-slash Windows local hrefs and still blocks protocol-relative web hrefs', () => {
  const local = resolveProjectMarkdownLink({
    href: '//C:/Users/example/Documents/ADDOM/src/main/index.mjs',
    projectFolder: 'C:/Users/example/Documents/ADDOM',
  })
  assert.equal(local.ok, true)
  assert.equal(local.kind, 'file')
  assert.equal(local.filePath, 'src/main/index.mjs')

  const blocked = resolveProjectMarkdownLink({
    href: '//example.com/docs',
    projectFolder: 'C:/Users/example/Documents/ADDOM',
  })
  assert.equal(blocked.ok, false)
  assert.equal(blocked.reason, 'unsafe_href')
})

test('resolveProjectFileReference recovers supported file labels when markdown href is empty', () => {
  const recovered = resolveProjectFileReference({
    href: '',
    label: 'src/main/index.mjs:810',
    projectFolder: 'C:/Users/example/Documents/ADDOM',
  })
  assert.equal(recovered.ok, true)
  assert.equal(recovered.kind, 'file')
  assert.equal(recovered.filePath, 'src/main/index.mjs')
  assert.equal(recovered.line, 810)

  const rejected = resolveProjectFileReference({
    href: '',
    label: 'https://example.com/docs',
    projectFolder: 'C:/Users/example/Documents/ADDOM',
  })
  assert.equal(rejected.ok, false)
  assert.equal(rejected.reason, 'unsupported_file_reference_label')
})

test('resolveProjectFileReference resolves structured file references through the shared path', () => {
  const structured = resolveProjectFileReference({
    filePath: 'src/renderer/components/chat/chat-rich-content-renderer.jsx',
    line: 164,
    projectFolder: 'C:/Users/example/Documents/ADDOM',
  })
  assert.equal(structured.ok, true)
  assert.equal(structured.kind, 'file')
  assert.equal(structured.filePath, 'src/renderer/components/chat/chat-rich-content-renderer.jsx')
  assert.equal(structured.line, 164)
  assert.equal(structured.column, 1)

  const lineSuffixed = resolveProjectFileReference({
    filePath: 'src/main/index.mjs:810',
    projectFolder: 'C:/Users/example/Documents/ADDOM',
  })
  assert.equal(lineSuffixed.ok, true)
  assert.equal(lineSuffixed.kind, 'file')
  assert.equal(lineSuffixed.filePath, 'src/main/index.mjs')
  assert.equal(lineSuffixed.line, 810)
  assert.equal(lineSuffixed.column, 1)

  const windowsAbsoluteLineSuffixed = resolveProjectFileReference({
    filePath: '/C:/Users/example/Documents/ADDOM/README.md:12',
    projectFolder: 'C:/Users/example/Documents/ADDOM',
  })
  assert.equal(windowsAbsoluteLineSuffixed.ok, true)
  assert.equal(windowsAbsoluteLineSuffixed.kind, 'file')
  assert.equal(windowsAbsoluteLineSuffixed.filePath, 'README.md')
  assert.equal(windowsAbsoluteLineSuffixed.line, 12)
  assert.equal(windowsAbsoluteLineSuffixed.column, 1)

  const posixAbsoluteLineSuffixed = resolveProjectFileReference({
    filePath: '/Users/example/Documents/ADDOM/README.md:12',
    projectFolder: '/Users/example/Documents/ADDOM',
  })
  assert.equal(posixAbsoluteLineSuffixed.ok, true)
  assert.equal(posixAbsoluteLineSuffixed.kind, 'file')
  assert.equal(posixAbsoluteLineSuffixed.filePath, 'README.md')
  assert.equal(posixAbsoluteLineSuffixed.line, 12)
  assert.equal(posixAbsoluteLineSuffixed.column, 1)
})

test('external URL and image support helpers classify sources correctly', () => {
  assert.equal(isExternalHttpHref('https://example.com'), true)
  assert.equal(isExternalHttpHref('http://example.com'), true)
  assert.equal(isExternalHttpHref('./local.md'), false)

  assert.equal(isSupportedPreviewImageSrc('https://cdn.example.com/img.png'), true)
  assert.equal(isSupportedPreviewImageSrc('data:image/png;base64,AA=='), true)
  assert.equal(isSupportedPreviewImageSrc('blob:https://example.com/123'), true)
  assert.equal(isSupportedPreviewImageSrc('./local-image.png'), false)
})
