const SEVERITY_SET = new Set(['security', 'correctness', 'completeness', 'performance', 'info'])
const PRIORITY_SET = new Set(['high', 'medium', 'low'])
const CHANGE_TYPE_SET = new Set(['create', 'update', 'delete', 'move'])

export const AGENT_OUTPUT_CONTRACT_TYPES = Object.freeze({
  findings: 'findings',
  recommendations: 'recommendations',
  stagedChanges: 'staged_changes',
  scorecard: 'scorecard',
})

export const DEFAULT_AGENT_OUTPUT_LIMITS = Object.freeze({
  maxFindingsPerAgent: 10,
  maxEvidenceCharsPerFinding: 500,
  maxAgentSummaryChars: 1200,
})

function clean(value) {
  return String(value ?? '').trim()
}

function clampInteger(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function normalizeLimits(limits = {}) {
  const src = limits && typeof limits === 'object' ? limits : {}
  return {
    maxFindingsPerAgent: clampInteger(
      src.maxFindingsPerAgent,
      DEFAULT_AGENT_OUTPUT_LIMITS.maxFindingsPerAgent,
      1,
      50,
    ),
    maxEvidenceCharsPerFinding: clampInteger(
      src.maxEvidenceCharsPerFinding,
      DEFAULT_AGENT_OUTPUT_LIMITS.maxEvidenceCharsPerFinding,
      80,
      4_000,
    ),
    maxAgentSummaryChars: clampInteger(
      src.maxAgentSummaryChars,
      DEFAULT_AGENT_OUTPUT_LIMITS.maxAgentSummaryChars,
      200,
      10_000,
    ),
  }
}

function normalizeFinding(row = {}, limits) {
  const item = row && typeof row === 'object' ? row : {}
  const severity = clean(item.severity).toLowerCase()
  const normalizedSeverity = SEVERITY_SET.has(severity) ? severity : 'info'
  return {
    severity: normalizedSeverity,
    file: clean(item.file).slice(0, 200),
    issue: clean(item.issue).slice(0, 500),
    evidence: clean(item.evidence).slice(0, limits.maxEvidenceCharsPerFinding),
    suggestion: clean(item.suggestion).slice(0, 800),
  }
}

function normalizeRecommendation(row = {}) {
  const item = row && typeof row === 'object' ? row : {}
  const priority = clean(item.priority).toLowerCase()
  return {
    title: clean(item.title).slice(0, 240),
    priority: PRIORITY_SET.has(priority) ? priority : 'medium',
    rationale: clean(item.rationale).slice(0, 800),
    file: clean(item.file).slice(0, 200),
  }
}

function normalizeStagedChange(row = {}) {
  const item = row && typeof row === 'object' ? row : {}
  const changeType = clean(item.changeType || item.change_type).toLowerCase()
  return {
    filePath: clean(item.filePath || item.file_path).slice(0, 260),
    changeType: CHANGE_TYPE_SET.has(changeType) ? changeType : 'update',
    rationale: clean(item.rationale).slice(0, 800),
  }
}

function normalizeScorecardRow(row = {}) {
  const item = row && typeof row === 'object' ? row : {}
  const numericScore = Number(item.score)
  return {
    label: clean(item.label).slice(0, 200),
    score: Number.isFinite(numericScore) ? Math.max(0, Math.min(100, numericScore)) : 0,
    rationale: clean(item.rationale).slice(0, 800),
  }
}

function normalizeContractType(value = '') {
  const normalized = clean(value).toLowerCase()
  if (normalized === AGENT_OUTPUT_CONTRACT_TYPES.recommendations) return normalized
  if (normalized === AGENT_OUTPUT_CONTRACT_TYPES.stagedChanges) return normalized
  if (normalized === AGENT_OUTPUT_CONTRACT_TYPES.scorecard) return normalized
  return AGENT_OUTPUT_CONTRACT_TYPES.findings
}

export function resolveAgentOutputContractType(task = {}) {
  const explicit = normalizeContractType(
    task?.outputContractType
    || task?.output_contract_type
    || task?.contractType
    || task?.contract_type,
  )
  if (clean(task?.outputContractType || task?.output_contract_type || task?.contractType || task?.contract_type)) {
    return explicit
  }

  const corpus = [
    clean(task?.expected_output_format),
    clean(task?.instruction),
    clean(task?.task_type || task?.taskType),
    clean(task?.specialty),
  ].join('\n').toLowerCase()

  if (/\b(scorecard|score card|rubric|rating)\b/.test(corpus)) {
    return AGENT_OUTPUT_CONTRACT_TYPES.scorecard
  }
  if (/\b(staged changes|change list|before\/after|applied fixes|files changed|change_type|filePath)\b/.test(corpus)) {
    return AGENT_OUTPUT_CONTRACT_TYPES.stagedChanges
  }
  if (/\b(recommendation|recommendations|plan|proposal|roadmap|next steps)\b/.test(corpus)) {
    return AGENT_OUTPUT_CONTRACT_TYPES.recommendations
  }
  return AGENT_OUTPUT_CONTRACT_TYPES.findings
}

function normalizeParseOptions(options = {}) {
  const src = options && typeof options === 'object' ? options : {}
  const limits = normalizeLimits(src)
  return {
    type: normalizeContractType(src.type || src.contractType),
    limits,
  }
}

export function parseAgentOutputContract(rawOutput, optionsInput = {}) {
  const { type, limits } = normalizeParseOptions(optionsInput)
  const source = String(rawOutput ?? '').trim()
  if (!source) {
    return {
      parsedOk: false,
      contractType: type,
      summary: '',
      findings: [],
      recommendations: [],
      stagedChanges: [],
      scorecard: [],
      raw: '',
      parseError: 'empty_output',
      limits,
    }
  }

  let parsed
  try {
    parsed = JSON.parse(source)
  } catch {
    return {
      parsedOk: false,
      contractType: type,
      summary: source.slice(0, limits.maxAgentSummaryChars),
      findings: [],
      recommendations: [],
      stagedChanges: [],
      scorecard: [],
      raw: source,
      parseError: 'invalid_json',
      limits,
    }
  }

  const payload = parsed && typeof parsed === 'object' ? parsed : {}
  const findingsRaw = Array.isArray(payload.findings) ? payload.findings : []
  const recommendationsRaw = Array.isArray(payload.recommendations) ? payload.recommendations : []
  const stagedChangesRaw = Array.isArray(payload.stagedChanges || payload.staged_changes)
    ? (payload.stagedChanges || payload.staged_changes)
    : []
  const scorecardRaw = Array.isArray(payload.scorecard) ? payload.scorecard : []
  const findings = findingsRaw
    .slice(0, limits.maxFindingsPerAgent)
    .map((row) => normalizeFinding(row, limits))
    .filter((row) => row.issue)
  const recommendations = recommendationsRaw
    .slice(0, limits.maxFindingsPerAgent)
    .map((row) => normalizeRecommendation(row))
    .filter((row) => row.title)
  const stagedChanges = stagedChangesRaw
    .slice(0, limits.maxFindingsPerAgent)
    .map((row) => normalizeStagedChange(row))
    .filter((row) => row.filePath)
  const scorecard = scorecardRaw
    .slice(0, limits.maxFindingsPerAgent)
    .map((row) => normalizeScorecardRow(row))
    .filter((row) => row.label)
  const summary = clean(payload.summary).slice(0, limits.maxAgentSummaryChars)

  return {
    parsedOk: true,
    contractType: type,
    summary,
    findings,
    recommendations,
    stagedChanges,
    scorecard,
    raw: source,
    parseError: '',
    limits,
  }
}

export function buildAgentOutputContractHint(task = {}) {
  const contractType = resolveAgentOutputContractType(task)
  const shape = contractType === AGENT_OUTPUT_CONTRACT_TYPES.scorecard
    ? '{"summary":"...", "scorecard":[{"label":"...","score":0,"rationale":"..."}]}'
    : contractType === AGENT_OUTPUT_CONTRACT_TYPES.stagedChanges
      ? '{"summary":"...", "stagedChanges":[{"filePath":"path","changeType":"create|update|delete|move","rationale":"..."}]}'
      : contractType === AGENT_OUTPUT_CONTRACT_TYPES.recommendations
        ? '{"summary":"...", "recommendations":[{"title":"...","priority":"high|medium|low","rationale":"...","file":"path"}]}'
        : '{"summary":"...", "findings":[{"severity":"security|correctness|completeness|performance|info","file":"path","issue":"...","evidence":"...","suggestion":"..."}]}'
  return [
    `Return STRICT JSON only with contract type "${contractType}" and shape:`,
    shape,
    'Do not include markdown fences.',
  ].join('\n')
}

