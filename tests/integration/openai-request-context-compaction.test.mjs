import test from 'node:test'
import assert from 'node:assert/strict'

import { COMPACTION_MODES } from '../../src/main/chat/continuity/compaction-mode-contract.mjs'
import {
  applyOpenAIRequestContextCompaction,
  buildOpenAIRequestContextSnapshot,
  resolveOpenAIRequestContextCompaction,
} from '../../src/main/api-clients/openai-request-context-compaction.mjs'

test('openai request-context compaction resolver normalizes the explicit nested contract', () => {
  const result = resolveOpenAIRequestContextCompaction({
    compaction: {
      requestedMode: COMPACTION_MODES.PROVIDER_TRUNCATION,
      selectedMode: COMPACTION_MODES.LOCAL_SUMMARY,
      candidateModes: [
        COMPACTION_MODES.PROVIDER_TRUNCATION,
        COMPACTION_MODES.LOCAL_SUMMARY,
      ],
      failureReason: 'below_threshold',
      fallbackMode: COMPACTION_MODES.LOCAL_SUMMARY,
      fallbackReason: 'provider_truncation_unavailable',
      forceProviderTruncation: true,
      providerTruncationThresholdTokens: 180_000,
    },
  })

  assert.deepEqual(result, {
    requestedCompactionMode: COMPACTION_MODES.PROVIDER_TRUNCATION,
    selectedCompactionMode: COMPACTION_MODES.LOCAL_SUMMARY,
    candidateCompactionModes: [
      COMPACTION_MODES.PROVIDER_TRUNCATION,
      COMPACTION_MODES.LOCAL_SUMMARY,
    ],
    compactionFailureReason: 'below_threshold',
    fallbackCompactionMode: COMPACTION_MODES.LOCAL_SUMMARY,
    fallbackReason: 'provider_truncation_unavailable',
    forceProviderTruncation: true,
    providerTruncationThresholdTokens: 180_000,
  })
})

test('openai request-context compaction writer keeps compatibility aliases while writing the shared nested contract', () => {
  const result = applyOpenAIRequestContextCompaction({
    previousResponseId: 'resp_prev_1',
    store: true,
  }, {
    requestedCompactionMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
    selectedCompactionMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
    candidateCompactionModes: [
      COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
      COMPACTION_MODES.LOCAL_SUMMARY,
    ],
  })

  assert.equal(result.previousResponseId, 'resp_prev_1')
  assert.equal(result.store, true)
  assert.equal(result.compactionStrategy, COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
  assert.equal(result.selectedCompactionMode, COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
  assert.deepEqual(result.candidateCompactionModes, [
    COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
    COMPACTION_MODES.LOCAL_SUMMARY,
  ])
  assert.deepEqual(result.compaction, {
    requestedMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
    selectedMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
    candidateModes: [
      COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
      COMPACTION_MODES.LOCAL_SUMMARY,
    ],
  })
})

test('openai request-context snapshot keeps continuity and compaction fields while dropping bulky transport-only state', () => {
  const result = buildOpenAIRequestContextSnapshot({
    previousResponseId: 'resp_prev_1',
    conversationId: 'conv_prev_1',
    accountBridgeThreadId: 'thr_prev_1',
    accountBridgeProjectFolder: 'C:/Users/example/Desktop/test/P21',
    accountDynamicToolSignature: 'sig_prev_1',
    accountDelegationBackend: 'OPENAI_NATIVE',
    accountCollaborationModeId: 'default',
    store: true,
    manualCompactedWindow: [{ type: 'compaction', id: 'cmp_prev_1' }],
    compaction: {
      requestedMode: COMPACTION_MODES.PROVIDER_TRUNCATION,
      selectedMode: COMPACTION_MODES.LOCAL_SUMMARY,
      candidateModes: [COMPACTION_MODES.PROVIDER_TRUNCATION, COMPACTION_MODES.LOCAL_SUMMARY],
      providerTruncationThresholdTokens: 180_000,
    },
  })

  assert.equal(result.previousResponseId, 'resp_prev_1')
  assert.equal(result.conversationId, 'conv_prev_1')
  assert.equal(result.accountBridgeThreadId, 'thr_prev_1')
  assert.equal(result.accountBridgeProjectFolder, 'C:/Users/example/Desktop/test/P21')
  assert.equal(result.accountDynamicToolSignature, 'sig_prev_1')
  assert.equal(result.accountDelegationBackend, 'openai_native')
  assert.equal(result.accountCollaborationModeId, 'default')
  assert.equal(result.store, true)
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'manualCompactedWindow'), false)
  assert.deepEqual(result.compaction, {
    requestedMode: COMPACTION_MODES.PROVIDER_TRUNCATION,
    selectedMode: COMPACTION_MODES.LOCAL_SUMMARY,
    candidateModes: [COMPACTION_MODES.PROVIDER_TRUNCATION, COMPACTION_MODES.LOCAL_SUMMARY],
    providerTruncationThresholdTokens: 180_000,
  })
})

test('openai request-context compaction round-trips explicit compaction event phase/type fields', () => {
  const written = applyOpenAIRequestContextCompaction({}, {
    requestedCompactionMode: COMPACTION_MODES.PROVIDER_TRUNCATION,
    selectedCompactionMode: COMPACTION_MODES.PROVIDER_TRUNCATION,
    compactionEventType: 'provider_truncation',
    compactionEventPhase: 'resumed_after',
    compactionEventOccurred: true,
    canonicalHandoffUsed: true,
    carryForwardSource: 'both',
  })

  assert.deepEqual(written.compaction, {
    requestedMode: COMPACTION_MODES.PROVIDER_TRUNCATION,
    selectedMode: COMPACTION_MODES.PROVIDER_TRUNCATION,
    candidateModes: [COMPACTION_MODES.PROVIDER_TRUNCATION],
    eventType: 'provider_truncation',
    eventPhase: 'resumed_after',
    eventOccurred: true,
    canonicalHandoffUsed: true,
    carryForwardSource: 'both',
  })

  const resolved = resolveOpenAIRequestContextCompaction(written)
  assert.equal(resolved.compactionEventType, 'provider_truncation')
  assert.equal(resolved.compactionEventPhase, 'resumed_after')
  assert.equal(resolved.compactionEventOccurred, true)
  assert.equal(resolved.canonicalHandoffUsed, true)
  assert.equal(resolved.carryForwardSource, 'both')
})
