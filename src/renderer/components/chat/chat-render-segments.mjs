const DEFAULT_OPTIONS = {
  mode: 'final',
  parseStablePrefixOnly: false,
  extractStandaloneCode: true,
  maxChars: 200_000,
  maxLines: 8_000,
  devDiagnostics: false,
  tailStrategy: 'raw_fallback',
}

const STRONG_PATCH_RE = /^(diff --git\b|---\s+a\/\S|---\s+\S|\+\+\+\s+b\/\S|\+\+\+\s+\S|@@(?:\s|$)|\\ No newline at end of file$)/
const HUNK_MARKER_RE = /^@@(?:\s|$)/
const FENCE_LINE_RE = /^\s*(`{3,})([^\s`]*)?.*$/
const PATH_LIKE_RE = /^(?:[A-Za-z]:[\\/]|\.{1,2}[\\/])?[\w .@()+\-\\/]+\.[A-Za-z0-9]{1,12}(?:#L\d+|:\d+)?$/
const PATCH_INDICATOR_RE = /(^|\n)(```|diff --git\b|---\s+a\/|\+\+\+\s+b\/|@@(?:\s|$)|\\ No newline at end of file$)/
const CODE_HINT_RE = /(^|\n)\s*(?:function\s+\w+\s*\(|(?:const|let|var)\s+\w+\s*=|<\/?[a-zA-Z][^>]*>|[@.#:][\w-][^{]*\{)/

function normalizeOptions(options = {}) {
  const mode = options.mode === 'streaming' ? 'streaming' : 'final'
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    mode,
    parseStablePrefixOnly: options.parseStablePrefixOnly ?? (mode === 'streaming'),
    extractStandaloneCode: options.extractStandaloneCode !== false,
    tailStrategy: options.tailStrategy === 'prose' ? 'prose' : 'raw_fallback',
    maxChars: Number.isFinite(Number(options.maxChars)) ? Math.max(1_000, Number(options.maxChars)) : DEFAULT_OPTIONS.maxChars,
    maxLines: Number.isFinite(Number(options.maxLines)) ? Math.max(200, Number(options.maxLines)) : DEFAULT_OPTIONS.maxLines,
    devDiagnostics: !!options.devDiagnostics,
  }
}

function normalizeNewlines(text = '') {
  return String(text ?? '').replace(/\r\n?/g, '\n')
}

function isBlank(line = '') {
  return String(line ?? '').trim() === ''
}

function isStrongPatchMarker(line = '') {
  return STRONG_PATCH_RE.test(String(line ?? '').trim())
}

function isNoNewlineMarker(line = '') {
  return /^\\ No newline at end of file$/.test(String(line ?? '').trim())
}

function isHunkMarker(line = '') {
  return HUNK_MARKER_RE.test(String(line ?? '').trim())
}

function isDiffHeaderLine(line = '') {
  const trimmed = String(line ?? '').trim()
  return /^(index\s+[0-9a-f]+\.\.[0-9a-f]+|new file mode\b|deleted file mode\b|old mode\b|new mode\b|similarity index\b|rename (from|to)\b)/.test(trimmed)
}

function isDiffPrefixedLine(line = '') {
  const raw = String(line ?? '')
  if (!raw) return false
  if (raw.startsWith('+++ ') || raw.startsWith('--- ')) return false
  return raw[0] === '+' || raw[0] === '-' || raw[0] === ' '
}

function isMarkdownHeading(line = '') {
  return /^\s{0,3}#{1,6}\s+/.test(String(line ?? ''))
}

function isBulletLine(line = '') {
  return /^\s*[-*]\s+/.test(String(line ?? ''))
}

function isEnumeratedListLine(line = '') {
  return /^\s*\d+\.\s+/.test(String(line ?? ''))
}

function isLikelyProseSentence(line = '') {
  const raw = String(line ?? '')
  const trimmed = raw.trim()
  if (!trimmed) return false
  if (isStrongPatchMarker(trimmed) || isMarkdownHeading(trimmed)) return false
  if (isBulletLine(trimmed) || isEnumeratedListLine(trimmed)) return true
  if (PATH_LIKE_RE.test(trimmed)) return false
  if (/^[<{]/.test(trimmed)) return false
  if (/[.;!?]$/.test(trimmed)) return true
  return /\b(and|the|with|for|you|your|review|apply|approval|since|want)\b/i.test(trimmed)
}

function isPathLikeLabel(line = '') {
  const raw = String(line ?? '')
  const trimmed = raw.trim()
  const candidateWithoutLocation = trimmed.replace(/(?:#L\d+|:\d+)$/i, '')
  if (!trimmed) return false
  if (trimmed !== raw) return false
  if (isBulletLine(trimmed) || isEnumeratedListLine(trimmed) || isMarkdownHeading(trimmed)) return false
  if (trimmed.length > 260) return false
  if (/^(?:\+\+\+|---|@@)\b/.test(trimmed)) return false
  if (trimmed.includes('://')) return false
  if (/[:?*<>|]/.test(candidateWithoutLocation) && !/^[A-Za-z]:[\\/]/.test(candidateWithoutLocation)) return false
  if (/[{}()[\]]/.test(trimmed)) return false
  return PATH_LIKE_RE.test(trimmed)
}

function nextNonBlankIndex(lines, start) {
  for (let i = start; i < lines.length; i += 1) {
    if (!isBlank(lines[i])) return i
  }
  return -1
}

function hasPatchLookahead(lines, startIndex, maxNonBlank = 3) {
  let seen = 0
  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i]
    if (isBlank(line)) continue
    seen += 1
    if (isStrongPatchMarker(line) || isDiffHeaderLine(line)) return true
    if (seen >= maxNonBlank) return false
  }
  return false
}

function isFileLabelCandidate(lines, index) {
  const line = lines[index]
  return isPathLikeLabel(line) && hasPatchLookahead(lines, index + 1, 3)
}

function guessCodeLanguage(text = '', preferred = '') {
  const pref = String(preferred || '').trim().toLowerCase()
  if (pref) {
    if (pref === 'javascript') return 'js'
    if (pref === 'typescript') return 'ts'
    if (pref === 'shell') return 'bash'
    return pref
  }
  const sample = String(text ?? '')
  if (/<(?:!doctype|html|head|body|div|script|style)\b/i.test(sample)) return 'html'
  if (/(^|\n)\s*[.#:@][\w-][^{]*\{\s*$/m.test(sample) || /:\s*[^;]+;/.test(sample)) return 'css'
  if (/\b(?:const|let|var|function|return|document\.|window\.)\b/.test(sample)) return 'js'
  return 'text'
}

function isMarkdownFenceLanguage(language = '') {
  const value = String(language || '').trim().toLowerCase()
  return value === 'markdown' || value === 'md' || value === 'mdx' || value === 'gfm'
}

function trimSegmentText(text = '') {
  return String(text ?? '').replace(/\n{3,}/g, '\n\n')
}

function createSegmentFactory() {
  let n = 0
  return (type, payload = {}) => {
    n += 1
    return { type, id: `seg_${n}`, ...payload }
  }
}

function appendTailSegment(segments, makeSegment, tailText, tailStrategy) {
  const tail = String(tailText ?? '')
  if (!tail) return
  if (tailStrategy === 'prose') {
    segments.push(makeSegment('prose_markdown', { text: tail }))
    return
  }
  segments.push(makeSegment('raw_fallback', { text: tail, reason: 'streaming_partial_tail' }))
}

function matchFenceLine(line = '') {
  return String(line ?? '').match(FENCE_LINE_RE)
}

function getOpenFenceMarkerAtEnd(text = '') {
  const lines = String(text ?? '').split('\n')
  let openFenceMarker = ''
  for (const line of lines) {
    const match = matchFenceLine(line)
    if (!match) continue
    const marker = String(match[1] || '')
    if (!openFenceMarker) {
      openFenceMarker = marker
      continue
    }
    if (marker.length >= openFenceMarker.length) {
      openFenceMarker = ''
    }
  }
  return openFenceMarker
}

function splitForStreaming(text, options) {
  if (options.mode !== 'streaming' || !options.parseStablePrefixOnly) {
    return { stableText: text, tailText: '', truncatedTail: false }
  }
  if (getOpenFenceMarkerAtEnd(text)) {
    return { stableText: text, tailText: '', truncatedTail: false }
  }
  const idx = text.lastIndexOf('\n')
  if (idx < 0) {
    return { stableText: '', tailText: text, truncatedTail: text.length > 0 }
  }
  const stableText = text.slice(0, idx + 1)
  const tailText = text.slice(idx + 1)
  const stableOpenFenceMarker = getOpenFenceMarkerAtEnd(stableText)
  const tailFenceMatch = matchFenceLine(tailText)
  if (
    stableOpenFenceMarker
    && tailFenceMatch
    && String(tailFenceMatch[1] || '').length >= stableOpenFenceMarker.length
  ) {
    return { stableText: text, tailText: '', truncatedTail: false }
  }
  return { stableText, tailText, truncatedTail: tailText.length > 0 }
}

function tokenizeByFences(text, options = {}) {
  const lines = String(text ?? '').split('\n')
  const tokens = []
  const pushText = (chunkLines) => {
    if (!chunkLines.length) return
    tokens.push({ kind: 'text', text: chunkLines.join('\n') })
  }

  let buffer = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const startMatch = matchFenceLine(line)
    if (!startMatch) {
      buffer.push(line)
      i += 1
      continue
    }

    pushText(buffer)
    buffer = []
    const lang = String(startMatch[2] || '').trim()
    const fenceMarker = String(startMatch[1] || '```')
    const startLine = i
    i += 1
    const body = []
    let closed = false
    while (i < lines.length) {
      const endMatch = matchFenceLine(lines[i])
      if (endMatch && String(endMatch[1] || '').length >= fenceMarker.length) {
        closed = true
        break
      }
      body.push(lines[i])
      i += 1
    }
    if (!closed) {
      if (options.mode === 'streaming') {
        tokens.push({
          kind: 'fence',
          language: guessCodeLanguage(body.join('\n'), lang),
          raw: lines.slice(startLine).join('\n'),
          text: body.join('\n'),
          incomplete: true,
        })
        return tokens
      }
      tokens.push({
        kind: 'raw_fallback',
        text: lines.slice(startLine).join('\n'),
        reason: 'malformed_fence',
      })
      return tokens
    }
    const endLine = i
    const raw = lines.slice(startLine, endLine + 1).join('\n')
    tokens.push({
      kind: 'fence',
      language: guessCodeLanguage(body.join('\n'), lang),
      raw,
      text: body.join('\n'),
      incomplete: false,
    })
    i += 1
  }

  pushText(buffer)
  return tokens
}

