import { buildCompactionDiagnosticLines } from '../../common/chat/compaction-diagnostics.mjs'
import { buildRuntimeEvidenceDiagnosticLines } from './chat-runtime-diagnostic-evidence.mjs'

const ADAPTIVE_BUDGET_DEGRADED_REASONS = new Set([
  'stale_observation',
  'expired_observation',
  'invalid_observation',
])

function summarizeCountMap(input = {}, maxItems = 8) {
  if (!input || typeof input !== 'object') return ''
  const rows = Object.entries(input)
    .map(([key, value]) => [String(key || '').trim(), Number(value || 0) || 0])
    .filter(([key, value]) => key && value > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxItems)
  if (rows.length === 0) return ''
  return rows.map(([key, value]) => `${key}=${value}`).join(', ')
}

function summarizeObjectRows(values = [], renderRow = () => '', maxItems = 8) {
  const out = []
  const seen = new Set()
  for (const row of Array.isArray(values) ? values : []) {
    if (out.length >= maxItems) break
    const rendered = renderRow(row && typeof row === 'object' ? row : {})
    const value = String(rendered || '').trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out.join(', ')
}

function summarizeStringList(values = [], maxItems = 8) {
  const out = []
  const seen = new Set()
  for (const rawValue of Array.isArray(values) ? values : []) {
    if (out.length >= maxItems) break
    const value = String(rawValue || '').trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out.join(', ')
}

function buildDevToolSurfaceDiagnosticLines(source = {}) {
  if (source.devToolSurfaceDiagnosticsEnabled !== true) return []
  const lines = []
  const visibleFamilies = summarizeCountMap(source.devToolSurfaceVisibleFamilies)
  if (visibleFamilies) lines.push(`dev_tool_surface_visible_families: ${visibleFamilies}`)
  const hiddenFamilies = summarizeStringList(source.devToolSurfaceHiddenDiscoverableFamilies)
  if (hiddenFamilies) lines.push(`dev_tool_surface_hidden_discoverable_families: ${hiddenFamilies}`)
  const activationRecords = summarizeObjectRows(
    source.devToolSurfaceActivationRecords,
    (row) => {
      const capabilityId = String(row.capabilityId || '').trim()
      if (!capabilityId) return ''
      const state = String(row.state || '').trim()
      const reason = String(row.reason || '').trim()
      const attemptedToolName = String(row.attemptedToolName || '').trim()
      return `${capabilityId}${state ? `:${state}` : ''}${reason ? `:${reason}` : ''}${attemptedToolName ? `(${attemptedToolName})` : ''}`
    },
    12,
  )
  if (activationRecords) lines.push(`dev_tool_surface_activation_records: ${activationRecords}`)
  const activatedCapabilities = summarizeStringList(source.devToolSurfaceActivatedCapabilities)
  if (activatedCapabilities) lines.push(`dev_tool_surface_activated_capabilities: ${activatedCapabilities}`)
  const blockedCapabilities = summarizeStringList(source.devToolSurfaceBlockedCapabilities)
  if (blockedCapabilities) lines.push(`dev_tool_surface_blocked_capabilities: ${blockedCapabilities}`)
  const includedTools = summarizeStringList(source.devToolSurfaceActivationIncludedTools)
  if (includedTools) lines.push(`dev_tool_surface_activation_included_tools: ${includedTools}`)
  const blockedReasons = summarizeCountMap(source.devToolSurfaceBlockedReasonCounts)
  if (blockedReasons) lines.push(`dev_tool_surface_blocked_reasons: ${blockedReasons}`)
  const catalogOperationCounts = summarizeCountMap(source.devToolSurfaceCatalogOperationCounts)
  if (catalogOperationCounts) lines.push(`dev_tool_surface_catalog_operation_counts: ${catalogOperationCounts}`)
  const catalogOperations = summarizeObjectRows(
    source.devToolSurfaceCatalogOperations,
    (row) => {
      const operation = String(row.operation || '').trim()
      const path = String(row.path || '').trim()
      if (!operation || !path) return ''
      const matches = Number(row.matchCount || 0) || 0
      return `${operation}:${path}${matches > 0 ? `(${matches})` : ''}`
    },
  )
  if (catalogOperations) lines.push(`dev_tool_surface_catalog_operations: ${catalogOperations}`)
  if (Number(source.toolSurfaceHiddenKnownRecoveryCount || 0) > 0) {
    lines.push(
      `dev_tool_surface_hidden_known_recovery: total=${Number(source.toolSurfaceHiddenKnownRecoveryCount || 0) || 0}, blocked=${Number(source.toolSurfaceHiddenKnownRecoveryBlockedCount || 0) || 0}`,
    )
  }
  const recoveryCapabilities = summarizeCountMap(source.toolSurfaceHiddenKnownRecoveryCapabilities)
  if (recoveryCapabilities) lines.push(`dev_tool_surface_hidden_known_recovery_capabilities: ${recoveryCapabilities}`)
  const hiddenKnownRecoveries = summarizeObjectRows(
    source.devToolSurfaceHiddenKnownRecoveries,
    (row) => {
      const toolName = String(row.attemptedToolName || '').trim()
      const capabilityId = String(row.capabilityId || '').trim()
      if (!toolName || !capabilityId) return ''
      return `${toolName}:${capabilityId}${row.blockedForTurn === true ? ':blocked' : ''}`
    },
  )
  if (hiddenKnownRecoveries) lines.push(`dev_tool_surface_hidden_known_recoveries: ${hiddenKnownRecoveries}`)
  return lines
}

function summarizeToolReasonList(values = [], maxItems = 12) {
  const source = Array.isArray(values) ? values : []
  const out = []
  const seen = new Set()
  for (const row of source) {
    if (out.length >= maxItems) break
    if (!row || typeof row !== 'object') continue
    const toolName = String(row.toolName || row.toolId || '').trim()
    const reason = String(row.reason || '').trim()
    if (!toolName || !reason) continue
    const key = `${toolName.toLowerCase()}::${reason.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(`${toolName}:${reason}`)
  }
  return out.join(', ')
}

function summarizeBudgetCategoryEstimates(values = {}, maxItems = 8) {
  if (!values || typeof values !== 'object') return ''
  return Object.entries(values)
    .map(([key, value]) => [String(key || '').trim(), Number(value || 0) || 0])
    .filter(([key, value]) => key && value > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxItems)
    .map(([key, value]) => `${key}=${Math.round(value)}`)
    .join(', ')
}

function summarizeBudgetContributors(values = [], maxItems = 3) {
  const rows = Array.isArray(values) ? values : []
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return ''
      const category = String(row.category || '').trim()
      const tokens = Number(row.tokens || 0) || 0
      if (!category || tokens <= 0) return ''
      return `${category}=${Math.round(tokens)}`
    })
    .filter(Boolean)
    .slice(0, maxItems)
    .join(', ')
}

function summarizeLaneMap(values = {}) {
  const source = values && typeof values === 'object' ? values : {}
  const ordered = ['thread', 'project', 'global']
    .map((key) => [key, Number(source[key] || 0) || 0])
    .filter(([, value]) => value > 0)
  if (ordered.length === 0) return ''
  return ordered.map(([key, value]) => `${key}=${Math.round(value)}`).join(', ')
}

function resolveAdaptiveBudgetState(source = {}) {
  return {
    promptBudgetProfileFamily: String(source.promptBudgetProfileFamily || '').trim().toLowerCase(),
    adaptiveBudgetSource: String(source.adaptiveBudgetSource || '').trim().toLowerCase(),
    adaptiveBudgetConfidence: String(source.adaptiveBudgetConfidence || '').trim().toLowerCase(),
    adaptiveBudgetResolutionSource: String(source.adaptiveBudgetResolutionSource || '').trim().toLowerCase(),
    adaptiveBudgetResolutionReason: String(
      source.adaptiveBudgetResolutionReasonOverride
      || source.adaptiveBudgetResolutionReason
      || ''
    ).trim().toLowerCase(),
    adaptiveBudgetScope: String(source.adaptiveBudgetScope || '').trim().toLowerCase(),
    adaptiveBudgetCapacityTier: String(source.adaptiveBudgetCapacityTier || '').trim().toLowerCase(),
    adaptiveBudgetObservedInputTpm: Number(source.adaptiveBudgetObservedInputTpm || 0) || 0,
    adaptiveBudgetObservedOutputTpm: Number(source.adaptiveBudgetObservedOutputTpm || 0) || 0,
    adaptiveBudgetObservedRpm: Number(source.adaptiveBudgetObservedRpm || 0) || 0,
    adaptiveBudgetLastObservedAt: Number(source.adaptiveBudgetLastObservedAt || 0) || 0,
    adaptiveBudgetResolvedCeilingTokens: typeof source.adaptiveBudgetResolvedCeilingTokens === 'number'
      ? Number(source.adaptiveBudgetResolvedCeilingTokens || 0)
      : 0,
    adaptiveBudgetResolvedExplorationMode: String(source.adaptiveBudgetResolvedExplorationMode || '').trim().toLowerCase(),
    adaptiveBudgetRuntimeOverrideApplied: source.adaptiveBudgetRuntimeOverrideApplied === true,
    adaptiveBudgetRuntimeOverrideSource: String(source.adaptiveBudgetRuntimeOverrideSource || '').trim().toLowerCase(),
    adaptiveBudgetRuntimeOverrideCeilingTokens: Number(source.adaptiveBudgetRuntimeOverrideCeilingTokens || 0) || 0,
    adaptiveBudgetRuntimeOverrideExplorationMode: String(source.adaptiveBudgetRuntimeOverrideExplorationMode || '').trim().toLowerCase(),
  }
}

function hasWriteIntentWithoutMutation(source = {}) {
  const mode = String(source.mode || '').trim().toLowerCase()
  const writeIntentDetected = source.toolWorkflowWriteIntentDetected === true
  const successfulMutationCount = Number(source.toolWorkflowSuccessfulMutationCount || 0) || 0
  const toolCallCount = Number(source.toolCallCount || 0) || 0
  return mode === 'execute' && writeIntentDetected && successfulMutationCount <= 0 && toolCallCount > 0
}

function buildWriteIntentWithoutMutationReason(source = {}) {
  if (!hasWriteIntentWithoutMutation(source)) return ''
  const terminalState = String(source.toolWorkflowTerminalState || '').trim().toLowerCase()
  if (terminalState === 'cancelled') return 'No file changes were applied before the turn was stopped.'
  if (terminalState === 'stale') return 'The turn went stale before any file changes were applied.'
  if (terminalState === 'completed') return 'The turn finished without applying any file changes.'
  return 'The turn ended without applying any file changes.'
}

export function applyAdaptiveBudgetDiagnosticsState(diagnostics = {}) {
  const source = diagnostics && typeof diagnostics === 'object' ? diagnostics : null
  if (!source) return diagnostics
  const overrideReason = String(source.adaptiveBudgetResolutionReasonOverride || '').trim().toLowerCase()
  if (
    overrideReason
    && String(source.promptBudgetProfileFamily || '').trim().toLowerCase() === 'anthropic'
  ) {
    source.adaptiveBudgetResolutionReason = overrideReason
  }
  return source
}

function resolveAdaptiveBudgetDiagnosticContext(source = {}) {
  const state = resolveAdaptiveBudgetState(source)
  const cleanupDeletedCount = Number(source.adaptiveBudgetCleanupDeletedCount || 0) || 0
  const degradedReason = ADAPTIVE_BUDGET_DEGRADED_REASONS.has(state.adaptiveBudgetResolutionReason)
    ? state.adaptiveBudgetResolutionReason
    : ''
  return {
    state,
    cleanupDeletedCount,
    degradedReason,
    degraded: !!degradedReason,
  }
}

function buildAdaptiveBudgetRuntimeDiagnosticLines(source = {}) {
  const context = resolveAdaptiveBudgetDiagnosticContext(source)
  const { state } = context
  const lines = []
  if (state.adaptiveBudgetSource) lines.push(`adaptive_budget_source: ${state.adaptiveBudgetSource}`)
  if (state.adaptiveBudgetConfidence) lines.push(`adaptive_budget_confidence: ${state.adaptiveBudgetConfidence}`)
  if (state.adaptiveBudgetResolutionSource) lines.push(`adaptive_budget_resolution_source: ${state.adaptiveBudgetResolutionSource}`)
  if (state.adaptiveBudgetResolutionReason) lines.push(`adaptive_budget_resolution_reason: ${state.adaptiveBudgetResolutionReason}`)
  if (state.adaptiveBudgetScope) lines.push(`adaptive_budget_scope: ${state.adaptiveBudgetScope}`)
  if (state.adaptiveBudgetCapacityTier) lines.push(`adaptive_budget_capacity_tier: ${state.adaptiveBudgetCapacityTier}`)
  const adaptiveBudgetObservedCapacity = [
    state.adaptiveBudgetObservedInputTpm > 0 ? `input_tpm=${state.adaptiveBudgetObservedInputTpm}` : '',
    state.adaptiveBudgetObservedOutputTpm > 0 ? `output_tpm=${state.adaptiveBudgetObservedOutputTpm}` : '',
    state.adaptiveBudgetObservedRpm > 0 ? `rpm=${state.adaptiveBudgetObservedRpm}` : '',
  ].filter(Boolean).join(', ')
  if (adaptiveBudgetObservedCapacity) lines.push(`adaptive_budget_observed_capacity: ${adaptiveBudgetObservedCapacity}`)
  if (state.adaptiveBudgetLastObservedAt > 0) {
    lines.push(`adaptive_budget_last_observed_at: ${state.adaptiveBudgetLastObservedAt}`)
  }
  if (state.adaptiveBudgetResolvedCeilingTokens > 0) {
    lines.push(`adaptive_budget_resolved_ceiling_tokens: ${state.adaptiveBudgetResolvedCeilingTokens}`)
  } else if (source.promptBudgetHardGuardEnabled === false && state.adaptiveBudgetSource) {
    lines.push('adaptive_budget_resolved_ceiling_tokens: disabled')
  }
  if (state.adaptiveBudgetResolvedExplorationMode) {
    lines.push(`adaptive_budget_resolved_exploration_mode: ${state.adaptiveBudgetResolvedExplorationMode}`)
  }
  if (context.degradedReason) {
    lines.push(`adaptive_budget_health: degraded (${context.degradedReason})`)
  } else if (context.cleanupDeletedCount > 0) {
    lines.push('adaptive_budget_health: cleanup_applied')
  } else if (
    state.adaptiveBudgetSource
    || state.adaptiveBudgetResolvedExplorationMode
    || state.adaptiveBudgetResolutionSource
  ) {
    lines.push('adaptive_budget_health: nominal')
  }
  if (context.cleanupDeletedCount > 0) {
    lines.push(`adaptive_budget_cleanup_deleted_profiles: ${context.cleanupDeletedCount}`)
  }
  if (state.adaptiveBudgetRuntimeOverrideApplied === true) {
    const adaptiveBudgetRuntimeOverride = [
      state.adaptiveBudgetRuntimeOverrideSource ? `source=${state.adaptiveBudgetRuntimeOverrideSource}` : '',
      state.adaptiveBudgetRuntimeOverrideCeilingTokens > 0
        ? `ceiling_tokens=${state.adaptiveBudgetRuntimeOverrideCeilingTokens}`
        : '',
      state.adaptiveBudgetRuntimeOverrideExplorationMode
        ? `exploration_mode=${state.adaptiveBudgetRuntimeOverrideExplorationMode}`
        : '',
    ].filter(Boolean).join(', ')
    lines.push(`adaptive_budget_runtime_override: ${adaptiveBudgetRuntimeOverride || 'applied'}`)
  }
  return lines
}

export function formatRuntimeDiagnosticsDetail(diagnostics = {}) {
  const source = diagnostics && typeof diagnostics === 'object' ? diagnostics : {}
  const lines = []
  const provider = String(source.providerId || '').trim().toLowerCase()
  const model = String(source.model || '').trim()
  if (provider || model) {
    lines.push(`provider_model: ${provider || 'unknown'}${model ? `/${model}` : ''}`)
  }
  const adapterSelection = String(source.adapterSelection || '').trim().toLowerCase()
  if (adapterSelection) {
    const adapterReason = String(source.adapterReason || '').trim()
    lines.push(`adapter_selection: ${adapterSelection}${adapterReason ? ` (${adapterReason})` : ''}`)
  }
  const adapterId = String(source.adapterId || '').trim()
  if (adapterId) lines.push(`adapter_id: ${adapterId}`)
  const availabilityState = String(source.availabilityState || '').trim().toLowerCase()
  const availabilitySelectionState = String(source.availabilitySelectionState || '').trim().toLowerCase()
  if (availabilityState || availabilitySelectionState) {
    lines.push(
      `availability: ${availabilityState || 'unknown'}${availabilitySelectionState ? ` (${availabilitySelectionState})` : ''}`,
    )
  }
  if (typeof source.availabilityRequiresKey === 'boolean') {
    lines.push(`availability_requires_key: ${source.availabilityRequiresKey ? 'true' : 'false'}`)
  }
  if (typeof source.availabilityConfigured === 'boolean') {
    lines.push(`availability_configured: ${source.availabilityConfigured ? 'true' : 'false'}`)
  }
  if (typeof source.availabilityVerified === 'boolean') {
    lines.push(`availability_verified: ${source.availabilityVerified ? 'true' : 'false'}`)
  }
  const availabilityGates = summarizeStringList(source.availabilityGates)
  if (availabilityGates) lines.push(`availability_gates: ${availabilityGates}`)
  const providerNativeRuntimeFamily = String(source.providerNativeRuntimeFamily || '').trim().toLowerCase()
  if (providerNativeRuntimeFamily) lines.push(`provider_native_runtime_family: ${providerNativeRuntimeFamily}`)
  const providerNativeRuntimeMode = String(source.providerNativeRuntimeMode || '').trim().toLowerCase()
  if (providerNativeRuntimeMode) lines.push(`provider_native_runtime_mode: ${providerNativeRuntimeMode}`)
  const authMethod = String(source.authMethod || '').trim().toLowerCase()
  if (authMethod) lines.push(`auth_method: ${authMethod}`)
  const accountRuntimeStatus = String(source.accountRuntimeStatus || '').trim().toLowerCase()
  if (authMethod === 'account' && accountRuntimeStatus) lines.push(`account_runtime_status: ${accountRuntimeStatus}`)
  const openAIAuthParityStatus = String(source.openAIAuthParityStatus || '').trim().toLowerCase()
  if (provider === 'openai' && authMethod === 'account' && openAIAuthParityStatus) {
    lines.push(`openai_auth_parity_status: ${openAIAuthParityStatus}`)
  }
  const openAIAuthParityCoreSummary = summarizeStringList(source.openAIAuthParityCoreSummary, 16)
  if (provider === 'openai' && authMethod === 'account' && openAIAuthParityCoreSummary) {
    lines.push(`openai_auth_parity_core: ${openAIAuthParityCoreSummary}`)
  }
  const openAIAuthParityExceptions = summarizeStringList(
    Array.isArray(source.openAIAuthParityExceptions)
      ? source.openAIAuthParityExceptions.map((row) => (
        row && typeof row === 'object'
          ? String(row.id || '').trim()
          : String(row || '').trim()
      ))
      : [],
  )
  if (provider === 'openai' && authMethod === 'account' && openAIAuthParityExceptions) {
    lines.push(`openai_auth_parity_exceptions: ${openAIAuthParityExceptions}`)
  }
  const openAIAuthParityMismatches = summarizeStringList(
    Array.isArray(source.openAIAuthParityMismatches)
      ? source.openAIAuthParityMismatches.map((row) => {
        if (!row || typeof row !== 'object') return ''
        const capabilityId = String(row.capabilityId || '').trim()
        const apiKeySupported = row.apiKeySupported === true ? 'true' : 'false'
        const accountSupported = row.accountSupported === true ? 'true' : 'false'
        const accountStatusValue = String(row.accountStatus || '').trim().toLowerCase()
        if (!capabilityId) return ''
        return `${capabilityId}(api=${apiKeySupported},account=${accountSupported}${accountStatusValue ? `,status=${accountStatusValue}` : ''})`
      })
      : [],
    12,
  )
  if (provider === 'openai' && authMethod === 'account' && openAIAuthParityMismatches) {
    lines.push(`openai_auth_parity_mismatches: ${openAIAuthParityMismatches}`)
  }
  lines.push(...buildCompactionDiagnosticLines(source))
  if (typeof source.accountAutoCompactionEnabled === 'boolean') {
    lines.push(`account_auto_compaction_enabled: ${source.accountAutoCompactionEnabled ? 'true' : 'false'}`)
  }
  if (Number(source.accountAutoCompactionTokenLimit || 0) > 0) {
    lines.push(`account_auto_compaction_token_limit: ${Number(source.accountAutoCompactionTokenLimit || 0)}`)
  }
  if (typeof source.accountAutoCompactionPromptConfigured === 'boolean') {
    lines.push(`account_auto_compaction_prompt_configured: ${source.accountAutoCompactionPromptConfigured ? 'true' : 'false'}`)
  }
  const wireApi = String(source.wireApi || '').trim()
  if (wireApi) lines.push(`wire_api: ${wireApi}`)
  const toolSurfaceKind = String(source.toolSurfaceKind || '').trim().toLowerCase()
  if (toolSurfaceKind) lines.push(`tool_surface_kind: ${toolSurfaceKind}`)
  const toolSurfaceComponents = summarizeStringList(source.toolSurfaceComponents)
  if (toolSurfaceComponents) lines.push(`tool_surface_components: ${toolSurfaceComponents}`)
  const promptBudgetProfileId = String(source.promptBudgetProfileId || '').trim()
  if (promptBudgetProfileId) lines.push(`prompt_budget_profile: ${promptBudgetProfileId}`)
  const promptBudgetProfileFamily = String(source.promptBudgetProfileFamily || '').trim().toLowerCase()
  if (promptBudgetProfileFamily) lines.push(`prompt_budget_family: ${promptBudgetProfileFamily}`)
  const promptBudgetStrictness = String(source.promptBudgetStrictness || '').trim().toLowerCase()
  if (promptBudgetStrictness) lines.push(`prompt_budget_strictness: ${promptBudgetStrictness}`)
  if (typeof source.promptBudgetHardGuardEnabled === 'boolean') {
    lines.push(`prompt_preflight_hard_guard_enabled: ${source.promptBudgetHardGuardEnabled ? 'true' : 'false'}`)
  }
  if (typeof source.promptBudgetResolvedCeilingTokens === 'number' && source.promptBudgetResolvedCeilingTokens > 0) {
    lines.push(`prompt_budget_resolved_ceiling_tokens: ${Number(source.promptBudgetResolvedCeilingTokens || 0)}`)
  } else if (source.promptBudgetHardGuardEnabled === false) {
    lines.push('prompt_budget_resolved_ceiling_tokens: disabled')
  }
  lines.push(...buildAdaptiveBudgetRuntimeDiagnosticLines(source))
  if (Number(source.memoryContextNodeCount || 0) > 0) {
    lines.push(`memory_context_node_count: ${Number(source.memoryContextNodeCount || 0)}`)
  }
  if (Number(source.memoryContextEstimatedTokens || 0) > 0) {
    lines.push(`memory_context_estimated_tokens: ${Number(source.memoryContextEstimatedTokens || 0)}`)
  }
  const memoryContextLaneCounts = summarizeLaneMap(source.memoryContextLaneCounts)
  if (memoryContextLaneCounts) {
    lines.push(`memory_context_lane_counts: ${memoryContextLaneCounts}`)
  }
  const memoryContextLaneEstimatedTokens = summarizeLaneMap(source.memoryContextLaneEstimatedTokens)
  if (memoryContextLaneEstimatedTokens) {
    lines.push(`memory_context_lane_estimated_tokens: ${memoryContextLaneEstimatedTokens}`)
  }
  const memoryContextPromotionCounts = summarizeLaneMap(source.memoryContextPromotionCounts)
  if (memoryContextPromotionCounts) {
    lines.push(`memory_context_promoted_lane_counts: ${memoryContextPromotionCounts}`)
  }
  if (Number(source.continuityPacketTokens || 0) > 0) {
    lines.push(`continuity_packet_tokens: ${Number(source.continuityPacketTokens || 0)}`)
  }
  if (source.memoryContextBudgetReductionApplied === true) {
    const reasons = summarizeStringList(source.memoryContextBudgetReductionReasons)
    lines.push(`memory_context_budget_reduction: ${reasons || 'applied'}`)
  }
  if (source.continuityPacketBudgetReductionApplied === true) {
    const reasons = summarizeStringList(source.continuityPacketBudgetReductionReasons)
    lines.push(`continuity_packet_budget_reduction: ${reasons || 'applied'}`)
  }
  if (source.promptBudgetHardLimitExceeded === true) {
    lines.push('prompt_budget_hard_limit_exceeded: true')
  }
  if (Number(source.promptBudgetHardLimitTokens || 0) > 0) {
    lines.push(`prompt_budget_hard_limit_tokens: ${Number(source.promptBudgetHardLimitTokens || 0)}`)
  }
  const preflightBudgetAction = String(source.preflightBudgetAction || '').trim().toLowerCase()
  if (preflightBudgetAction && preflightBudgetAction !== 'none') {
    lines.push(`preflight_budget_action: ${preflightBudgetAction}`)
  }
  const budgetCategories = summarizeBudgetCategoryEstimates(source.promptBudgetCategoryEstimates)
  if (budgetCategories && (
    source.promptBudgetHardLimitExceeded === true
    || (preflightBudgetAction && preflightBudgetAction !== 'none')
    || Number(source.toolResultHistoryPrunedCount || 0) > 0
  )) {
    lines.push(`prompt_budget_categories: ${budgetCategories}`)
  }
  const budgetDominantContributors = summarizeBudgetContributors(source.promptBudgetDominantContributors)
  if (budgetDominantContributors && (
    source.promptBudgetHardLimitExceeded === true
    || (preflightBudgetAction && preflightBudgetAction !== 'none')
    || Number(source.toolResultHistoryPrunedCount || 0) > 0
  )) {
    lines.push(`prompt_budget_dominant_contributors: ${budgetDominantContributors}`)
  }
  if (Number(source.toolResultHistoryPrunedCount || 0) > 0) {
    lines.push(`tool_result_history_pruned_count: ${Number(source.toolResultHistoryPrunedCount || 0)}`)
  }
  if (Number(source.toolResultHistoryPrunedChars || 0) > 0) {
    lines.push(`tool_result_history_pruned_chars: ${Number(source.toolResultHistoryPrunedChars || 0)}`)
  }
  if (Number(source.toolResultHistoryEstimatedSavedTokens || 0) > 0) {
    lines.push(`tool_result_history_estimated_saved_tokens: ${Number(source.toolResultHistoryEstimatedSavedTokens || 0)}`)
  }
  if (Number(source.toolResultHistoryProtectedCriticalCount || 0) > 0) {
    lines.push(`tool_result_history_protected_critical_count: ${Number(source.toolResultHistoryProtectedCriticalCount || 0)}`)
  }
  if (Number(source.toolResultSpilloverPersistedCount || 0) > 0) {
    lines.push(`tool_result_spillover_persisted_count: ${Number(source.toolResultSpilloverPersistedCount || 0)}`)
  }
  if (Number(source.toolResultSpilloverCleanupAppliedCount || 0) > 0) {
    lines.push(`tool_result_spillover_cleanup_applied_count: ${Number(source.toolResultSpilloverCleanupAppliedCount || 0)}`)
  }
  if (Number(source.toolResultSpilloverCleanupDeletedFileCount || 0) > 0) {
    lines.push(`tool_result_spillover_cleanup_deleted_files: ${Number(source.toolResultSpilloverCleanupDeletedFileCount || 0)}`)
  }
  if (Number(source.toolResultSpilloverCleanupDeletedBytes || 0) > 0) {
    lines.push(`tool_result_spillover_cleanup_deleted_bytes: ${Number(source.toolResultSpilloverCleanupDeletedBytes || 0)}`)
  }
  if (Number(source.toolResultSpilloverWriteFailureCount || 0) > 0) {
    lines.push(`tool_result_spillover_write_failures: ${Number(source.toolResultSpilloverWriteFailureCount || 0)}`)
  }
  if (Number(source.toolResultSpilloverCleanupFailureCount || 0) > 0) {
    lines.push(`tool_result_spillover_cleanup_failures: ${Number(source.toolResultSpilloverCleanupFailureCount || 0)}`)
  }
  const toolResultSpilloverLastPersistenceState = String(source.toolResultSpilloverLastPersistenceState || '').trim().toLowerCase()
  if (toolResultSpilloverLastPersistenceState) {
    lines.push(`tool_result_spillover_last_persistence_state: ${toolResultSpilloverLastPersistenceState}`)
  }
  const toolResultSpilloverLastCleanupState = String(source.toolResultSpilloverLastCleanupState || '').trim().toLowerCase()
  if (toolResultSpilloverLastCleanupState) {
    lines.push(`tool_result_spillover_last_cleanup_state: ${toolResultSpilloverLastCleanupState}`)
  }
  const toolResultSpilloverFailureReasons = summarizeCountMap(source.toolResultSpilloverFailureReasonCounts)
  if (toolResultSpilloverFailureReasons) {
    lines.push(`tool_result_spillover_failure_reasons: ${toolResultSpilloverFailureReasons}`)
  }
  const toolSurfaceBudgetProfile = String(source.toolSurfaceBudgetProfile || '').trim()
  if (toolSurfaceBudgetProfile) lines.push(`tool_surface_budget_profile: ${toolSurfaceBudgetProfile}`)
  if (Number(source.toolSurfaceVisibleCount || 0) > 0) {
    lines.push(`tool_surface_visible_count: ${Number(source.toolSurfaceVisibleCount || 0)}`)
  }
  const toolSurfaceHiddenFamilies = summarizeStringList(source.toolSurfaceHiddenFamilies)
  if (toolSurfaceHiddenFamilies) lines.push(`tool_surface_hidden_families: ${toolSurfaceHiddenFamilies}`)
  lines.push(...buildDevToolSurfaceDiagnosticLines(source))
  const delegationBackend = String(source.delegationBackend || '').trim().toLowerCase()
  if (delegationBackend) lines.push(`delegation_backend: ${delegationBackend}`)
  const delegationBackends = summarizeStringList(source.availableDelegationBackends)
  if (delegationBackends) lines.push(`delegation_backends_available: ${delegationBackends}`)
  const delegationBackendPreference = String(source.delegationBackendPreference || '').trim().toLowerCase()
  if (delegationBackendPreference) lines.push(`delegation_backend_preference: ${delegationBackendPreference}`)
  const delegationBackendReason = String(source.delegationBackendReason || '').trim().toLowerCase()
  if (delegationBackendReason) lines.push(`delegation_backend_reason: ${delegationBackendReason}`)
  const nativeCollaborationModeId = String(source.nativeCollaborationModeId || '').trim()
  if (nativeCollaborationModeId) lines.push(`native_collaboration_mode_id: ${nativeCollaborationModeId}`)
  const toolReliabilityProfileId = String(source.toolReliabilityProfileId || '').trim().toLowerCase()
  if (toolReliabilityProfileId) lines.push(`tool_reliability_profile: ${toolReliabilityProfileId}`)
  const toolReliabilityTier = String(source.toolReliabilityTier || '').trim().toLowerCase()
  if (toolReliabilityTier) lines.push(`tool_reliability_tier: ${toolReliabilityTier}`)
  const toolShadowIntent = String(source.toolShadowIntent || '').trim().toLowerCase()
  if (toolShadowIntent) lines.push(`tool_shadow_intent: ${toolShadowIntent}`)
  const toolShadowIntentConfidence = String(source.toolShadowIntentConfidence || '').trim().toLowerCase()
  if (toolShadowIntentConfidence) lines.push(`tool_shadow_intent_confidence: ${toolShadowIntentConfidence}`)
  const supportedTools = summarizeStringList(source.supportedTools)
  if (supportedTools) lines.push(`supported_tools: ${supportedTools}`)
  const defaultEnabledTools = summarizeStringList(source.defaultEnabledTools)
  if (defaultEnabledTools) lines.push(`default_enabled_tools: ${defaultEnabledTools}`)
  const usedTools = summarizeStringList(source.usedTools)
  if (usedTools) lines.push(`used_tools: ${usedTools}`)
  const excludedToolsWithReasons = summarizeToolReasonList(source.excludedToolsWithReasons)
  if (excludedToolsWithReasons) lines.push(`excluded_tools_with_reasons: ${excludedToolsWithReasons}`)
  if (source.mixedToolSurfaceDetected === true) lines.push('mixed_tool_surface_detected: true')
  const workspaceRoot = String(source.workspaceRoot || '').trim()
  if (workspaceRoot) lines.push(`workspace_root: ${workspaceRoot}`)
  const workspaceTrustSource = String(source.workspaceTrustSource || '').trim().toLowerCase()
  if (workspaceTrustSource) lines.push(`workspace_trust: ${workspaceTrustSource}`)
  const permissionMode = String(source.permissionMode || '').trim().toLowerCase()
  if (permissionMode) lines.push(`permission_mode: ${permissionMode}`)
  const persistedPermissionMode = String(source.persistedPermissionMode || '').trim().toLowerCase()
  if (persistedPermissionMode) lines.push(`persisted_permission_mode: ${persistedPermissionMode}`)
  if (typeof source.permissionModeInSync === 'boolean') {
    lines.push(`permission_mode_in_sync: ${source.permissionModeInSync ? 'true' : 'false'}`)
  }
  if (typeof source.modelSupportsTools === 'boolean') {
    const capabilitiesSource = String(source.modelCapabilitiesSource || '').trim()
    lines.push(
      `model_tool_support: ${source.modelSupportsTools ? 'true' : 'false'}${capabilitiesSource ? ` (${capabilitiesSource})` : ''}`,
    )
  }
  if (typeof source.modelSupportsAnyToolSurface === 'boolean') {
    lines.push(`model_any_tool_surface: ${source.modelSupportsAnyToolSurface ? 'true' : 'false'}`)
  }
  const modelToolSupportMode = String(source.modelToolSupportMode || '').trim().toLowerCase()
  if (modelToolSupportMode) lines.push(`model_tool_support_mode: ${modelToolSupportMode}`)
  const capabilityBlockReasons = summarizeStringList(source.capabilityBlockReasons)
  if (capabilityBlockReasons) lines.push(`capability_block_reasons: ${capabilityBlockReasons}`)
  const capabilityNotices = summarizeStringList(source.capabilityNotices)
  if (capabilityNotices) lines.push(`capability_notices: ${capabilityNotices}`)
  const guardrailFailures = summarizeStringList(source.guardrailFailures)
  if (guardrailFailures) lines.push(`guardrail_failures: ${guardrailFailures}`)
  const reresolutionReasons = summarizeStringList(source.surfacePolicyReresolution)
  if (reresolutionReasons) lines.push(`surface_policy_reresolution: ${reresolutionReasons}`)
  const requestedToolCount = Number(source.requestedToolCount || 0) || 0
  const activeToolCount = Number(source.activeToolCount || 0) || 0
  if (requestedToolCount > 0 || activeToolCount > 0) {
    lines.push(`tools_requested_active: ${requestedToolCount}/${activeToolCount}`)
  }
  if (source.toolWorkflowSurfaceNarrowed === true) {
    lines.push(`tool_workflow_surface_narrowed: true (${Number(source.toolWorkflowSuppressedToolCount || 0) || 0} suppressed)`)
  }
  const toolCallCount = Number(source.toolCallCount || 0) || 0
  lines.push(`tool_calls_emitted: ${toolCallCount}`)
  lines.push(...buildRuntimeEvidenceDiagnosticLines(source))
  if (Number(source.firstToolLatencyMs || 0) > 0) {
    lines.push(`first_tool_latency_ms: ${Math.max(0, Math.round(Number(source.firstToolLatencyMs) || 0))}`)
  }
  if (source.zeroToolExecuteTurn === true) lines.push('zero_tool_execute_turn: true')
  const approvalSummary = [
    `shown=${Number(source.approvalPromptCount || 0) || 0}`,
    `approved=${Number(source.approvalApprovedCount || 0) || 0}`,
    `denied=${Number(source.approvalDeniedCount || 0) || 0}`,
    `policy_blocked=${Number(source.approvalPolicyBlockedCount || 0) || 0}`,
    `user_denied=${Number(source.approvalUserDeniedCount || 0) || 0}`,
    `timeouts=${Number(source.approvalTimeoutCount || 0) || 0}`,
  ].join(', ')
  lines.push(`approval_summary: ${approvalSummary}`)
  const approvalAutoSources = summarizeCountMap(source.approvalAutoSources)
  if (approvalAutoSources) lines.push(`approval_auto_sources: ${approvalAutoSources}`)
  if (source.modelTextualApprovalWithoutToolCall === true) {
    lines.push('model_textual_approval_without_tool_call: true')
    if (Number(source.modelTextualApprovalCueCount || 0) > 0) {
      lines.push(`model_textual_approval_cue_count: ${Number(source.modelTextualApprovalCueCount || 0)}`)
    }
  }
  if (Number(source.riskyApprovalPromptCount || 0) > 0) {
    lines.push(`risky_approval_prompts: ${Number(source.riskyApprovalPromptCount || 0)}`)
  }
  const lintRejectCount = Number(source.toolWorkflowLintRejectCount || 0) || 0
  const lintWarnCount = Number(source.toolWorkflowLintWarnCount || 0) || 0
  const rerouteCount = Number(source.toolWorkflowRerouteCount || 0) || 0
  const wrongToolRetryCount = Number(source.toolWorkflowWrongToolRetryCount || 0) || 0
  if (lintRejectCount > 0 || lintWarnCount > 0 || rerouteCount > 0 || wrongToolRetryCount > 0) {
    lines.push(`tool_workflow_summary: lint_reject=${lintRejectCount}, lint_warn=${lintWarnCount}, reroute=${rerouteCount}, wrong_tool_retry=${wrongToolRetryCount}`)
  }
  const toolWorkflowFailureClasses = summarizeCountMap(source.toolWorkflowFailureClassCounts)
  if (toolWorkflowFailureClasses) lines.push(`tool_workflow_failure_classes: ${toolWorkflowFailureClasses}`)
  const toolWorkflowToolFailures = summarizeCountMap(source.toolWorkflowToolFailureCounts)
  if (toolWorkflowToolFailures) lines.push(`tool_workflow_tool_failures: ${toolWorkflowToolFailures}`)
  const toolWorkflowWriteToolFailures = summarizeCountMap(source.toolWorkflowWriteFailureCounts)
  if (toolWorkflowWriteToolFailures) lines.push(`tool_workflow_write_tool_failures: ${toolWorkflowWriteToolFailures}`)
  const toolWorkflowLintCodes = summarizeCountMap(source.toolWorkflowLintCodeCounts)
  if (toolWorkflowLintCodes) lines.push(`tool_workflow_lint_codes: ${toolWorkflowLintCodes}`)
  if (source.toolWorkflowWriteIntentDetected === true) lines.push('tool_workflow_write_intent: true')
  if (source.toolWorkflowWriteIntentDetected === true || Number(source.toolWorkflowSuccessfulMutationCount || 0) > 0) {
    lines.push(`tool_workflow_successful_mutations: ${Number(source.toolWorkflowSuccessfulMutationCount || 0) || 0}`)
  }
  if (hasWriteIntentWithoutMutation(source)) {
    lines.push('tool_workflow_write_intent_without_mutation: true')
    const toolWorkflowTerminalState = String(source.toolWorkflowTerminalState || '').trim().toLowerCase()
    if (toolWorkflowTerminalState) {
      lines.push(`tool_workflow_terminal_state: ${toolWorkflowTerminalState}`)
    }
    const toolWorkflowTerminalReason = buildWriteIntentWithoutMutationReason(source)
    if (toolWorkflowTerminalReason) {
      lines.push(`tool_workflow_terminal_reason: ${toolWorkflowTerminalReason}`)
    }
  }
  if (Number(source.toolWorkflowApplyPatchFailureCount || 0) > 0) {
    lines.push(`tool_workflow_apply_patch_failures: ${Number(source.toolWorkflowApplyPatchFailureCount || 0)}`)
  }
  if (Number(source.toolWorkflowApplyPatchRetryAllowedCount || 0) > 0) {
    lines.push(`tool_workflow_apply_patch_retry_allowed: ${Number(source.toolWorkflowApplyPatchRetryAllowedCount || 0)}`)
  }
  if (Number(source.toolWorkflowApplyPatchHardBlockCount || 0) > 0) {
    lines.push(`tool_workflow_apply_patch_hard_block: ${Number(source.toolWorkflowApplyPatchHardBlockCount || 0)}`)
  }
  if (Number(source.toolWorkflowRawDelegationExposureCount || 0) > 0) {
    lines.push(`tool_workflow_raw_delegation_exposure: ${Number(source.toolWorkflowRawDelegationExposureCount || 0)}`)
  }
  if (Number(source.toolWorkflowCompactDelegationOnlyExposureCount || 0) > 0) {
    lines.push(`tool_workflow_compact_delegation_only_exposure: ${Number(source.toolWorkflowCompactDelegationOnlyExposureCount || 0)}`)
  }
  if (Number(source.toolWorkflowFetchBrowserCoexposureCount || 0) > 0) {
    lines.push(`tool_workflow_fetch_browser_coexposure: ${Number(source.toolWorkflowFetchBrowserCoexposureCount || 0)}`)
  }
  if (Number(source.toolWorkflowFirstSuccessfulMutationLatencyMs || 0) > 0) {
    lines.push(`tool_workflow_first_successful_mutation_ms: ${Math.max(0, Math.round(Number(source.toolWorkflowFirstSuccessfulMutationLatencyMs) || 0))}`)
  }
  const shellFileChangeHydrationSummary = [
    `hydrated=${Number(source.shellFileChangeHydratedCount || 0) || 0}`,
    `suppressed=${Number(source.shellFileChangeSuppressedCount || 0) || 0}`,
    `non_file=${Number(source.shellFileChangeNonFileCount || 0) || 0}`,
  ].join(', ')
  if (
    Number(source.shellFileChangeHydratedCount || 0) > 0
    || Number(source.shellFileChangeSuppressedCount || 0) > 0
    || Number(source.shellFileChangeNonFileCount || 0) > 0
  ) {
    lines.push(`shell_file_change_hydration: ${shellFileChangeHydrationSummary}`)
  }
  const shellFileChangeSuppressionReasons = summarizeCountMap(source.shellFileChangeSuppressionReasonCounts)
  if (shellFileChangeSuppressionReasons) {
    lines.push(`shell_file_change_suppression_reasons: ${shellFileChangeSuppressionReasons}`)
  }
  const surfaceResolutionFailure = String(source.surfaceResolutionFailure || '').trim()
  if (surfaceResolutionFailure) lines.push(`surface_resolution_failure: ${surfaceResolutionFailure}`)
  return lines.join('\n')
}
