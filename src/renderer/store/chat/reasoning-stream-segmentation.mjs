function normalizeText(value = '') {
  return String(value || '').replace(/\r\n?/g, '\n')
}

const REASONING_STEP_DELIMITER_TEXT = '\n\n---\n\n'
const REASONING_STEP_DELIMITER = /\n{2,}---\n{2,}/g

function countMatches(text = '', pattern) {
  const matches = normalizeText(text).match(pattern)
  return Array.isArray(matches) ? matches.length : 0
}

function hasUnbalancedMarkdown(text = '') {
  const normalized = normalizeText(text)
  if (!normalized.trim()) return false

  const fencedBlocks = countMatches(normalized, /```/g)
  if (fencedBlocks % 2 !== 0) return true

  const inlineCode = countMatches(normalized.replace(/```[\s\S]*?```/g, ''), /(?<!\\)`/g)
  if (inlineCode % 2 !== 0) return true

  const boldMarkers = countMatches(normalized, /(?<!\\)\*\*/g)
  return boldMarkers % 2 !== 0
}

function isOnlyFormatting(text = '') {
  return /^(\s|[*`_~-])+$/.test(normalizeText(text))
}

function isSeparatorOnly(text = '') {
  return /^-{3,}$/.test(normalizeText(text).trim())
}

function findTrailingDelimiterPrefixLength(text = '') {
  const normalized = normalizeText(text)
  const maxPrefixLength = REASONING_STEP_DELIMITER_TEXT.length - 1
  for (let length = maxPrefixLength; length > 0; length -= 1) {
    const prefix = REASONING_STEP_DELIMITER_TEXT.slice(0, length)
    if (normalized.endsWith(prefix)) return length
  }
  return 0
}

function findFirstUnmatchedMarkdownIndex(text = '') {
  const normalized = normalizeText(text)
  let inFence = false
  let inInlineCode = false
  let inBold = false
  let fenceStart = -1
  let inlineCodeStart = -1
  let boldStart = -1

  for (let index = 0; index < normalized.length; index += 1) {
    const escaped = index > 0 && normalized[index - 1] === '\\'
    if (!escaped && normalized.startsWith('```', index)) {
      if (inInlineCode) continue
      if (inFence) {
        inFence = false
        fenceStart = -1
      } else {
        inFence = true
        fenceStart = index
      }
      index += 2
      continue
    }
    if (inFence) continue
    if (!escaped && normalized[index] === '`') {
      if (inInlineCode) {
        inInlineCode = false
        inlineCodeStart = -1
      } else {
        inInlineCode = true
        inlineCodeStart = index
      }
      continue
    }
    if (inInlineCode) continue
    if (!escaped && normalized.startsWith('**', index)) {
      if (inBold) {
        inBold = false
        boldStart = -1
      } else {
        inBold = true
        boldStart = index
      }
      index += 1
    }
  }

  const unmatchedStarts = [fenceStart, inlineCodeStart, boldStart].filter((value) => value >= 0)
  if (unmatchedStarts.length <= 0) return -1
  return Math.min(...unmatchedStarts)
}

function trimDisplayReadySegment(text = '') {
  const normalized = normalizeText(text)
  const trimmed = normalized.trim()
  if (!trimmed || isOnlyFormatting(trimmed) || isSeparatorOnly(trimmed)) return ''
  return normalized
}

export function collectDisplayReadyReasoningSegments(buffer = '', { forceFlush = false } = {}) {
  const normalized = normalizeText(buffer)
  const trimmed = normalized.trim()
  if (!trimmed) {
    return { segments: [], rest: '', restStartsNewBlock: false }
  }

  if (!forceFlush && isOnlyFormatting(trimmed)) {
    return { segments: [], rest: normalized, restStartsNewBlock: false }
  }

  const trailingDelimiterPrefixLength = forceFlush ? 0 : findTrailingDelimiterPrefixLength(normalized)
  const trailingRest = trailingDelimiterPrefixLength > 0
    ? normalized.slice(normalized.length - trailingDelimiterPrefixLength)
    : ''
  const stableText = trailingDelimiterPrefixLength > 0
    ? normalized.slice(0, normalized.length - trailingDelimiterPrefixLength)
    : normalized
  const rawSegments = stableText.split(REASONING_STEP_DELIMITER)
  const segments = rawSegments
    .map((segment, index) => {
      const candidate = trimDisplayReadySegment(segment)
      if (!candidate) return null
      return {
        text: candidate,
        startsNewBlock: index > 0,
      }
    })
    .filter(Boolean)
  const restStartsNewBlock = stableText.endsWith(REASONING_STEP_DELIMITER_TEXT)
  return {
    segments,
    rest: trailingRest,
    restStartsNewBlock,
  }
}

export function buildReasoningDisplayState(text = '', { terminal = false } = {}) {
  const normalized = normalizeText(text)
  const trimmed = normalized.trim()
  if (!trimmed) {
    return {
      stableDetail: '',
      pendingTail: '',
      hasPendingTail: false,
    }
  }

  if (terminal || (!hasUnbalancedMarkdown(normalized) && !isOnlyFormatting(trimmed))) {
    return {
      stableDetail: normalized,
      pendingTail: '',
      hasPendingTail: false,
    }
  }

  const unmatchedIndex = findFirstUnmatchedMarkdownIndex(normalized)
  if (unmatchedIndex <= 0) {
    return {
      stableDetail: '',
      pendingTail: normalized,
      hasPendingTail: true,
    }
  }

  const stableDetail = normalized.slice(0, unmatchedIndex)
  const pendingTail = normalized.slice(unmatchedIndex)
  if (!pendingTail.trim()) {
    return {
      stableDetail: normalized,
      pendingTail: '',
      hasPendingTail: false,
    }
  }

  return {
    stableDetail,
    pendingTail,
    hasPendingTail: true,
  }
}
