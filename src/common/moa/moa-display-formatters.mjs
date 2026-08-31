function normalizeText(value = '') {
  return String(value ?? '').trim()
}

const ACRONYM_WORDS = new Set(['ai', 'api', 'css', 'db', 'html', 'js', 'json', 'llm', 'qa', 'seo', 'sql', 'ts', 'ui', 'url', 'ux'])

function formatWord(word = '') {
  const normalized = normalizeText(word)
  if (!normalized) return ''
  if (ACRONYM_WORDS.has(normalized.toLowerCase())) return normalized.toUpperCase()
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase()
}

export function humanizeMoaToken(value = '', fallback = '') {
  const normalized = normalizeText(value)
  if (!normalized) return fallback
  return normalized
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map(formatWord)
    .join(' ')
}

function extractCompactIdSuffix(value = '') {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  const chunks = normalized.split(/[_-]+/).filter(Boolean)
  const suffix = normalizeText(chunks[chunks.length - 1] || '')
  return suffix || normalized
}

function looksLikeGeneratedRoleId(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized.startsWith('role_') && !normalized.startsWith('role-')) return false
  const suffix = normalized.slice(5)
  return /\d/.test(suffix) || /[a-f0-9]{6,}/i.test(suffix)
}

export function formatMoaRoleLabel({ role = '', roleId = '', fallback = 'Agent' } = {}) {
  const roleLabel = normalizeText(role)
  if (roleLabel && !looksLikeGeneratedRoleId(roleLabel)) return roleLabel

  const idLabel = normalizeText(roleId || role)
  if (!idLabel) return fallback

  if (looksLikeGeneratedRoleId(idLabel)) {
    const suffix = extractCompactIdSuffix(idLabel)
    const fallbackLabel = fallback || 'Agent'
    return suffix ? `${fallbackLabel} ${suffix}` : fallbackLabel
  }

  const withoutPrefix = idLabel.replace(/^role[_-]?/i, '')
  return humanizeMoaToken(withoutPrefix, fallback) || fallback
}

export function summarizeMoaRoleLabels(entries = [], { maxVisible = 3, fallback = '' } = {}) {
  const source = Array.isArray(entries) ? entries : []
  const labels = []
  const seen = new Set()

  for (const entry of source) {
    const label = typeof entry === 'string'
      ? formatMoaRoleLabel({ role: entry, roleId: entry, fallback: '' })
      : formatMoaRoleLabel({
          role: entry?.role,
          roleId: entry?.roleId,
          fallback: '',
        })
    if (!label) continue
    const dedupeKey = label.toLowerCase()
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    labels.push(label)
  }

  if (labels.length === 0) return fallback
  if (labels.length <= maxVisible) return labels.join(', ')
  return `${labels.slice(0, maxVisible).join(', ')} +${labels.length - maxVisible} more`
}

export function formatMoaDelegationLabel(value = '', fallback = '-') {
  const normalized = normalizeText(value)
  if (!normalized) return fallback
  const suffix = extractCompactIdSuffix(normalized)
  return suffix ? `#${suffix}` : fallback
}

export function formatMoaDispatchLabel(value = '', fallback = '-') {
  const normalized = normalizeText(value)
  if (!normalized) return fallback
  return `Run ${formatMoaDelegationLabel(normalized, fallback)}`
}

export function formatMoaInitiatorLabel(value = '', fallback = '-') {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) return fallback
  if (normalized === 'orchestrator') return 'Orchestrator'
  if (normalized === 'user_direct') return 'User'
  if (normalized === 'hybrid') return 'Hybrid'
  return humanizeMoaToken(normalized, fallback)
}

export function formatMoaRouteLabel(value = '', fallback = '-') {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) return fallback
  if (normalized === 'delegate_to_agents') return 'Delegation'
  if (normalized === 'direct_single') return 'Direct Single Agent'
  if (normalized === 'direct_fanout') return 'Direct Fanout'
  return humanizeMoaToken(normalized, fallback)
}

