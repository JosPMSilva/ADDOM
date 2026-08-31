import React from 'react'
import ReactMarkdown from 'react-markdown'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  getSharedMarkdownRehypePlugins,
  getSharedMarkdownRemarkPlugins,
} from '../../src/renderer/components/markdown/markdown-plugin-config.mjs'
import { groupPatchSegments, parseChatRenderSegments } from '../../src/renderer/components/chat/chat-render-segments.mjs'
import { sanitizePreviewHref } from '../../src/renderer/components/editor/editor-markdown-preview-utils.mjs'

const MARKDOWN_REMARK_PLUGINS = getSharedMarkdownRemarkPlugins()
const MARKDOWN_REHYPE_PLUGINS = getSharedMarkdownRehypePlugins()

function reactNodeText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(reactNodeText).join('')
  if (React.isValidElement(node)) return reactNodeText(node.props?.children)
  return ''
}

function childrenAreVisuallyEmpty(children) {
  const parts = React.Children.toArray(children)
  if (parts.length === 0) return true
  const hasElement = parts.some((part) => React.isValidElement(part))
  if (hasElement) return false
  return parts.map(reactNodeText).join('').trim().length === 0
}

const markdownComponents = {
  code({ inline, className, children, ...props }) {
    if (inline) {
      return React.createElement(
        'code',
        {
          ...props,
          className: 'px-1 py-0.5 rounded bg-[#0f1117] text-[#34d399] font-mono text-xs',
        },
        children,
      )
    }
    return React.createElement('code', { ...props, className }, children)
  },
  pre({ children }) {
    return React.createElement(
      'pre',
      { className: 'my-2 rounded-lg bg-[#0f1117] border border-[#1e2535] overflow-x-auto text-xs leading-relaxed p-3' },
      children,
    )
  },
  p({ children }) {
    if (childrenAreVisuallyEmpty(children)) return null
    return React.createElement('p', { className: 'mb-2 last:mb-0' }, children)
  },
  ul({ children }) {
    return React.createElement('ul', { className: 'list-disc list-inside mb-2 space-y-0.5' }, children)
  },
  ol({ children }) {
    return React.createElement('ol', { className: 'list-decimal list-inside mb-2 space-y-0.5' }, children)
  },
  li({ children }) {
    if (childrenAreVisuallyEmpty(children)) return null
    return React.createElement('li', { className: 'text-[#e2e8f0]' }, children)
  },
  h1({ children }) {
    return React.createElement('h1', { className: 'text-base font-bold mb-1 text-[#e2e8f0]' }, children)
  },
  h2({ children }) {
    return React.createElement('h2', { className: 'text-sm font-bold mb-1 text-[#e2e8f0]' }, children)
  },
  h3({ children }) {
    return React.createElement('h3', { className: 'text-sm font-semibold mb-1 text-[#8b9ab4]' }, children)
  },
  blockquote({ children }) {
    return React.createElement('blockquote', { className: 'border-l-2 border-[#5b8dee] pl-3 text-[#8b9ab4] italic my-2' }, children)
  },
  a({ href, children }) {
    return React.createElement(
      'a',
      { href, className: 'text-[#5b8dee] underline hover:text-[#e2e8f0]', target: '_blank', rel: 'noreferrer' },
      children,
    )
  },
  hr() {
    return React.createElement('hr', { className: 'border-[#1e2535] my-3' })
  },
  strong({ children }) {
    return React.createElement('strong', { className: 'font-semibold text-[#e2e8f0]' }, children)
  },
  em({ children }) {
    return React.createElement('em', { className: 'italic text-[#8b9ab4]' }, children)
  },
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function renderProseMarkdownHtml(text) {
  return renderToStaticMarkup(
    React.createElement(
      ReactMarkdown,
      {
        remarkPlugins: MARKDOWN_REMARK_PLUGINS,
        rehypePlugins: MARKDOWN_REHYPE_PLUGINS,
        components: markdownComponents,
        urlTransform: sanitizePreviewHref,
      },
      String(text ?? ''),
    ),
  )
}

function renderNonProseSegmentHtml(segment) {
  if (!segment || typeof segment !== 'object') return ''
  if (segment.type === 'patch_file_group') {
    const filePath = String(segment.filePath ?? '')
    const inner = (Array.isArray(segment.diffSegments) ? segment.diffSegments : [])
      .map((diff) => renderNonProseSegmentHtml(diff))
      .join('')
    return [
      `<section data-chat-render="patch-group" data-file-path="${escapeHtml(filePath)}">`,
      `<header data-chat-render="patch-header">${escapeHtml(filePath)}</header>`,
      inner,
      '</section>',
    ].join('')
  }
  if (segment.type === 'diff_block') {
    return `<pre data-chat-render="diff-block"><code>${escapeHtml(segment.text)}</code></pre>`
  }
  if (segment.type === 'code_block') {
    const lang = String(segment.language || 'text')
    return `<pre data-chat-render="code-block" data-language="${escapeHtml(lang)}"><code>${escapeHtml(segment.text)}</code></pre>`
  }
  if (segment.type === 'raw_fallback') {
    return `<pre data-chat-render="raw-fallback"><code>${escapeHtml(segment.text)}</code></pre>`
  }
  if (segment.type === 'file_label') {
    return `<div data-chat-render="file-label">${escapeHtml(segment.filePath || segment.rawLabel || '')}</div>`
  }
  return ''
}

function renderGroupedSegmentHtml(segment) {
  if (!segment || typeof segment !== 'object') return ''
  if (segment.type === 'prose_markdown') return renderProseMarkdownHtml(segment.text)
  return renderNonProseSegmentHtml(segment)
}

export function renderNormalizedAssistantMessageHtmlForTest(content, options = {}) {
  const mode = options.mode === 'streaming' ? 'streaming' : 'final'
  const sourceText = String(content ?? '')
  const parsed = parseChatRenderSegments(sourceText, {
    mode,
    parseStablePrefixOnly: mode === 'streaming',
    extractStandaloneCode: true,
    tailStrategy: 'raw_fallback',
  })
  const grouped = groupPatchSegments(parsed.segments)
  return grouped.map(renderGroupedSegmentHtml).join('')
}

export function renderAssistantMessageBubblePathHtmlForTest(content, options = {}) {
  const mode = options.mode === 'streaming' ? 'streaming' : 'final'
  const sourceText = String(content ?? '')
  const parsed = parseChatRenderSegments(sourceText, {
    mode,
    parseStablePrefixOnly: mode === 'streaming',
    extractStandaloneCode: true,
    tailStrategy: 'raw_fallback',
  })
  const grouped = groupPatchSegments(parsed.segments)
  const narrativeHtml = grouped.map(renderGroupedSegmentHtml).join('')

  return {
    hasPlan: false,
    hasPlanNarrative: false,
    html: narrativeHtml,
  }
}
