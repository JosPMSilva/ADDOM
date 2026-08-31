import {
  applyCompactionDiagnostics,
  normalizeCompactionDiagnostics,
} from '../../common/chat/compaction-diagnostics.mjs'
import {
  COMPACTION_MODES,
  normalizeCompactionMode,
  normalizeCompactionModeList,
} from '../chat/continuity/compaction-mode-contract.mjs'

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizeThresholdTokens(value, fallback = 0) {
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) return Math.round(numeric)
  const fallbackNumeric = Number(fallback)
  return Number.isFinite(fallbackNumeric) && fallbackNumeric > 0
    ? Math.round(fallbackNumeric)
    : 0
}

export function resolveOpenAIRequestContextCompaction(openAIRequestContext = {}) {
  const source = asObject(openAIRequestContext)
  const compaction = asObject(source.compaction)
  const diagnostics = normalizeCompactionDiagnostics({
    selectedCompactionMode: (
      compaction.selectedMode
      || compaction.selectedCompactionMode
      || source.selectedMode
      || source.selectedCompactionMode
    ),
    candidateCompactionModes: (
      compaction.candidateModes
      || compaction.candidateCompactionModes
      || source.candidateCompactionModes
    ),
    compactionFailureReason: (
      compaction.failureReason
      || compaction.compactionFailureReason
      || source.compactionFailureReason
    ),
    fallbackCompactionMode: (
      compaction.fallbackMode
      || compaction.fallbackCompactionMode
      || source.fallbackCompactionMode
    ),
    fallbackReason: compaction.fallbackReason || source.fallbackReason,
    compactionEventType: (
      compaction.eventType
      || compaction.compactionEventType
      || source.compactionEventType
    ),
    compactionEventPhase: (
      compaction.eventPhase
      || compaction.compactionEventPhase
      || source.compactionEventPhase
    ),
    compactionEventOccurred: (
      compaction.eventOccurred
      ?? compaction.compactionEventOccurred
      ?? source.compactionEventOccurred
    ),
    canonicalHandoffUsed: (
      compaction.canonicalHandoffUsed
      ?? source.canonicalHandoffUsed
    ),
    carryForwardSource: (
      compaction.carryForwardSource
      || compaction.compactionCarryForwardSource
      || source.carryForwardSource
      || source.compactionCarryForwardSource
    ),
  })
  const requestedCompactionMode = normalizeCompactionMode(
    compaction.requestedMode
    || compaction.requestedCompactionMode
    || source.requestedMode
    || source.requestedCompactionMode
    || source.compactionStrategy
    || source.compactionMode
    || (source.forceManualCompaction === true ? COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION : ''),
    COMPACTION_MODES.NONE,
  )
  const selectedCompactionMode = normalizeCompactionMode(
    diagnostics.selectedCompactionMode,
    requestedCompactionMode,
  )
  const candidateCompactionModes = diagnostics.candidateCompactionModes.length > 0
    ? normalizeCompactionModeList(diagnostics.candidateCompactionModes)
    : normalizeCompactionModeList(
        selectedCompactionMode && selectedCompactionMode !== COMPACTION_MODES.NONE
          ? [selectedCompactionMode]
          : [],
      )
  return {
    requestedCompactionMode,
    selectedCompactionMode,
    candidateCompactionModes,
    compactionFailureReason: diagnostics.compactionFailureReason,
    fallbackCompactionMode: diagnostics.fallbackCompactionMode,
    fallbackReason: diagnostics.fallbackReason,
    ...(diagnostics.compactionEventType
      ? { compactionEventType: diagnostics.compactionEventType }
      : {}),
    ...(diagnostics.compactionEventPhase
      ? { compactionEventPhase: diagnostics.compactionEventPhase }
      : {}),
    ...(diagnostics.compactionEventOccurred === null
      ? {}
      : { compactionEventOccurred: diagnostics.compactionEventOccurred === true }),
    ...(diagnostics.canonicalHandoffUsed === null
      ? {}
      : { canonicalHandoffUsed: diagnostics.canonicalHandoffUsed === true }),
    ...(diagnostics.carryForwardSource
      ? { carryForwardSource: diagnostics.carryForwardSource }
      : {}),
    forceProviderTruncation: (
      compaction.forceProviderTruncation === true
      || source.forceProviderTruncation === true
      || source.forceServerSideCompaction === true
    ),
    providerTruncationThresholdTokens: normalizeThresholdTokens(
      compaction.providerTruncationThresholdTokens
      || compaction.truncationThresholdTokens
      || source.providerTruncationThresholdTokens
      || source.truncationThresholdTokens
      || source.serverSideCompactionThresholdTokens,
      0,
    ),
  }
}

