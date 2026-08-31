import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildLiveSmokeRequest,
  buildLiveSmokeCases,
  formatLiveSmokeCompactionDiagnostics,
  isLiveSmokeEnabled,
  isLiveSmokeExecutionContractEnabled,
  isLiveSmokeStreamEnabled,
  createLiveSmokeExecutionContractRecorder,
  validateLiveSmokeExecutionContract,
  parseLiveSmokeProviderSelection,
  resolveOpenRouterSmokeModelIds,
  resolveLiveSmokeCompactionVisibility,
  resolveLiveSmokeApiKey,
  resolveLiveSmokeModelId,
  resolveLiveSmokeTimeoutMs,
} from '../../tests/live/provider-smoke-helpers.mjs'

test('live smoke helpers stay opt-in by default', () => {
  assert.equal(isLiveSmokeEnabled({}), false)
  assert.equal(isLiveSmokeStreamEnabled({}), false)
  assert.equal(isLiveSmokeExecutionContractEnabled({}), false)
  assert.deepEqual(parseLiveSmokeProviderSelection({}), [])
  assert.equal(resolveLiveSmokeTimeoutMs({}), 60_000)
  assert.equal(resolveOpenRouterSmokeModelIds({}).length > 10, true)
})

test('live smoke helpers resolve provider selection, keys, and model overrides', () => {
  const env = {
    ADDOM_LIVE_SMOKE: '1',
    ADDOM_LIVE_SMOKE_PROVIDERS: 'openai, gemini',
    ADDOM_LIVE_SMOKE_STREAM: 'true',
    ADDOM_LIVE_SMOKE_EXECUTION_CONTRACT: '1',
    OPENAI_API_KEY: 'sk-openai',
    GOOGLE_GENERATIVE_AI_API_KEY: 'gem-key',
    ADDOM_LIVE_SMOKE_GEMINI_MODEL: 'gemini-2.5-pro',
    ADDOM_LIVE_SMOKE_TIMEOUT_MS: '45000',
  }

  assert.equal(isLiveSmokeEnabled(env), true)
  assert.equal(isLiveSmokeStreamEnabled(env), true)
  assert.equal(isLiveSmokeExecutionContractEnabled(env), true)
  assert.deepEqual(parseLiveSmokeProviderSelection(env), ['openai', 'gemini'])
  assert.deepEqual(resolveLiveSmokeApiKey('openai', env), {
    apiKey: 'sk-openai',
    source: 'OPENAI_API_KEY',
  })
  assert.deepEqual(resolveLiveSmokeApiKey('gemini', env), {
    apiKey: 'gem-key',
    source: 'GOOGLE_GENERATIVE_AI_API_KEY',
  })
  assert.equal(resolveLiveSmokeModelId('gemini', env), 'gemini-2.5-pro')
  assert.equal(resolveLiveSmokeTimeoutMs(env), 45_000)
})

test('live execution-contract recorder validates ordering and terminal session closure', () => {
  const recorder = createLiveSmokeExecutionContractRecorder()
  recorder.record('reasoning', { detail: 'Checking' })
  recorder.record('tool_started', { sessionId: 'tool-1' })
  recorder.record('tool_result', { sessionId: 'tool-1' })
  recorder.record('terminal', { state: 'succeeded' })

  const validation = validateLiveSmokeExecutionContract(recorder.snapshot(), { supportsReasoning: true })
  assert.deepEqual(validation.errors, [])
  assert.equal(validation.valid, true)

  const noReasoningProfile = validateLiveSmokeExecutionContract([
    { kind: 'reasoning', at: 1, sequence: 1 },
    { kind: 'terminal', at: 2, sequence: 2 },
  ], { supportsReasoning: false })
  assert.equal(noReasoningProfile.valid, false)
  assert.match(noReasoningProfile.errors.join(' '), /must not synthesize reasoning/i)
})

