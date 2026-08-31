import { sanitizePreviewHref } from '../../src/renderer/components/editor/editor-markdown-preview-utils.mjs'
import {
  decodeHtmlEntities,
  formatAnnotationPath,
  getAttribute,
  hasTruthyAttribute,
  isCheckboxInput,
  isWindowsDriveAbsolutePath,
} from './final-document-semantic-snapshot-dom.mjs'

const INLINE_SKIP_TAGS = new Set(['script', 'style'])
const EXECUTION_DATA_UI_MARKERS = new Set([
  'execution',
  'execution-commentary',
  'execution-stream',
  'execution-row',
])
const EXCLUDED_CHAT_RENDER_MARKERS = new Set([
  'patch-group',
  'diff-block',
  'file-label',
  'plan-card',
  'delegation',
  'role',
  'dispatch',
  'council',
  'review',
  'role-confirmation',
])

export function collectInlineTokens(nodes, state, path = []) {
  const tokens = []
  let index = 0
  for (const node of nodes || []) {
    const token = collectInlineToken(node, state, [...path, index])
    if (token) tokens.push(token)
    index += 1
  }
  return mergeAdjacentTextTokens(tokens)
}

export function collectInlineToken(node, state, path) {
  if (!node) return null
  if (node.type === 'text') {
    const text = normalizeInlineText(node.text)
    return text ? { kind: 'text', text, path: formatAnnotationPath(path) } : null
  }
  if (node.type !== 'element') return null
  const tagName = String(node.tagName || '').toLowerCase()
  if (INLINE_SKIP_TAGS.has(tagName)) return null
  if (shouldSkipExecutionOwnedNode(node)) return null
  if (tagName === 'br') return { kind: 'text', text: '\n', path: formatAnnotationPath(path) }
  if (tagName === 'wbr') return null
  if (tagName === 'strong' || tagName === 'b') {
    const children = collectInlineTokens(node.children || [], state, [...path, 'children'])
    return children.length > 0
      ? { kind: 'strong', children, text: inlineTokensToText(children), path: formatAnnotationPath(path) }
      : null
  }
  if (tagName === 'em' || tagName === 'i') {
    const children = collectInlineTokens(node.children || [], state, [...path, 'children'])
    return children.length > 0
      ? { kind: 'emphasis', children, text: inlineTokensToText(children), path: formatAnnotationPath(path) }
      : null
  }
  if (tagName === 'code') {
    const text = normalizeInlineText(collectNodeText(node))
    return text ? { kind: 'inline_code', text, path: formatAnnotationPath(path) } : null
  }
  if (tagName === 'a') {
    const children = collectInlineTokens(node.children || [], state, [...path, 'children'])
    const href = normalizeLinkHref(getAttribute(node, 'href'))
    const linkMeta = classifyLinkHref(href)
    state.snapshot.annotations.links.push({
      id: `link-${state.nextLinkId++}`,
      href: linkMeta.href,
      safe: linkMeta.safe,
      targetClass: linkMeta.targetClass,
      text: inlineTokensToText(children),
      path: formatAnnotationPath(path),
      ownership: 'final_document',
    })
    return children.length > 0
      ? { kind: 'link', href: linkMeta.href, safe: linkMeta.safe, targetClass: linkMeta.targetClass, children, text: inlineTokensToText(children), path: formatAnnotationPath(path) }
      : null
  }
  if (tagName === 'button' || getAttribute(node, 'role') === 'button') {
    recordControlAnnotation(node, state, path)
    return null
  }
  if (tagName === 'input' && isCheckboxInput(node)) return null
  if (hasTruthyAttribute(node, 'data-chat-control') || hasTruthyAttribute(node, 'data-control')) {
    recordControlAnnotation(node, state, path)
    return null
  }
  const children = collectInlineTokens(node.children || [], state, [...path, 'children'])
  return children.length > 0 ? { kind: 'group', children, text: inlineTokensToText(children), path: formatAnnotationPath(path) } : null
}

