function hasFencedCode(text = '') {
  return /```/.test(String(text || ''))
}

function startsWithBullet(line = '') {
  return /^\s*[-*]\s+/.test(String(line || ''))
}

function classifyLine(line = '') {
  const raw = String(line || '')
  const trimmed = raw.trim()
  if (!trimmed) return { blank: true, codeish: false, strongDiff: false }

  const strongDiff = /^(diff --git|@@\s|@@$|---\s+\S|\+\+\+\s+\S)/.test(trimmed)
  const htmlTag = /<\/?[a-zA-Z][^>]*>/.test(trimmed)
  const cssSelector = /^\s*[@.#:][\w:-][^{]*\{\s*$/.test(raw)
    || /^\s*[a-zA-Z][\w-]*(?:\s*(?:[>+~,:.#="'-]|\[|\])[^{]*)?\{\s*$/.test(raw)
  const cssRule = cssSelector || /:\s*[^;]+;/.test(trimmed)
  const cssVarLine = /^\s*--[\w-]+\s*:\s*[^;]+;?$/.test(raw)
  const jsLike = (
    /\b(?:const|let|var|if|else|for|while|function|return|document\.|window\.)\b/.test(trimmed)
    && /[;{}()]/.test(trimmed)
  ) || /^[{}]+;?$/.test(trimmed) || /^[)}\]]+\s*[;,]?$/.test(trimmed)
  const callLike = /^[A-Za-z_$][\w$.]*\s*\([^)]*\)\s*;?$/.test(trimmed)
    || /^[A-Za-z_$][\w$.]*\s*\([^)]*\)\s*\{?$/.test(trimmed)
    || /^[A-Za-z_$][\w$.]*\.[A-Za-z_$][\w$]*\s*\(.*\)\s*;?$/.test(trimmed)
    || /^[A-Za-z_$][\w$.]*\.[A-Za-z_$][\w$]*\s*\(.*\)\s*\{?$/.test(trimmed)
  const commentLike = /^(\/\/|\/\*|\*\/|\*)/.test(trimmed)
  const diffOpLine = /^[+-]\s*(?:<|\.|#|@|\/\*|\/\/|const\b|let\b|var\b|if\b|else\b|\}|{|[a-zA-Z0-9_-]+\s*[:{])/.test(trimmed)
  const diffContextCodeLine = /^\s+[.#@]|^\s+[a-zA-Z_-][\w-]*\s*\{|^\s+[a-zA-Z_-][\w-]*\s*:/.test(raw)

  // Plain markdown bullets should not be treated as code unless they carry code-like tokens.
  const plainBullet = startsWithBullet(trimmed)
    && !diffOpLine
    && !htmlTag
    && !cssRule
    && !jsLike
    && !commentLike
    && !strongDiff

  const codeish = !plainBullet && (
    strongDiff || diffOpLine || diffContextCodeLine || htmlTag || cssRule || cssVarLine || jsLike || callLike || commentLike
  )
  return {
    blank: false,
    codeish,
    strongDiff,
    htmlTag,
    cssRule: cssRule || cssVarLine || diffContextCodeLine,
    jsLike: jsLike || callLike,
    diffOpLine,
  }
}

function detectRuns(lines = []) {
  const runs = []
  let start = -1
  let end = -1
  let codeCount = 0
  let strongDiffCount = 0
  let htmlCount = 0
  let cssCount = 0
  let jsCount = 0
  let plusMinusCount = 0
  let blankInside = 0

  const flush = () => {
    if (start < 0 || end < start) return
    const nonBlankSpan = (end - start + 1) - blankInside
    const strongSignal = strongDiffCount > 0 || plusMinusCount >= 2
    const enoughCode = (
      codeCount >= 4
      || (codeCount >= 3 && strongSignal)
      || (codeCount >= 3 && (cssCount >= 1 || jsCount >= 1))
    )
    const denseEnough = nonBlankSpan > 0 ? (codeCount / nonBlankSpan) >= 0.6 : false
    const shortDense = nonBlankSpan > 0 && nonBlankSpan <= 6 && codeCount >= 3 && (codeCount / nonBlankSpan) >= 0.5
    if (enoughCode && (denseEnough || shortDense)) {
      runs.push({
        start,
        end,
        codeCount,
        strongDiffCount,
        htmlCount,
        cssCount,
        jsCount,
        plusMinusCount,
      })
    }
    start = -1
    end = -1
    codeCount = 0
    strongDiffCount = 0
    htmlCount = 0
    cssCount = 0
    jsCount = 0
    plusMinusCount = 0
    blankInside = 0
  }

  for (let i = 0; i < lines.length; i += 1) {
    const info = classifyLine(lines[i])
    if (info.codeish) {
      if (start < 0) start = i
      end = i
      codeCount += 1
      if (info.strongDiff) strongDiffCount += 1
      if (info.htmlTag) htmlCount += 1
      if (info.cssRule) cssCount += 1
      if (info.jsLike) jsCount += 1
      if (info.diffOpLine) plusMinusCount += 1
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

function pickLanguage(run, lines) {
  if ((run?.strongDiffCount || 0) > 0 || (run?.plusMinusCount || 0) >= 4) return 'diff'
  const sample = lines.slice(run.start, run.end + 1).join('\n')
  if (/<(?:!doctype|html|head|body|div|script|style)\b/i.test(sample)) return 'html'
  if ((run?.cssCount || 0) > (run?.jsCount || 0)) return 'css'
  if ((run?.jsCount || 0) > 0) return 'js'
  return 'text'
}

export function autoFenceMarkdownCodeArtifacts(text = '') {
  const source = String(text ?? '')
  if (!source.trim()) return source
  if (hasFencedCode(source)) return source

  const lines = source.split('\n')
  const runs = detectRuns(lines)
  if (runs.length === 0) return source

  const runStarts = new Map(runs.map((run) => [run.start, run]))
  const runEnds = new Set(runs.map((run) => run.end))
  const out = []

  for (let i = 0; i < lines.length; i += 1) {
    const run = runStarts.get(i)
    if (run) {
      out.push(`\`\`\`${pickLanguage(run, lines)}`)
    }
    out.push(lines[i])
    if (runEnds.has(i)) {
      out.push('```')
    }
  }

  return out.join('\n')
}
