import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildEmptyPromptBudgetDiagnosticSnapshot,
  resolveProviderPromptBudgetProfile,
} from '../../src/main/chat/provider-prompt-budget-profile.mjs'

const RECENT_OBSERVED_AT = Date.UTC(2026, 3, 14, 18, 6, 40)
const RECENT_OBSERVED_NOW = Date.UTC(2026, 3, 16, 12, 0, 0)

async function withMockedNow(nowMs, callback) {
  const originalNow = Date.now
  Date.now = () => nowMs
  try {
    return await callback()
  } finally {
    Date.now = originalNow
  }
}

test('prompt budget diagnostic snapshot defaults stay stable for downstream diagnostics contracts', () => {
  assert.deepEqual(buildEmptyPromptBudgetDiagnosticSnapshot(), {
    promptBudgetProfileId: '',
    promptBudgetProfileFamily: '',
    promptBudgetStrictness: '',
    promptBudgetHardGuardEnabled: null,
    promptBudgetResolvedCeilingTokens: null,
    adaptiveBudgetSource: '',
    adaptiveBudgetConfidence: '',
    adaptiveBudgetScope: '',
    adaptiveBudgetCapacityTier: '',
    adaptiveBudgetObservedInputTpm: 0,
    adaptiveBudgetObservedOutputTpm: 0,
    adaptiveBudgetObservedRpm: 0,
    adaptiveBudgetLastObservedAt: 0,
    adaptiveBudgetResolutionSource: '',
    adaptiveBudgetResolutionReason: '',
    adaptiveBudgetResolvedCeilingTokens: null,
    adaptiveBudgetResolvedExplorationMode: '',
    adaptiveBudgetRuntimeOverrideApplied: false,
    adaptiveBudgetRuntimeOverrideSource: '',
    adaptiveBudgetRuntimeOverrideCeilingTokens: 0,
    adaptiveBudgetRuntimeOverrideExplorationMode: '',
  })
})

test('anthropic strict profile applies hidden runtime overrides from a provider settings map', () => {
  const profile = resolveProviderPromptBudgetProfile({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    runtimeSettings: {
      anthropic: {
        defaultMaxOutputTokensOverride: '12000',
        toolResultBudgetCharsOverride: '18000',
        oldToolResultPruningEnabled: false,
        promptPreflightHardGuardEnabled: false,
      },
    },
  })

  assert.equal(profile.id, 'anthropic_strict')
  assert.equal(profile.family, 'anthropic')
  assert.equal(profile.defaultMaxOutputTokens, 12_000)
  assert.equal(profile.perToolOutputPreviewChars, 18_000)
  assert.equal(profile.perTurnToolResultBudgetChars, 18_000)
  assert.equal(profile.oldToolResultProtectChars, 18_000)
  assert.equal(profile.oldToolResultPruningEnabled, false)
  assert.equal(profile.oldToolResultPrune, 'disabled')
  assert.equal(profile.promptPreflightHardGuardEnabled, false)
  assert.equal(profile.localPreflightInputCeilingTokens, null)
  assert.equal(profile.explorationToolBudgetMode, 'strict')
  assert.equal(profile.adaptiveBudgetSource, 'fallback')
  assert.equal(profile.adaptiveBudgetConfidence, 'fallback')
  assert.equal(profile.adaptiveBudgetResolutionSource, 'fallback_profile')
  assert.equal(profile.adaptiveBudgetResolutionReason, 'fallback_no_telemetry')
  assert.equal(profile.runtimeSettingsPresent, true)
})

test('anthropic learned medium-capacity profile derives an adaptive medium ceiling and exploration tier', async () => {
  await withMockedNow(RECENT_OBSERVED_NOW, async () => {
    const profile = resolveProviderPromptBudgetProfile({
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      learnedBudgetProfile: {
        profileSource: 'observed_headers',
        confidence: 'observed_stable',
        organizationId: 'org_medium',
        credentialFingerprint: 'sha256:medium',
        inputTpmLimit: 80_000,
        outputTpmLimit: 8_000,
        requestsPerMinuteLimit: 50,
        lastObservedAt: RECENT_OBSERVED_AT,
      },
    })

    assert.equal(profile.id, 'anthropic_strict')
    assert.equal(profile.localPreflightInputCeilingTokens, 48_000)
    assert.equal(profile.explorationToolBudgetMode, 'moderate')
    assert.equal(profile.perToolOutputPreviewChars, 40_000)
    assert.equal(profile.perTurnToolResultBudgetChars, 80_000)
    assert.equal(profile.oldToolResultProtectChars, 32_000)
    assert.equal(profile.adaptiveBudgetSource, 'observed_headers')
    assert.equal(profile.adaptiveBudgetConfidence, 'observed_stable')
    assert.equal(profile.adaptiveBudgetScope, 'organization')
    assert.equal(profile.adaptiveBudgetCapacityTier, 'medium')
    assert.equal(profile.adaptiveBudgetOrganizationId, 'org_medium')
    assert.equal(profile.adaptiveBudgetObservedInputTpm, 80_000)
    assert.equal(profile.adaptiveBudgetResolutionSource, 'learned_profile')
    assert.equal(profile.adaptiveBudgetResolutionReason, 'observed_medium_capacity')
    assert.equal(profile.adaptiveBudgetPreflightCeilingTokens, 48_000)
  })
})