export function formatMoaEstimateConfidenceLabel(value = '', fallback = '-') {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) return fallback
  if (normalized === 'token_only') return 'Token-only estimate'
  if (normalized === 'token_plus_pricing') return 'Pricing-backed estimate'
  if (normalized === 'partial_request_fee') return 'Partial pricing estimate'
  return humanizeMoaToken(normalized, fallback)
}

export function parseMoaStructuredOutput(value = '') {
  const source = normalizeText(value)
  if (!source) return null
  try {
    const parsed = JSON.parse(source)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    // Some provider CLIs prepend a short commentary sentence to an otherwise valid
    // contract. Recover only a complete JSON object that consumes the remaining suffix;
    // never guess at or repair an arbitrary partial payload here.
    for (let index = source.indexOf('{'); index >= 0; index = source.indexOf('{', index + 1)) {
      try {
        const parsed = JSON.parse(source.slice(index))
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
      } catch {
        // Try the next possible object boundary.
      }
    }
    return null
  }
}

function decodeLooseStructuredString(value = '') {
  return String(value || '')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')
    .trim()
}

function finalizeLooseField(target, fieldName = '', parts = []) {
  if (!target || !fieldName) return
  let raw = Array.isArray(parts) ? parts.join('\n').trim() : ''
  if (!raw) return
  raw = raw.replace(/,\s*$/, '').trim()
  if (raw.startsWith('"')) raw = raw.slice(1)
  if (raw.endsWith('"')) raw = raw.slice(0, -1)
  target[fieldName] = decodeLooseStructuredString(raw)
}

function parseLooseFindingsContract(value = '') {
  const source = String(value || '').trim()
  if (!source || !/"summary"\s*:/.test(source) || !/"findings"\s*:/.test(source)) return null

  const lines = source.split(/\r?\n/)
  let summary = ''
  const findings = []
  let inFindings = false
  let currentFinding = null
  let openFieldTarget = null
  let openFieldName = ''
  let openFieldParts = []

  const closeOpenField = () => {
    if (!openFieldTarget || !openFieldName) return
    finalizeLooseField(openFieldTarget, openFieldName, openFieldParts)
    openFieldTarget = null
    openFieldName = ''
    openFieldParts = []
  }

  const beginField = (target, fieldName, initialValue) => {
    openFieldTarget = target
    openFieldName = fieldName
    openFieldParts = [String(initialValue || '').trim()]
  }

  for (const line of lines) {
    const trimmed = String(line || '').trim()
    if (!trimmed) {
      if (openFieldTarget) openFieldParts.push('')
      continue
    }

    const keyMatch = trimmed.match(/^"([a-zA-Z_][a-zA-Z0-9_]*)"\s*:\s*(.*)$/)
    const isObjectBoundary = trimmed === '{' || trimmed === '}' || trimmed === '},'

    if (openFieldTarget && (keyMatch || isObjectBoundary)) {
      closeOpenField()
    }

    if (!inFindings) {
      if (!summary && keyMatch?.[1] === 'summary') {
        let summaryValue = String(keyMatch[2] || '').trim()
        summaryValue = summaryValue.replace(/,\s*$/, '').trim()
        if (summaryValue.startsWith('"')) summaryValue = summaryValue.slice(1)
        if (summaryValue.endsWith('"')) summaryValue = summaryValue.slice(0, -1)
        summary = decodeLooseStructuredString(summaryValue)
        continue
      }
      if (/^"findings"\s*:\s*\[$/.test(trimmed)) {
        inFindings = true
      }
      continue
    }

    if (!currentFinding) {
      if (trimmed === '{') currentFinding = {}
      if (trimmed === ']') break
      continue
    }

    if (trimmed === '}' || trimmed === '},') {
      closeOpenField()
      if (Object.keys(currentFinding).length > 0) findings.push(currentFinding)
      currentFinding = null
      continue
    }

    if (keyMatch) {
      beginField(currentFinding, keyMatch[1], keyMatch[2])
      continue
    }

    if (openFieldTarget) {
      openFieldParts.push(line)
    }
  }

  closeOpenField()
  if (currentFinding && Object.keys(currentFinding).length > 0) findings.push(currentFinding)
  if (!summary && findings.length === 0) return null
  return {
    ...(summary ? { summary } : {}),
    findings,
  }
}

function markdownInlineCode(value = '') {
  const text = normalizeText(value)
  if (!text) return ''
  return `\`${text.replace(/`/g, '\\`')}\``
}

