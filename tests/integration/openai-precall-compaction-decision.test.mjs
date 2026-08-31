import test from 'node:test'
import assert from 'node:assert/strict'

import { COMPACTION_MODES } from '../../src/main/chat/continuity/compaction-mode-contract.mjs'
import { resolveOpenAIPreCallCompactionDecision } from '../../src/main/chat/continuity/openai-precall-compaction-decision.mjs'

test('openai precall compaction decision prefers provider truncation when policy and runtime both allow it', () => {
  const result = resolveOpenAIPreCallCompactionDecision({
    providerId: 'openai',
    modelSupport: {
      supportsProviderChainCompaction: true,
      supportsProviderTruncation: true,
    },
    providerRuntimeSettings: {
      openai: {
        usePreviousResponseId: false,
        useConversationState: false,
        useServerSideCompaction: true,
        serverSideCompactionThresholdTokens: 180_000,
        enableBackgroundMode: false,
      },
    },
    continuityPolicy: {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: true,
      providerCompactionAllowlist: ['openai'],
    },
    requestContext: {},
    previousResponseId: 'resp_prev_1',
    occupancyEstimateTokens: 12_000,
  })

  assert.equal(result.openAICompactionStrategy.mode, COMPACTION_MODES.PROVIDER_TRUNCATION)
  assert.equal(result.selectedCompactionMode, COMPACTION_MODES.PROVIDER_TRUNCATION)
  assert.deepEqual(result.candidateCompactionModes, [
    COMPACTION_MODES.PROVIDER_TRUNCATION,
    COMPACTION_MODES.LOCAL_SUMMARY,
  ])
  assert.equal(result.shouldStoreOpenAIState, true)
})

test('openai precall compaction decision derives provider truncation from the soft trigger percent when explicit tokens are unset', () => {
  const result = resolveOpenAIPreCallCompactionDecision({
    providerId: 'openai',
    modelSupport: {
      supportsProviderChainCompaction: true,
      supportsProviderTruncation: true,
    },
    providerRuntimeSettings: {
      openai: {
        usePreviousResponseId: false,
        useConversationState: false,
        useServerSideCompaction: true,
        serverSideCompactionThresholdTokens: 0,
        providerTruncationSoftTriggerPercent: 50,
        enableBackgroundMode: false,
      },
    },
    continuityPolicy: {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: true,
      providerCompactionAllowlist: ['openai'],
    },
    requestContext: {},
    previousResponseId: 'resp_prev_derived_1',
    occupancyEstimateTokens: 12_000,
    modelContextLimitTokens: 200_000,
  })

  assert.equal(result.openAICompactionStrategy.mode, COMPACTION_MODES.PROVIDER_TRUNCATION)
  assert.equal(result.openAICompactionStrategy.thresholdTokens, 100_000)
  assert.equal(result.selectedCompactionMode, COMPACTION_MODES.PROVIDER_TRUNCATION)
})