test('anthropic learned high-capacity profile derives a relaxed ceiling from observed input TPM', async () => {
  await withMockedNow(RECENT_OBSERVED_NOW, async () => {
    const profile = resolveProviderPromptBudgetProfile({
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      learnedBudgetProfile: {
        profileSource: 'observed_headers',
        confidence: 'observed_once',
        organizationId: 'org_large',
        credentialFingerprint: 'sha256:large',
        inputTpmLimit: 300_000,
        lastObservedAt: RECENT_OBSERVED_AT,
      },
    })

    assert.equal(profile.id, 'anthropic_strict')
    assert.equal(profile.localPreflightInputCeilingTokens, 165_000)
    assert.equal(profile.explorationToolBudgetMode, 'relaxed')
    assert.equal(profile.perToolOutputPreviewChars, 50_000)
    assert.equal(profile.perTurnToolResultBudgetChars, 100_000)
    assert.equal(profile.oldToolResultProtectChars, 40_000)
    assert.equal(profile.adaptiveBudgetObservedInputTpm, 300_000)
    assert.equal(profile.adaptiveBudgetCapacityTier, 'very_high')
    assert.equal(profile.adaptiveBudgetResolutionSource, 'learned_profile')
    assert.equal(profile.adaptiveBudgetResolutionReason, 'observed_very_high_capacity')
    assert.equal(profile.adaptiveBudgetPreflightCeilingTokens, 165_000)
  })
})

test('anthropic learned profile keeps adaptive limits but marks stale observations explicitly', () => {
  const nowMs = Date.UTC(2026, 3, 16, 12, 0, 0)
  const originalNow = Date.now
  Date.now = () => nowMs
  try {
    const profile = resolveProviderPromptBudgetProfile({
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      learnedBudgetProfile: {
        profileSource: 'observed_headers',
        confidence: 'observed_stable',
        organizationId: 'org_stale',
        credentialFingerprint: 'sha256:stale',
        inputTpmLimit: 80_000,
        outputTpmLimit: 8_000,
        requestsPerMinuteLimit: 50,
        lastObservedAt: nowMs - (8 * 24 * 60 * 60 * 1000),
      },
    })

    assert.equal(profile.adaptiveBudgetSource, 'observed_headers')
    assert.equal(profile.adaptiveBudgetConfidence, 'observed_stable')
    assert.equal(profile.localPreflightInputCeilingTokens, 48_000)
    assert.equal(profile.explorationToolBudgetMode, 'moderate')
    assert.equal(profile.adaptiveBudgetResolutionSource, 'learned_profile')
    assert.equal(profile.adaptiveBudgetResolutionReason, 'stale_observation')
  } finally {
    Date.now = originalNow
  }
})

test('anthropic expired learned profile falls back to the conservative static profile', () => {
  const nowMs = Date.UTC(2026, 3, 16, 12, 0, 0)
  const originalNow = Date.now
  Date.now = () => nowMs
  try {
    const profile = resolveProviderPromptBudgetProfile({
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      learnedBudgetProfile: {
        profileSource: 'observed_headers',
        confidence: 'observed_stable',
        organizationId: 'org_expired',
        credentialFingerprint: 'sha256:expired',
        inputTpmLimit: 80_000,
        outputTpmLimit: 8_000,
        requestsPerMinuteLimit: 50,
        lastObservedAt: nowMs - (31 * 24 * 60 * 60 * 1000),
      },
    })

    assert.equal(profile.adaptiveBudgetSource, 'fallback')
    assert.equal(profile.adaptiveBudgetConfidence, 'fallback')
    assert.equal(profile.localPreflightInputCeilingTokens, 24_000)
    assert.equal(profile.explorationToolBudgetMode, 'strict')
    assert.equal(profile.adaptiveBudgetResolutionSource, 'fallback_profile')
    assert.equal(profile.adaptiveBudgetResolutionReason, 'expired_observation')
  } finally {
    Date.now = originalNow
  }
})

test('anthropic invalid learned profile falls back conservatively instead of trusting partial telemetry', () => {
  const profile = resolveProviderPromptBudgetProfile({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    learnedBudgetProfile: {
      profileSource: 'observed_headers',
      confidence: 'observed_once',
      organizationId: 'org_invalid',
      credentialFingerprint: 'sha256:invalid',
      lastObservedAt: Date.now() - (60 * 60 * 1000),
    },
  })

  assert.equal(profile.adaptiveBudgetSource, 'fallback')
  assert.equal(profile.adaptiveBudgetConfidence, 'fallback')
  assert.equal(profile.localPreflightInputCeilingTokens, 24_000)
  assert.equal(profile.explorationToolBudgetMode, 'strict')
  assert.equal(profile.adaptiveBudgetResolutionSource, 'fallback_profile')
  assert.equal(profile.adaptiveBudgetResolutionReason, 'invalid_observation')
})

