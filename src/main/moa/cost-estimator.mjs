import { resolveRoleByIdentity } from './moa-policy.mjs'
import { resolveRegistryModel } from '../api-clients/model-registry.mjs'

function clean(value) {
  return String(value ?? '').trim()
}

function findPricingProfile(pricingProfiles = [], providerId = '', model = '') {
  const providerKey = clean(providerId).toLowerCase()
  const modelKey = clean(model).toLowerCase()
  if (!providerKey || !modelKey) return null
  return (Array.isArray(pricingProfiles) ? pricingProfiles : []).find((row) => (
    clean(row?.providerId).toLowerCase() === providerKey
    && clean(row?.model).toLowerCase() === modelKey
  )) || null
}

function getRegistryPricingMeta(providerId = '', model = '') {
  const resolved = resolveRegistryModel(providerId, model)
  const pricing = resolved?.model?.pricing && typeof resolved.model.pricing === 'object'
    ? resolved.model.pricing
    : null
  const notes = clean(pricing?.notes || resolved?.model?.notes)
  const providerKey = clean(providerId).toLowerCase()
  const hasRequestFeeCaveat = providerKey === 'perplexity' || notes.toLowerCase().includes('request-fee')
  return {
    pricing,
    notes,
    hasRequestFeeCaveat,
  }
}

function estimateTaskTokens(task = {}, strategy = 'balanced') {
  const promptChars = (
    clean(task.instruction).length
    + String(task.injected_context ?? '').length
    + clean(task.expected_output_format).length
  )
  const promptTokens = Math.max(200, Math.ceil(promptChars / 4) + 180)

  const formatHint = clean(task.expected_output_format).toLowerCase()
  let outputBase = 650
  if (strategy === 'minimal') outputBase = 350
  if (strategy === 'deep_review') outputBase = 900
  if (formatHint.includes('json') || formatHint.includes('bullet')) {
    outputBase = Math.max(220, Math.round(outputBase * 0.75))
  }

  const outputTokens = outputBase
  const reasoningTokens = Math.round(outputBase * 0.35)
  return {
    inputTokens: promptTokens,
    outputTokens,
    reasoningTokens,
    totalTokens: promptTokens + outputTokens + reasoningTokens,
  }
}

export function estimateDelegationCost({
  tasks = [],
  roles = [],
  strategy = 'balanced',
  pricingProfiles = [],
} = {}) {
  const taskRows = Array.isArray(tasks) ? tasks : []
  const roleRows = Array.isArray(roles) ? roles : []

  const perTask = taskRows.map((task) => {
    const role = resolveRoleByIdentity(task, roleRows)
    const providerId = clean(role?.providerId)
    const model = clean(role?.model)
    const estimate = estimateTaskTokens(task, strategy)
    const profile = findPricingProfile(pricingProfiles, providerId, model)
    const registryPricingMeta = getRegistryPricingMeta(providerId, model)

    let usd = null
    let estimateConfidence = 'token_only'
    let pricingWarning = ''
    if (profile) {
      const inputUsdPer1k = Number(profile.inputUsdPer1kTokens || 0)
      const outputUsdPer1k = Number(profile.outputUsdPer1kTokens || 0)
      const reasoningUsdPer1k = Number(profile.reasoningUsdPer1kTokens || 0)
      usd = (
        (estimate.inputTokens / 1000) * inputUsdPer1k
        + (estimate.outputTokens / 1000) * outputUsdPer1k
        + (estimate.reasoningTokens / 1000) * reasoningUsdPer1k
      )
      if (registryPricingMeta.hasRequestFeeCaveat) {
        estimateConfidence = 'partial_request_fee'
        pricingWarning = registryPricingMeta.notes
          || 'Provider applies request-fee/search components; token-only USD estimate is partial.'
      } else {
        estimateConfidence = 'token_plus_pricing'
      }
    }

    return {
      taskId: clean(task.task_id),
      providerId,
      model,
      ...estimate,
      estimatedUsd: usd,
      usdAvailable: usd != null,
      estimateConfidence,
      pricingWarning,
    }
  })

  const totals = perTask.reduce((acc, row) => ({
    inputTokens: acc.inputTokens + Number(row.inputTokens || 0),
    outputTokens: acc.outputTokens + Number(row.outputTokens || 0),
    reasoningTokens: acc.reasoningTokens + Number(row.reasoningTokens || 0),
    totalTokens: acc.totalTokens + Number(row.totalTokens || 0),
  }), {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  })

  // Include orchestrator synthesis + merge overhead.
  totals.totalTokens += 900
  totals.inputTokens += 500
  totals.outputTokens += 250
  totals.reasoningTokens += 150

  const usdValues = perTask
    .map((row) => row.estimatedUsd)
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
    .map(Number)
  const usdAvailable = usdValues.length === perTask.length && perTask.length > 0
  const estimatedUsd = usdAvailable
    ? usdValues.reduce((sum, value) => sum + value, 0)
    : null
  const hasPartialRequestFee = perTask.some((row) => row.estimateConfidence === 'partial_request_fee')
  const estimateConfidence = hasPartialRequestFee
    ? 'partial_request_fee'
    : usdAvailable
      ? 'token_plus_pricing'
      : 'token_only'
  const pricingWarnings = [...new Set(
    perTask.map((row) => clean(row.pricingWarning)).filter(Boolean),
  )]

  return {
    strategy: clean(strategy) || 'balanced',
    perTask,
    estimatedTokens: Number(totals.totalTokens || 0),
    estimatedUsd,
    usdAvailable,
    estimateConfidence,
    pricingWarning: pricingWarnings[0] || '',
    pricingWarnings,
  }
}

