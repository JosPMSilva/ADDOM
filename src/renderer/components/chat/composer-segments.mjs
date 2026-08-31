let composerSegmentSequence = 0

function nextComposerSegmentId(prefix = 'composer_seg') {
  composerSegmentSequence += 1
  return `${prefix}_${Date.now()}_${composerSegmentSequence.toString(36)}`
}

function sanitizeLanguage(value) {
  if (value === null || value === undefined) return 'plaintext'
  const raw = String(value).trim().toLowerCase()
  if (!raw) return ''
  return raw.replace(/[^a-z0-9_+.-]/g, '').slice(0, 40) || ''
}

function isPlausibleLanguageToken(value) {
  return /^[a-z0-9_+.-]{1,40}$/i.test(String(value || '').trim())
}

export function createTextComposerSegment(text = '', id = '') {
  return {
    id: String(id || '').trim() || nextComposerSegmentId('composer_text'),
    type: 'text',
    text: String(text || ''),
  }
}

export function createCodeComposerSegment({ language = 'plaintext', code = '' } = {}, id = '') {
  return {
    id: String(id || '').trim() || nextComposerSegmentId('composer_code'),
    type: 'code',
    language: sanitizeLanguage(language),
    code: String(code || ''),
  }
}

export const createTextComposerBlock = createTextComposerSegment
export const createCodeComposerBlock = createCodeComposerSegment

