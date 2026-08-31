import { endsWithSentenceBoundary } from '../../../common/chat/reasoning-sentence-boundary.mjs'
import { normalizeReasoningPreview } from './live-execution-reasoning-render.mjs'

const CONNECTOR_TAIL = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'if', 'in', 'into', 'of', 'on', 'or',
  'the', 'to', 'with', 'without', 'be', 'been', 'is', 'are', 'was', 'were',
])

function lastWord(text = '') {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  return String(words[words.length - 1] || '')
    .toLowerCase()
    .replace(/[^a-z0-9'-]/gi, '')
}

/**
 * True when next commentary continues previous across tool-only gaps
 * (lowercase / paren continuation, or connector-ending previous + any next).
 */
export function isCrossToolCommentaryContinuation(previousLabel = '', nextLabel = '') {
  const previous = String(previousLabel || '').trimEnd()
  const next = String(nextLabel || '').trimStart()
  if (!previous || !next) return false
  if (endsWithSentenceBoundary(previous)) return false
  if (/^(#{1,6}\s|[*-]\s|\d+\.\s|```|>\s)/.test(next)) return false
  if (/^[a-z0-9(]/.test(next)) return true
  if (CONNECTOR_TAIL.has(lastWord(previous))) return true
  return false
}

/**
 * Display-only stitch: merge commentary labels across tool-only gaps when the
 * later row continues the earlier clause. Tool rows stay in place after the
 * merged commentary (they remain visible; chronological tool order is preserved).
 */
export function stitchCrossToolCommentaryItems(items = []) {
  const source = Array.isArray(items) ? items : []
  const projected = []
  let index = 0
  while (index < source.length) {
    const item = source[index]
    if (item?.kind !== 'commentary') {
      projected.push(item)
      index += 1
      continue
    }

    let cursor = index + 1
    const tools = []
    while (cursor < source.length && source[cursor]?.kind === 'tool') {
      tools.push(source[cursor])
      cursor += 1
    }
    const nextCommentary = cursor < source.length && source[cursor]?.kind === 'commentary'
      ? source[cursor]
      : null

    if (
      nextCommentary
      && tools.length > 0
      && isCrossToolCommentaryContinuation(item.label, nextCommentary.label)
    ) {
      const mergedLabel = normalizeReasoningPreview([
        String(item.label || '').trimEnd(),
        String(nextCommentary.label || '').trimStart(),
      ].filter(Boolean).join(' '))
      projected.push({
        ...item,
        label: mergedLabel,
      })
      for (const tool of tools) projected.push(tool)
      index = cursor + 1
      continue
    }

    projected.push(item)
    index += 1
  }
  return projected
}
