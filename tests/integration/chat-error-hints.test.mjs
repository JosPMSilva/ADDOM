import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildRunbookErrorReason,
  extractProviderErrorDetail,
  formatProviderErrorForUser,
  resolveRunbookErrorDetailMode,
  withAttachmentSupportHint,
  withModelSelectionHint,
} from '../../src/main/chat/chat-error-hints.mjs'

test('withModelSelectionHint does not misclassify prompt-cache compatibility as model unavailability', () => {
  const base = 'This model is compatible only with 24h extended prompt caching'
  const hinted = withModelSelectionHint(base, 'openai', 'gpt-5.6-terra')

  assert.equal(hinted, base)
})

test('withModelSelectionHint still identifies an explicitly unavailable model', () => {
  const hinted = withModelSelectionHint(
    'The requested model does not exist',
    'openai',
    'gpt-missing',
  )

  assert.match(hinted, /may be unavailable for openai/i)
})

test('withAttachmentSupportHint appends hint for attachment-processing errors', () => {
  const hinted = withAttachmentSupportHint(
    'Unable to process input image. Please retry.',
    'gemini',
    'gemini-2.5-flash',
  )

  assert.match(hinted, /Unable to process input image/i)
  assert.match(hinted, /may not accept PDF\/file attachments/i)
  assert.match(hinted, /gemini-2\.5-flash/i)
})

test('withAttachmentSupportHint leaves unrelated errors unchanged', () => {
  const base = 'Network timeout while contacting provider'
  const hinted = withAttachmentSupportHint(base, 'openai', 'gpt-5')
  assert.equal(hinted, base)
})

test('formatProviderErrorForUser emits concise quota guidance', () => {
  const err = new Error('You exceeded your current quota. Retry in 22.4s.')
  err.statusCode = 429
  err.responseBody = JSON.stringify({
    error: {
      status: 'RESOURCE_EXHAUSTED',
      message: 'Quota exceeded for metric: generate_content_free_tier_requests',
      details: [{ retryDelay: '22s' }],
    },
  })

  const formatted = formatProviderErrorForUser(err, 'gemini', 'gemini-2.5-flash')
  assert.match(formatted, /Quota or rate limit reached/i)
  assert.match(formatted, /gemini\/gemini-2\.5-flash/i)
  assert.match(formatted, /about \d+s/i)
  assert.ok(!formatted.includes('\n'))
})

test('formatProviderErrorForUser includes Anthropic input-token rate-limit headers', () => {
  const err = new Error('rate_limit_error: Input tokens per minute exceeded')
  err.statusCode = 429
  err.responseHeaders = {
    'anthropic-ratelimit-input-tokens-limit': '30000',
    'anthropic-ratelimit-input-tokens-remaining': '0',
    'retry-after': '7',
  }

  const formatted = formatProviderErrorForUser(err, 'anthropic', 'claude-sonnet-4-6')

  assert.match(formatted, /Quota or rate limit reached/i)
  assert.match(formatted, /anthropic\/claude-sonnet-4-6/i)
  assert.match(formatted, /input-token limit 30000/i)
  assert.match(formatted, /remaining input tokens 0/i)
  assert.match(formatted, /retry in about 7s/i)
  assert.match(formatted, /Reduce prompt size/i)
})

test('formatProviderErrorForUser emits content-shape hint for provider payload mismatch', () => {
  const err = new Error('messages[1].content must be a string')
  err.statusCode = 400
  err.data = {
    error: {
      message: 'messages[1].content must be a string',
      type: 'invalid_request_error',
    },
  }

  const formatted = formatProviderErrorForUser(err, 'groq', 'llama-3.3-70b-versatile')
  assert.match(formatted, /Request format rejected/i)
  assert.match(formatted, /groq\/llama-3\.3-70b-versatile/i)
  assert.match(formatted, /plain text/i)
  assert.match(formatted, /multimodal content support/i)
})

test('formatProviderErrorForUser emits retry guidance for no-output provider failures', () => {
  const err = new Error('No output generated. Check the stream for errors.')
  const formatted = formatProviderErrorForUser(err, 'groq', 'llama-3.3-70b-versatile')
  assert.match(formatted, /No output was returned/i)
  assert.match(formatted, /groq\/llama-3\.3-70b-versatile/i)
  assert.match(formatted, /Retry once/i)
})

test('extractProviderErrorDetail prefers nested provider payload detail', () => {
  const err = new Error('No output generated. Check the stream for errors.')
  err.lastError = new Error('provider wrapper')
  err.lastError.data = {
    error: {
      message: 'Request too large for model `qwen/qwen3-32b` on tokens per minute (TPM): Limit 6000, Requested 6036',
      type: 'tokens',
    },
  }

  const detail = extractProviderErrorDetail(err)
  assert.match(detail, /Request too large for model `qwen\/qwen3-32b`/i)
  assert.match(detail, /Limit 6000, Requested 6036/i)
})

