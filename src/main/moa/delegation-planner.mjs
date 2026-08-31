import { estimateDelegationCost } from './cost-estimator.mjs'
import { normalizeDelegationTasks } from './moa-policy.mjs'
import { chooseOrchestrationPattern } from './orchestration-patterns.mjs'

function clean(value) {
  return String(value ?? '').trim()
}

function detectRiskScore(tasks = [], projectSignals = {}, recentMoaStats = {}) {
  let score = 0
  const rows = Array.isArray(tasks) ? tasks : []
  const combined = rows
    .map((task) => `${clean(task.instruction)}\n${String(task.injected_context ?? '')}`)
    .join('\n')
    .toLowerCase()

  if (rows.length >= 3) score += 1
  if (rows.length >= 5) score += 1

  const highRiskPatterns = [
    /\bsecurity\b/,
    /\bauth\b/,
    /\bcredential\b/,
    /\bencrypt\b/,
    /\bpayment\b/,
    /\bmigration\b/,
    /\brefactor\b/,
    /\bdelete\b/,
    /\bpermission\b/,
    /\baccess control\b/,
  ]
  if (highRiskPatterns.some((pattern) => pattern.test(combined))) score += 2

  if (Number(projectSignals?.estimatedChangedFiles || 0) >= 8) score += 1
  if (Number(projectSignals?.estimatedChangedFiles || 0) >= 20) score += 1
  if (Number(recentMoaStats?.recentFailureRate || 0) > 0.25) score += 1

  return score
}

function riskFromScore(score = 0) {
  if (score <= 1) return 'low'
  if (score <= 3) return 'medium'
  return 'high'
}

function strategyFromRisk(riskTier = 'medium') {
  if (riskTier === 'low') return 'minimal'
  if (riskTier === 'high') return 'deep_review'
  return 'balanced'
}

function dedupeTasks(tasks = []) {
  const seen = new Set()
  const out = []
  for (const task of tasks) {
    const key = [
      clean(task.task_id).toLowerCase(),
      clean(task.agent_role_id).toLowerCase(),
      clean(task.agent_role).toLowerCase(),
      clean(task.specialty).toLowerCase(),
      clean(task.task_type).toLowerCase(),
      clean(task.goal).toLowerCase(),
      Array.isArray(task.constraints) ? task.constraints.map((row) => clean(row).toLowerCase()).join('|') : '',
      clean(task.instruction).toLowerCase(),
      clean(task.injected_context).toLowerCase(),
      clean(task.expected_output_format).toLowerCase(),
    ].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(task)
  }
  return out
}

export function planDelegation({
  tasks = [],
  roles = [],
  projectSignals = {},
  recentMoaStats = {},
  pricingProfiles = [],
} = {}) {
  const normalized = normalizeDelegationTasks(tasks)
  const deduped = dedupeTasks(normalized)
  const riskScore = detectRiskScore(deduped, projectSignals, recentMoaStats)
  const riskTier = riskFromScore(riskScore)
  const strategy = strategyFromRisk(riskTier)
  const patternDecision = chooseOrchestrationPattern(deduped, { riskTier })
  const pattern = String(patternDecision?.pattern || 'parallel_independent')
  const patternRationale = Array.isArray(patternDecision?.rationale) ? patternDecision.rationale : []

  const plannedTasks = deduped
  const leanTasks = deduped.slice(0, 1)

  const plannedEstimate = estimateDelegationCost({
    tasks: plannedTasks,
    roles,
    strategy,
    pricingProfiles,
  })
  const leanEstimate = estimateDelegationCost({
    tasks: leanTasks,
    roles,
    strategy: 'minimal',
    pricingProfiles,
  })

  const rationale = [
    `risk_tier=${riskTier}`,
    `strategy=${strategy}`,
    `pattern=${pattern}`,
    'task_selection=all_valid_distinct_tasks',
    ...patternRationale.map((entry) => `pattern_reason=${entry}`),
    deduped.length !== normalized.length ? 'deduped_redundant_tasks=true' : '',
  ].filter(Boolean)

  return {
    riskTier,
    strategy,
    pattern,
    patternRationale,
    plannedTasks,
    rationale,
    estimatedTokens: Number(plannedEstimate.estimatedTokens || 0),
    estimatedUsd: plannedEstimate.estimatedUsd,
    usdAvailable: !!plannedEstimate.usdAvailable,
    estimateConfidence: String(plannedEstimate.estimateConfidence || 'token_only'),
    pricingWarning: String(plannedEstimate.pricingWarning || ''),
    pricingWarnings: Array.isArray(plannedEstimate.pricingWarnings) ? plannedEstimate.pricingWarnings : [],
    leanAlternative: {
      strategy: 'minimal',
      pattern: 'single_specialist',
      plannedTasks: leanTasks,
      estimatedTokens: Number(leanEstimate.estimatedTokens || 0),
      estimatedUsd: leanEstimate.estimatedUsd,
      usdAvailable: !!leanEstimate.usdAvailable,
      estimateConfidence: String(leanEstimate.estimateConfidence || 'token_only'),
      pricingWarning: String(leanEstimate.pricingWarning || ''),
      pricingWarnings: Array.isArray(leanEstimate.pricingWarnings) ? leanEstimate.pricingWarnings : [],
    },
  }
}

