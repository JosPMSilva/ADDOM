const DEFAULT_MAX_CONSECUTIVE_IDENTICAL_TOOL_ROUNDS = 3

function normalizePathLike(value) {
  const normalized = String(value || '').trim().replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase()
  if (!normalized || normalized === '/') return normalized
  return normalized.replace(/\/+$/g, '')
}

function normalizeCompactText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function normalizePositiveInt(value, fallback = 0) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return Math.max(0, Math.round(Number(fallback || 0) || 0))
  return Math.max(0, Math.round(numeric))
}

function normalizeViewRangeFamily(input = {}) {
  const startLine = Math.max(1, normalizePositiveInt(input.start_line ?? input.startLine, 1))
  const endLine = Math.max(startLine, normalizePositiveInt(input.end_line ?? input.endLine, startLine))
  const span = Math.max(1, endLine - startLine + 1)
  const bucketSize = Math.max(50, Math.min(500, span))
  const midpoint = Math.floor((startLine + endLine) / 2)
  const midpointBucket = Math.floor(Math.max(0, midpoint - 1) / bucketSize)
  const spanBucket = Math.max(1, Math.round(span / 100) || 1)
  return {
    midpointBucket,
    spanBucket,
  }
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, item]) => [String(key || '').trim(), item])
      .filter(([key]) => key)
      .sort((a, b) => a[0].localeCompare(b[0]))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

export function buildRepeatedToolCallBatchSignature(toolCalls = []) {
  const rows = Array.isArray(toolCalls) ? toolCalls : []
  return stableSerialize(rows.map((row) => {
    const source = row && typeof row === 'object' ? row : {}
    const input = source.input ?? source.args ?? {}
    return {
      toolName: String(source.name || source.toolName || '').trim().toLowerCase(),
      input,
    }
  }))
}

export function buildExplorationToolCallBatchSignature(toolCalls = []) {
  const rows = Array.isArray(toolCalls) ? toolCalls : []
  const normalized = rows.map((row) => {
    const source = row && typeof row === 'object' ? row : {}
    const input = source.input ?? source.args ?? {}
    const toolName = String(source.name || source.toolName || '').trim().toLowerCase()
    if (toolName === 'read_file') {
      return {
        toolName,
        path: normalizePathLike(input.path),
      }
    }
    if (toolName === 'view_file_range') {
      return {
        toolName,
        path: normalizePathLike(input.path),
        ...normalizeViewRangeFamily(input),
      }
    }
    if (toolName === 'search_code') {
      const fileExtensions = Array.isArray(input.file_extensions ?? input.fileExtensions)
        ? (input.file_extensions ?? input.fileExtensions)
          .map((item) => normalizeCompactText(item))
          .filter(Boolean)
          .sort()
        : []
      return {
        toolName,
        path: normalizePathLike(input.path || '.'),
        query: normalizeCompactText(input.query),
        fileExtensions,
      }
    }
    if (toolName === 'grep_file') {
      return {
        toolName,
        path: normalizePathLike(input.path),
        pattern: normalizeCompactText(input.pattern),
      }
    }
    return null
  }).filter(Boolean)
  return stableSerialize(normalized)
}

export function recordRepeatedToolCallBatch({
  state = null,
  toolCalls = [],
  maxConsecutiveIdenticalRounds = DEFAULT_MAX_CONSECUTIVE_IDENTICAL_TOOL_ROUNDS,
  signatureBuilder = buildRepeatedToolCallBatchSignature,
} = {}) {
  const target = state && typeof state === 'object' ? state : {}
  const signature = typeof signatureBuilder === 'function'
    ? signatureBuilder(toolCalls)
    : buildRepeatedToolCallBatchSignature(toolCalls)
  const threshold = Math.max(2, Number(maxConsecutiveIdenticalRounds || 0) || DEFAULT_MAX_CONSECUTIVE_IDENTICAL_TOOL_ROUNDS)

  if (!signature || signature === '[]') {
    target.lastSignature = ''
    target.repeatedCount = 0
    return {
      signature: '',
      repeatedCount: 0,
      blocked: false,
      threshold,
    }
  }

  if (target.lastSignature === signature) {
    target.repeatedCount = (Number(target.repeatedCount || 0) || 0) + 1
  } else {
    target.lastSignature = signature
    target.repeatedCount = 1
  }

  return {
    signature,
    repeatedCount: Number(target.repeatedCount || 0) || 0,
    blocked: (Number(target.repeatedCount || 0) || 0) >= threshold,
    threshold,
  }
}