test('extractProviderErrorDetail parses JSON responseBody fallback', () => {
  const err = new Error('No output generated. Check the stream for errors.')
  err.responseBody = JSON.stringify({
    error: {
      message: 'messages[1].content must be a string',
      type: 'invalid_request_error',
    },
  })

  const detail = extractProviderErrorDetail(err)
  assert.equal(detail, 'messages[1].content must be a string')
})

test('buildRunbookErrorReason includes actionable quota diagnostics', () => {
  const err = new Error('No output generated. Check the stream for errors.')
  err.statusCode = 429
  err.data = {
    error: {
      message: 'Rate limit reached for model `openai/gpt-oss-120b` on tokens per minute (TPM): Limit 8000, Used 4536, Requested 5113. Please try again in 12.3675s.',
      type: 'tokens',
    },
  }

  const reason = buildRunbookErrorReason({
    err,
    providerId: 'groq',
    model: 'openai/gpt-oss-120b',
    summarizedMessage: 'No output was returned by groq/openai/gpt-oss-120b.',
    providerDetail: String(err.data.error.message),
    diagnostics: {
      mode: 'execute',
      round: 1,
      requestedToolCount: 18,
      activeToolCount: 18,
      historyMessageCount: 25,
      preCallOccupancyEstimateTokens: 9600,
      promptOccupancyEstimateTokens: 10120,
      rollingTotalTokens: 0,
      continuityPacketTokens: 900,
      continuitySourceRefs: 18,
    },
  })

  assert.match(reason, /^Error:/i)
  assert.match(reason, /Provider detail:/i)
  assert.match(reason, /Why it failed: Provider quota\/rate limits/i)
  assert.match(reason, /What to do next:/i)
  assert.match(reason, /Diagnostics:/i)
  assert.match(reason, /provider_model: groq\/openai\/gpt-oss-120b/i)
  assert.match(reason, /pre_call_occupancy_tokens: 9600/i)
  assert.match(reason, /provider_retry_after_s: 13/i)
})

test('buildRunbookErrorReason includes local prompt budget diagnostics', () => {
  const err = new Error('Prompt preflight blocked anthropic/claude-sonnet-4-6: safe prompt estimate 30112 tokens exceeds hard ceiling 24000 tokens.')
  err.code = 'prompt_budget_hard_limit_exceeded'
  err.localPromptBudgetBlocked = true

  const reason = buildRunbookErrorReason({
    err,
    providerId: 'anthropic',
    model: 'claude-sonnet-4-6',
    summarizedMessage: String(err.message),
    providerDetail: '',
    diagnostics: {
      promptBudgetProfileId: 'anthropic_strict',
      promptBudgetProfileFamily: 'anthropic',
      promptBudgetStrictness: 'strict',
      promptBudgetHardGuardEnabled: true,
      promptBudgetResolvedCeilingTokens: 48_000,
      adaptiveBudgetSource: 'observed_headers',
      adaptiveBudgetConfidence: 'observed_stable',
      adaptiveBudgetScope: 'organization',
      adaptiveBudgetCapacityTier: 'medium',
      adaptiveBudgetObservedInputTpm: 80_000,
      adaptiveBudgetObservedOutputTpm: 8_000,
      adaptiveBudgetObservedRpm: 50,
      adaptiveBudgetResolutionSource: 'learned_profile',
      adaptiveBudgetResolutionReason: 'observed_medium_capacity',
      adaptiveBudgetResolvedCeilingTokens: 48_000,
      adaptiveBudgetResolvedExplorationMode: 'moderate',
      promptBudgetHardLimitExceeded: true,
      promptBudgetHardLimitTokens: 24_000,
      preflightBudgetAction: 'blocked',
      promptOccupancyEstimateTokens: 25_740,
      promptBudgetCategoryEstimates: {
        systemRuntimeTokens: 60,
        memoryTokens: 0,
        continuityTokens: 0,
        historyTokens: 25_100,
        activeToolSchemaTokens: 220,
        recentToolResultTokens: 0,
        outputReserveTokens: 16_000,
      },
      promptBudgetDominantContributors: [
        { category: 'historyTokens', tokens: 25_100 },
        { category: 'outputReserveTokens', tokens: 16_000 },
      ],
    },
  })

  assert.match(reason, /ADDOM blocked this request locally/i)
  assert.match(reason, /prompt_budget_profile: anthropic_strict/i)
  assert.match(reason, /prompt_budget_family: anthropic/i)
  assert.match(reason, /prompt_budget_resolved_ceiling_tokens: 48000/i)
  assert.match(reason, /adaptive_budget_source: observed_headers/i)
  assert.match(reason, /adaptive_budget_confidence: observed_stable/i)
  assert.match(reason, /adaptive_budget_scope: organization/i)
  assert.match(reason, /adaptive_budget_observed_capacity: input_tpm=80000, output_tpm=8000, rpm=50/i)
  assert.match(reason, /adaptive_budget_resolution_source: learned_profile/i)
  assert.match(reason, /adaptive_budget_resolution_reason: observed_medium_capacity/i)
  assert.match(reason, /adaptive_budget_resolved_ceiling_tokens: 48000/i)
  assert.match(reason, /adaptive_budget_resolved_exploration_mode: moderate/i)
  assert.match(reason, /prompt_budget_hard_limit_exceeded: true/i)
  assert.match(reason, /prompt_budget_hard_limit_tokens: 24000/i)
  assert.match(reason, /preflight_budget_action: blocked/i)
  assert.match(reason, /prompt_budget_categories:/i)
  assert.match(reason, /historyTokens=25100/i)
  assert.match(reason, /prompt_budget_dominant_contributors: historyTokens=25100, outputReserveTokens=16000/i)
})