export function recordControlAnnotation(node, state, path) {
  const role = normalizeControlRole(getAttribute(node, 'role') || String(node.tagName || 'button'))
  const name = normalizeInlineText(
    getAttribute(node, 'aria-label')
      || inlineTokensToText(collectInlineTokens(node.children || [], state, [...path, 'children']))
      || getAttribute(node, 'title')
      || '',
  )
  const action = normalizeInlineText(getAttribute(node, 'data-chat-control-action') || getAttribute(node, 'data-action') || name)
  if (!name && !action) return
  state.snapshot.annotations.controls.push({
    id: `control-${state.nextControlId++}`,
    role,
    name: name || action,
    action,
    path: formatAnnotationPath(path),
    ownership: 'renderer',
  })
}

export function collectNodeText(node) {
  if (!node) return ''
  if (node.type === 'text') return decodeHtmlEntities(String(node.text || ''))
  let text = ''
  for (const child of node.children || []) {
    text += collectNodeText(child)
  }
  return text
}

export function normalizeInlineText(value) {
  return decodeHtmlEntities(String(value ?? '')).replace(/\r\n/g, '\n')
}

export function normalizeBlockText(value) {
  return decodeHtmlEntities(String(value ?? '')).replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim()
}

export function normalizeCodeText(value) {
  return decodeHtmlEntities(String(value ?? '').replace(/\r\n/g, '\n')).replace(/\n+$/, '')
}

export function normalizeCodeLanguage(value) {
  const language = String(value ?? '').trim()
  if (!language) return ''
  const match = language.match(/\b(?:language|lang)-([a-z0-9_-]+)/i)
  if (match) return match[1].toLowerCase()
  return language.replace(/^language-/i, '').toLowerCase()
}

export function normalizeLinkHref(href) {
  return decodeHtmlEntities(String(href ?? '')).trim()
}

export function classifyLinkHref(href) {
  const value = String(href ?? '').trim()
  const sanitized = sanitizePreviewHref(value)
  if (!value) return { href: '', safe: false, targetClass: 'empty' }
  if (value === '#') return { href: '#', safe: false, targetClass: 'unsafe' }
  if (value.startsWith('#')) return { href: value, safe: true, targetClass: 'anchor' }
  if (isWindowsDriveAbsolutePath(value)) return { href: value, safe: true, targetClass: 'internal_file' }
  if (sanitized === '#' && value !== '#') return { href: value, safe: false, targetClass: 'unsafe' }
  if (/^https?:\/\//i.test(sanitized)) return { href: sanitized, safe: true, targetClass: 'external' }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return { href: value, safe: false, targetClass: 'unsafe' }
  return { href: value, safe: true, targetClass: 'internal_file' }
}

export function normalizeControlRole(role) {
  const value = String(role ?? '').trim().toLowerCase()
  return value.length > 0 ? value : 'button'
}

export function shouldSkipExecutionOwnedNode(node) {
  if (!node || typeof node !== 'object') return false
  if (String(getAttribute(node, 'data-live-execution-stream-root')).toLowerCase() === 'true') return true
  if (String(getAttribute(node, 'data-turn-shell-slot')).trim().toLowerCase() === 'execution') return true
  const dataUi = String(getAttribute(node, 'data-ui') || '').trim().toLowerCase()
  if (EXECUTION_DATA_UI_MARKERS.has(dataUi)) return true
  const render = String(getAttribute(node, 'data-chat-render') || '').trim().toLowerCase()
  if (EXCLUDED_CHAT_RENDER_MARKERS.has(render)) return true
  return false
}

export function mergeAdjacentTextTokens(tokens) {
  const merged = []
  for (const token of tokens || []) {
    if (!token) continue
    if (token.kind === 'text' && merged.at(-1)?.kind === 'text') {
      merged.at(-1).text += token.text
      continue
    }
    merged.push(token)
  }
  return merged.filter((token) => token.kind !== 'text' || token.text.length > 0)
}

export function inlineTokensToText(tokens) {
  let text = ''
  for (const token of tokens || []) {
    text += inlineTokenText(token)
  }
  return text
}

export function inlineTokenText(token) {
  if (!token) return ''
  if (Array.isArray(token)) return inlineTokensToText(token)
  if (typeof token === 'string') return token
  if (token.kind === 'text' || token.kind === 'inline_code') return String(token.text || '')
  if (Array.isArray(token.children)) {
    return inlineTokensToText(token.children || []) || token.text || ''
  }
  return String(token.text || '')
}

export function inlinesToText(inlines) {
  return inlineTokensToText(inlines)
}