test('anthropic hidden runtime overrides can pin adaptive ceiling and exploration mode without changing learned source metadata', () => {
  const profile = resolveProviderPromptBudgetProfile({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    runtimeSettings: {
      anthropic: {
        adaptiveInputCeilingOverrideTokens: '60000',
        adaptiveExplorationModeOverride: 'relaxed',
      },
    },
    learnedBudgetProfile: {
      profileSource: 'observed_headers',
      confidence: 'observed_stable',
      organizationId: 'org_medium',
      credentialFingerprint: 'sha256:medium',
      inputTpmLimit: 80_000,
      outputTpmLimit: 8_000,
      requestsPerMinuteLimit: 50,
      lastObservedAt: Date.now() - (60 * 60 * 1000),
    },
  })

  assert.equal(profile.adaptiveBudgetSource, 'observed_headers')
  assert.equal(profile.adaptiveBudgetConfidence, 'observed_stable')
  assert.equal(profile.localPreflightInputCeilingTokens, 60_000)
  assert.equal(profile.adaptiveBudgetPreflightCeilingTokens, 60_000)
  assert.equal(profile.explorationToolBudgetMode, 'relaxed')
  assert.equal(profile.perToolOutputPreviewChars, 50_000)
  assert.equal(profile.perTurnToolResultBudgetChars, 100_000)
  assert.equal(profile.adaptiveBudgetResolutionSource, 'runtime_override')
  assert.equal(profile.adaptiveBudgetResolutionReason, 'runtime_override')
  assert.equal(profile.adaptiveBudgetRuntimeOverrideApplied, true)
  assert.equal(profile.adaptiveBudgetRuntimeOverrideSource, 'provider_runtime_settings')
  assert.equal(profile.adaptiveBudgetRuntimeOverrideCeilingTokens, 60_000)
  assert.equal(profile.adaptiveBudgetRuntimeOverrideExplorationMode, 'relaxed')
})

test('openai moderate profile keeps defaults unless hidden overrides are explicitly set', () => {
  const defaultProfile = resolveProviderPromptBudgetProfile({
    providerId: 'openai',
    modelId: 'gpt-5.3-codex',
  })
  const overriddenProfile = resolveProviderPromptBudgetProfile({
    providerId: 'openai',
    modelId: 'gpt-5.3-codex',
    runtimeSettings: {
      openai: {
        defaultMaxOutputTokensOverride: '9000',
        toolResultBudgetCharsOverride: '24000',
      },
    },
  })

  assert.equal(defaultProfile.id, 'openai_moderate')
  assert.equal(defaultProfile.family, 'openai')
  assert.equal(defaultProfile.defaultMaxOutputTokens, null)
  assert.equal(defaultProfile.perToolOutputPreviewChars, 50_000)
  assert.equal(defaultProfile.oldToolResultPruningEnabled, true)
  assert.equal(defaultProfile.promptPreflightHardGuardEnabled, true)

  assert.equal(overriddenProfile.defaultMaxOutputTokens, 9_000)
  assert.equal(overriddenProfile.perToolOutputPreviewChars, 24_000)
  assert.equal(overriddenProfile.perTurnToolResultBudgetChars, 24_000)
  assert.equal(overriddenProfile.oldToolResultProtectChars, 24_000)
  assert.equal(overriddenProfile.localPreflightInputCeilingTokens, null)
})

test('generic remote profile resolves for non-special remote providers and accepts direct scoped overrides', () => {
  const profile = resolveProviderPromptBudgetProfile({
    providerId: 'groq',
    modelId: 'llama-4-maverick',
    runtimeSettings: {
      defaultMaxOutputTokensOverride: '4096',
      toolResultBudgetCharsOverride: '12000',
    },
  })

  assert.equal(profile.id, 'generic_remote')
  assert.equal(profile.family, 'remote')
  assert.equal(profile.defaultMaxOutputTokens, 4_096)
  assert.equal(profile.perToolOutputPreviewChars, 12_000)
  assert.equal(profile.perTurnToolResultBudgetChars, 12_000)
  assert.equal(profile.oldToolResultProtectChars, 12_000)
  assert.equal(profile.oldToolResultPruningEnabled, true)
  assert.equal(profile.promptPreflightHardGuardEnabled, true)
})

test('local profile remains distinct and does not enable a remote preflight ceiling by default', () => {
  const profile = resolveProviderPromptBudgetProfile({
    providerId: 'ollama',
    modelId: 'qwen2.5-coder:latest',
    mode: 'execute',
  })

  assert.equal(profile.id, 'local')
  assert.equal(profile.family, 'local')
  assert.equal(profile.mode, 'execute')
  assert.equal(profile.defaultMaxOutputTokens, null)
  assert.equal(profile.localPreflightInputCeilingTokens, null)
  assert.equal(profile.oldToolResultPruningEnabled, true)
  assert.equal(profile.promptPreflightHardGuardEnabled, true)
})