test('openrouter smoke helpers resolve key sources and reviewed route allowlists', () => {
  const env = {
    ADDOM_LIVE_SMOKE: '1',
    OPENROUTER_API_KEY: 'sk-or-v1',
    ADDOM_LIVE_SMOKE_OPENROUTER_MODELS: 'openai/gpt-5.4,anthropic/claude-sonnet-4.6',
  }

  assert.deepEqual(resolveLiveSmokeApiKey('openrouter', env), {
    apiKey: 'sk-or-v1',
    source: 'OPENROUTER_API_KEY',
  })
  assert.deepEqual(resolveOpenRouterSmokeModelIds(env), [
    'openai/gpt-5.4',
    'anthropic/claude-sonnet-4.6',
  ])
})

test('live smoke cases only run for selected and configured providers', () => {
  const env = {
    ADDOM_LIVE_SMOKE: '1',
    ADDOM_LIVE_SMOKE_PROVIDERS: 'openai,anthropic',
    OPENAI_API_KEY: 'sk-openai',
  }

  const cases = buildLiveSmokeCases(env)
  const openai = cases.find((entry) => entry.providerId === 'openai')
  const anthropic = cases.find((entry) => entry.providerId === 'anthropic')
  const gemini = cases.find((entry) => entry.providerId === 'gemini')

  assert.equal(openai.run, true)
  assert.equal(openai.apiKeySource, 'OPENAI_API_KEY')
  assert.equal(anthropic.run, false)
  assert.match(anthropic.skipReason, /No API key found/i)
  assert.equal(gemini.run, false)
  assert.match(gemini.skipReason, /was not selected/i)
})

test('openrouter smoke cases expand to reviewed routes when selected and configured', () => {
  const env = {
    ADDOM_LIVE_SMOKE: '1',
    ADDOM_LIVE_SMOKE_PROVIDERS: 'openrouter',
    OPENROUTER_API_KEY: 'sk-or-v1',
    ADDOM_LIVE_SMOKE_OPENROUTER_MODELS: 'openai/gpt-5.4,google/gemini-2.5-pro',
  }

  const cases = buildLiveSmokeCases(env).filter((entry) => entry.providerId === 'openrouter')

  assert.deepEqual(cases.map((entry) => entry.modelId), [
    'openai/gpt-5.4',
    'google/gemini-2.5-pro',
  ])
  assert.equal(cases.every((entry) => entry.run === true), true)
})

test('live smoke compaction visibility uses the shared diagnostics vocabulary', () => {
  const openai = resolveLiveSmokeCompactionVisibility({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    occupancyEstimateTokens: 190_000,
    providerRuntimeSettings: {
      openai: {
        useServerSideCompaction: false,
        useResponseCompaction: true,
        serverSideCompactionThresholdTokens: 0,
      },
    },
  })
  const anthropic = resolveLiveSmokeCompactionVisibility({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-5',
    providerRuntimeSettings: {
      anthropic: {
        useContextManagementCompaction: true,
      },
    },
  })
  const formatted = formatLiveSmokeCompactionDiagnostics({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    transport: 'stream',
    compaction: openai,
    providerResponseMeta: {
      autoCompactionApplied: true,
      autoCompactionIds: ['cmp_auto_1'],
    },
  })

  assert.equal(openai.selectedCompactionMode, 'provider_chain_compaction')
  assert.deepEqual(openai.candidateCompactionModes, [
    'provider_chain_compaction',
    'local_summary',
  ])
  assert.equal(anthropic.selectedCompactionMode, 'provider_truncation')
  assert.deepEqual(anthropic.candidateCompactionModes, [
    'provider_truncation',
    'local_summary',
  ])
  assert.equal(anthropic.providerTruncationEnabled, true)
  assert.equal(anthropic.providerTruncationSoftTriggerPercent, 85)
  assert.equal(anthropic.providerTruncationThresholdTokens > 0, true)
  assert.equal(anthropic.providerTruncationForcedTriggerTokens >= anthropic.providerTruncationThresholdTokens, true)
  assert.match(formatted, /selected_compaction_mode: provider_chain_compaction/)
  assert.match(formatted, /candidate_compaction_modes: provider_chain_compaction, local_summary/)
  assert.match(formatted, /provider_truncation_soft_trigger_percent: 85/)
  assert.match(formatted, /provider_truncation_enabled: false/)
  assert.match(formatted, /provider_auto_compaction_applied: true/)
  assert.match(formatted, /provider_auto_compaction_ids: cmp_auto_1/)
})

