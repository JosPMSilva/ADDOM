function normalizeIdentity(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function asObject(value = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value
}

function tryParseJsonObject(value = '') {
  const text = String(value || '').trim()
  if (!text || (text[0] !== '{' && text[0] !== '[')) return null
  try {
    const parsed = JSON.parse(text)
    return asObject(parsed)
  } catch {
    return null
  }
}

function unescapeJsonString(value = '') {
  return String(value || '')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\(["\\/bfnrt])/g, (_, ch) => {
      if (ch === 'b') return '\b'
      if (ch === 'f') return '\f'
      if (ch === 'n') return '\n'
      if (ch === 'r') return '\r'
      if (ch === 't') return '\t'
      return ch
    })
}

/**
 * Cursor tool detail is often truncated mid-JSON (large diffs). Recover identity
 * fields with a regex scrape when JSON.parse fails.
 */
function scrapeIdentityFromTruncatedJson(detail = '', toolKind = '') {
  const text = String(detail || '')
  if (!text.includes('{')) return ''
  const kind = String(toolKind || '').trim().toLowerCase()
  const readField = (...keys) => {
    for (const key of keys) {
      const match = text.match(new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`))
      if (!match) continue
      const value = normalizeIdentity(unescapeJsonString(match[1]))
      if (value) return value
    }
    return ''
  }
  const pathLike = readField('path', 'filePath', 'file_path', 'targetFile', 'target_file', 'relativePath', 'relative_path')
  const searchLike = readField('pattern', 'query', 'url', 'glob', 'globPattern')
  const commandLike = readField('command', 'script')
  if (kind === 'search' || kind === 'web') {
    if (searchLike) return searchLike
    if (pathLike) {
      const base = pathLike.replace(/\\/g, '/').split('/').filter(Boolean).pop()
      return base || pathLike
    }
    return commandLike
  }
  if (kind === 'command') return commandLike || pathLike || searchLike
  if (kind.startsWith('file_')) return pathLike || searchLike || commandLike
  return pathLike || commandLike || searchLike
}

function readIdentityCandidate(source = null, toolKind = '') {
  const row = asObject(source)
  if (!row) return ''
  const kind = String(toolKind || '').trim().toLowerCase()
  const pathLike = normalizeIdentity(
    row.path
    || row.filePath
    || row.file_path
    || row.targetFile
    || row.target_file
    || row.relativePath
    || row.relative_path
    || '',
  )
  const searchLike = normalizeIdentity(
    row.pattern
    || row.query
    || row.url
    || row.glob
    || row.globPattern
    || '',
  )
  const commandLike = normalizeIdentity(row.command || row.script || '')

  if (kind === 'search' || kind === 'web') {
    if (searchLike) return searchLike
    // Empty-pattern listing/search: prefer folder basename over absolute path.
    if (pathLike) {
      const base = pathLike.replace(/\\/g, '/').split('/').filter(Boolean).pop()
      return base || pathLike
    }
    return commandLike
  }
  if (kind === 'command') {
    return commandLike || pathLike || searchLike
  }
  if (kind.startsWith('file_')) {
    return pathLike || searchLike || commandLike
  }
  return pathLike || commandLike || searchLike
}

/**
 * Extract a short L2 identity (path/query/command) from Cursor/OpenAI-compatible
 * tool args or success payloads. Returns '' when nothing useful is present.
 */
export function extractToolIdentityDetail({
  toolInput = null,
  detail = '',
  output = null,
  toolKind = '',
} = {}) {
  const kind = String(toolKind || '').trim().toLowerCase()
  const input = asObject(toolInput)
  const inputArgs = asObject(input?.args) || input
  const fromInput = readIdentityCandidate(inputArgs, kind)
  if (fromInput) return fromInput

  const parsedDetail = tryParseJsonObject(detail)
  const detailSuccess = asObject(parsedDetail?.success) || parsedDetail
  const fromDetail = readIdentityCandidate(detailSuccess, kind)
    || readIdentityCandidate(asObject(parsedDetail?.args), kind)
  if (fromDetail) return fromDetail

  const outputObject = asObject(output) || tryParseJsonObject(output)
  const outputSuccess = asObject(outputObject?.success) || outputObject
  const fromOutput = readIdentityCandidate(outputSuccess, kind)
    || readIdentityCandidate(asObject(outputObject?.args), kind)
  if (fromOutput) return fromOutput

  const scraped = scrapeIdentityFromTruncatedJson(detail, kind)
    || scrapeIdentityFromTruncatedJson(
      typeof output === 'string' ? output : '',
      kind,
    )
  if (scraped) return scraped

  return ''
}

export function isPlaceholderToolInputDetail(detail = '') {
  const text = normalizeIdentity(detail)
  if (!text) return true
  if (/^collecting provider tool input/i.test(text)) return true
  if (/^running tool$/i.test(text)) return true
  if (/^provider tool (input|running|output):/i.test(text)) return true
  return false
}