function pushMarkdownSection(lines, title, bodyLines = []) {
  const content = (Array.isArray(bodyLines) ? bodyLines : [])
    .map((line) => String(line ?? ''))
    .filter((line) => line.trim().length > 0)
  if (content.length === 0) return
  if (lines.length > 0) lines.push('')
  lines.push(`## ${title}`)
  lines.push(...content)
}

function pushMarkdownBlock(lines, label, value, { code = false } = {}) {
  const text = normalizeText(value)
  if (!text) return
  if (code || text.includes('\n')) {
    lines.push(`- ${label}:`)
    lines.push('```text')
    lines.push(text)
    lines.push('```')
    return
  }
  lines.push(`- ${label}: ${text}`)
}

function buildFindingsMarkdown(payload = {}) {
  const summary = normalizeText(payload.summary || payload.message)
  const findings = Array.isArray(payload.findings) ? payload.findings : []
  const lines = []

  if (summary) lines.push(summary)

  if (findings.length > 0) {
    const findingLines = []
    findings.forEach((row, index) => {
      const severity = humanizeMoaToken(row?.severity || 'info', 'Info')
      const issue = normalizeText(row?.issue || row?.title || row?.description) || 'Finding'
      const file = normalizeText(row?.file || row?.path)
      findingLines.push(`${index + 1}. **${severity}**: ${issue}`)
      if (file) findingLines.push(`   - File: ${markdownInlineCode(file)}`)
      if (normalizeText(row?.evidence)) findingLines.push(`   - Evidence: ${normalizeText(row.evidence)}`)
      if (normalizeText(row?.suggestion)) {
        const suggestion = normalizeText(row.suggestion)
        if (suggestion.includes('\n')) {
          findingLines.push('   - Suggestion:')
          findingLines.push('     ```text')
          suggestion.split('\n').forEach((line) => findingLines.push(`     ${line}`))
          findingLines.push('     ```')
        } else {
          findingLines.push(`   - Suggestion: ${suggestion}`)
        }
      }
      if (index < findings.length - 1) findingLines.push('')
    })
    pushMarkdownSection(lines, 'Findings', findingLines)
  }

  return lines.join('\n').trim()
}

function buildRecommendationsMarkdown(payload = {}) {
  const summary = normalizeText(payload.summary || payload.message)
  const recommendations = Array.isArray(payload.recommendations) ? payload.recommendations : []
  const lines = []

  if (summary) lines.push(summary)
  if (recommendations.length > 0) {
    const body = []
    recommendations.forEach((row, index) => {
      const priority = humanizeMoaToken(row?.priority || 'medium', 'Medium')
      const title = normalizeText(row?.title || row?.recommendation) || `Recommendation ${index + 1}`
      body.push(`${index + 1}. **${title}**`)
      body.push(`   - Priority: ${priority}`)
      if (normalizeText(row?.file)) body.push(`   - File: ${markdownInlineCode(row.file)}`)
      if (normalizeText(row?.rationale)) body.push(`   - Rationale: ${normalizeText(row.rationale)}`)
      if (index < recommendations.length - 1) body.push('')
    })
    pushMarkdownSection(lines, 'Recommendations', body)
  }

  return lines.join('\n').trim()
}