function codeishInfo(line = '') {
  const raw = String(line ?? '')
  const trimmed = raw.trim()
  if (!trimmed) return { blank: true, codeish: false, strong: false, html: false, css: false, js: false }
  if (isStrongPatchMarker(trimmed) || raw.startsWith('+') || raw.startsWith('-')) {
    return { blank: false, codeish: false, strong: false, html: false, css: false, js: false }
  }
  if (isBulletLine(trimmed) || isEnumeratedListLine(trimmed)) {
    return { blank: false, codeish: false, strong: false, html: false, css: false, js: false }
  }
  const html = /<\/?[a-zA-Z][^>]*>/.test(trimmed)
  const css = /^\s*[@.#:][\w:-][^{]*\{\s*$/.test(raw)
    || /^\s*[a-zA-Z][\w-]*(?:\s*(?:[>+~,:.#="'-]|\[|\])[^{]*)?\{\s*$/.test(raw)
    || /:\s*[^;]+;/.test(trimmed)
  const js = (
    /\b(?:const|let|var|function|return|if|else|for|while|document\.|window\.|localStorage\b)\b/.test(trimmed)
    && /[;{}()]/.test(trimmed)
  ) || /^[{}()[\]]+\s*;?$/.test(trimmed)
  const comment = /^(\/\/|\/\*|\*\/|\*)/.test(trimmed)
  const call = /^[A-Za-z_$][\w$.]*\s*\([^)]*\)\s*;?$/.test(trimmed)
    || /^[A-Za-z_$][\w$.]*\s*\([^)]*\)\s*\{?$/.test(trimmed)
  const strong = html || css || js
  return {
    blank: false,
    codeish: strong || comment || call,
    strong,
    html,
    css,
    js: js || call,
  }
}

function detectStandaloneCodeRuns(lines = []) {
  const runs = []
  let start = -1
  let end = -1
  let codeCount = 0
  let strongCount = 0
  let htmlCount = 0
  let cssCount = 0
  let jsCount = 0
  let blankInside = 0

  const flush = () => {
    if (start < 0 || end < start) return
    const nonBlankSpan = (end - start + 1) - blankInside
    const density = nonBlankSpan > 0 ? (codeCount / nonBlankSpan) : 0
    if (codeCount >= 4 && strongCount >= 2 && density >= 0.65) {
      runs.push({ start, end, codeCount, htmlCount, cssCount, jsCount })
    }
    start = -1
    end = -1
    codeCount = 0
    strongCount = 0
    htmlCount = 0
    cssCount = 0
    jsCount = 0
    blankInside = 0
  }

  for (let i = 0; i < lines.length; i += 1) {
    const info = codeishInfo(lines[i])
    if (info.codeish) {
      if (start < 0) start = i
      end = i
      codeCount += 1
      if (info.strong) strongCount += 1
      if (info.html) htmlCount += 1
      if (info.css) cssCount += 1
      if (info.js) jsCount += 1
      continue
    }
    if (start >= 0 && info.blank) {
      end = i
      blankInside += 1
      continue
    }
    flush()
  }
  flush()
  return runs
}

function splitStandaloneCodeFromProse(text, makeSegment) {
  const source = String(text ?? '')
  if (!source.trim()) return []
  const lines = source.split('\n')
  const runs = detectStandaloneCodeRuns(lines)
  if (runs.length === 0) return [makeSegment('prose_markdown', { text: source })]

  const out = []
  let cursor = 0
  for (const run of runs) {
    if (run.start > cursor) {
      const proseChunk = lines.slice(cursor, run.start).join('\n')
      if (proseChunk.trim() || /\n/.test(proseChunk)) {
        out.push(makeSegment('prose_markdown', { text: proseChunk }))
      }
    }
    const codeText = lines.slice(run.start, run.end + 1).join('\n')
    const language = run.htmlCount > 0 ? 'html' : run.cssCount > run.jsCount ? 'css' : run.jsCount > 0 ? 'js' : 'text'
    out.push(makeSegment('code_block', {
      text: codeText,
      language,
      confidence: 'medium',
      lineCount: codeText.split('\n').length,
    }))
    cursor = run.end + 1
  }
  if (cursor < lines.length) {
    const proseTail = lines.slice(cursor).join('\n')
    if (proseTail.trim() || /\n/.test(proseTail)) {
      out.push(makeSegment('prose_markdown', { text: proseTail }))
    }
  }
  return out
}

function isPotentialPatchContextLine(line = '') {
  const raw = String(line ?? '')
  const trimmed = raw.trim()
  if (!trimmed) return true
  if (isStrongPatchMarker(trimmed) || isDiffHeaderLine(trimmed) || isDiffPrefixedLine(raw)) return true
  if (/^(\/\/|\/\*|\*\/|\*|#)/.test(trimmed)) return true
  if (/^[{}()[\]]+\s*;?$/.test(trimmed)) return true
  if (/^[A-Za-z_$][\w$.]*\s*\([^)]*\)\s*\{?$/.test(trimmed)) return true
  if (/^\s*[@.#:][\w:-][^{]*\{\s*$/.test(raw)) return true
  if (/^\s*[A-Za-z][\w-]*\s*:/.test(raw)) return true
  if (/[;{}]$/.test(trimmed)) return true
  if (/<\/?[a-zA-Z][^>]*>/.test(trimmed)) return true
  return false
}

function consumePatchBlock(lines, startIndex, filePathHint = '') {
  const patchLines = []
  let i = startIndex
  let seenStrong = false
  let seenHunk = false
  let hunkCount = 0
  let plusMinusLines = 0
  let hadAny = false

  while (i < lines.length) {
    const line = lines[i]

    if (isStrongPatchMarker(line)) {
      patchLines.push(line)
      hadAny = true
      seenStrong = true
      if (isHunkMarker(line)) {
        seenHunk = true
        hunkCount += 1
      }
      i += 1
      continue
    }

    if (hadAny && isFileLabelCandidate(lines, i)) {
      break
    }

    if (isDiffHeaderLine(line)) {
      patchLines.push(line)
      hadAny = true
      i += 1
      continue
    }

    if (isDiffPrefixedLine(line)) {
      patchLines.push(line)
      hadAny = true
      if (line[0] === '+' || line[0] === '-') plusMinusLines += 1
      i += 1
      continue
    }

    if (isNoNewlineMarker(line)) {
      patchLines.push(line)
      hadAny = true
      i += 1
      continue
    }

    if (isBlank(line)) {
      if (!hadAny) break
      patchLines.push(line)
      i += 1
      continue
    }

    if ((seenStrong || seenHunk) && isPotentialPatchContextLine(line)) {
      patchLines.push(line)
      hadAny = true
      i += 1
      continue
    }

    if (hadAny && isLikelyProseSentence(line)) {
      break
    }

    if (!hadAny) break
    // Unknown nonblank line after patch content: keep a high-confidence patch contiguous
    // if we have hunk context already, otherwise stop to avoid swallowing prose.
    if (seenHunk) {
      patchLines.push(line)
      i += 1
      continue
    }
    break
  }

  const text = patchLines.join('\n')
  const lineCount = patchLines.length
  const confidence = seenStrong && hunkCount > 0 ? 'high' : (seenStrong || plusMinusLines >= 3 ? 'medium' : 'low')
  return {
    endIndexExclusive: i,
    text,
    lineCount,
    hunkCount,
    confidence,
    filePathHint,
    consumed: patchLines.length > 0,
  }
}

function pushProseBuffer(bufferLines, segments, makeSegment, options) {
  if (!bufferLines.length) return
  const text = trimSegmentText(bufferLines.join('\n'))
  bufferLines.length = 0
  if (!text.trim()) return
  if (!options.extractStandaloneCode) {
    segments.push(makeSegment('prose_markdown', { text }))
    return
  }
  const split = splitStandaloneCodeFromProse(text, makeSegment)
  for (const seg of split) {
    if (seg.type === 'prose_markdown' && !String(seg.text ?? '').trim()) continue
    segments.push(seg)
  }
}

function parseUnfencedRegion(text, makeSegment, options, meta) {
  const source = String(text ?? '')
  if (!source) return []
  const lines = source.split('\n')
  const segments = []
  const proseBuffer = []
  let i = 0

  while (i < lines.length) {
    if (isFileLabelCandidate(lines, i)) {
      pushProseBuffer(proseBuffer, segments, makeSegment, options)
      const filePath = String(lines[i] ?? '').trim()
      segments.push(makeSegment('file_label', { filePath, rawLabel: lines[i] }))
      i += 1
      const firstPatchLine = nextNonBlankIndex(lines, i)
      if (firstPatchLine >= 0 && isStrongPatchMarker(lines[firstPatchLine])) {
        // Preserve blank lines between label and patch inside patch block.
        const patch = consumePatchBlock(lines, i, filePath)
        if (patch.consumed) {
          segments.push(makeSegment('diff_block', {
            text: patch.text,
            language: 'diff',
            filePathHint: filePath,
            confidence: patch.confidence,
            lineCount: patch.lineCount,
            hunkCount: patch.hunkCount,
          }))
          i = patch.endIndexExclusive
          continue
        }
      }
      // If patch confirmation failed unexpectedly, downgrade label back into prose.
      const labelSeg = segments.pop()
      proseBuffer.push(labelSeg.rawLabel)
      continue
    }

    if (isStrongPatchMarker(lines[i])) {
      pushProseBuffer(proseBuffer, segments, makeSegment, options)
      const patch = consumePatchBlock(lines, i)
      if (patch.consumed) {
        segments.push(makeSegment('diff_block', {
          text: patch.text,
          language: 'diff',
          filePathHint: patch.filePathHint || '',
          confidence: patch.confidence,
          lineCount: patch.lineCount,
          hunkCount: patch.hunkCount,
        }))
        i = patch.endIndexExclusive
        continue
      }
    }

    proseBuffer.push(lines[i])
    i += 1
  }

  pushProseBuffer(proseBuffer, segments, makeSegment, options)

  if (segments.some((s) => s.type === 'raw_fallback')) {
    meta.confidence = 'low'
  }

  return segments
}

function mergeAdjacentSegments(segments) {
  const out = []
  for (const seg of segments) {
    if (!seg || typeof seg !== 'object') continue
    const text = typeof seg.text === 'string' ? seg.text : null
    if (text != null && text.length === 0 && seg.type !== 'raw_fallback') continue

    const prev = out[out.length - 1]
    if (prev && prev.type === 'prose_markdown' && seg.type === 'prose_markdown') {
      prev.text = trimSegmentText(`${prev.text}\n${seg.text}`)
      continue
    }
    out.push({ ...seg })
  }
  return out.filter((seg) => {
    if (seg.type === 'prose_markdown') return String(seg.text ?? '').trim().length > 0
    if (seg.type === 'diff_block' || seg.type === 'code_block' || seg.type === 'raw_fallback') return String(seg.text ?? '').length > 0
    if (seg.type === 'file_label') return String(seg.filePath ?? '').trim().length > 0
    return true
  })
}

function summarizeConfidence(segments) {
  if (!segments.length) return 'high'
  if (segments.some((s) => s.type === 'raw_fallback')) return 'low'
  if (segments.some((s) => s.type === 'diff_block' && s.confidence === 'low')) return 'medium'
  return 'high'
}

export function parseChatRenderSegments(rawText, options = {}) {
  const opts = normalizeOptions(options)
  const makeSegment = createSegmentFactory()
  const meta = {
    mode: opts.mode,
    confidence: 'high',
    fastPath: false,
    truncatedTail: false,
    hasIncompleteFence: false,
    segmentCount: 0,
    reasons: [],
  }

  const normalized = normalizeNewlines(rawText)
  if (!normalized.trim()) {
    return { segments: [], meta: { ...meta, fastPath: true } }
  }

  if (normalized.length > opts.maxChars) {
    meta.confidence = 'low'
    meta.reasons.push('max_chars_exceeded')
    const truncated = `${normalized.slice(0, opts.maxChars)}\n...[truncated for renderer safety]`
    const segments = [makeSegment('raw_fallback', { text: truncated, reason: 'max_chars_exceeded' })]
    meta.segmentCount = segments.length
    return { segments, meta }
  }

  const totalLines = normalized.split('\n').length
  if (totalLines > opts.maxLines) {
    meta.confidence = 'low'
    meta.reasons.push('max_lines_exceeded')
    const trimmed = normalized.split('\n').slice(0, opts.maxLines).join('\n')
    const segments = [makeSegment('raw_fallback', { text: `${trimmed}\n...[truncated for renderer safety]`, reason: 'max_lines_exceeded' })]
    meta.segmentCount = segments.length
    return { segments, meta }
  }

  const { stableText, tailText, truncatedTail } = splitForStreaming(normalized, opts)
  meta.truncatedTail = truncatedTail
  if (truncatedTail) meta.reasons.push('streaming_partial_tail')

  const parseTarget = stableText
  if (!parseTarget) {
    const segments = []
    appendTailSegment(segments, makeSegment, tailText, opts.tailStrategy)
    meta.confidence = segments.some((s) => s.type === 'raw_fallback') ? 'low' : 'high'
    meta.segmentCount = segments.length
    return { segments, meta }
  }

  if (!PATCH_INDICATOR_RE.test(parseTarget) && !(opts.extractStandaloneCode && CODE_HINT_RE.test(parseTarget))) {
    meta.fastPath = true
    const segments = [makeSegment('prose_markdown', { text: parseTarget })]
    appendTailSegment(segments, makeSegment, tailText, opts.tailStrategy)
    meta.confidence = segments.some((s) => s.type === 'raw_fallback') ? 'low' : 'high'
    meta.segmentCount = segments.length
    return { segments, meta }
  }

  const tokens = tokenizeByFences(parseTarget, opts)
  const segments = []
  for (const token of tokens) {
    if (token.kind === 'text') {
      const parsed = parseUnfencedRegion(token.text, makeSegment, opts, meta)
      segments.push(...parsed)
      continue
    }
    if (token.kind === 'fence') {
      if (token.incomplete === true) {
        meta.hasIncompleteFence = true
        meta.reasons.push('streaming_incomplete_fence')
      }
      if (isMarkdownFenceLanguage(token.language)) {
        segments.push(makeSegment('prose_markdown', {
          text: token.text,
        }))
        continue
      }
      segments.push(makeSegment('code_block', {
        text: token.text,
        language: token.language || 'text',
        confidence: 'high',
        incomplete: token.incomplete === true,
        lineCount: token.text ? token.text.split('\n').length : 0,
      }))
      continue
    }
    if (token.kind === 'raw_fallback') {
      meta.reasons.push(token.reason || 'raw_fallback')
      segments.push(makeSegment('raw_fallback', { text: token.text, reason: token.reason || 'raw_fallback' }))
    }
  }

  appendTailSegment(segments, makeSegment, tailText, opts.tailStrategy)

  const merged = mergeAdjacentSegments(segments)
  meta.hasIncompleteFence = meta.hasIncompleteFence || merged.some((segment) => segment?.type === 'code_block' && segment?.incomplete === true)
  meta.confidence = summarizeConfidence(merged)
  meta.segmentCount = merged.length
  return { segments: merged, meta }
}

export function groupPatchSegments(segments = []) {
  const source = Array.isArray(segments) ? segments : []
  const grouped = []
  let i = 0
  let n = 0

  while (i < source.length) {
    const seg = source[i]
    if (!seg || typeof seg !== 'object') {
      i += 1
      continue
    }

    if (seg.type === 'file_label') {
      const diffs = []
      let j = i + 1
      while (j < source.length && source[j]?.type === 'diff_block') {
        diffs.push(source[j])
        j += 1
      }
      if (diffs.length > 0) {
        n += 1
        grouped.push({
          type: 'patch_file_group',
          id: `patch_group_${n}`,
          filePath: String(seg.filePath || seg.rawLabel || '').trim(),
          labelSegment: seg,
          diffSegments: diffs,
        })
        i = j
        continue
      }
    }

    grouped.push(seg)
    i += 1
  }

  return grouped
}