test('openai precall compaction decision falls back to provider chain compaction when truncation is policy-blocked', () => {
  const result = resolveOpenAIPreCallCompactionDecision({
    providerId: 'openai',
    modelSupport: {
      supportsProviderChainCompaction: true,
      supportsProviderTruncation: true,
    },
    providerRuntimeSettings: {
      openai: {
        usePreviousResponseId: false,
        useConversationState: false,
        useResponseCompaction: true,
        useServerSideCompaction: true,
      },
    },
    continuityPolicy: {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: false,
      providerCompactionAllowlist: ['openai'],
    },
    requestContext: {},
    previousResponseId: 'resp_prev_chain_1',
    occupancyEstimateTokens: 12_000,
  })

  assert.equal(result.openAICompactionStrategy.mode, COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
  assert.equal(result.selectedCompactionMode, COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
  assert.deepEqual(result.candidateCompactionModes, [
    COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
    COMPACTION_MODES.LOCAL_SUMMARY,
  ])
})

test('openai precall compaction decision keeps provider chain compaction disabled when runtime settings opt out', () => {
  const result = resolveOpenAIPreCallCompactionDecision({
    providerId: 'openai',
    modelSupport: {
      supportsProviderChainCompaction: true,
      supportsProviderTruncation: true,
    },
    providerRuntimeSettings: {
      openai: {
        usePreviousResponseId: true,
        useConversationState: false,
        useResponseCompaction: false,
        useServerSideCompaction: false,
      },
    },
    continuityPolicy: {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: false,
      providerCompactionAllowlist: ['openai'],
    },
    requestContext: {},
    previousResponseId: 'resp_prev_opted_out',
    occupancyEstimateTokens: 12_000,
  })

  assert.equal(result.effectiveOpenAIRuntimeSettings.useResponseCompaction, false)
  assert.equal(result.openAICompactionStrategy.mode, COMPACTION_MODES.NONE)
  assert.equal(result.selectedCompactionMode, COMPACTION_MODES.LOCAL_SUMMARY)
})

test('openai precall compaction decision reports one blocked manual-command reason from the shared helper', () => {
  const result = resolveOpenAIPreCallCompactionDecision({
    providerId: 'openai',
    modelSupport: {
      supportsProviderChainCompaction: true,
      supportsProviderTruncation: true,
    },
    providerRuntimeSettings: {
      openai: {
        allowPromptCompactionCommands: true,
        useServerSideCompaction: false,
      },
    },
    continuityPolicy: {
      providerChainCompactionEnabled: false,
      providerTruncationEnabled: true,
      providerCompactionAllowlist: ['openai'],
    },
    requestContext: {
      forceManualCompaction: true,
      commandOnly: true,
    },
    previousResponseId: 'resp_prev_policy_blocked',
    occupancyEstimateTokens: 12_000,
  })

  assert.equal(result.manualDecision?.shouldAttempt, false)
  assert.equal(result.manualDecision?.blockedReason, 'provider_chain_compaction_disabled')
  assert.equal(result.manualDecision?.fallbackCompactionMode, COMPACTION_MODES.NONE)
  assert.equal(result.manualDecision?.fallbackReason, 'command_only_turn_stopped')
  assert.deepEqual(result.manualDecision?.candidateCompactionModes, [
    COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
    COMPACTION_MODES.LOCAL_SUMMARY,
  ])
})

test('openai precall compaction decision uses Codex thread compaction for account-auth manual commands', () => {
  const result = resolveOpenAIPreCallCompactionDecision({
    providerId: 'openai',
    modelSupport: {
      supportsProviderChainCompaction: false,
      supportsProviderTruncation: false,
    },
    providerRuntimeSettings: {
      openai: {
        allowPromptCompactionCommands: true,
      },
    },
    continuityPolicy: {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: true,
      providerCompactionAllowlist: ['openai'],
    },
    requestContext: {
      forceManualCompaction: true,
    },
    openAIExecutionAuthContext: {
      authMethod: 'account',
    },
    accountBridgeThreadId: 'thr_account_1',
  })

  assert.equal(result.shouldStoreOpenAIState, true)
  assert.equal(result.selectedCompactionMode, COMPACTION_MODES.LOCAL_SUMMARY)
  assert.equal(result.manualDecision?.shouldAttempt, true)
  assert.equal(result.manualDecision?.requestedCompactionMode, COMPACTION_MODES.CODEX_THREAD_COMPACTION)
  assert.deepEqual(result.manualDecision?.candidateCompactionModes, [
    COMPACTION_MODES.CODEX_THREAD_COMPACTION,
    COMPACTION_MODES.LOCAL_SUMMARY,
  ])
})

test('openai precall compaction decision blocks account-auth manual compaction without a bridge thread id', () => {
  const result = resolveOpenAIPreCallCompactionDecision({
    providerId: 'openai',
    providerRuntimeSettings: {
      openai: {
        allowPromptCompactionCommands: true,
      },
    },
    continuityPolicy: {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: true,
      providerCompactionAllowlist: ['openai'],
    },
    requestContext: {
      forceManualCompaction: true,
      commandOnly: true,
    },
    openAIExecutionAuthContext: {
      authMethod: 'account',
    },
  })

  assert.equal(result.manualDecision?.shouldAttempt, false)
  assert.equal(result.manualDecision?.blockedReason, 'missing_account_bridge_thread_id')
  assert.equal(result.manualDecision?.fallbackCompactionMode, COMPACTION_MODES.NONE)
})

test('openai precall compaction decision derives account auto-compaction threshold when configured limit is automatic', () => {
  const result = resolveOpenAIPreCallCompactionDecision({
    providerId: 'openai',
    providerRuntimeSettings: {
      openai: {
        codexAutoThreadCompactionEnabled: true,
        codexAutoThreadCompactionTokenLimit: 0,
        providerTruncationSoftTriggerPercent: 50,
      },
    },
    openAIExecutionAuthContext: {
      authMethod: 'account',
    },
    accountBridgeThreadId: 'thr_account_auto_threshold',
    occupancyEstimateTokens: 120_000,
    modelContextLimitTokens: 200_000,
  })

  assert.equal(result.automaticAccountCompactionDecision?.shouldAttempt, true)
  assert.equal(result.automaticAccountCompactionDecision?.tokenLimit, 100_000)
  assert.equal(result.automaticAccountCompactionDecision?.thresholdSource, 'automatic')
  assert.equal(result.contextManagementDiagnostics?.selectedStrategy, COMPACTION_MODES.CODEX_THREAD_COMPACTION)
  assert.equal(result.contextManagementDiagnostics?.thresholdTokens, 100_000)
})

test('openai precall compaction decision disables prompt compaction commands by default', () => {
  const result = resolveOpenAIPreCallCompactionDecision({
    providerId: 'openai',
    modelSupport: {
      supportsProviderChainCompaction: true,
    },
    providerRuntimeSettings: {
      openai: {},
    },
    continuityPolicy: {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: false,
      providerCompactionAllowlist: ['openai'],
    },
    requestContext: {
      forceManualCompaction: true,
      commandOnly: true,
    },
    previousResponseId: 'resp_prev_default_disabled',
  })

  assert.equal(result.manualDecision?.shouldAttempt, false)
  assert.equal(result.manualDecision?.blockedReason, 'commands_disabled')
  assert.equal(result.manualDecision?.fallbackCompactionMode, COMPACTION_MODES.NONE)
})
