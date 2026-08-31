import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyAdaptiveBudgetDiagnosticsState,
  buildAdaptiveBudgetUserExplanation,
  buildToolWorkflowTelemetryPayload,
  buildWriteIntentWithoutMutationReason,
  classifyToolWorkflowFamily,
  formatRuntimeDiagnosticsDetail,
  hasWriteIntentWithoutMutation,
  recordToolResultSpilloverOutcome,
  recordToolWorkflowLintEvent,
  recordToolWorkflowOutcome,
  resolveToolSurfaceDiagnostics,
  resolveWireApi,
  resolveWorkspaceTrust,
  summarizeRuntimeDiagnostics,
} from '../../src/main/chat/chat-runtime-diagnostics.mjs'
import { createRuntimeDiagnosticsEmitter } from '../../src/main/ipc-handlers/chat-stream-handler-runtime-diagnostics.mjs'
import { summarizeCanonicalTurnToolEvidence } from '../../src/main/chat/chat-runtime-diagnostic-evidence.mjs'
import { resolveProviderModelAdapter } from '../../src/main/api-clients/provider-model-adapters.mjs'
import {
  applyDevToolSurfaceDiagnostics,
  recordDevCapabilityCatalogOperation,
} from '../../src/main/chat/dev-tool-surface-diagnostics.mjs'
import { recordHiddenKnownToolRecoveryDiagnostics } from '../../src/main/chat/tool-surface-recovery.mjs'

test('provider adapter diagnostics distinguish curated, snapshot, and generic routes', () => {
  const curated = resolveProviderModelAdapter('openai', 'gpt-5.4')
  const snapshot = resolveProviderModelAdapter('openai', 'gpt-5.4-2026-03-05')
  const generic = resolveProviderModelAdapter('openai', 'gpt-5-unknown-lab-build')

  assert.deepEqual({
    adapterSelection: curated.adapterSelection,
    adapterReason: curated.adapterReason,
    adapterModelId: curated.adapterModelId,
    adapterId: curated.adapterId,
  }, {
    adapterSelection: 'curated',
    adapterReason: 'registry_exact',
    adapterModelId: 'gpt-5.4',
    adapterId: 'openai:gpt-5.4',
  })
  assert.deepEqual({
    adapterSelection: snapshot.adapterSelection,
    adapterReason: snapshot.adapterReason,
    adapterModelId: snapshot.adapterModelId,
  }, {
    adapterSelection: 'curated',
    adapterReason: 'registry_snapshot',
    adapterModelId: 'gpt-5.4',
  })
  assert.deepEqual({
    adapterSelection: generic.adapterSelection,
    adapterReason: generic.adapterReason,
    adapterModelId: generic.adapterModelId,
    adapterId: generic.adapterId,
  }, {
    adapterSelection: 'generic',
    adapterReason: 'unknown_or_non_curated',
    adapterModelId: 'gpt-5-unknown-lab-build',
    adapterId: 'openai:generic',
  })
})

test('resolveToolSurfaceDiagnostics flags mixed surfaces explicitly', () => {
  const diagnostics = resolveToolSurfaceDiagnostics({
    mode: 'execute',
    toolNames: ['read_file', 'web_search', 'local_shell', 'mcp_docs'],
  })

  assert.equal(diagnostics.toolSurfaceKind, 'mixed')
  assert.equal(diagnostics.mixedToolSurfaceDetected, true)
  assert.deepEqual(diagnostics.toolSurfaceComponents, [
    'addom_native',
    'openai_hosted',
    'openai_local_runtime',
  ])
})

test('resolveWorkspaceTrust reports the active workspace guardrail snapshot without persisted trust state', () => {
  const workspace = resolveWorkspaceTrust('C:/Users/example/Documents/ADDOM', {})

  assert.equal(workspace.trustedWorkspaceActive, false)
  assert.equal(workspace.workspaceTrustSource, 'workspace_guardrails')
})

test('dev tool-surface diagnostics render only when developer diagnostics are enabled', () => {
  const hidden = {
    runtimeDiagnosticsVisible: false,
  }
  applyDevToolSurfaceDiagnostics(hidden, {
    resolvedToolSurface: {
      toolIdentityMap: {
        read_file: { family: 'file' },
      },
      toolSurfaceHiddenFamilies: ['browser'],
    },
  })
  assert.doesNotMatch(formatRuntimeDiagnosticsDetail(hidden), /dev_tool_surface/i)

  const diagnostics = {
    runtimeDiagnosticsVisible: true,
    toolSurfaceHiddenKnownRecoveryCount: 1,
    toolSurfaceHiddenKnownRecoveryBlockedCount: 0,
    toolSurfaceHiddenKnownRecoveryCapabilities: { 'builtins.files': 1 },
  }
  applyDevToolSurfaceDiagnostics(diagnostics, {
    resolvedToolSurface: {
      tools: {
        read_file: {},
        search_code: {},
        run_command: {},
      },
      toolIdentityMap: {
        read_file: { family: 'file' },
        search_code: { family: 'file' },
        run_command: { family: 'shell' },
      },
      toolSurfaceHiddenFamilies: ['browser', 'delegation'],
      toolSurfaceActivationRecords: [{
        capabilityId: 'builtins.browser',
        state: 'active',
        reason: 'catalog_read',
        metadata: { catalogPath: 'addom://capabilities/browser.md' },
      }],
      toolSurfaceActivatedCapabilities: ['builtins.browser'],
      toolSurfaceActivationIncludedTools: ['browser_action'],
      excludedToolsWithReasons: [
        { toolName: 'apply_patch', reason: 'excluded_due_to_catalog_first_prompt_budget' },
      ],
    },
  })
  recordDevCapabilityCatalogOperation(diagnostics, {
    operation: 'read',
    path: 'addom://capabilities/browser.md',
  })
  recordDevCapabilityCatalogOperation(diagnostics, {
    operation: 'search',
    path: 'addom://capabilities',
    query: 'browser',
    matchCount: 2,
  })
  recordHiddenKnownToolRecoveryDiagnostics(diagnostics, {
    recovery: {
      attemptedToolName: 'apply_patch',
      capabilityId: 'builtins.files',
      catalogPath: 'addom://capabilities/files.md',
    },
  })

  const detail = formatRuntimeDiagnosticsDetail(diagnostics)
  assert.match(detail, /dev_tool_surface_visible_families: file=2, shell=1/i)
  assert.match(detail, /dev_tool_surface_hidden_discoverable_families: browser, delegation/i)
  assert.match(detail, /dev_tool_surface_activation_records: builtins\.browser:active:catalog_read/i)
  assert.match(detail, /dev_tool_surface_activation_included_tools: browser_action/i)
  assert.match(detail, /dev_tool_surface_blocked_reasons: excluded_due_to_catalog_first_prompt_budget=1/i)
  assert.match(detail, /dev_tool_surface_catalog_operation_counts: read=1, search=1/i)
  assert.match(detail, /dev_tool_surface_catalog_operations: read:addom:\/\/capabilities\/browser\.md, search:addom:\/\/capabilities\(2\)/i)
  assert.match(detail, /dev_tool_surface_hidden_known_recovery: total=2, blocked=0/i)
  assert.match(detail, /dev_tool_surface_hidden_known_recovery_capabilities: builtins\.files=2/i)
  assert.match(detail, /dev_tool_surface_hidden_known_recoveries: apply_patch:builtins\.files/i)
})

