/**
 * Strip model-facing / echoed MoA delegation payloads from user-visible prose.
 * Agents chrome owns spawn evidence; these blocks must not appear as product answers.
 */

const LEGACY_DELEGATION_START_RE = /^=== AGENT DELEGATION RESULTS ===$/m
const LEGACY_DELEGATION_END_RE = /^=== END AGENT RESULTS ===$/m
const COMPACT_DELEGATION_START_RE = /<delegation\b[^>]*>/i
const COMPACT_DELEGATION_END_RE = /<\/delegation>/i

function splitMarkdownFenceSegments(text = '') {
  const lines = String(text || '').match(/[^\n]*\n|[^\n]+$/g) || []
  const segments = []
  let buffer = ''
  let protectedFence = false
  let fenceChar = ''
  let fenceLength = 0

  const flush = () => {
    if (!buffer) return
    segments.push({ text: buffer, protected: protectedFence })
    buffer = ''
  }

  for (const line of lines) {
    const bare = line.replace(/\r?\n$/, '')
    const fence = bare.match(/^\s*(`{3,}|~{3,})/)
    if (!protectedFence && fence) {
      flush()
      protectedFence = true
      fenceChar = fence[1][0]
      fenceLength = fence[1].length
      buffer += line
      continue
    }
    buffer += line
    if (
      protectedFence
      && fence
      && fence[1][0] === fenceChar
      && fence[1].length >= fenceLength
    ) {
      flush()
      protectedFence = false
      fenceChar = ''
      fenceLength = 0
    }
  }
  flush()
  return segments
}

function stripCompactDelegationBlocks(text = '') {
  let remaining = String(text || '')
  const kept = []
  while (true) {
    const startMatch = COMPACT_DELEGATION_START_RE.exec(remaining)
    if (!startMatch) break
    kept.push(remaining.slice(0, startMatch.index))
    const afterStart = remaining.slice(startMatch.index + startMatch[0].length)
    const endMatch = COMPACT_DELEGATION_END_RE.exec(afterStart)
    if (!endMatch) {
      remaining = ''
      break
    }
    remaining = afterStart.slice(endMatch.index + endMatch[0].length)
  }
  kept.push(remaining)
  return kept.join('')
}

function stripLegacyDelegationBlocks(text = '') {
  let remaining = String(text || '')
  const kept = []

  while (true) {
    const startMatch = LEGACY_DELEGATION_START_RE.exec(remaining)
    if (!startMatch) break

    const beforeText = remaining.slice(0, startMatch.index).trim()
    if (beforeText) kept.push(beforeText)

    const afterStart = remaining.slice(startMatch.index + startMatch[0].length)
    const endMatch = LEGACY_DELEGATION_END_RE.exec(afterStart)
    if (endMatch) {
      remaining = afterStart.slice(endMatch.index + endMatch[0].length)
      continue
    }
    remaining = ''
    break
  }

  const tail = remaining.trim()
  if (tail) kept.push(tail)
  return kept.join('\n\n')
}

export function hasDelegationPayload(text = '') {
  const raw = String(text || '')
  if (!raw) return false
  return splitMarkdownFenceSegments(raw).some((segment) => (
    !segment.protected
    && (
      LEGACY_DELEGATION_START_RE.test(segment.text)
      || COMPACT_DELEGATION_START_RE.test(segment.text)
    )
  ))
}

export function stripDelegationPayloads(text = '') {
  const raw = String(text ?? '')
  if (!raw) return ''
  const stripped = splitMarkdownFenceSegments(raw)
    .map((segment) => {
      if (segment.protected) return segment.text
      const withoutCompact = stripCompactDelegationBlocks(segment.text)
      return LEGACY_DELEGATION_START_RE.test(withoutCompact)
        ? stripLegacyDelegationBlocks(withoutCompact)
        : withoutCompact
    })
    .join('')
  return stripped.replace(/\n{3,}/g, '\n\n').trim()
}