test('buildRunbookErrorReason preserves degraded adaptive-budget diagnostics from the normalized runtime state', () => {
  const err = new Error('Prompt preflight blocked anthropic/claude-sonnet-4-6: safe prompt estimate 30112 tokens exceeds hard ceiling 24000 tokens.')
  err.code = 'prompt_budget_hard_limit_exceeded'
  err.localPromptBudgetBlocked = true

  const reason = buildRunbookErrorReason({
    err,
    providerId: 'anthropic',
    model: 'claude-sonnet-4-6',
    summarizedMessage: String(err.message),
    diagnostics: {
      promptBudgetProfileId: 'anthropic_strict',
      promptBudgetProfileFamily: 'anthropic',
      promptBudgetStrictness: 'strict',
      promptBudgetHardGuardEnabled: true,
      promptBudgetResolvedCeilingTokens: 24_000,
      adaptiveBudgetSource: 'fallback',
      adaptiveBudgetConfidence: 'fallback',
      adaptiveBudgetResolutionSource: 'fallback_profile',
      adaptiveBudgetResolutionReason: 'fallback_no_telemetry',
      adaptiveBudgetResolutionReasonOverride: 'expired_observation',
      adaptiveBudgetResolvedExplorationMode: 'strict',
      adaptiveBudgetCleanupDeletedCount: 1,
      promptBudgetHardLimitExceeded: true,
      promptBudgetHardLimitTokens: 24_000,
      preflightBudgetAction: 'blocked',
    },
  })

  assert.match(reason, /adaptive_budget_resolution_reason: expired_observation/i)
  assert.match(reason, /adaptive_budget_health: degraded \(expired_observation\)/i)
  assert.match(reason, /adaptive_budget_cleanup_deleted_profiles: 1/i)
})

test('buildRunbookErrorReason explains tool-choice-none mismatch clearly', () => {
  const err = new Error('Tool choice is none, but model called a tool')
  const reason = buildRunbookErrorReason({
    err,
    providerId: 'groq',
    model: 'llama-3.3-70b-versatile',
    summarizedMessage: 'No output was returned by groq/llama-3.3-70b-versatile.',
    providerDetail: 'Tool choice is none, but model called a tool',
    diagnostics: {
      mode: 'execute',
      round: 2,
      requestedToolCount: 18,
      activeToolCount: 0,
    },
  })

  assert.match(reason, /no-tools request path/i)
  assert.match(reason, /start a fresh thread/i)
  assert.match(reason, /tools_requested_active: 18\/0/i)
})