function buildStagedChangesMarkdown(payload = {}) {
  const summary = normalizeText(payload.summary || payload.message)
  const stagedChanges = Array.isArray(payload.stagedChanges || payload.staged_changes)
    ? (payload.stagedChanges || payload.staged_changes)
    : []
  const lines = []

  if (summary) lines.push(summary)
  if (stagedChanges.length > 0) {
    const body = stagedChanges.map((row, index) => {
      const filePath = normalizeText(row?.filePath || row?.file_path) || `Change ${index + 1}`
      const changeType = humanizeMoaToken(row?.changeType || row?.change_type || 'update', 'Update')
      const rationale = normalizeText(row?.rationale)
      return [
        `${index + 1}. **${filePath}**`,
        `   - Change: ${changeType}`,
        rationale ? `   - Rationale: ${rationale}` : '',
      ].filter(Boolean).join('\n')
    })
    pushMarkdownSection(lines, 'Staged Changes', body)
  }

  return lines.join('\n\n').trim()
}

function buildScorecardMarkdown(payload = {}) {
  const summary = normalizeText(payload.summary || payload.message)
  const scorecard = Array.isArray(payload.scorecard) ? payload.scorecard : []
  const lines = []

  if (summary) lines.push(summary)
  if (scorecard.length > 0) {
    const body = scorecard.map((row, index) => {
      const label = normalizeText(row?.label) || `Score ${index + 1}`
      const score = Number(row?.score)
      const rationale = normalizeText(row?.rationale)
      return [
        `${index + 1}. **${label}**`,
        Number.isFinite(score) ? `   - Score: ${score}` : '',
        rationale ? `   - Rationale: ${rationale}` : '',
      ].filter(Boolean).join('\n')
    })
    pushMarkdownSection(lines, 'Scorecard', body)
  }

  return lines.join('\n\n').trim()
}

function buildStructuredContractMarkdown(parsed = null, contractType = '', rawFallback = '') {
  if (!parsed || typeof parsed !== 'object') return rawFallback
  if (normalizeText(parsed.reportMarkdown || parsed.displayOutput || parsed.markdown)) {
    return normalizeText(parsed.reportMarkdown || parsed.displayOutput || parsed.markdown)
  }
  if (contractType === 'recommendations' || Array.isArray(parsed.recommendations)) {
    return buildRecommendationsMarkdown(parsed) || rawFallback
  }
  if (contractType === 'staged_changes' || Array.isArray(parsed.stagedChanges) || Array.isArray(parsed.staged_changes)) {
    return buildStagedChangesMarkdown(parsed) || rawFallback
  }
  if (contractType === 'scorecard' || Array.isArray(parsed.scorecard)) {
    return buildScorecardMarkdown(parsed) || rawFallback
  }
  if (Array.isArray(parsed.findings) || normalizeText(parsed.summary || parsed.message)) {
    return buildFindingsMarkdown(parsed) || rawFallback
  }

  const lines = []
  pushMarkdownSection(lines, 'Summary', [normalizeText(parsed.summary || parsed.message)])
  Object.entries(parsed).forEach(([key, value]) => {
    if (key === 'summary' || key === 'message' || value == null) return
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      pushMarkdownBlock(lines, humanizeMoaToken(key, key), String(value))
    }
  })
  return lines.join('\n').trim() || rawFallback
}

export function buildMoaAgentReportMarkdown({
  reportMarkdown = '',
  rawOutput = '',
  outputContractType = '',
  structuredOutput = null,
} = {}) {
  const explicit = normalizeText(reportMarkdown)
  const raw = String(rawOutput ?? '').trim()
  const contractType = normalizeText(outputContractType).toLowerCase()
  const normalizedStructured = structuredOutput && typeof structuredOutput === 'object'
    ? structuredOutput
    : null
  const explicitParsed = explicit ? parseMoaStructuredOutput(explicit) : null
  const rawParsed = raw ? parseMoaStructuredOutput(raw) : null
  const looseParsed = !normalizedStructured && !explicitParsed && !rawParsed
    ? parseLooseFindingsContract(explicit || raw)
    : null
  const parsed = normalizedStructured || explicitParsed || rawParsed || looseParsed

  if (parsed) {
    return buildStructuredContractMarkdown(parsed, contractType, explicit || raw)
  }
  if (explicit) return explicit
  return raw
}