export function applyOpenAIRequestContextCompaction(target = {}, payload = {}) {
  const base = asObject(target)
  const normalized = resolveOpenAIRequestContextCompaction(payload)
  const hasCompactionEventOccurred = typeof normalized.compactionEventOccurred === 'boolean'
  const hasCanonicalHandoffUsed = typeof normalized.canonicalHandoffUsed === 'boolean'
  return applyCompactionDiagnostics({
    ...base,
    compaction: {
      requestedMode: normalized.requestedCompactionMode,
      selectedMode: normalized.selectedCompactionMode,
      ...(normalized.candidateCompactionModes.length > 0
        ? { candidateModes: normalized.candidateCompactionModes }
        : {}),
      ...(normalized.compactionFailureReason
        ? { failureReason: normalized.compactionFailureReason }
        : {}),
      ...(normalized.fallbackCompactionMode
        ? { fallbackMode: normalized.fallbackCompactionMode }
        : {}),
      ...(normalized.fallbackReason
        ? { fallbackReason: normalized.fallbackReason }
        : {}),
      ...(normalized.compactionEventType
        ? { eventType: normalized.compactionEventType }
        : {}),
      ...(normalized.compactionEventPhase
        ? { eventPhase: normalized.compactionEventPhase }
        : {}),
      ...(hasCompactionEventOccurred
        ? { eventOccurred: normalized.compactionEventOccurred === true }
        : {}),
      ...(hasCanonicalHandoffUsed
        ? { canonicalHandoffUsed: normalized.canonicalHandoffUsed === true }
        : {}),
      ...(normalized.carryForwardSource
        ? { carryForwardSource: normalized.carryForwardSource }
        : {}),
      ...(normalized.forceProviderTruncation
        ? { forceProviderTruncation: true }
        : {}),
      ...(normalized.providerTruncationThresholdTokens > 0
        ? { providerTruncationThresholdTokens: normalized.providerTruncationThresholdTokens }
        : {}),
    },
    compactionStrategy: normalized.requestedCompactionMode,
    forceServerSideCompaction: normalized.forceProviderTruncation,
    serverSideCompactionThresholdTokens: normalized.providerTruncationThresholdTokens,
  }, normalized)
}

export function buildOpenAIRequestContextSnapshot(openAIRequestContext = {}) {
  const source = asObject(openAIRequestContext)
  return applyOpenAIRequestContextCompaction({
    ...(source.previousResponseId ? { previousResponseId: String(source.previousResponseId || '').trim() } : {}),
    ...(source.conversationId ? { conversationId: String(source.conversationId || '').trim() } : {}),
    ...(source.accountBridgeThreadId ? { accountBridgeThreadId: String(source.accountBridgeThreadId || '').trim() } : {}),
    ...(source.accountBridgeProjectFolder ? { accountBridgeProjectFolder: String(source.accountBridgeProjectFolder || '').trim() } : {}),
    ...(source.accountDynamicToolSignature ? { accountDynamicToolSignature: String(source.accountDynamicToolSignature || '').trim() } : {}),
    ...(source.accountDelegationBackend ? { accountDelegationBackend: String(source.accountDelegationBackend || '').trim().toLowerCase() } : {}),
    ...(source.accountCollaborationModeId ? { accountCollaborationModeId: String(source.accountCollaborationModeId || '').trim() } : {}),
    ...(Number.isFinite(Number(source.accountContextCompactionGeneration))
      ? { accountContextCompactionGeneration: Math.max(0, Number(source.accountContextCompactionGeneration) || 0) }
      : {}),
    ...(typeof source.store === 'boolean' ? { store: source.store === true } : {}),
    ...(source.resetChainFromCompactedWindow === true ? { resetChainFromCompactedWindow: true } : {}),
  }, source)
}