test('anthropic live smoke compaction visibility reports explicit local fallback when disabled', () => {
  const anthropic = resolveLiveSmokeCompactionVisibility({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-5',
    providerRuntimeSettings: {
      anthropic: {
        useContextManagementCompaction: false,
      },
    },
  })
  const formatted = formatLiveSmokeCompactionDiagnostics({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-5',
    transport: 'stream_response',
    compaction: anthropic,
    providerResponseMeta: {
      appliedContextManagement: true,
      contextManagementEdits: ['compact_20260112'],
    },
  })

  assert.equal(anthropic.selectedCompactionMode, 'local_summary')
  assert.deepEqual(anthropic.candidateCompactionModes, ['local_summary'])
  assert.equal(anthropic.compactionFailureReason, 'provider_truncation_disabled')
  assert.equal(anthropic.fallbackCompactionMode, 'local_summary')
  assert.equal(anthropic.fallbackReason, 'provider_truncation_unavailable')
  assert.equal(anthropic.providerTruncationEnabled, false)
  assert.match(formatted, /provider_context_management_applied: true/)
  assert.match(formatted, /provider_context_management_edits: compact_20260112/)
})

test('live smoke request builder stays minimal by default and supports compaction probe overrides', () => {
  const baseline = buildLiveSmokeRequest({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-5',
    env: {},
  })
  const anthropicProbe = buildLiveSmokeRequest({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-5',
    env: {
      ADDOM_LIVE_SMOKE_COMPACTION_PROBE: '1',
      ADDOM_LIVE_SMOKE_ANTHROPIC_COMPACTION_THRESHOLD_TOKENS: '5000',
      ADDOM_LIVE_SMOKE_COMPACTION_PADDING_CHARS: '18000',
    },
  })
  const openaiProbe = buildLiveSmokeRequest({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    env: {
      ADDOM_LIVE_SMOKE_COMPACTION_PROBE: '1',
      ADDOM_LIVE_SMOKE_COMPACTION_THRESHOLD_TOKENS: '6000',
    },
  })

  assert.deepEqual(baseline, {
    messages: [{ role: 'user', content: 'Reply with exactly ADDOM_LIVE_SMOKE_OK and nothing else.' }],
    providerRuntimeSettings: null,
  })
  assert.equal(String(anthropicProbe.messages?.[0]?.content || '').includes('ADDOM_LIVE_SMOKE_OK'), true)
  assert.equal(anthropicProbe.providerRuntimeSettings?.anthropic?.useContextManagementCompaction, true)
  assert.equal(anthropicProbe.providerRuntimeSettings?.anthropic?.contextManagementCompactionThresholdTokens, 5000)
  assert.equal(anthropicProbe.providerRuntimeSettings?.anthropic?.providerTruncationSoftTriggerPercent, 85)
  assert.equal(openaiProbe.providerRuntimeSettings?.openai?.useServerSideCompaction, false)
  assert.equal(openaiProbe.providerRuntimeSettings?.openai?.useResponseCompaction, true)
  assert.equal(openaiProbe.providerRuntimeSettings?.openai?.serverSideCompactionThresholdTokens, 0)
  assert.equal(openaiProbe.providerRuntimeSettings?.openai?.providerTruncationSoftTriggerPercent, 85)
})