test('formatRuntimeDiagnosticsDetail emits the strict runtime contract summary', () => {
  const detail = formatRuntimeDiagnosticsDetail({
    providerId: 'openai',
    model: 'gpt-5.4',
    permissionMode: 'autonomy',
    persistedPermissionMode: 'ask',
    permissionModeInSync: false,
    adapterSelection: 'curated',
    adapterReason: 'registry_exact',
    adapterId: 'openai:gpt-5.4',
    availabilityState: 'unknown',
    availabilitySelectionState: 'curated',
    availabilityRequiresKey: true,
    availabilityConfigured: true,
    availabilityVerified: true,
    availabilityGates: ['upstream:openai'],
    wireApi: resolveWireApi('openai'),
    workspaceRoot: 'C:/Users/example/Documents/ADDOM',
    workspaceTrustSource: 'workspace_guardrails',
    toolSurfaceKind: 'mixed',
    toolSurfaceComponents: ['addom_native', 'openai_hosted'],
    delegationBackend: 'openai_native',
    availableDelegationBackends: ['openai_native', 'addom_moa'],
    delegationBackendPreference: 'auto',
    delegationBackendReason: 'capability_default',
    nativeCollaborationModeId: 'plan',
    mixedToolSurfaceDetected: true,
    modelSupportsTools: true,
    modelSupportsAnyToolSurface: true,
    modelToolSupportMode: 'openai_hosted',
    modelCapabilitiesSource: 'merged_catalog',
    capabilityBlockReasons: ['missing_vector_store'],
    capabilityNotices: ['missing_vector_store'],
    guardrailFailures: ['repeated_tool_call_loop'],
    surfacePolicyReresolution: ['model_changed'],
    requestedToolCount: 5,
    activeToolCount: 3,
    toolCallCount: 0,
    firstToolLatencyMs: 0,
    zeroToolExecuteTurn: true,
    approvalPromptCount: 1,
    approvalApprovedCount: 2,
    approvalDeniedCount: 1,
    approvalPolicyBlockedCount: 1,
    approvalUserDeniedCount: 0,
    approvalTimeoutCount: 0,
    approvalAutoSources: { permission_mode_autonomy: 2 },
    riskyApprovalPromptCount: 1,
    surfaceResolutionFailure: 'provider_rejected_tool_surface',
  })

  assert.match(detail, /provider_model: openai\/gpt-5\.4/i)
  assert.match(detail, /adapter_selection: curated \(registry_exact\)/i)
  assert.match(detail, /adapter_id: openai:gpt-5\.4/i)
  assert.match(detail, /availability: unknown \(curated\)/i)
  assert.match(detail, /availability_requires_key: true/i)
  assert.match(detail, /availability_configured: true/i)
  assert.match(detail, /availability_verified: true/i)
  assert.match(detail, /availability_gates: upstream:openai/i)
  assert.match(detail, /wire_api: ai_sdk_stream_text:openai/i)
  assert.match(detail, /tool_surface_kind: mixed/i)
  assert.match(detail, /delegation_backend: openai_native/i)
  assert.match(detail, /delegation_backends_available: openai_native, addom_moa/i)
  assert.match(detail, /delegation_backend_preference: auto/i)
  assert.match(detail, /delegation_backend_reason: capability_default/i)
  assert.match(detail, /native_collaboration_mode_id: plan/i)
  assert.match(detail, /model_any_tool_surface: true/i)
  assert.match(detail, /model_tool_support_mode: openai_hosted/i)
  assert.match(detail, /permission_mode_in_sync: false/i)
  assert.match(detail, /capability_block_reasons: missing_vector_store/i)
  assert.match(detail, /guardrail_failures: repeated_tool_call_loop/i)
  assert.match(detail, /surface_policy_reresolution: model_changed/i)
  assert.match(detail, /zero_tool_execute_turn: true/i)
  assert.match(detail, /approval_summary: shown=1, approved=2, denied=1, policy_blocked=1, user_denied=0, timeouts=0/i)
  assert.match(detail, /approval_auto_sources: permission_mode_autonomy=2/i)
  assert.match(detail, /surface_resolution_failure: provider_rejected_tool_surface/i)
})

