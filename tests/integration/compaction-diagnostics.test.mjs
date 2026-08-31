import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyCompactionDiagnostics,
  buildCompactionDiagnosticLines,
  buildCompactionUserFacingLines,
  normalizeCompactionDiagnostics,
} from '../../src/common/chat/compaction-diagnostics.mjs'

test('normalizeCompactionDiagnostics resolves aliases and nested event fields', () => {
  const normalized = normalizeCompactionDiagnostics({
    compactionStrategy: 'provider_chain_compaction',
    candidateCompactionModes: ['provider_chain_compaction', 'local_summary'],
    failureReason: 'provider_chain_compaction_unavailable',
    fallbackCompactionMode: 'local_summary',
    fallbackReason: 'provider_policy_block',
    compactionEvent: {
      type: 'provider_truncation',
      phase: 'applied',
      occurred: true,
    },
    estimatedAfterTokens: 64000,
    compactionHandoffUsed: false,
    compactionCarryForwardSource: 'both',
  })

  assert.equal(normalized.selectedCompactionMode, 'provider_chain_compaction')
  assert.deepEqual(normalized.candidateCompactionModes, ['provider_chain_compaction', 'local_summary'])
  assert.equal(normalized.compactionFailureReason, 'provider_chain_compaction_unavailable')
  assert.equal(normalized.fallbackCompactionMode, 'local_summary')
  assert.equal(normalized.fallbackReason, 'provider_policy_block')
  assert.equal(normalized.compactionEventType, 'provider_truncation')
  assert.equal(normalized.compactionEventPhase, 'applied')
  assert.equal(normalized.compactionEventOccurred, true)
  assert.equal(normalized.canonicalHandoffUsed, false)
  assert.equal(normalized.carryForwardSource, 'both')
  assert.equal(normalized.strategy, 'provider_chain_compaction')
  assert.equal(normalized.scope, 'partial_reduce')
  assert.equal(normalized.source, 'provider')
  assert.equal(normalized.usageRefreshState, 'estimated')
})

test('buildCompactionDiagnosticLines emits raw diagnostic key-value detail lines', () => {
  const lines = buildCompactionDiagnosticLines({
    selectedCompactionMode: 'provider_truncation',
    candidateCompactionModes: ['provider_truncation', 'local_summary'],
    compactionEventType: 'provider_truncation',
    compactionEventPhase: 'applied',
    compactionEventOccurred: true,
    canonicalHandoffUsed: true,
    carryForwardSource: 'both',
  })

  assert.ok(lines.includes('selected_compaction_mode: provider_truncation'))
  assert.ok(lines.includes('strategy: provider_truncation'))
  assert.ok(lines.includes('scope: partial_reduce'))
  assert.ok(lines.includes('source: provider'))
  assert.ok(lines.includes('usage_refresh_state: none'))
  assert.ok(lines.includes('candidate_compaction_modes: provider_truncation, local_summary'))
  assert.ok(lines.includes('compaction_event_type: provider_truncation'))
  assert.ok(lines.includes('compaction_event_phase: applied'))
  assert.ok(lines.includes('compaction_event_occurred: true'))
  assert.ok(lines.includes('canonical_handoff_used: true'))
  assert.ok(lines.includes('carry_forward_source: both'))
})

test('buildCompactionUserFacingLines emits concise readable compaction detail lines', () => {
  const lines = buildCompactionUserFacingLines({
    selectedCompactionMode: 'provider_truncation',
    candidateCompactionModes: ['provider_truncation', 'local_summary'],
    compactionFailureReason: 'provider_chain_compaction_unavailable',
    fallbackCompactionMode: 'local_summary',
    compactionEventType: 'provider_truncation',
    compactionEventPhase: 'applied',
    canonicalHandoffUsed: true,
    carryForwardSource: 'both',
  })
  const detail = lines.join('\n')

  assert.match(detail, /compaction mode: provider truncation/)
  assert.match(detail, /boundary: compaction applied \(provider truncation\)/)
  assert.match(detail, /compaction failure: provider chain compaction unavailable/)
  assert.match(detail, /fallback mode: local summary/)
  assert.match(detail, /carry-forward source: continuity packet \+ compaction handoff/)
  assert.match(detail, /canonical handoff: used/)
  assert.doesNotMatch(detail, /candidate_compaction_modes:/)
})

test('applyCompactionDiagnostics writes only normalized fields to target object', () => {
  const payload = applyCompactionDiagnostics({
    threadId: 'thread_1',
  }, {
    selectedCompactionMode: 'provider_chain_compaction',
    candidateCompactionModes: ['provider_chain_compaction', 'local_summary'],
    compactionEventOccurred: false,
    canonicalHandoffUsed: false,
    carryForwardSource: 'continuity_packet_only',
  })

  assert.equal(payload.threadId, 'thread_1')
  assert.equal(payload.selectedCompactionMode, 'provider_chain_compaction')
  assert.deepEqual(payload.candidateCompactionModes, ['provider_chain_compaction', 'local_summary'])
  assert.equal(payload.compactionEventOccurred, false)
  assert.equal(payload.canonicalHandoffUsed, false)
  assert.equal(payload.carryForwardSource, 'continuity_packet_only')
  assert.equal(payload.strategy, 'provider_chain_compaction')
  assert.equal(payload.scope, 'partial_reduce')
  assert.equal(payload.source, 'provider')
  assert.equal(payload.usageRefreshState, 'none')
})
