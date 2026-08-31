function clean(value) {
  return String(value ?? '').trim()
}

function normalizePhrase(value = '') {
  return clean(value).toLowerCase()
}

function buildTaskCorpus(tasks = []) {
  return (Array.isArray(tasks) ? tasks : [])
    .map((task) => [
      clean(task?.specialty),
      clean(task?.task_type || task?.taskType),
      clean(task?.goal),
      clean(task?.instruction),
    ].filter(Boolean).join('\n'))
    .join('\n')
    .toLowerCase()
}

function detectTaskKinds(tasks = []) {
  const corpus = buildTaskCorpus(tasks)
  return {
    hasCouncil: /\b(council|consensus|debate|vote)\b/.test(corpus),
    hasResearch: /\b(research|scout|investigate|discovery|explore)\b/.test(corpus),
    hasImplementation: /\b(implement|build|create|fix|write|patch|refactor|update)\b/.test(corpus),
    hasReview: /\b(review|audit|inspect|analyze|analyse|validate|verify)\b/.test(corpus),
    hasTesting: /\b(test|tests|testing|regression|coverage|qa)\b/.test(corpus),
  }
}

export function chooseOrchestrationPattern(tasks = [], {
  riskTier = 'medium',
} = {}) {
  const rows = Array.isArray(tasks) ? tasks : []
  if (rows.length <= 1) {
    return {
      pattern: 'single_specialist',
      rationale: ['single_task'],
    }
  }

  const kinds = detectTaskKinds(rows)
  if (kinds.hasCouncil) {
    return {
      pattern: 'council',
      rationale: ['council_keywords_detected'],
    }
  }
  if (kinds.hasResearch && kinds.hasImplementation) {
    return {
      pattern: 'sequential_pipeline',
      rationale: ['research_then_implementation_shape'],
    }
  }
  if (kinds.hasImplementation && (kinds.hasReview || kinds.hasTesting)) {
    return {
      pattern: riskTier === 'high' ? 'review_gate' : 'sequential_pipeline',
      rationale: [riskTier === 'high' ? 'high_risk_review_gate' : 'implementation_review_chain'],
    }
  }
  return {
    pattern: 'parallel_independent',
    rationale: ['independent_specialist_tasks'],
  }
}

export function maxTasksForPattern(pattern = '', {
  policyMax = 6,
  riskTier = 'medium',
} = {}) {
  const normalized = normalizePhrase(pattern)
  const max = Math.max(1, Number(policyMax || 1) || 1)
  if (normalized === 'single_specialist') return 1
  if (normalized === 'council') return Math.min(max, 3)
  if (normalized === 'review_gate') return Math.min(max, riskTier === 'high' ? 3 : 2)
  if (normalized === 'sequential_pipeline') return Math.min(max, 3)
  return Math.min(max, riskTier === 'high' ? 3 : riskTier === 'low' ? 1 : 2)
}