test('formatRuntimeDiagnosticsDetail includes provider-owned runtime context explicitly', () => {
  const detail = formatRuntimeDiagnosticsDetail({
    providerId: 'perplexity',
    model: 'sonar-pro',
    availabilityState: 'unknown',
    availabilitySelectionState: 'curated',
    availabilityRequiresKey: true,
    availabilityConfigured: true,
    availabilityVerified: true,
    providerNativeRuntimeFamily: 'perplexity_search',
    providerNativeRuntimeMode: 'provider_owned_runtime',
    selectedCompactionMode: 'local_summary',
    candidateCompactionModes: ['provider_chain_compaction', 'local_summary'],
    compactionFailureReason: 'provider_chain_compaction_unavailable',
    fallbackCompactionMode: 'local_summary',
    fallbackReason: 'provider_chain_compaction_unavailable',
    compactionEventType: 'provider_chain_compaction',
    compactionEventPhase: 'imminent',
    compactionEventOccurred: false,
    canonicalHandoffUsed: false,
    carryForwardSource: 'continuity_packet_only',
    toolSurfaceKind: 'perplexity_search',
    toolSurfaceComponents: ['perplexity_search'],
    modelSupportsTools: false,
    modelSupportsAnyToolSurface: true,
    modelToolSupportMode: 'provider_owned_runtime_only',
    modelCapabilitiesSource: 'merged_catalog',
    capabilityBlockReasons: ['provider_owned_runtime_no_local_tool_calls'],
    surfaceResolutionFailure: 'provider_owned_runtime_no_local_tool_calls',
  })

  assert.match(detail, /provider_native_runtime_family: perplexity_search/i)
  assert.match(detail, /provider_native_runtime_mode: provider_owned_runtime/i)
  assert.match(detail, /selected_compaction_mode: local_summary/i)
  assert.match(detail, /candidate_compaction_modes: provider_chain_compaction, local_summary/i)
  assert.match(detail, /compaction_failure_reason: provider_chain_compaction_unavailable/i)
  assert.match(detail, /fallback_compaction_mode: local_summary/i)
  assert.match(detail, /fallback_reason: provider_chain_compaction_unavailable/i)
  assert.match(detail, /compaction_event_type: provider_chain_compaction/i)
  assert.match(detail, /compaction_event_phase: imminent/i)
  assert.match(detail, /compaction_event_occurred: false/i)
  assert.match(detail, /canonical_handoff_used: false/i)
  assert.match(detail, /carry_forward_source: continuity_packet_only/i)
  assert.match(detail, /model_any_tool_surface: true/i)
  assert.match(detail, /model_tool_support_mode: provider_owned_runtime_only/i)
  assert.match(detail, /capability_block_reasons: provider_owned_runtime_no_local_tool_calls/i)
  assert.match(detail, /surface_resolution_failure: provider_owned_runtime_no_local_tool_calls/i)
})

test('formatRuntimeDiagnosticsDetail includes OpenAI account auto-compaction diagnostics explicitly', () => {
  const detail = formatRuntimeDiagnosticsDetail({
    providerId: 'openai',
    model: 'gpt-5.4',
    providerNativeRuntimeFamily: 'codex_app_server_chatgpt',
    providerNativeRuntimeMode: 'provider_owned_runtime',
    accountAutoCompactionEnabled: true,
    accountAutoCompactionTokenLimit: 180000,
    accountAutoCompactionPromptConfigured: true,
  })

  assert.match(detail, /provider_native_runtime_family: codex_app_server_chatgpt/i)
  assert.match(detail, /account_auto_compaction_enabled: true/i)
  assert.match(detail, /account_auto_compaction_token_limit: 180000/i)
  assert.match(detail, /account_auto_compaction_prompt_configured: true/i)
})

test('formatRuntimeDiagnosticsDetail includes explicit OpenAI auth parity drift diagnostics', () => {
  const detail = formatRuntimeDiagnosticsDetail({
    providerId: 'openai',
    model: 'gpt-5.4',
    authMethod: 'account',
    accountRuntimeStatus: 'parity',
    openAIAuthParityStatus: 'mismatch',
    openAIAuthParityCoreSummary: ['web_search=equivalent_native', 'shell=equivalent_native'],
    openAIAuthParityExceptions: [],
    openAIAuthParityMismatches: [{
      capabilityId: 'shell',
      apiKeySupported: true,
      accountSupported: false,
      accountStatus: 'parity',
    }],
  })

  assert.match(detail, /auth_method: account/i)
  assert.match(detail, /account_runtime_status: parity/i)
  assert.match(detail, /openai_auth_parity_status: mismatch/i)
  assert.match(detail, /openai_auth_parity_core: web_search=equivalent_native, shell=equivalent_native/i)
  assert.doesNotMatch(detail, /openai_auth_parity_exceptions:/i)
  assert.match(detail, /openai_auth_parity_mismatches: shell\(api=true,account=false,status=parity\)/i)
})

test('formatRuntimeDiagnosticsDetail includes memory context lane counts and token estimates', () => {
  const detail = formatRuntimeDiagnosticsDetail({
    memoryContextNodeCount: 5,
    memoryContextEstimatedTokens: 240,
    memoryContextLaneCounts: {
      thread: 4,
      project: 1,
      global: 0,
    },
    memoryContextLaneEstimatedTokens: {
      thread: 192,
      project: 48,
      global: 0,
    },
    memoryContextPromotionCounts: {
      thread: 0,
      project: 1,
      global: 0,
    },
  })

  assert.match(detail, /memory_context_node_count: 5/i)
  assert.match(detail, /memory_context_estimated_tokens: 240/i)
  assert.match(detail, /memory_context_lane_counts: thread=4, project=1/i)
  assert.match(detail, /memory_context_lane_estimated_tokens: thread=192, project=48/i)
  assert.match(detail, /memory_context_promoted_lane_counts: project=1/i)
})