function longestBacktickRun(text = '') {
  let max = 0
  const value = String(text || '')
  const matches = value.match(/`+/g) || []
  for (const run of matches) {
    if (run.length > max) max = run.length
  }
  return max
}

function serializeCodeFence(segment) {
  const code = String(segment?.code || '')
  const language = sanitizeLanguage(segment?.language)
  const fenceLength = Math.max(3, longestBacktickRun(code) + 1)
  const fence = '`'.repeat(fenceLength)
  return `${fence}${language}\n${code}\n${fence}`
}

function separatorBetweenSerializedSegments(previousSegment, nextSegment, previousChunk, nextChunk) {
  if (!previousSegment || !nextSegment) return ''
  const prevType = String(previousSegment.type || '')
  const nextType = String(nextSegment.type || '')
  if (prevType === 'text' && nextType === 'text') return ''

  const prevValue = String(previousChunk || '')
  const nextValue = String(nextChunk || '')
  const prevEndsWithNewline = /\r?\n$/.test(prevValue)
  const nextStartsWithNewline = /^\r?\n/.test(nextValue)

  if (prevType === 'code' && nextType === 'code') {
    return '\n\n'
  }
  if (prevType === 'text' && nextType === 'code') {
    return prevEndsWithNewline ? '' : '\n\n'
  }
  if (prevType === 'code' && nextType === 'text') {
    return nextStartsWithNewline ? '' : '\n\n'
  }
  return ''
}

function mergeAdjacentTextSegments(segments = []) {
  const merged = []
  for (const segment of segments) {
    if (!segment) continue
    if (segment.type === 'text') {
      const text = String(segment.text || '')
      const prev = merged[merged.length - 1]
      if (prev?.type === 'text') {
        prev.text = `${String(prev.text || '')}${text}`
      } else {
        merged.push(createTextComposerSegment(text, segment.id))
      }
      continue
    }
    if (segment.type === 'code') {
      merged.push(createCodeComposerSegment({
        language: segment.language,
        code: segment.code,
      }, segment.id))
    }
  }
  return merged
}

function parseInlineFencePayload(payload = '') {
  const raw = String(payload || '')
  const trimmed = raw.trim()
  if (!trimmed) {
    return { language: 'plaintext', code: '' }
  }

  const firstWhitespaceIndex = trimmed.search(/\s/)
  if (firstWhitespaceIndex === -1) {
    if (isPlausibleLanguageToken(trimmed)) {
      return { language: trimmed, code: '' }
    }
    return { language: 'plaintext', code: trimmed }
  }

  const firstToken = trimmed.slice(0, firstWhitespaceIndex).trim()
  const rest = trimmed.slice(firstWhitespaceIndex + 1)
  if (isPlausibleLanguageToken(firstToken)) {
    return { language: firstToken, code: rest }
  }
  return { language: 'plaintext', code: trimmed }
}

function splitInlineFencesInTextSegment(segment) {
  const text = String(segment?.text || '')
  if (!text.includes('```')) return [createTextComposerSegment(text, segment?.id)]

  const inlineFencePattern = /(`{3,})([^\r\n]*?)\1/g
  const parts = []
  let cursor = 0
  let match
  let preservedTextIdUsed = false

  while ((match = inlineFencePattern.exec(text))) {
    const [fullMatch, , innerPayload] = match
    const start = match.index
    const end = start + fullMatch.length

    if (start > cursor) {
      const beforeText = text.slice(cursor, start)
      if (beforeText) {
        parts.push(createTextComposerSegment(
          beforeText,
          !preservedTextIdUsed ? segment?.id : '',
        ))
        preservedTextIdUsed = true
      }
    }

    const { language, code } = parseInlineFencePayload(innerPayload)
    parts.push(createCodeComposerSegment({ language, code }))
    cursor = end
  }

  if (cursor < text.length) {
    const tailText = text.slice(cursor)
    parts.push(createTextComposerSegment(
      tailText,
      !preservedTextIdUsed ? segment?.id : '',
    ))
    preservedTextIdUsed = true
  }

  if (parts.length === 0) {
    return [createTextComposerSegment(text, segment?.id)]
  }

  return parts
}

function explodeInlineFencesInTextSegments(segments = []) {
  const expanded = []
  for (const segment of Array.isArray(segments) ? segments : []) {
    if (!segment || segment.type !== 'text') {
      if (segment) expanded.push(segment)
      continue
    }
    expanded.push(...splitInlineFencesInTextSegment(segment))
  }
  return expanded
}

function normalizeSegmentInput(segment) {
  if (!segment || typeof segment !== 'object') return null
  if (segment.type === 'code') {
    return createCodeComposerSegment({
      language: segment.language,
      code: segment.code,
    }, segment.id)
  }
  return createTextComposerSegment(segment.text, segment.id)
}

export function normalizeComposerSegments(input = [], options = {}) {
  const {
    ensureTextSegment = true,
    ensureTrailingTextSegment = true,
  } = options

  const list = Array.isArray(input)
    ? input.map(normalizeSegmentInput).filter(Boolean)
    : []

  let normalized = mergeAdjacentTextSegments(list)

  if (normalized.length === 0 && ensureTextSegment) {
    return [createTextComposerSegment('')]
  }

  if (ensureTextSegment && ensureTrailingTextSegment && normalized.length > 0) {
    const last = normalized[normalized.length - 1]
    const hasAnyText = normalized.some((segment) => segment.type === 'text')
    if (!hasAnyText || last?.type !== 'text') {
      normalized = [...normalized, createTextComposerSegment('')]
    }
  }

  return normalized
}

export const normalizeComposerBlocks = normalizeComposerSegments

export function parseComposerTextToSegments(text = '', options = {}) {
  const value = String(text || '')
  if (!value) {
    return normalizeComposerSegments([], options)
  }

  const segments = []
  const fencePattern = /(^|\r?\n)(`{3,})([^\n`]*)[ \t]*\r?\n([\s\S]*?)\r?\n?\2/g
  let cursor = 0
  let match

  while ((match = fencePattern.exec(value))) {
    const [fullMatch, linePrefix, , rawLanguage, rawCode] = match
    const prefixLength = String(linePrefix || '').length
    const start = match.index + prefixLength
    const end = match.index + fullMatch.length

    if (start > cursor) {
      segments.push(createTextComposerSegment(value.slice(cursor, start)))
    }

    segments.push(createCodeComposerSegment({
      language: rawLanguage,
      code: rawCode,
    }))

    cursor = end
  }

  if (cursor < value.length) {
    segments.push(createTextComposerSegment(value.slice(cursor)))
  }

  return normalizeComposerSegments(explodeInlineFencesInTextSegments(segments), options)
}

export function parseTextToComposerBlocks(text = '', options = {}) {
  return parseComposerTextToSegments(text, {
    ensureTextSegment: false,
    ensureTrailingTextSegment: false,
    ...options,
  })
}

export function extractComposerBlocksFromDraftText(draftText = '') {
  const raw = String(draftText || '')
  const parsed = parseComposerTextToSegments(raw, {
    ensureTextSegment: true,
    ensureTrailingTextSegment: true,
  })
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return {
      blocksToAppend: [],
      remainingDraftText: raw,
    }
  }

  const trailing = parsed[parsed.length - 1]
  if (!trailing || trailing.type !== 'text') {
    return {
      blocksToAppend: normalizeComposerBlocks(parsed, {
        ensureTextSegment: false,
        ensureTrailingTextSegment: false,
      }),
      remainingDraftText: '',
    }
  }

  const preceding = parsed.slice(0, -1)
  const blocksToAppend = normalizeComposerBlocks(
    preceding.filter((segment) => (
      segment?.type === 'code'
      || String(segment?.text || '').length > 0
    )),
    {
      ensureTextSegment: false,
      ensureTrailingTextSegment: false,
    },
  )

  return {
    blocksToAppend,
    remainingDraftText: String(trailing.text || ''),
  }
}

export function serializeComposerSegments(input = [], options = {}) {
  const {
    trimOuterWhitespace = true,
  } = options

  const segments = normalizeComposerSegments(input, {
    ensureTextSegment: false,
    ensureTrailingTextSegment: false,
  })

  const parts = []
  let previousSegment = null
  let previousChunk = ''
  for (const segment of segments) {
    if (!segment) continue
    let chunk = ''
    if (segment.type === 'code') {
      chunk = serializeCodeFence(segment)
    } else {
      const text = String(segment.text || '')
      if (text.length === 0) continue
      chunk = text
    }
    const separator = separatorBetweenSerializedSegments(previousSegment, segment, previousChunk, chunk)
    if (separator) parts.push(separator)
    parts.push(chunk)
    previousSegment = segment
    previousChunk = chunk
  }

  const joined = parts.join('')
  return trimOuterWhitespace ? joined.trim() : joined
}

export const serializeComposerBlocks = serializeComposerSegments

export function serializeComposerBlocksAndDraft(params = {}) {
  const input = params && typeof params === 'object' ? params : {}
  const hasBlocksKey = Object.prototype.hasOwnProperty.call(input, 'blocks')
  const hasDraftTextKey = Object.prototype.hasOwnProperty.call(input, 'draftText')
  const blocks = hasBlocksKey ? input.blocks : undefined
  const composerBlocks = input.composerBlocks
  const draftText = hasDraftTextKey ? input.draftText : undefined
  const composerDraftText = input.composerDraftText
  const trimOuterWhitespace = input.trimOuterWhitespace !== false

  const normalizedInputBlocks = Array.isArray(blocks)
    ? blocks
    : (Array.isArray(composerBlocks) ? composerBlocks : [])
  const serializedBlocks = serializeComposerBlocks(normalizedInputBlocks, { trimOuterWhitespace: false })
  const trailingDraft = String(draftText ?? composerDraftText ?? '')

  let combined = serializedBlocks
  if (trailingDraft) {
    const needsBoundary = (
      combined.length > 0
      && !/[\s\n]$/.test(combined)
      && !/^[\s\n]/.test(trailingDraft)
    )
    combined += needsBoundary ? `\n\n${trailingDraft}` : trailingDraft
  }

  return trimOuterWhitespace ? combined.trim() : combined
}

export function parseComposerMarkdownToBlocksAndDraft(markdown = '') {
  const raw = String(markdown || '')
  if (!raw) {
    return {
      composerBlocks: [],
      composerDraftText: '',
    }
  }
  const { blocksToAppend, remainingDraftText } = extractComposerBlocksFromDraftText(raw)
  return {
    composerBlocks: normalizeComposerBlocks(blocksToAppend, {
      ensureTextSegment: false,
      ensureTrailingTextSegment: false,
    }),
    composerDraftText: String(remainingDraftText || ''),
  }
}

export function splitTextComposerSegmentByFences(segment, nextText = '') {
  const base = segment && typeof segment === 'object' ? segment : createTextComposerSegment('')
  const parsed = parseComposerTextToSegments(nextText, {
    ensureTextSegment: false,
    ensureTrailingTextSegment: false,
  })

  if (parsed.length === 0) {
    return [createTextComposerSegment('', base.id)]
  }

  if (parsed.length === 1 && parsed[0]?.type === 'text') {
    return [createTextComposerSegment(parsed[0].text, base.id)]
  }

  return parsed
}

export function replaceComposerSegmentById(segments = [], segmentId, replacement = []) {
  const targetId = String(segmentId || '').trim()
  const source = Array.isArray(segments) ? segments : []
  const next = []
  let replaced = false

  for (const segment of source) {
    if (!replaced && String(segment?.id || '').trim() === targetId) {
      const items = Array.isArray(replacement) ? replacement : [replacement]
      next.push(...items.map(normalizeSegmentInput).filter(Boolean))
      replaced = true
      continue
    }
    const normalized = normalizeSegmentInput(segment)
    if (normalized) next.push(normalized)
  }

  if (!replaced) {
    const items = Array.isArray(replacement) ? replacement : [replacement]
    next.push(...items.map(normalizeSegmentInput).filter(Boolean))
  }

  return normalizeComposerSegments(next)
}

export function replaceComposerBlockById(blocks = [], blockId, replacement = []) {
  const targetId = String(blockId || '').trim()
  const source = Array.isArray(blocks) ? blocks : []
  const next = []
  let replaced = false

  for (const block of source) {
    if (!replaced && String(block?.id || '').trim() === targetId) {
      const items = Array.isArray(replacement) ? replacement : [replacement]
      next.push(...items.map(normalizeSegmentInput).filter(Boolean))
      replaced = true
      continue
    }
    const normalized = normalizeSegmentInput(block)
    if (normalized) next.push(normalized)
  }

  if (!replaced) {
    const items = Array.isArray(replacement) ? replacement : [replacement]
    next.push(...items.map(normalizeSegmentInput).filter(Boolean))
  }

  return normalizeComposerBlocks(next, {
    ensureTextSegment: false,
    ensureTrailingTextSegment: false,
  })
}

export function removeComposerSegmentById(segments = [], segmentId) {
  const targetId = String(segmentId || '').trim()
  return normalizeComposerSegments(
    (Array.isArray(segments) ? segments : []).filter((segment) => String(segment?.id || '').trim() !== targetId),
  )
}

export function removeComposerBlockById(blocks = [], blockId) {
  const targetId = String(blockId || '').trim()
  return normalizeComposerBlocks(
    (Array.isArray(blocks) ? blocks : []).filter((block) => String(block?.id || '').trim() !== targetId),
    {
      ensureTextSegment: false,
      ensureTrailingTextSegment: false,
    },
  )
}
