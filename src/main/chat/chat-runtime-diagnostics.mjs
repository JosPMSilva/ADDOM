import path from 'node:path'
import { isSupportedOpenAIHostedToolId } from '../../common/api-clients/openai-hosted-tool-catalog.mjs'
import { formatRuntimeDiagnosticsDetail } from './chat-runtime-diagnostics-detail.mjs'
import { isOpenAILocalRuntimeToolName } from '../api-clients/openai-local-runtime-tools.mjs'

const OPENAI_DYNAMIC_HOSTED_TOOL_PATTERN = /^mcp_/i
const ADAPTIVE_BUDGET_DEGRADED_REASONS = new Set([
  'stale_observation',
  'expired_observation',
  'invalid_observation',
])
const TOOL_WORKFLOW_WRITE_TOOL_NAMES = new Set([
  'write_file',
  'edit_file',
  'apply_patch',
  'rename_file',
  'delete_file',
  'create_directory',
  'rollback_file',
  'apply_artifact_revision',
])

function incrementCount(target = {}, key = '') {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey) return
  target[normalizedKey] = (Number(target[normalizedKey] || 0) || 0) + 1
}

function normalizeTerminalState(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeWorkspaceRoot(projectFolder = '') {
  const raw = String(projectFolder || '').trim()
  if (!raw) return ''
  try {
    return path.resolve(raw)
  } catch {
    return raw
  }
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

function classifyToolSurfaceComponent(toolName = '') {
  const name = String(toolName || '').trim().toLowerCase()
  if (!name) return ''
  if (isOpenAILocalRuntimeToolName(name)) return 'openai_local_runtime'
  if (isSupportedOpenAIHostedToolId(name) || OPENAI_DYNAMIC_HOSTED_TOOL_PATTERN.test(name)) {
    return 'openai_hosted'
  }
  return 'addom_native'
}

export function classifyToolWorkflowFamily(toolName = '') {
  const name = String(toolName || '').trim().toLowerCase()
  if (!name) return ''
  if ([
    'read_file',
    'view_file_range',
    'grep_file',
    'search_code',
    'find_files',
    'list_directory',
    'write_file',
    'edit_file',
    'apply_patch',
    'rename_file',
    'delete_file',
    'create_directory',
    'rollback_file',
    'apply_artifact_revision',
  ].includes(name)) return 'file'
  if (name === 'run_command' || name === 'local_shell') return 'shell'
  if (name === 'fetch_page') return 'web_fetch'
  if (name === 'browser_action') return 'browser'
  if (name === 'delegate_to_agents' || name === 'delegate_tasks') return 'delegation'
  return 'other'
}

export function recordToolWorkflowLintEvent(errorDiagnostics = {}, {
  toolName = '',
  lintResult = null,
} = {}) {
  const diagnostics = errorDiagnostics && typeof errorDiagnostics === 'object' ? errorDiagnostics : null
  if (!diagnostics || !lintResult || typeof lintResult !== 'object') return
  const decision = String(lintResult.decision || '').trim().toLowerCase()
  const lintCode = String(lintResult.lintCode || '').trim()
  const failureClass = String(lintResult.failureClass || '').trim()
  const toolFamily = classifyToolWorkflowFamily(toolName)
  if (decision === 'reject') diagnostics.toolWorkflowLintRejectCount = Number(diagnostics.toolWorkflowLintRejectCount || 0) + 1
  if (decision === 'warn') diagnostics.toolWorkflowLintWarnCount = Number(diagnostics.toolWorkflowLintWarnCount || 0) + 1
  if (lintCode) incrementCount(diagnostics.toolWorkflowLintCodeCounts, lintCode)
  if (failureClass) incrementCount(diagnostics.toolWorkflowFailureClassCounts, failureClass)
  if (toolFamily) incrementCount(diagnostics.toolWorkflowFamilyCounts, toolFamily)
}

export function recordToolWorkflowOutcome(errorDiagnostics = {}, {
  toolName = '',
  decision = '',
  isError = false,
  failureClass = '',
  rerouteToolName = '',
  writeArtifactChanges = [],
  shellWriteDiagnostics = null,
  turnStartedAt = 0,
  finishedAt = 0,
  repeatedBlockedRetry = false,
} = {}) {
  const diagnostics = errorDiagnostics && typeof errorDiagnostics === 'object' ? errorDiagnostics : null
  if (!diagnostics) return
  const normalizedToolName = String(toolName || '').trim().toLowerCase()
  const normalizedDecision = String(decision || '').trim().toLowerCase()
  const normalizedFailureClass = String(failureClass || '').trim()
  const normalizedRerouteToolName = String(rerouteToolName || '').trim().toLowerCase()
  const toolFamily = classifyToolWorkflowFamily(normalizedToolName)
  if (toolFamily) incrementCount(diagnostics.toolWorkflowFamilyCounts, toolFamily)
  if (normalizedToolName) incrementCount(diagnostics.toolWorkflowToolAttemptCounts, normalizedToolName)
  if (normalizedFailureClass) incrementCount(diagnostics.toolWorkflowFailureClassCounts, normalizedFailureClass)
  if (isError === true && normalizedToolName) incrementCount(diagnostics.toolWorkflowToolFailureCounts, normalizedToolName)
  if (isError === true && TOOL_WORKFLOW_WRITE_TOOL_NAMES.has(normalizedToolName)) {
    incrementCount(diagnostics.toolWorkflowWriteFailureCounts, normalizedToolName)
  }
  if (isError === true && normalizedToolName === 'apply_patch') {
    diagnostics.toolWorkflowApplyPatchFailureCount = Number(diagnostics.toolWorkflowApplyPatchFailureCount || 0) + 1
  }
  if (normalizedRerouteToolName) diagnostics.toolWorkflowRerouteCount = Number(diagnostics.toolWorkflowRerouteCount || 0) + 1
  if (repeatedBlockedRetry === true) diagnostics.toolWorkflowWrongToolRetryCount = Number(diagnostics.toolWorkflowWrongToolRetryCount || 0) + 1
  if (TOOL_WORKFLOW_WRITE_TOOL_NAMES.has(normalizedToolName)) diagnostics.toolWorkflowWriteIntentDetected = true
  if ((normalizedToolName === 'run_command' || normalizedToolName === 'local_shell') && shellWriteDiagnostics && typeof shellWriteDiagnostics === 'object') {
    if (!diagnostics.shellFileChangeSuppressionReasonCounts || typeof diagnostics.shellFileChangeSuppressionReasonCounts !== 'object') {
      diagnostics.shellFileChangeSuppressionReasonCounts = {}
    }
    const shellHydrationStatus = String(shellWriteDiagnostics.status || '').trim().toLowerCase()
    if (shellHydrationStatus === 'hydrated') {
      diagnostics.shellFileChangeHydratedCount = Number(diagnostics.shellFileChangeHydratedCount || 0) + 1
    } else if (shellHydrationStatus === 'suppressed') {
      diagnostics.shellFileChangeSuppressedCount = Number(diagnostics.shellFileChangeSuppressedCount || 0) + 1
    } else if (shellHydrationStatus === 'non_file' || shellHydrationStatus === 'no_write') {
      diagnostics.shellFileChangeNonFileCount = Number(diagnostics.shellFileChangeNonFileCount || 0) + 1
    }
    for (const reasonCode of Array.isArray(shellWriteDiagnostics.reasonCodes) ? shellWriteDiagnostics.reasonCodes : []) {
      incrementCount(diagnostics.shellFileChangeSuppressionReasonCounts, reasonCode)
    }
  }
  const wroteArtifacts = Array.isArray(writeArtifactChanges) && writeArtifactChanges.some((row) => row && typeof row === 'object' && String(row.filePath || '').trim())
  const successfulMutation = normalizedDecision === 'approved'
    && isError !== true
    && (TOOL_WORKFLOW_WRITE_TOOL_NAMES.has(normalizedToolName) || wroteArtifacts)
  if (!successfulMutation) return
  diagnostics.toolWorkflowSuccessfulMutationCount = Number(diagnostics.toolWorkflowSuccessfulMutationCount || 0) + 1
  if (Number(diagnostics.toolWorkflowFirstSuccessfulMutationLatencyMs || 0) > 0) return
  const started = Number(turnStartedAt || 0) || 0
  const finished = Number(finishedAt || 0) || 0
  if (started > 0 && finished >= started) {
    diagnostics.toolWorkflowFirstSuccessfulMutationLatencyMs = Math.max(0, finished - started)
  } else {
    diagnostics.toolWorkflowFirstSuccessfulMutationLatencyMs = 1
  }
}

export function recordToolResultSpilloverOutcome(errorDiagnostics = {}, toolResultBudget = null) {
  const diagnostics = errorDiagnostics && typeof errorDiagnostics === 'object' ? errorDiagnostics : null
  const source = toolResultBudget && typeof toolResultBudget === 'object' ? toolResultBudget : null
  if (!diagnostics || !source) return

  const persistence = String(source.persistence || '').trim().toLowerCase()
  const persistenceState = String(source.spilloverPersistenceState || '').trim().toLowerCase()
  const cleanupState = String(source.spilloverCleanupState || '').trim().toLowerCase()
  const deletedFileCount = Number(source.spilloverCleanupDeletedFileCount || 0) || 0
  const deletedBytes = Number(source.spilloverCleanupDeletedBytes || 0) || 0
  const degraded = (
    source.spilloverDegraded === true
    || persistenceState === 'write_failed'
    || cleanupState === 'failed'
    || cleanupState === 'pruned_with_failures'
  )

  if (persistence === 'enabled') {
    diagnostics.toolResultSpilloverPersistedCount = Number(diagnostics.toolResultSpilloverPersistedCount || 0) + 1
  }
  if (deletedFileCount > 0) {
    diagnostics.toolResultSpilloverCleanupDeletedFileCount = Number(
      diagnostics.toolResultSpilloverCleanupDeletedFileCount || 0,
    ) + deletedFileCount
  }
  if (deletedBytes > 0) {
    diagnostics.toolResultSpilloverCleanupDeletedBytes = Number(
      diagnostics.toolResultSpilloverCleanupDeletedBytes || 0,
    ) + deletedBytes
  }
  if (cleanupState.startsWith('pruned')) {
    diagnostics.toolResultSpilloverCleanupAppliedCount = Number(
      diagnostics.toolResultSpilloverCleanupAppliedCount || 0,
    ) + 1
  }
  if (persistenceState === 'write_failed') {
    diagnostics.toolResultSpilloverWriteFailureCount = Number(
      diagnostics.toolResultSpilloverWriteFailureCount || 0,
    ) + 1
  }
  if (cleanupState === 'failed' || cleanupState === 'pruned_with_failures') {
    diagnostics.toolResultSpilloverCleanupFailureCount = Number(
      diagnostics.toolResultSpilloverCleanupFailureCount || 0,
    ) + 1
  }
  if (degraded) diagnostics.toolResultSpilloverDegraded = true
  if (persistenceState) diagnostics.toolResultSpilloverLastPersistenceState = persistenceState
  if (cleanupState && cleanupState !== 'none') diagnostics.toolResultSpilloverLastCleanupState = cleanupState
  if (!diagnostics.toolResultSpilloverFailureReasonCounts || typeof diagnostics.toolResultSpilloverFailureReasonCounts !== 'object') {
    diagnostics.toolResultSpilloverFailureReasonCounts = {}
  }
  for (const reason of Array.isArray(source.spilloverFailureReasons) ? source.spilloverFailureReasons : []) {
    incrementCount(diagnostics.toolResultSpilloverFailureReasonCounts, reason)
  }
}

export function buildToolWorkflowTelemetryPayload(errorDiagnostics = {}, {
  threadId = '',
  turnId = '',
} = {}) {
  const diagnostics = errorDiagnostics && typeof errorDiagnostics === 'object' ? errorDiagnostics : {}
  const payload = {
    threadId: String(threadId || '').trim(),
    turnId: String(turnId || '').trim(),
    version: 1,
    providerId: String(diagnostics.providerId || '').trim().toLowerCase(),
    model: String(diagnostics.model || '').trim(),
    toolSurfaceKind: String(diagnostics.toolSurfaceKind || '').trim().toLowerCase(),
    delegationBackend: String(diagnostics.delegationBackend || '').trim().toLowerCase(),
    delegationBackendPreference: String(diagnostics.delegationBackendPreference || '').trim().toLowerCase(),
    availableDelegationBackends: Array.isArray(diagnostics.availableDelegationBackends)
      ? diagnostics.availableDelegationBackends.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
      : [],
    nativeCollaborationModeId: String(diagnostics.nativeCollaborationModeId || '').trim(),
    lintRejectCount: Number(diagnostics.toolWorkflowLintRejectCount || 0) || 0,
    lintWarnCount: Number(diagnostics.toolWorkflowLintWarnCount || 0) || 0,
    rerouteCount: Number(diagnostics.toolWorkflowRerouteCount || 0) || 0,
    wrongToolRetryCount: Number(diagnostics.toolWorkflowWrongToolRetryCount || 0) || 0,
    shadowIntent: String(diagnostics.toolShadowIntent || '').trim().toLowerCase(),
    shadowIntentConfidence: String(diagnostics.toolShadowIntentConfidence || '').trim().toLowerCase(),
    requestedToolCount: Number(diagnostics.requestedToolCount || 0) || 0,
    activeToolCount: Number(diagnostics.activeToolCount || 0) || 0,
    surfaceNarrowed: diagnostics.toolWorkflowSurfaceNarrowed === true,
    suppressedToolCount: Number(diagnostics.toolWorkflowSuppressedToolCount || 0) || 0,
    writeIntentDetected: diagnostics.toolWorkflowWriteIntentDetected === true,
    applyPatchFailureCount: Number(diagnostics.toolWorkflowApplyPatchFailureCount || 0) || 0,
    applyPatchRetryAllowedCount: Number(diagnostics.toolWorkflowApplyPatchRetryAllowedCount || 0) || 0,
    applyPatchHardBlockCount: Number(diagnostics.toolWorkflowApplyPatchHardBlockCount || 0) || 0,
    rawDelegationExposureCount: Number(diagnostics.toolWorkflowRawDelegationExposureCount || 0) || 0,
    compactDelegationOnlyExposureCount: Number(diagnostics.toolWorkflowCompactDelegationOnlyExposureCount || 0) || 0,
    fetchBrowserCoexposureCount: Number(diagnostics.toolWorkflowFetchBrowserCoexposureCount || 0) || 0,
    firstSuccessfulMutationLatencyMs: Number(diagnostics.toolWorkflowFirstSuccessfulMutationLatencyMs || 0) || 0,
    failureClassCounts: diagnostics.toolWorkflowFailureClassCounts && typeof diagnostics.toolWorkflowFailureClassCounts === 'object'
      ? { ...diagnostics.toolWorkflowFailureClassCounts }
      : {},
    toolAttemptCounts: diagnostics.toolWorkflowToolAttemptCounts && typeof diagnostics.toolWorkflowToolAttemptCounts === 'object'
      ? { ...diagnostics.toolWorkflowToolAttemptCounts }
      : {},
    toolFailureCounts: diagnostics.toolWorkflowToolFailureCounts && typeof diagnostics.toolWorkflowToolFailureCounts === 'object'
      ? { ...diagnostics.toolWorkflowToolFailureCounts }
      : {},
    writeToolFailureCounts: diagnostics.toolWorkflowWriteFailureCounts && typeof diagnostics.toolWorkflowWriteFailureCounts === 'object'
      ? { ...diagnostics.toolWorkflowWriteFailureCounts }
      : {},
    lintCodeCounts: diagnostics.toolWorkflowLintCodeCounts && typeof diagnostics.toolWorkflowLintCodeCounts === 'object'
      ? { ...diagnostics.toolWorkflowLintCodeCounts }
      : {},
    toolFamilyCounts: diagnostics.toolWorkflowFamilyCounts && typeof diagnostics.toolWorkflowFamilyCounts === 'object'
      ? { ...diagnostics.toolWorkflowFamilyCounts }
      : {},
  }
  const hasSignal = (
    payload.requestedToolCount > 0
    || payload.activeToolCount > 0
    || payload.lintRejectCount > 0
    || payload.lintWarnCount > 0
    || payload.rerouteCount > 0
    || payload.wrongToolRetryCount > 0
    || payload.writeIntentDetected
    || payload.applyPatchFailureCount > 0
    || payload.applyPatchRetryAllowedCount > 0
    || payload.applyPatchHardBlockCount > 0
    || payload.rawDelegationExposureCount > 0
    || payload.compactDelegationOnlyExposureCount > 0
    || payload.fetchBrowserCoexposureCount > 0
    || payload.firstSuccessfulMutationLatencyMs > 0
    || Object.keys(payload.failureClassCounts).length > 0
    || Object.keys(payload.toolFailureCounts).length > 0
    || Object.keys(payload.writeToolFailureCounts).length > 0
    || Object.keys(payload.lintCodeCounts).length > 0
  )
  return hasSignal ? payload : null
}

export function hasWriteIntentWithoutMutation(diagnostics = {}, {
  requireToolCalls = true,
} = {}) {
  const source = diagnostics && typeof diagnostics === 'object' ? diagnostics : {}
  const mode = String(source.mode || '').trim().toLowerCase()
  const writeIntentDetected = source.toolWorkflowWriteIntentDetected === true
  const successfulMutationCount = Number(source.toolWorkflowSuccessfulMutationCount || 0) || 0
  const toolCallCount = Number(source.toolCallCount || 0) || 0
  if (mode !== 'execute' || !writeIntentDetected || successfulMutationCount > 0) return false
  if (requireToolCalls && toolCallCount <= 0) return false
  return true
}

export function buildWriteIntentWithoutMutationReason(diagnostics = {}) {
  const source = diagnostics && typeof diagnostics === 'object' ? diagnostics : {}
  if (!hasWriteIntentWithoutMutation(source)) return ''
  const terminalState = normalizeTerminalState(source.toolWorkflowTerminalState)
  if (terminalState === 'cancelled') {
    return 'No file changes were applied before the turn was stopped.'
  }
  if (terminalState === 'stale') {
    return 'The turn went stale before any file changes were applied.'
  }
  if (terminalState === 'completed') {
    return 'The turn finished without applying any file changes.'
  }
  return 'The turn ended without applying any file changes.'
}

export function resolveWorkspaceTrust(projectFolder = '', commandSafetySettings = {}) {
  void commandSafetySettings
  const workspaceRoot = normalizeWorkspaceRoot(projectFolder)
  if (!workspaceRoot) {
    return {
      workspaceRoot: '',
      trustedWorkspaceActive: false,
      workspaceTrustSource: 'no_workspace',
    }
  }
  return {
    workspaceRoot,
    trustedWorkspaceActive: false,
    workspaceTrustSource: 'workspace_guardrails',
  }
}

export function resolveWireApi(providerId = '', { backgroundQueued = false } = {}) {
  const provider = String(providerId || '').trim().toLowerCase()
  if (backgroundQueued && provider === 'openai') return 'openai_background_response'
  switch (provider) {
    case 'openai':
      return 'ai_sdk_stream_text:openai'
    case 'deepseek':
    case 'moonshot':
    case 'ollama':
    case 'lmstudio':
      return 'ai_sdk_stream_text:openai_compatible'
    case 'anthropic':
      return 'ai_sdk_stream_text:anthropic'
    case 'gemini':
      return 'ai_sdk_stream_text:google'
    case 'grok':
      return 'ai_sdk_stream_text:xai'
    case 'groq':
      return 'ai_sdk_stream_text:groq'
    case 'mistral':
      return 'ai_sdk_stream_text:mistral'
    case 'perplexity':
      return 'ai_sdk_stream_text:perplexity'
    default:
      return provider ? `ai_sdk_stream_text:${provider}` : 'ai_sdk_stream_text:unknown'
  }
}

export function resolveToolSurfaceDiagnostics({
  mode = 'execute',
  toolNames = [],
} = {}) {
  const normalizedMode = String(mode || '').trim().toLowerCase()
  if (normalizedMode !== 'execute') {
    return {
      toolSurfaceKind: 'none',
      mixedToolSurfaceDetected: false,
      toolSurfaceComponents: [],
    }
  }

  const names = Array.isArray(toolNames)
    ? toolNames.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
    : []
  if (names.length === 0) {
    return {
      toolSurfaceKind: 'none',
      mixedToolSurfaceDetected: false,
      toolSurfaceComponents: [],
    }
  }

  const components = []
  const seen = new Set()
  for (const toolName of names) {
    const component = classifyToolSurfaceComponent(toolName)
    if (!component || seen.has(component)) continue
    seen.add(component)
    components.push(component)
  }

  return {
    toolSurfaceKind: components.length > 1 ? 'mixed' : (components[0] || 'none'),
    mixedToolSurfaceDetected: components.length > 1,
    toolSurfaceComponents: components,
  }
}


export { formatRuntimeDiagnosticsDetail }

function resolveAdaptiveBudgetUserSource(state = {}) {
  const adaptiveBudgetSource = String(state.adaptiveBudgetSource || '').trim().toLowerCase()
  const adaptiveBudgetResolutionSource = String(state.adaptiveBudgetResolutionSource || '').trim().toLowerCase()
  if (
    state.adaptiveBudgetRuntimeOverrideApplied === true
    || adaptiveBudgetResolutionSource === 'runtime_override'
  ) {
    return 'app-managed runtime budget'
  }
  if (adaptiveBudgetSource === 'manual_override') {
    return 'saved budget policy'
  }
  if (
    adaptiveBudgetResolutionSource === 'learned_profile'
    || adaptiveBudgetSource === 'observed_headers'
  ) {
    return 'learned provider budget'
  }
  if (
    adaptiveBudgetResolutionSource === 'fallback_profile'
    || adaptiveBudgetSource === 'fallback'
  ) {
    return 'default safe Anthropic budget'
  }
  return 'adaptive budget policy'
}

function resolveAdaptiveBudgetUserReason(state = {}) {
  const adaptiveBudgetResolutionReason = String(state.adaptiveBudgetResolutionReason || '').trim().toLowerCase()
  const adaptiveBudgetResolvedExplorationMode = String(state.adaptiveBudgetResolvedExplorationMode || '').trim().toLowerCase()
  switch (adaptiveBudgetResolutionReason) {
    case 'fallback_no_telemetry':
      return 'no recent provider budget signal is available yet.'
    case 'stale_observation':
      return 'saved provider budget data is stale, so this turn kept the last safe learned budget.'
    case 'expired_observation':
      return 'saved provider budget data expired, so this turn fell back to the default safe Anthropic budget.'
    case 'invalid_observation':
      return 'saved provider budget data was incomplete, so this turn fell back to the default safe Anthropic budget.'
    case 'observed_low_capacity':
      return 'recent provider feedback suggests a smaller prompt budget.'
    case 'observed_medium_capacity':
      return 'recent provider feedback supports a balanced prompt budget.'
    case 'observed_high_capacity':
    case 'observed_very_high_capacity':
      return 'recent provider feedback supports a roomier prompt budget.'
    case 'runtime_override':
      return 'this turn used an app-managed budget policy.'
    case 'stored_manual_override':
      return 'this turn used a saved budget policy.'
    default:
      if (adaptiveBudgetResolvedExplorationMode === 'strict') {
        return 'this turn keeps a tighter prompt budget.'
      }
      if (adaptiveBudgetResolvedExplorationMode === 'moderate') {
        return 'this turn keeps a balanced prompt budget.'
      }
      if (adaptiveBudgetResolvedExplorationMode === 'relaxed') {
        return 'this turn can use a roomier prompt budget.'
      }
      return ''
  }
}

export function buildAdaptiveBudgetUserExplanation(diagnostics = {}) {
  const source = diagnostics && typeof diagnostics === 'object' ? diagnostics : {}
  const context = resolveAdaptiveBudgetDiagnosticContext(source)
  const { state } = context
  if (
    state.promptBudgetProfileFamily !== 'anthropic'
    || !['strict', 'moderate', 'relaxed'].includes(state.adaptiveBudgetResolvedExplorationMode)
  ) {
    return null
  }
  const detail = [
    `source: ${resolveAdaptiveBudgetUserSource(state)}`,
    `reason: ${resolveAdaptiveBudgetUserReason(state) || 'this turn used the resolved adaptive budget policy.'}`,
  ].join('\n')
  return {
    type: context.degraded ? 'warning' : 'info',
    label: `Adaptive budget: ${state.adaptiveBudgetResolvedExplorationMode} for this turn`,
    detail,
  }
}

export function summarizeRuntimeDiagnostics(diagnostics = {}) {
  const source = diagnostics && typeof diagnostics === 'object' ? diagnostics : {}
  if (source.promptBudgetHardLimitExceeded === true) {
    return {
      type: 'warning',
      label: 'Runtime diagnostics: prompt budget hard limit exceeded',
    }
  }
  if (
    source.toolResultSpilloverDegraded === true
    || Number(source.toolResultSpilloverWriteFailureCount || 0) > 0
    || Number(source.toolResultSpilloverCleanupFailureCount || 0) > 0
  ) {
    return {
      type: 'warning',
      label: 'Runtime diagnostics: spillover persistence degraded',
    }
  }
  const adaptiveBudgetContext = resolveAdaptiveBudgetDiagnosticContext(source)
  if (adaptiveBudgetContext.degradedReason === 'stale_observation') {
    return {
      type: 'warning',
      label: 'Runtime diagnostics: adaptive budget signal is stale',
    }
  }
  if (
    adaptiveBudgetContext.degradedReason === 'expired_observation'
    || adaptiveBudgetContext.degradedReason === 'invalid_observation'
  ) {
    return {
      type: 'warning',
      label: 'Runtime diagnostics: adaptive budget fell back to safe defaults',
    }
  }
  const openAIAuthParityStatus = String(source.openAIAuthParityStatus || '').trim().toLowerCase()
  if (openAIAuthParityStatus === 'mismatch') {
    return {
      type: 'warning',
      label: 'Runtime diagnostics: openai_auth_surface_mismatch',
    }
  }
  const surfaceResolutionFailure = String(source.surfaceResolutionFailure || '').trim()
  if (surfaceResolutionFailure) {
    return {
      type: 'warning',
      label: `Runtime diagnostics: ${surfaceResolutionFailure}`,
    }
  }
  if (source.zeroToolExecuteTurn === true) {
    return {
      type: 'info',
      label: 'Execute turn completed without tool calls',
    }
  }
  if (hasWriteIntentWithoutMutation(source)) {
    return {
      type: 'warning',
      label: 'Runtime diagnostics: write-intent turn ended without durable file changes',
    }
  }
  if (source.mixedToolSurfaceDetected === true) {
    return {
      type: 'warning',
      label: 'Runtime diagnostics: mixed tool surface detected',
    }
  }
  if (source.modelTextualApprovalWithoutToolCall === true) {
    return {
      type: 'warning',
      label: 'Runtime diagnostics: model emitted textual approval request without tool call',
    }
  }
  if (Array.isArray(source.guardrailFailures) && source.guardrailFailures.length > 0) {
    return {
      type: 'warning',
      label: 'Runtime diagnostics: guardrail failure detected',
    }
  }
  return {
    type: 'info',
    label: 'Runtime diagnostics captured',
  }
}