test('formatRuntimeDiagnosticsDetail explains adaptive Anthropic budget posture and hides credential material', () => {
  const detail = formatRuntimeDiagnosticsDetail({
    providerId: 'anthropic',
    model: 'claude-sonnet-4-6',
    promptBudgetProfileId: 'anthropic_strict',
    promptBudgetProfileFamily: 'anthropic',
    promptBudgetStrictness: 'strict',
    promptBudgetHardGuardEnabled: true,
    promptBudgetResolvedCeilingTokens: 60_000,
    adaptiveBudgetSource: 'observed_headers',
    adaptiveBudgetConfidence: 'observed_stable',
    adaptiveBudgetScope: 'organization',
    adaptiveBudgetCapacityTier: 'medium',
    adaptiveBudgetObservedInputTpm: 80_000,
    adaptiveBudgetObservedOutputTpm: 8_000,
    adaptiveBudgetObservedRpm: 50,
    adaptiveBudgetLastObservedAt: 1776190000000,
    adaptiveBudgetResolutionSource: 'runtime_override',
    adaptiveBudgetResolutionReason: 'runtime_override',
    adaptiveBudgetResolvedCeilingTokens: 60_000,
    adaptiveBudgetResolvedExplorationMode: 'relaxed',
    adaptiveBudgetRuntimeOverrideApplied: true,
    adaptiveBudgetRuntimeOverrideSource: 'provider_runtime_settings',
    adaptiveBudgetRuntimeOverrideCeilingTokens: 60_000,
    adaptiveBudgetRuntimeOverrideExplorationMode: 'relaxed',
    adaptiveBudgetCredentialFingerprint: 'sha256:should_not_render',
    adaptiveBudgetOrganizationId: 'org_hidden',
  })

  assert.match(detail, /prompt_budget_profile: anthropic_strict/i)
  assert.match(detail, /prompt_budget_family: anthropic/i)
  assert.match(detail, /prompt_budget_strictness: strict/i)
  assert.match(detail, /prompt_preflight_hard_guard_enabled: true/i)
  assert.match(detail, /prompt_budget_resolved_ceiling_tokens: 60000/i)
  assert.match(detail, /adaptive_budget_source: observed_headers/i)
  assert.match(detail, /adaptive_budget_confidence: observed_stable/i)
  assert.match(detail, /adaptive_budget_scope: organization/i)
  assert.match(detail, /adaptive_budget_capacity_tier: medium/i)
  assert.match(detail, /adaptive_budget_observed_capacity: input_tpm=80000, output_tpm=8000, rpm=50/i)
  assert.match(detail, /adaptive_budget_resolution_source: runtime_override/i)
  assert.match(detail, /adaptive_budget_resolution_reason: runtime_override/i)
  assert.match(detail, /adaptive_budget_resolved_ceiling_tokens: 60000/i)
  assert.match(detail, /adaptive_budget_resolved_exploration_mode: relaxed/i)
  assert.match(detail, /adaptive_budget_runtime_override: source=provider_runtime_settings, ceiling_tokens=60000, exploration_mode=relaxed/i)
  assert.doesNotMatch(detail, /sha256:should_not_render/i)
  assert.doesNotMatch(detail, /org_hidden/i)
})

test('buildAdaptiveBudgetUserExplanation returns sanitized end-user copy for Anthropic turns', () => {
  assert.deepEqual(
    buildAdaptiveBudgetUserExplanation({
      promptBudgetProfileFamily: 'anthropic',
      adaptiveBudgetSource: 'fallback',
      adaptiveBudgetResolutionSource: 'fallback_profile',
      adaptiveBudgetResolutionReason: 'fallback_no_telemetry',
      adaptiveBudgetResolvedExplorationMode: 'strict',
      adaptiveBudgetCredentialFingerprint: 'sha256:hidden',
      adaptiveBudgetOrganizationId: 'org_hidden',
    }),
    {
      type: 'info',
      label: 'Adaptive budget: strict for this turn',
      detail: [
        'source: default safe Anthropic budget',
        'reason: no recent provider budget signal is available yet.',
      ].join('\n'),
    },
  )

  assert.deepEqual(
    buildAdaptiveBudgetUserExplanation({
      promptBudgetProfileFamily: 'anthropic',
      adaptiveBudgetSource: 'observed_headers',
      adaptiveBudgetResolutionSource: 'runtime_override',
      adaptiveBudgetResolutionReason: 'runtime_override',
      adaptiveBudgetResolvedExplorationMode: 'relaxed',
      adaptiveBudgetRuntimeOverrideApplied: true,
      adaptiveBudgetRuntimeOverrideSource: 'provider_runtime_settings',
      adaptiveBudgetCredentialFingerprint: 'sha256:hidden',
    }),
    {
      type: 'info',
      label: 'Adaptive budget: relaxed for this turn',
      detail: [
        'source: app-managed runtime budget',
        'reason: this turn used an app-managed budget policy.',
      ].join('\n'),
    },
  )

  assert.equal(
    buildAdaptiveBudgetUserExplanation({
      promptBudgetProfileFamily: 'openai',
      adaptiveBudgetResolvedExplorationMode: 'moderate',
    }),
    null,
  )
})

test('adaptive budget degraded lifecycle reasons stay aligned across user copy and runtime detail', () => {
  const diagnostics = applyAdaptiveBudgetDiagnosticsState({
    promptBudgetProfileFamily: 'anthropic',
    adaptiveBudgetSource: 'fallback',
    adaptiveBudgetConfidence: 'fallback',
    adaptiveBudgetResolutionSource: 'fallback_profile',
    adaptiveBudgetResolutionReason: 'fallback_no_telemetry',
    adaptiveBudgetResolutionReasonOverride: 'expired_observation',
    adaptiveBudgetResolvedExplorationMode: 'strict',
    adaptiveBudgetCleanupDeletedCount: 1,
  })

  const detail = formatRuntimeDiagnosticsDetail(diagnostics)
  const explanation = buildAdaptiveBudgetUserExplanation(diagnostics)

  assert.match(detail, /adaptive_budget_resolution_reason: expired_observation/i)
  assert.match(detail, /adaptive_budget_health: degraded \(expired_observation\)/i)
  assert.match(detail, /adaptive_budget_cleanup_deleted_profiles: 1/i)
  assert.deepEqual(explanation, {
    type: 'warning',
    label: 'Adaptive budget: strict for this turn',
    detail: [
      'source: default safe Anthropic budget',
      'reason: saved provider budget data expired, so this turn fell back to the default safe Anthropic budget.',
    ].join('\n'),
  })
  assert.deepEqual(
    summarizeRuntimeDiagnostics(diagnostics),
    { type: 'warning', label: 'Runtime diagnostics: adaptive budget fell back to safe defaults' },
  )
})