test('buildRunbookErrorReason includes runtime contract diagnostics for strict surface failures', () => {
  const err = new Error('tools are not supported for this model')
  const reason = buildRunbookErrorReason({
    err,
    providerId: 'openai',
    model: 'gpt-5.4',
    summarizedMessage: 'No output was returned by openai/gpt-5.4.',
    providerDetail: 'tools are not supported for this model',
    diagnostics: {
      mode: 'execute',
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
      wireApi: 'ai_sdk_stream_text:openai',
      workspaceRoot: 'C:/Users/example/Documents/ADDOM',
      workspaceTrustSource: 'workspace_guardrails',
      toolSurfaceKind: 'mixed',
      toolSurfaceComponents: ['addom_native', 'openai_hosted'],
      mixedToolSurfaceDetected: true,
      modelSupportsTools: false,
      modelSupportsAnyToolSurface: false,
      modelToolSupportMode: 'unsupported',
      modelCapabilitiesSource: 'runtime_error',
      capabilityBlockReasons: ['provider_rejected_tool_surface'],
      surfacePolicyReresolution: ['model_changed'],
      requestedToolCount: 7,
      activeToolCount: 0,
      toolCallCount: 0,
      zeroToolExecuteTurn: true,
      approvalPromptCount: 0,
      approvalApprovedCount: 0,
      approvalDeniedCount: 0,
      approvalPolicyBlockedCount: 0,
      approvalUserDeniedCount: 0,
      approvalTimeoutCount: 0,
      approvalAutoSources: {},
      riskyApprovalPromptCount: 0,
      surfaceResolutionFailure: 'provider_rejected_tool_surface',
    },
  })

  assert.match(reason, /permission_mode_in_sync: false/i)
  assert.match(reason, /adapter_id: openai:gpt-5\.4/i)
  assert.match(reason, /availability: unknown \(curated\)/i)
  assert.match(reason, /availability_gates: upstream:openai/i)
  assert.match(reason, /tool_surface_kind: mixed/i)
  assert.match(reason, /model_tool_support: false \(runtime_error\)/i)
  assert.match(reason, /model_any_tool_surface: false/i)
  assert.match(reason, /model_tool_support_mode: unsupported/i)
  assert.match(reason, /surface_policy_reresolution: model_changed/i)
  assert.match(reason, /zero_tool_execute_turn: true/i)
  assert.match(reason, /surface_resolution_failure: provider_rejected_tool_surface/i)
})

test('buildRunbookErrorReason preserves provider-owned runtime diagnostics instead of flattening them into generic no-tools', () => {
  const err = new Error('provider-owned runtime does not expose local tool calls')
  const reason = buildRunbookErrorReason({
    err,
    providerId: 'perplexity',
    model: 'sonar-pro',
    summarizedMessage: 'No output was returned by perplexity/sonar-pro.',
    providerDetail: 'provider-owned runtime does not expose local tool calls',
    diagnostics: {
      mode: 'execute',
      adapterSelection: 'curated',
      adapterReason: 'registry_exact',
      adapterId: 'perplexity:sonar-pro',
      availabilityState: 'unknown',
      availabilitySelectionState: 'curated',
      availabilityRequiresKey: true,
      availabilityConfigured: true,
      availabilityVerified: true,
      availabilityGates: ['upstream:perplexity'],
      providerNativeRuntimeFamily: 'perplexity_search',
      providerNativeRuntimeMode: 'provider_owned_runtime',
      toolSurfaceKind: 'perplexity_search',
      toolSurfaceComponents: ['perplexity_search'],
      modelSupportsTools: false,
      modelSupportsAnyToolSurface: true,
      modelToolSupportMode: 'provider_owned_runtime_only',
      modelCapabilitiesSource: 'merged_catalog',
      capabilityBlockReasons: ['provider_owned_runtime_no_local_tool_calls'],
      surfaceResolutionFailure: 'provider_owned_runtime_no_local_tool_calls',
    },
  })

  assert.match(reason, /provider_native_runtime_family: perplexity_search/i)
  assert.match(reason, /provider_native_runtime_mode: provider_owned_runtime/i)
  assert.match(reason, /model_any_tool_surface: true/i)
  assert.match(reason, /model_tool_support_mode: provider_owned_runtime_only/i)
  assert.match(reason, /capability_block_reasons: provider_owned_runtime_no_local_tool_calls/i)
})

test('resolveRunbookErrorDetailMode keys off developer diagnostics visibility', () => {
  assert.equal(resolveRunbookErrorDetailMode({
    commandSafety: {
      showDeveloperOptions: false,
    },
  }), 'basic')
  assert.equal(resolveRunbookErrorDetailMode({
    commandSafety: {
      showDeveloperOptions: true,
    },
  }), 'advanced')
})

test('buildRunbookErrorReason basic mode omits technical diagnostics', () => {
  const err = new Error('No output generated. Check the stream for errors.')
  err.data = {
    error: {
      message: 'Rate limit reached for model `openai/gpt-oss-120b`.',
      type: 'tokens',
    },
  }

  const reason = buildRunbookErrorReason({
    err,
    providerId: 'groq',
    model: 'openai/gpt-oss-120b',
    summarizedMessage: 'No output was returned by groq/openai/gpt-oss-120b.',
    providerDetail: String(err.data.error.message),
    detailMode: 'basic',
    diagnostics: {
      mode: 'execute',
      round: 1,
      requestedToolCount: 18,
      activeToolCount: 18,
      preCallOccupancyEstimateTokens: 9600,
    },
  })

  assert.match(reason, /^Error:/i)
  assert.match(reason, /Why it failed:/i)
  assert.match(reason, /What to do next:/i)
  assert.doesNotMatch(reason, /Diagnostics:/i)
  assert.doesNotMatch(reason, /provider_model:/i)
  assert.doesNotMatch(reason, /Provider detail:/i)
})
