function clean(value) {
  return String(value ?? '').trim()
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'do', 'for', 'from', 'if', 'in',
  'into', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'use', 'with',
])

const TERM_ALIASES = {
  testing: ['test', 'tests', 'coverage', 'regression', 'qa'],
  security: ['auth', 'injection', 'access', 'owasp', 'vulnerability'],
  performance: ['perf', 'latency', 'render', 'optimization', 'optimize'],
  accessibility: ['a11y', 'wcag', 'screen', 'keyboard', 'aria'],
  documentation: ['docs', 'readme', 'writing'],
  implementation: ['implement', 'build', 'fix', 'write', 'create'],
  review: ['audit', 'inspect', 'analyze', 'analyse'],
}

function normalizePhrase(value) {
  return clean(value).toLowerCase()
}

function normalizeConstraints(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => clean(entry)).filter(Boolean)
  }
  const single = clean(value)
  return single ? [single] : []
}

function tokenize(value) {
  const text = normalizePhrase(value)
  if (!text) return []
  return text
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
}

function unique(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)))
}

function expandAliases(values = []) {
  const expanded = []
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizePhrase(value)
    if (!normalized) continue
    expanded.push(normalized)
    for (const token of tokenize(normalized)) {
      const aliases = TERM_ALIASES[token]
      if (Array.isArray(aliases)) expanded.push(...aliases.map((entry) => normalizePhrase(entry)).filter(Boolean))
    }
  }
  return unique(expanded)
}

function buildRoleText(role = {}) {
  return [
    clean(role?.name),
    clean(role?.templateLabel),
    clean(role?.templateId),
    clean(role?.systemPrompt),
  ].filter(Boolean).join('\n').toLowerCase()
}

function buildRoleIdentityPhrases(role = {}) {
  return unique([
    normalizePhrase(role?.name),
    normalizePhrase(role?.templateLabel),
    normalizePhrase(role?.templateId),
  ])
}

function buildRoleIdentityText(role = {}) {
  return buildRoleIdentityPhrases(role).join('\n')
}

function buildTaskPhrases(task = {}) {
  return expandAliases([
    normalizePhrase(task?.specialty),
    normalizePhrase(task?.task_type || task?.taskType),
    normalizePhrase(task?.goal),
    normalizePhrase(task?.instruction),
    ...normalizeConstraints(task?.constraints).map((entry) => normalizePhrase(entry)),
  ])
}

function buildTaskTokens(task = {}) {
  return unique(buildTaskPhrases(task).flatMap((phrase) => tokenize(phrase)))
}

function buildRawTaskTokens(task = {}) {
  return unique([
    task?.specialty,
    task?.task_type || task?.taskType,
    task?.goal,
    task?.instruction,
    ...normalizeConstraints(task?.constraints),
  ].flatMap((value) => tokenize(value)))
}

function expandHintTerms(value = '') {
  const normalized = normalizePhrase(value)
  if (!normalized) return []
  return expandAliases([normalized]).flatMap((entry) => [entry, ...tokenize(entry)])
}

function inferWriteBias(task = {}) {
  const corpus = buildTaskPhrases(task).join('\n')
  if (!corpus) return 'neutral'
  if (/\b(fix|implement|create|write|refactor|patch|edit|update|build)\b/.test(corpus)) return 'write'
  if (/\b(review|audit|inspect|analyze|analyse|investigate|triage)\b/.test(corpus)) return 'read'
  return 'neutral'
}

export function hasSemanticRoutingHints(task = {}) {
  return !!(
    clean(task?.specialty)
    || clean(task?.task_type || task?.taskType)
    || clean(task?.goal)
    || clean(task?.instruction)
    || normalizeConstraints(task?.constraints).length > 0
  )
}

export function scoreRoleForTask(task = {}, role = {}) {
  const roleText = buildRoleText(role)
  const roleIdentityText = buildRoleIdentityText(role)
  const taskPhrases = buildTaskPhrases(task)
  const taskText = taskPhrases.join('\n')
  const taskTokens = buildTaskTokens(task)
  const matchedTerms = []
  let score = 0

  const exactIdentity = buildRoleIdentityPhrases(role).find((identity) => (
    identity.length >= 3 && taskText.includes(identity)
  ))
  if (exactIdentity) {
    score += 20
    matchedTerms.push(exactIdentity)
  }

  for (const token of buildRawTaskTokens(task)) {
    if (!roleIdentityText.includes(token)) continue
    score += 4
    matchedTerms.push(token)
  }

  const specialty = normalizePhrase(task?.specialty)
  if (specialty && roleText.includes(specialty)) {
    score += 5
    matchedTerms.push(specialty)
  }
  if (specialty && !roleText.includes(specialty)) {
    const specialtyAlias = expandHintTerms(specialty).find((term) => term && roleText.includes(term))
    if (specialtyAlias) {
      score += 4
      matchedTerms.push(specialtyAlias)
    }
  }

  const taskType = normalizePhrase(task?.task_type || task?.taskType)
  if (taskType && roleText.includes(taskType)) {
    score += 4
    matchedTerms.push(taskType)
  }
  if (taskType && !roleText.includes(taskType)) {
    const taskTypeAlias = expandHintTerms(taskType).find((term) => term && roleText.includes(term))
    if (taskTypeAlias) {
      score += 3
      matchedTerms.push(taskTypeAlias)
    }
  }

  for (const token of taskTokens) {
    if (!roleText.includes(token)) continue
    score += 1
    matchedTerms.push(token)
  }

  const writeBias = inferWriteBias(task)
  if (writeBias === 'write' && role?.canWriteFiles) score += 2
  if (writeBias === 'read' && !role?.canWriteFiles) score += 1

  const confidence = score >= 8 ? 'high' : score >= 5 ? 'medium' : 'low'
  return {
    role,
    score,
    confidence,
    matchedTerms: unique(matchedTerms).slice(0, 8),
    taskPhrases,
    writeBias,
  }
}

export function resolveRoleForTask(task = {}, roles = [], {
  minScore = 5,
  minMargin = 2,
} = {}) {
  const roleRows = Array.isArray(roles) ? roles : []
  const scored = roleRows
    .map((role) => scoreRoleForTask(task, role))
    .sort((left, right) => right.score - left.score || clean(left?.role?.name).localeCompare(clean(right?.role?.name)))

  const best = scored[0] || null
  const second = scored[1] || null
  const margin = best && second ? best.score - second.score : best ? best.score : 0
  const requiredScore = Number.isFinite(Number(minScore)) ? Math.max(0, Number(minScore)) : 5
  const accepted = !!best && (
    best.score >= requiredScore
    && (margin >= Math.max(0, Number(minMargin || 0)) || best.confidence === 'high')
  )

  return {
    role: accepted ? best.role : null,
    strategy: accepted ? 'semantic' : 'unresolved',
    confidence: accepted ? best.confidence : 'low',
    score: best?.score || 0,
    margin,
    matchedTerms: Array.isArray(best?.matchedTerms) ? best.matchedTerms : [],
    candidates: scored.slice(0, 3).map((entry) => ({
      roleId: clean(entry?.role?.id),
      roleName: clean(entry?.role?.name),
      score: Number(entry?.score || 0),
      confidence: String(entry?.confidence || 'low'),
      matchedTerms: Array.isArray(entry?.matchedTerms) ? entry.matchedTerms : [],
    })),
  }
}