test('adaptive budget stale learned signal produces a warning instead of generic budget copy', () => {
  const diagnostics = {
    promptBudgetProfileFamily: 'anthropic',
    adaptiveBudgetSource: 'observed_headers',
    adaptiveBudgetConfidence: 'observed_stable',
    adaptiveBudgetResolutionSource: 'learned_profile',
    adaptiveBudgetResolutionReason: 'stale_observation',
    adaptiveBudgetResolvedExplorationMode: 'moderate',
  }

  assert.deepEqual(
    buildAdaptiveBudgetUserExplanation(diagnostics),
    {
      type: 'warning',
      label: 'Adaptive budget: moderate for this turn',
      detail: [
        'source: learned provider budget',
        'reason: saved provider budget data is stale, so this turn kept the last safe learned budget.',
      ].join('\n'),
    },
  )
  assert.deepEqual(
    summarizeRuntimeDiagnostics(diagnostics),
    { type: 'warning', label: 'Runtime diagnostics: adaptive budget signal is stale' },
  )
})

test('summarizeRuntimeDiagnostics promotes zero-tool and mixed-surface incidents', () => {
  assert.deepEqual(
    summarizeRuntimeDiagnostics({ zeroToolExecuteTurn: true }),
    { type: 'info', label: 'Execute turn completed without tool calls' },
  )
  assert.deepEqual(
    summarizeRuntimeDiagnostics({
      mode: 'execute',
      toolCallCount: 2,
      toolWorkflowWriteIntentDetected: true,
      toolWorkflowSuccessfulMutationCount: 0,
    }),
    { type: 'warning', label: 'Runtime diagnostics: write-intent turn ended without durable file changes' },
  )
  assert.deepEqual(
    summarizeRuntimeDiagnostics({ mixedToolSurfaceDetected: true }),
    { type: 'warning', label: 'Runtime diagnostics: mixed tool surface detected' },
  )
  assert.deepEqual(
    summarizeRuntimeDiagnostics({ guardrailFailures: ['repeated_tool_call_loop'] }),
    { type: 'warning', label: 'Runtime diagnostics: guardrail failure detected' },
  )
  assert.deepEqual(
    summarizeRuntimeDiagnostics({ modelTextualApprovalWithoutToolCall: true }),
    { type: 'warning', label: 'Runtime diagnostics: model emitted textual approval request without tool call' },
  )
  assert.deepEqual(
    summarizeRuntimeDiagnostics({ openAIAuthParityStatus: 'mismatch' }),
    { type: 'warning', label: 'Runtime diagnostics: openai_auth_surface_mismatch' },
  )
  assert.deepEqual(
    summarizeRuntimeDiagnostics({ toolResultSpilloverDegraded: true }),
    { type: 'warning', label: 'Runtime diagnostics: spillover persistence degraded' },
  )
  assert.deepEqual(
    summarizeRuntimeDiagnostics({ adaptiveBudgetResolutionReason: 'expired_observation' }),
    { type: 'warning', label: 'Runtime diagnostics: adaptive budget fell back to safe defaults' },
  )
  assert.deepEqual(
    summarizeRuntimeDiagnostics({}),
    { type: 'info', label: 'Runtime diagnostics captured' },
  )
})

test('tool result spillover diagnostics surface cleanup degradation and failure reasons explicitly', () => {
  const diagnostics = {}

  recordToolResultSpilloverOutcome(diagnostics, {
    persistence: 'enabled',
    spilloverPersistenceState: 'persisted_with_cleanup_degraded',
    spilloverCleanupState: 'pruned_with_failures',
    spilloverCleanupDeletedFileCount: 3,
    spilloverCleanupDeletedBytes: 4096,
    spilloverFailureReasons: ['scan_failed:EACCES', 'delete_failed:EPERM'],
    spilloverDegraded: true,
  })
  recordToolResultSpilloverOutcome(diagnostics, {
    persistence: 'disabled',
    spilloverPersistenceState: 'write_failed',
    spilloverCleanupState: 'none',
    spilloverCleanupDeletedFileCount: 0,
    spilloverCleanupDeletedBytes: 0,
    spilloverFailureReasons: ['write_failed:ENOSPC'],
    spilloverDegraded: true,
  })

  const detail = formatRuntimeDiagnosticsDetail(diagnostics)

  assert.match(detail, /tool_result_spillover_persisted_count: 1/i)
  assert.match(detail, /tool_result_spillover_cleanup_applied_count: 1/i)
  assert.match(detail, /tool_result_spillover_cleanup_deleted_files: 3/i)
  assert.match(detail, /tool_result_spillover_cleanup_deleted_bytes: 4096/i)
  assert.match(detail, /tool_result_spillover_write_failures: 1/i)
  assert.match(detail, /tool_result_spillover_cleanup_failures: 1/i)
  assert.match(detail, /tool_result_spillover_last_persistence_state: write_failed/i)
  assert.match(detail, /tool_result_spillover_last_cleanup_state: pruned_with_failures/i)
  assert.match(detail, /tool_result_spillover_failure_reasons: delete_failed:EPERM=1, scan_failed:EACCES=1, write_failed:ENOSPC=1/i)
  assert.deepEqual(
    summarizeRuntimeDiagnostics(diagnostics),
    { type: 'warning', label: 'Runtime diagnostics: spillover persistence degraded' },
  )
})

test('formatRuntimeDiagnosticsDetail includes textual-approval-without-tool-call markers', () => {
  const detail = formatRuntimeDiagnosticsDetail({
    providerId: 'openai',
    model: 'gpt-5.3-codex',
    approvalPromptCount: 0,
    approvalApprovedCount: 1,
    approvalDeniedCount: 0,
    approvalPolicyBlockedCount: 0,
    approvalUserDeniedCount: 0,
    approvalTimeoutCount: 0,
    modelTextualApprovalWithoutToolCall: true,
    modelTextualApprovalCueCount: 2,
  })
  assert.match(detail, /model_textual_approval_without_tool_call: true/i)
  assert.match(detail, /model_textual_approval_cue_count: 2/i)
})

