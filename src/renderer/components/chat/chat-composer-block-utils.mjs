import {
  createCodeComposerBlock,
  createTextComposerBlock,
  normalizeComposerBlocks,
} from './composer-segments.mjs'
import { highlightCode, canHighlightLanguage } from './composer-highlight.mjs'
import { shouldHighlightBlockText } from './code-block-rendering.mjs'

const NORMALIZE_COMPOSER_BLOCK_OPTIONS = Object.freeze({
  ensureTextSegment: false,
  ensureTrailingTextSegment: false,
})

export function normalizeComposerBlockSnapshot(blocks = []) {
  return normalizeComposerBlocks(blocks, NORMALIZE_COMPOSER_BLOCK_OPTIONS)
}

export function composerBlockMatchesId(block, blockId) {
  return String(block?.id || '').trim() === String(blockId || '').trim()
}

function areComposerBlocksEquivalent(left, right) {
  if (left === right) return true
  if (!left || !right) return false
  if (String(left.id || '').trim() !== String(right.id || '').trim()) return false
  if (String(left.type || '').trim() !== String(right.type || '').trim()) return false
  if (left.type === 'code') {
    return (
      String(left.language || 'plaintext') === String(right.language || 'plaintext')
      && String(left.code || '') === String(right.code || '')
    )
  }
  return String(left.text || '') === String(right.text || '')
}

export function areComposerBlockListsEquivalent(left = [], right = []) {
  if (left === right) return true
  if (!Array.isArray(left) || !Array.isArray(right)) return false
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (!areComposerBlocksEquivalent(left[index], right[index])) {
      return false
    }
  }
  return true
}

export function replaceComposerBlockPreservingIdentity(blocks = [], blockId, createReplacement) {
  const source = Array.isArray(blocks) ? blocks : []
  const targetId = String(blockId || '').trim()
  if (!targetId || typeof createReplacement !== 'function') return source

  let replaced = false
  let changed = false
  const nextBlocks = source.map((block) => {
    if (!composerBlockMatchesId(block, targetId)) return block
    replaced = true
    const replacement = createReplacement(block)
    if (!replacement || typeof replacement !== 'object') {
      changed = true
      return replacement
    }
    if (areComposerBlocksEquivalent(block, replacement)) {
      return block
    }
    changed = true
    return replacement
  })

  if (!replaced) {
    const replacement = createReplacement(null)
    return replacement && typeof replacement === 'object'
      ? [...source, replacement]
      : source
  }

  return changed ? nextBlocks.filter(Boolean) : source
}

export function removeComposerBlockPreservingIdentity(blocks = [], blockId) {
  const source = Array.isArray(blocks) ? blocks : []
  const targetId = String(blockId || '').trim()
  const nextBlocks = source.filter((block) => !composerBlockMatchesId(block, targetId))
  return nextBlocks.length === source.length ? source : nextBlocks
}

export function deriveCodeBlockHighlightHtml(code = '', language = 'plaintext') {
  const normalizedCode = String(code || '')
  const normalizedLanguage = String(language || 'plaintext')
  const eligible = shouldHighlightBlockText(normalizedCode) && canHighlightLanguage(normalizedLanguage)
  return eligible ? highlightCode(normalizedCode, normalizedLanguage) : null
}

export {
  createCodeComposerBlock,
  createTextComposerBlock,
}
