const EXAMPLE_ARROW_RE = /(?:→|->|⇒|=>)/
const EXAMPLE_TOKEN_RE = /(?:`([^`]+)`|(\b[A-Za-z_][\w.]*(?:\([^)]*\))?))\s*(?:→|->|⇒|=>)\s*(?:`([^`]+)`|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|[A-Za-z_][\w.]*))/g

/**
 * Parse reference-table example cells like:
 * `cbrt(27) → 3, cbrt(-8) → -2`
 * into structured { expression, result } chips.
 * Returns null when the cell is not example-shaped.
 */
export function parseMarkdownReferenceExamples(text = '') {
  const source = String(text || '').trim()
  if (!source || !EXAMPLE_ARROW_RE.test(source)) return null

  const examples = []
  for (const match of source.matchAll(EXAMPLE_TOKEN_RE)) {
    const expression = String(match[1] || match[2] || '').trim()
    const result = String(match[3] || match[4] || '').trim()
    if (!expression || !result) continue
    examples.push({ expression, result })
  }

  return examples.length > 0 ? examples : null
}

export function shouldRenderMarkdownReferenceExamples(text = '') {
  return Array.isArray(parseMarkdownReferenceExamples(text))
}

function markdownAstNodeText(node) {
  if (!node || typeof node !== 'object') return ''
  if (typeof node.value === 'string') return node.value
  const children = Array.isArray(node.children) ? node.children : []
  return children.map((child) => markdownAstNodeText(child)).join('')
}

function findFirstMarkdownCodeText(nodes = []) {
  const source = Array.isArray(nodes) ? nodes : []
  for (const node of source) {
    const tag = String(node?.tagName || '').trim().toLowerCase()
    if (tag === 'code') {
      const text = markdownAstNodeText(node).trim()
      if (text) return text
    }
    const nested = findFirstMarkdownCodeText(node?.children)
    if (nested) return nested
  }
  return ''
}

/**
 * Prefer a callable id from the name/function cell (`cbrt`, or trailing `(cbrt)`),
 * otherwise fall back to the visible key/button cell text.
 */
export function resolveMarkdownReferenceKeyInsertText({
  keyCell = null,
  nameCell = null,
} = {}) {
  const fromNameAst = findFirstMarkdownCodeText(nameCell?.children)
  if (fromNameAst) return fromNameAst

  const nameText = String(nameCell?.text || '').trim()
  const fenced = nameText.match(/`([^`]+)`/)
  if (fenced?.[1]) return String(fenced[1]).trim()
  const parenId = nameText.match(/\(([A-Za-z_][\w.]*)\)\s*$/)
  if (parenId?.[1]) return String(parenId[1]).trim()

  return String(keyCell?.text || '').trim()
}

export function appendComposerSnippet(currentDraft = '', snippet = '') {
  const text = String(snippet || '').trim()
  if (!text) return String(currentDraft || '')
  const current = String(currentDraft || '')
  if (!current) return text
  if (/\s$/.test(current)) return `${current}${text}`
  return `${current} ${text}`
}