test('tool workflow telemetry helpers keep a low-cardinality payload', () => {
  const diagnostics = {
    providerId: 'openai',
    model: 'gpt-5.4',
    delegationBackend: 'addom_moa',
    delegationBackendPreference: 'addom_moa',
    availableDelegationBackends: ['openai_native', 'addom_moa'],
    nativeCollaborationModeId: '',
    toolWorkflowLintRejectCount: 0,
    toolWorkflowLintWarnCount: 0,
    toolWorkflowRerouteCount: 0,
    toolWorkflowWrongToolRetryCount: 0,
    toolWorkflowSurfaceNarrowed: true,
    toolWorkflowSuppressedToolCount: 2,
    toolWorkflowWriteIntentDetected: false,
    toolWorkflowApplyPatchFailureCount: 0,
    toolWorkflowApplyPatchRetryAllowedCount: 1,
    toolWorkflowApplyPatchHardBlockCount: 1,
    toolWorkflowRawDelegationExposureCount: 1,
    toolWorkflowCompactDelegationOnlyExposureCount: 0,
    toolWorkflowFetchBrowserCoexposureCount: 1,
    toolWorkflowFirstSuccessfulMutationLatencyMs: 0,
    toolWorkflowFailureClassCounts: {},
    toolWorkflowToolAttemptCounts: {},
    toolWorkflowToolFailureCounts: {},
    toolWorkflowWriteFailureCounts: {},
    toolWorkflowLintCodeCounts: {},
    toolWorkflowFamilyCounts: {},
    toolShadowIntent: 'targeted_edit',
    toolShadowIntentConfidence: 'high',
    requestedToolCount: 5,
    activeToolCount: 3,
  }

  recordToolWorkflowLintEvent(diagnostics, {
    toolName: 'apply_patch',
    lintResult: {
      decision: 'reject',
      lintCode: 'apply_patch_missing_hunk',
      failureClass: 'MALFORMED_PATCH_SYNTAX',
    },
  })
  recordToolWorkflowOutcome(diagnostics, {
    toolName: 'apply_patch',
    decision: 'approved',
    isError: true,
    failureClass: 'MALFORMED_PATCH_SYNTAX',
    rerouteToolName: 'write_file',
    turnStartedAt: 100,
    finishedAt: 180,
    repeatedBlockedRetry: true,
  })
  recordToolWorkflowOutcome(diagnostics, {
    toolName: 'write_file',
    decision: 'approved',
    isError: false,
    writeArtifactChanges: [{ filePath: 'src/app.js' }],
    turnStartedAt: 100,
    finishedAt: 260,
  })

  const payload = buildToolWorkflowTelemetryPayload(diagnostics, {
    threadId: 'thread_telemetry',
    turnId: 'turn_telemetry',
  })
  const detail = formatRuntimeDiagnosticsDetail(diagnostics)

  assert.equal(classifyToolWorkflowFamily('edit_file'), 'file')
  assert.deepEqual(payload, {
    threadId: 'thread_telemetry',
    turnId: 'turn_telemetry',
    version: 1,
    providerId: 'openai',
    model: 'gpt-5.4',
    toolSurfaceKind: '',
    delegationBackend: 'addom_moa',
    delegationBackendPreference: 'addom_moa',
    availableDelegationBackends: ['openai_native', 'addom_moa'],
    nativeCollaborationModeId: '',
    lintRejectCount: 1,
    lintWarnCount: 0,
    rerouteCount: 1,
    wrongToolRetryCount: 1,
    shadowIntent: 'targeted_edit',
    shadowIntentConfidence: 'high',
    requestedToolCount: 5,
    activeToolCount: 3,
    surfaceNarrowed: true,
    suppressedToolCount: 2,
    writeIntentDetected: true,
    applyPatchFailureCount: 1,
    applyPatchRetryAllowedCount: 1,
    applyPatchHardBlockCount: 1,
    rawDelegationExposureCount: 1,
    compactDelegationOnlyExposureCount: 0,
    fetchBrowserCoexposureCount: 1,
    firstSuccessfulMutationLatencyMs: 160,
    failureClassCounts: { MALFORMED_PATCH_SYNTAX: 2 },
    toolAttemptCounts: { apply_patch: 1, write_file: 1 },
    toolFailureCounts: { apply_patch: 1 },
    writeToolFailureCounts: { apply_patch: 1 },
    lintCodeCounts: { apply_patch_missing_hunk: 1 },
    toolFamilyCounts: { file: 3 },
  })
  assert.match(detail, /tool_workflow_summary: lint_reject=1, lint_warn=0, reroute=1, wrong_tool_retry=1/i)
  assert.match(detail, /tool_workflow_failure_classes: MALFORMED_PATCH_SYNTAX=2/i)
  assert.match(detail, /tool_workflow_tool_failures: apply_patch=1/i)
  assert.match(detail, /tool_workflow_write_tool_failures: apply_patch=1/i)
  assert.match(detail, /tool_workflow_lint_codes: apply_patch_missing_hunk=1/i)
  assert.match(detail, /tool_workflow_write_intent: true/i)
  assert.match(detail, /tool_workflow_surface_narrowed: true \(2 suppressed\)/i)
  assert.match(detail, /tool_workflow_apply_patch_failures: 1/i)
  assert.match(detail, /tool_workflow_apply_patch_retry_allowed: 1/i)
  assert.match(detail, /tool_workflow_apply_patch_hard_block: 1/i)
  assert.match(detail, /delegation_backend: addom_moa/i)
  assert.match(detail, /delegation_backends_available: openai_native, addom_moa/i)
  assert.match(detail, /delegation_backend_preference: addom_moa/i)
  assert.match(detail, /tool_workflow_raw_delegation_exposure: 1/i)
  assert.match(detail, /tool_workflow_fetch_browser_coexposure: 1/i)
  assert.match(detail, /tool_workflow_first_successful_mutation_ms: 160/i)
})

