import test from 'node:test'
import assert from 'node:assert/strict'

import {
  COMPACTION_MODES,
  isCompactionMode,
  isProviderNativeCompactionMode,
  normalizeCompactionMode,
  normalizeCompactionModeList,
  resolvePreferredCompactionMode,
} from '../../src/main/chat/continuity/compaction-mode-contract.mjs'

test('compaction mode contract normalizes canonical mode values safely', () => {
  assert.equal(normalizeCompactionMode(' PROVIDER_CHAIN_COMPACTION '), COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
  assert.equal(normalizeCompactionMode('codex_thread_compaction'), COMPACTION_MODES.CODEX_THREAD_COMPACTION)
  assert.equal(normalizeCompactionMode('provider_truncation'), COMPACTION_MODES.PROVIDER_TRUNCATION)
  assert.equal(normalizeCompactionMode('unknown_mode'), COMPACTION_MODES.NONE)
  assert.equal(normalizeCompactionMode('unknown_mode', COMPACTION_MODES.LOCAL_SUMMARY), COMPACTION_MODES.LOCAL_SUMMARY)
})

test('compaction mode contract deduplicates normalized mode lists', () => {
  assert.deepEqual(
    normalizeCompactionModeList(['provider_chain_compaction', 'PROVIDER_TRUNCATION', 'provider_chain_compaction', '', null]),
    [
      COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
      COMPACTION_MODES.PROVIDER_TRUNCATION,
    ],
  )
})

test('compaction mode contract resolves provider-native membership and preferred mode order', () => {
  assert.equal(isCompactionMode(COMPACTION_MODES.LOCAL_SUMMARY), true)
  assert.equal(isProviderNativeCompactionMode(COMPACTION_MODES.LOCAL_SUMMARY), false)
  assert.equal(isProviderNativeCompactionMode(COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION), true)
  assert.equal(
    resolvePreferredCompactionMode({
      supportsProviderChainCompaction: true,
      supportsProviderTruncation: true,
    }),
    COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
  )
  assert.equal(
    resolvePreferredCompactionMode({
      supportsProviderChainCompaction: false,
      supportsProviderTruncation: true,
    }),
    COMPACTION_MODES.PROVIDER_TRUNCATION,
  )
})
