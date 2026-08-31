import { estimateHistoryTokens } from '../../context-compaction.mjs'
import { isProviderChainCompactionAllowed } from '../continuity-policy.mjs'
import { applyOpenAIProviderNativeCompaction } from './openai-compaction-adapter.mjs'
import {
  createProviderNativeCompactionEligibility,
  createProviderNativeCompactionReference,
  createProviderNativeCompactionResult,
  PROVIDER_NATIVE_COMPACTION_FAILURE_REASONS,
  resolveProviderNativeCompactionAdapter,
} from './provider-native-compaction-contract.mjs'

function now() {
  return Date.now()
}

function normalizeId(value = '') {
  return String(value || '').trim()
}

export function resolveOpenAIProviderNativeCompactionEligibility({
  providerId = '',
  policy = {},
  history = [],
  model = '',
  previousResponseId = '',
  historyTokenEstimate = 0,
  packetTokens = 0,
  force = false,
} = {}) {
  const adapter = resolveProviderNativeCompactionAdapter(providerId)
  const provider = adapter.providerId
  if (provider !== 'openai' || adapter.supported !== true) {
    return createProviderNativeCompactionEligibility({
      providerId,
      reason: PROVIDER_NATIVE_COMPACTION_FAILURE_REASONS.PROVIDER_NOT_SUPPORTED,
    })
  }
  if (!isProviderChainCompactionAllowed(provider, policy)) {
    return createProviderNativeCompactionEligibility({
      providerId,
      reason: PROVIDER_NATIVE_COMPACTION_FAILURE_REASONS.POLICY_DISABLED,
    })
  }
  if (!Array.isArray(history) || history.length < 2) {
    return createProviderNativeCompactionEligibility({
      providerId,
      reason: PROVIDER_NATIVE_COMPACTION_FAILURE_REASONS.INSUFFICIENT_HISTORY,
    })
  }

  const normalizedModel = normalizeId(model)
  if (!normalizedModel) {
    return createProviderNativeCompactionEligibility({
      providerId,
      reason: PROVIDER_NATIVE_COMPACTION_FAILURE_REASONS.MISSING_MODEL,
    })
  }

  const normalizedPreviousResponseId = normalizeId(previousResponseId)
  if (!normalizedPreviousResponseId) {
    return createProviderNativeCompactionEligibility({
      providerId,
      reason: PROVIDER_NATIVE_COMPACTION_FAILURE_REASONS.MISSING_PREVIOUS_RESPONSE_ID,
    })
  }

  const estimatedTokens = Number(historyTokenEstimate || 0) || estimateHistoryTokens(history)
  const threshold = Math.max(
    4_000,
    Math.min(
      Number(policy?.maxContinuityPacketTokens || 7_000) || 7_000,
      12_000,
    ),
  )
  if (!force && estimatedTokens < threshold && Number(packetTokens || 0) < Math.round(threshold * 0.35)) {
    return createProviderNativeCompactionEligibility({
      providerId,
      reason: PROVIDER_NATIVE_COMPACTION_FAILURE_REASONS.BELOW_THRESHOLD,
      reference: createProviderNativeCompactionReference({
        providerId,
        stage: 'candidate',
        at: now(),
        estimatedTokens,
        threshold,
      }),
    })
  }

  return createProviderNativeCompactionEligibility({
    eligible: true,
    providerId,
    model: normalizedModel,
    previousResponseId: normalizedPreviousResponseId,
  })
}

export async function tryOpenAIProviderNativeCompaction(options = {}) {
  const eligibility = resolveOpenAIProviderNativeCompactionEligibility(options)
  if (!eligibility.eligible) {
    return createProviderNativeCompactionResult({
      providerId: options?.providerId,
      compactionMode: eligibility.compactionMode,
      reason: eligibility.reason,
      reference: eligibility.reference,
    })
  }

  return applyOpenAIProviderNativeCompaction({
    model: eligibility.model,
    previousResponseId: eligibility.previousResponseId,
    apiKey: options?.apiKey,
    promptCacheKey: options?.promptCacheKey,
  })
}