test('buildToolWorkflowTelemetryPayload emits baseline payloads for narrowed zero-error execute turns', () => {
  const payload = buildToolWorkflowTelemetryPayload({
    providerId: 'openai',
    model: 'gpt-5.4',
    toolSurfaceKind: 'addom_native',
    toolShadowIntent: 'targeted_edit',
    toolShadowIntentConfidence: 'high',
    requestedToolCount: 4,
    activeToolCount: 2,
    toolWorkflowSurfaceNarrowed: true,
    toolWorkflowSuppressedToolCount: 2,
    toolWorkflowToolAttemptCounts: {},
    toolWorkflowToolFailureCounts: {},
    toolWorkflowWriteFailureCounts: {},
    toolWorkflowFailureClassCounts: {},
    toolWorkflowLintCodeCounts: {},
    toolWorkflowFamilyCounts: {},
    toolWorkflowApplyPatchRetryAllowedCount: 0,
    toolWorkflowApplyPatchHardBlockCount: 0,
    toolWorkflowRawDelegationExposureCount: 0,
    toolWorkflowCompactDelegationOnlyExposureCount: 1,
    toolWorkflowFetchBrowserCoexposureCount: 1,
    nativeCollaborationModeId: '',
  }, {
    threadId: 'thread_zero',
    turnId: 'turn_zero',
  })

  assert.deepEqual(payload, {
    threadId: 'thread_zero',
    turnId: 'turn_zero',
    version: 1,
    providerId: 'openai',
    model: 'gpt-5.4',
    toolSurfaceKind: 'addom_native',
    delegationBackend: '',
    delegationBackendPreference: '',
    availableDelegationBackends: [],
    nativeCollaborationModeId: '',
    lintRejectCount: 0,
    lintWarnCount: 0,
    rerouteCount: 0,
    wrongToolRetryCount: 0,
    shadowIntent: 'targeted_edit',
    shadowIntentConfidence: 'high',
    requestedToolCount: 4,
    activeToolCount: 2,
    surfaceNarrowed: true,
    suppressedToolCount: 2,
    writeIntentDetected: false,
    applyPatchFailureCount: 0,
    applyPatchRetryAllowedCount: 0,
    applyPatchHardBlockCount: 0,
    rawDelegationExposureCount: 0,
    compactDelegationOnlyExposureCount: 1,
    fetchBrowserCoexposureCount: 1,
    firstSuccessfulMutationLatencyMs: 0,
    failureClassCounts: {},
    toolAttemptCounts: {},
    toolFailureCounts: {},
    writeToolFailureCounts: {},
    lintCodeCounts: {},
    toolFamilyCounts: {},
  })
})

test('formatRuntimeDiagnosticsDetail summarizes shell file-change hydration suppression reasons', () => {
  const diagnostics = {}

  recordToolWorkflowOutcome(diagnostics, {
    toolName: 'run_command',
    decision: 'approved',
    isError: false,
    shellWriteDiagnostics: {
      status: 'suppressed',
      reasonCodes: ['broad_command'],
    },
    turnStartedAt: 100,
    finishedAt: 120,
  })
  recordToolWorkflowOutcome(diagnostics, {
    toolName: 'run_command',
    decision: 'approved',
    isError: false,
    shellWriteDiagnostics: {
      status: 'hydrated',
      reasonCodes: [],
    },
    writeArtifactChanges: [{ filePath: 'src/file.txt' }],
    turnStartedAt: 100,
    finishedAt: 180,
  })

  const detail = formatRuntimeDiagnosticsDetail(diagnostics)

  assert.match(detail, /shell_file_change_hydration: hydrated=1, suppressed=1, non_file=0/i)
  assert.match(detail, /shell_file_change_suppression_reasons: broad_command=1/i)
})

test('write-intent turns that end without mutations emit explicit diagnostics and recovery reasons', () => {
  const diagnostics = {
    mode: 'execute',
    toolCallCount: 3,
    toolWorkflowWriteIntentDetected: true,
    toolWorkflowSuccessfulMutationCount: 0,
    toolWorkflowTerminalState: 'cancelled',
  }

  assert.equal(hasWriteIntentWithoutMutation(diagnostics), true)
  assert.equal(
    buildWriteIntentWithoutMutationReason(diagnostics),
    'No file changes were applied before the turn was stopped.',
  )

  const detail = formatRuntimeDiagnosticsDetail(diagnostics)
  assert.match(detail, /tool_workflow_write_intent: true/i)
  assert.match(detail, /tool_workflow_successful_mutations: 0/i)
  assert.match(detail, /tool_workflow_write_intent_without_mutation: true/i)
  assert.match(detail, /tool_workflow_terminal_state: cancelled/i)
  assert.match(detail, /tool_workflow_terminal_reason: No file changes were applied before the turn was stopped\./i)
})

test('runtime diagnostics emitter surfaces cancelled write-intent turns with no landed mutations', () => {
  const sent = []
  const persisted = []
  const diagnostics = {
    runtimeDiagnosticsVisible: true,
    mode: 'execute',
    requestedToolCount: 2,
    toolCallCount: 2,
    toolWorkflowWriteIntentDetected: true,
    toolWorkflowSuccessfulMutationCount: 0,
  }

  const emit = createRuntimeDiagnosticsEmitter({
    errorDiagnostics: diagnostics,
    adapterProfile: { wireApi: 'ai_sdk_stream_text:openai', transportFamily: 'openai_responses' },
    activeThreadId: 'thread-runtime',
    activeTurnId: 'turn-runtime',
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
  })

  emit({
    terminalState: 'cancelled',
    terminalReason: 'Stopped by user.',
  })

  assert.equal(sent.length, 1)
  assert.equal(sent[0]?.channel, 'chat:runtime-diagnostics')
  assert.match(String(sent[0]?.payload?.label || ''), /write-intent turn ended without durable file changes/i)
  assert.match(String(sent[0]?.payload?.detail || ''), /tool_workflow_terminal_state: cancelled/i)
  assert.equal(persisted[0]?.kind, 'runtime_diagnostics')
})

