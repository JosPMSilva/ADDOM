const MAX_OUTPUT_CHARS = 4_000
const MAX_OUTPUT_LINES = 80

function normalizeText(value = '') {
  return String(value || '').trim()
}

function isPlaceholderStatusText(value = '') {
  const text = normalizeText(value)
  if (!text) return true
  if (/^collecting provider tool input/i.test(text)) return true
  if (/^running tool$/i.test(text)) return true
  return false
}

function truncateText(value = '', maxChars = MAX_OUTPUT_CHARS) {
  const text = String(value || '')
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars).trimEnd()}\n…`
}

function truncateLines(value = '', maxLines = MAX_OUTPUT_LINES) {
  const text = String(value || '')
  const lines = text.split('\n')
  if (lines.length <= maxLines) return truncateText(text)
  const kept = lines.slice(0, maxLines).join('\n')
  const hidden = lines.length - maxLines
  return `${truncateText(kept)}\n… ${hidden} more line${hidden === 1 ? '' : 's'}`
}

function pushSection(sections, { key, label, value, mono = true } = {}) {
  const text = normalizeText(value)
  if (!text || isPlaceholderStatusText(text)) return
  sections.push({
    key,
    label,
    value: mono ? truncateLines(text) : truncateText(text),
    mono,
  })
}

export function buildExecutionEvidenceSections({
  toolKind = 'tool',
  evidence = {},
} = {}) {
  const kind = String(toolKind || 'tool').trim().toLowerCase()
  const sections = []
  const input = normalizeText(evidence?.input)
  const result = normalizeText(evidence?.result)
  const outputs = Array.isArray(evidence?.outputs) ? evidence.outputs : []

  if (kind === 'command') {
    pushSection(sections, { key: 'command', label: 'Command', value: input })
  } else if (kind.startsWith('file_')) {
    pushSection(sections, { key: 'path', label: 'Path', value: input })
  } else if (kind === 'search') {
    pushSection(sections, { key: 'query', label: 'Query', value: input })
  } else if (kind === 'web') {
    pushSection(sections, { key: 'url', label: 'URL', value: input })
  } else if (input) {
    pushSection(sections, { key: 'input', label: 'Input', value: input })
  }

  for (const [index, output] of outputs.entries()) {
    const stream = normalizeText(output?.stream || 'stdout').toLowerCase()
    const label = stream === 'stderr' ? 'Stderr' : (stream === 'stdout' ? 'Output' : `Output (${stream})`)
    pushSection(sections, {
      key: `output:${output?.eventId || index}`,
      label,
      value: output?.detail,
    })
  }

  if (result && result !== input) {
    pushSection(sections, { key: 'result', label: 'Result', value: result })
  }

  const startedAt = Number(evidence?.startedAt || 0) || 0
  const completedAt = Number(evidence?.completedAt || 0) || 0
  const hasPrimaryEvidence = sections.length > 0
  // Duration alone is not enough to make a row expandable.
  if (hasPrimaryEvidence && startedAt > 0 && completedAt > startedAt) {
    const durationMs = completedAt - startedAt
    const durationLabel = durationMs >= 1000
      ? `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 0 : 1)}s`
      : `${durationMs}ms`
    pushSection(sections, {
      key: 'duration',
      label: 'Duration',
      value: durationLabel,
      mono: false,
    })
  }

  return sections
}

export function hasUsefulExecutionEvidence(sections = []) {
  if (!Array.isArray(sections) || sections.length === 0) return false
  return sections.some((section) => {
    const key = String(section?.key || '').trim().toLowerCase()
    if (key === 'duration') return false
    return Boolean(normalizeText(section?.value))
  })
}
