import { normalizeUsage } from './ai-provider-stream-utils.mjs'

function trimString(value = '') {
  return String(value || '').trim()
}

function readAnthropicReasoningMetadata(source = null) {
  const anthropic = source?.anthropic && typeof source.anthropic === 'object'
    ? source.anthropic
    : null
  if (!anthropic) return null
  const signature = trimString(anthropic.signature)
  const redactedData = trimString(anthropic.redactedData)
  if (signature) return { signature }
  if (redactedData) return { redactedData }
  return null
}

function normalizeAnthropicReasoningHistoryPart(part = null) {
  if (!part || typeof part !== 'object') return null
  if (trimString(part.type).toLowerCase() !== 'reasoning') return null
  const metadata = readAnthropicReasoningMetadata(part.providerOptions)
    || readAnthropicReasoningMetadata(part.providerMetadata)
  if (!metadata) return null
  return {
    type: 'reasoning',
    text: String(part.text ?? ''),
    providerOptions: {
      anthropic: metadata,
    },
  }
}

function normalizeAnthropicAppliedEdits(contextManagement = null) {
  const appliedEdits = Array.isArray(contextManagement?.appliedEdits)
    ? contextManagement.appliedEdits
    : []
  return appliedEdits
    .map((edit) => String(edit?.type || '').trim())
    .filter(Boolean)
}

export function extractAnthropicReasoningHistoryParts(reasoningParts = []) {
  return (Array.isArray(reasoningParts) ? reasoningParts : [])
    .map((part) => normalizeAnthropicReasoningHistoryPart(part))
    .filter(Boolean)
}

export function extractAnthropicResponseMeta(providerMetadata = null, response = null, fallbackModelId = '', rawStreamMeta = null) {
  const anthropicMetadata = providerMetadata?.anthropic && typeof providerMetadata.anthropic === 'object'
    ? providerMetadata.anthropic
    : {}
  const contextManagement = anthropicMetadata?.contextManagement && typeof anthropicMetadata.contextManagement === 'object'
    ? anthropicMetadata.contextManagement
    : null
  const appliedEdits = normalizeAnthropicAppliedEdits(contextManagement)
  const iterations = Array.isArray(anthropicMetadata?.iterations)
    ? anthropicMetadata.iterations
      .map((iteration) => {
        const type = String(iteration?.type || '').trim().toLowerCase()
        if (!type) return null
        return {
          type,
          inputTokens: Number(iteration?.inputTokens || 0) || 0,
          outputTokens: Number(iteration?.outputTokens || 0) || 0,
        }
      })
      .filter(Boolean)
    : []
  const compactionApplied = appliedEdits.includes('compact_20260112')
  const compactionSummaryDetected = rawStreamMeta?.compactionSummaryDetected === true
  const contextManagementApplied = appliedEdits.length > 0
  const usageTelemetry = normalizeUsage(
    anthropicMetadata?.usage
    || anthropicMetadata?.rawUsage
    || response?.usage
    || null,
  )

  if (!contextManagementApplied && !compactionSummaryDetected && iterations.length === 0) {
    return null
  }

  return {
    providerId: 'anthropic',
    modelId: String(response?.modelId || response?.model || fallbackModelId || '').trim(),
    contextManagementApplied,
    contextManagementAppliedEdits: appliedEdits,
    compactionApplied,
    compactionSummaryDetected,
    usageSemantics: {
      currentTurnInputMayExcludeCompaction: iterations.length > 0,
      billedTotalsDerivedFromIterations: iterations.length > 0,
    },
    ...(usageTelemetry ? { usageTelemetry } : {}),
    usageIterations: iterations,
  }
}