test('canonical runtime evidence deduplicates local and provider-native tool activity for one turn', () => {
  const evidence = summarizeCanonicalTurnToolEvidence([
    {
      eventId: 1,
      turnId: 'turn-runtime',
      kind: 'tool_executing',
      meta: { stepId: 'step-local-1', toolName: 'read_file' },
    },
    {
      eventId: 2,
      turnId: 'turn-runtime',
      kind: 'tool_result',
      meta: { stepId: 'step-local-1', toolName: 'read_file' },
    },
    {
      eventId: 3,
      turnId: 'turn-runtime',
      kind: 'provider_tool_output',
      meta: { toolCallId: 'native-web-1', toolName: 'web_search' },
    },
    {
      eventId: 4,
      turnId: 'turn-runtime',
      kind: 'openai_continuity_status',
      meta: {
        accountProtocol: { runtime: { version: '0.124.0' } },
        accountNativeActivity: {
          webSearch: { itemIds: ['native-web-1'], completed: true },
          commandExecution: { itemIds: ['native-command-1'], completed: true },
          fileChange: { itemIds: ['native-file-1'], completed: true },
          imageGeneration: { itemIds: ['native-image-1'], completed: true },
          plan: { itemIds: ['native-plan-1'], completed: true },
          reviewMode: { itemIds: ['native-review-1'], entered: true },
        },
      },
    },
    {
      eventId: 5,
      turnId: 'other-turn',
      kind: 'tool_executing',
      meta: { stepId: 'other-step', toolName: 'write_file' },
    },
  ], { turnId: 'turn-runtime' })

  assert.deepEqual(evidence, {
    available: true,
    localToolCallCount: 1,
    providerToolCallCount: 4,
    totalToolCallCount: 5,
    usedTools: ['command_execution', 'file_change', 'image_generation', 'read_file', 'web_search'],
    providerRuntimeVersion: '0.124.0',
  })
})

test('runtime diagnostics reconcile mutable counters with canonical provider activity', () => {
  const sent = []
  const diagnostics = {
    runtimeDiagnosticsVisible: true,
    mode: 'execute',
    requestedToolCount: 4,
    toolCallCount: 0,
    usedTools: [],
    mixedToolSurfaceDetected: true,
  }
  const emit = createRuntimeDiagnosticsEmitter({
    errorDiagnostics: diagnostics,
    getAdapterProfile: () => ({
      providerId: 'openai',
      wireApi: 'codex_app_server_chatgpt',
      transportFamily: 'openai_account',
      openaiRuntimeSupport: {
        authMethod: 'account',
        providerNativeRuntimeMode: 'provider_owned_runtime',
      },
    }),
    activeThreadId: 'thread-runtime',
    activeTurnId: 'turn-runtime',
    readTimelineEvents: () => [{
      eventId: 1,
      turnId: 'turn-runtime',
      kind: 'openai_continuity_status',
      meta: {
        accountProtocol: { runtime: { version: '0.124.0' } },
        accountNativeActivity: {
          webSearch: { itemIds: ['native-web-1'], completed: true },
          commandExecution: { itemIds: ['native-command-1'], completed: true },
          fileChange: { itemIds: ['native-file-1'], completed: true },
          imageGeneration: { itemIds: ['native-image-1'], completed: true },
        },
      },
    }],
    addomBuildIdentity: {
      version: '1.0.0',
      mode: 'development',
      processId: 4242,
      processStartedAt: '2026-07-29T10:00:00.000Z',
    },
    send: (channel, payload) => sent.push({ channel, payload }),
  })

  emit()

  assert.equal(diagnostics.toolCallCount, 4)
  assert.equal(diagnostics.zeroToolExecuteTurn, false)
  assert.deepEqual(diagnostics.usedTools, [
    'command_execution',
    'file_change',
    'image_generation',
    'web_search',
  ])
  assert.equal(sent.length, 1)
  assert.match(sent[0].payload.detail, /tool_calls_emitted: 4/i)
  assert.match(sent[0].payload.detail, /tool_activity_evidence: canonical_timeline/i)
  assert.match(sent[0].payload.detail, /tool_activity_counts: local=0, provider_native=4, total=4/i)
  assert.match(sent[0].payload.detail, /provider_runtime_version: 0\.124\.0/i)
  assert.match(sent[0].payload.detail, /addom_build_identity: version=1\.0\.0, mode=development, process_id=4242/i)
  assert.match(sent[0].payload.detail, /image_generation_protocol_support: supported .*qualification=qualified/i)
  assert.doesNotMatch(sent[0].payload.detail, /zero_tool_execute_turn: true/i)
})

test('provider-owned diagnostics do not assert zero tool activity when canonical evidence is unavailable', () => {
  const sent = []
  const diagnostics = {
    runtimeDiagnosticsVisible: true,
    mode: 'execute',
    requestedToolCount: 3,
    toolCallCount: 0,
    usedTools: [],
    mixedToolSurfaceDetected: true,
  }
  const emit = createRuntimeDiagnosticsEmitter({
    errorDiagnostics: diagnostics,
    getAdapterProfile: () => ({
      providerId: 'openai',
      openaiRuntimeSupport: {
        authMethod: 'account',
        providerNativeRuntimeMode: 'provider_owned_runtime',
      },
    }),
    readTimelineEvents: () => { throw new Error('database unavailable') },
    send: (channel, payload) => sent.push({ channel, payload }),
  })

  emit()

  assert.equal(diagnostics.zeroToolExecuteTurn, false)
  assert.equal(diagnostics.toolActivityEvidenceSource, 'unavailable')
  assert.match(sent[0].payload.detail, /tool_activity_evidence: unavailable/i)
  assert.doesNotMatch(sent[0].payload.detail, /zero_tool_execute_turn: true/i)
})

test('non-OpenAI diagnostics do not report OpenAI account protocol support', () => {
  const sent = []
  const emit = createRuntimeDiagnosticsEmitter({
    errorDiagnostics: {
      providerId: 'anthropic',
      runtimeDiagnosticsVisible: true,
      mode: 'execute',
      requestedToolCount: 1,
      toolCallCount: 1,
      mixedToolSurfaceDetected: true,
    },
    adapterProfile: { providerId: 'anthropic', wireApi: 'anthropic_messages' },
    readTimelineEvents: () => [],
    send: (channel, payload) => sent.push({ channel, payload }),
  })

  emit()

  assert.equal(sent.length, 1)
  assert.doesNotMatch(sent[0].payload.detail, /image_generation_protocol_support/i)
})
