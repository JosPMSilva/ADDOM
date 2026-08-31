import test from 'node:test'
import assert from 'node:assert/strict'
import { buildContinuityPacket } from '../../src/main/chat/continuity/packet-builder.mjs'
import { applyContinuityCompaction } from '../../src/main/chat/continuity/compaction-engine.mjs'

test('buildContinuityPacket emits bounded packet text with ordered sections', () => {
  const retrieval = {
    facts: [
      { id: 'f1', factType: 'constraint', factText: 'Keep API compatibility with existing payloads.', sourceTurnId: 't1', sourceRef: 'user:constraints', confidence: 0.9 },
      { id: 'f2', factType: 'decision', factText: 'Use ID-first role resolution for agent routing.', sourceTurnId: 't2', sourceRef: 'assistant:decision', confidence: 0.8 },
      { id: 'f3', factType: 'error_pattern', factText: 'Previous run failed due to timeout.', sourceTurnId: 't3', sourceRef: 'tool:run_command', confidence: 0.9 },
      { id: 'f4', factType: 'file_intent', factText: 'Changed src/main/ipc-handlers/chat.mjs.', sourceTurnId: 't4', sourceRef: 'tool:write_file', confidence: 0.85 },
    ],
    invariants: [
      { id: 'i1', invariantText: 'Do not bypass approval flow.', sourceTurnId: 't1', confidence: 0.95 },
    ],
    snapshots: [
      { id: 's1', turnId: 't8', qualityMeta: { driftRisk: 'low' } },
    ],
  }

  const built = buildContinuityPacket({
    packetId: 'pkt_1',
    threadId: 'thread_1',
    turnId: 'turn_9',
    profile: 'balanced',
    tokenBudget: 300,
    maxFacts: 8,
    maxSourceRefs: 8,
    retrieval,
    openLoops: [{ id: 'loop1', factText: 'Add tests for continuity packet injection.' }],
    drift: { driftRisk: 'low', violationCount: 0 },
  })

  assert.ok(built.packetText.includes('[ADDOM Continuity Packet]'))
  assert.ok(built.packetText.includes('## decisions'))
  assert.ok(built.packetText.includes('## open_loops'))
  assert.ok(built.packetText.includes('## source_refs'))
  assert.equal((built.packetText.match(/## source_refs/g) || []).length, 1)
  assert.ok(built.packetTokens <= 300)
  assert.equal(built.packet.packetId, 'pkt_1')
  assert.ok(Array.isArray(built.packet.sourceRefs))
  assert.equal(Object.prototype.hasOwnProperty.call(built.packet.sections || {}, 'source_refs'), false)
})

test('applyContinuityCompaction replaces legacy summary note with continuity packet text', async () => {
  const history = [{ role: 'system', content: 'You are ADDOM.' }]
  const filler = 'x'.repeat(9000)
  for (let i = 0; i < 24; i += 1) {
    history.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `${i}: ${filler}` })
  }

  const result = await applyContinuityCompaction({
    history,
    modelLimit: 32_000,
    packetText: '[ADDOM Continuity Packet]\n## decisions\n- Keep deterministic ordering.',
  })

  assert.equal(result.compacted, true)
  assert.equal(result.replacedWithPacket, true)
  assert.ok(result.history.some((row) => String(row?.content || '').includes('[ADDOM Continuity Packet]')))
})

test('applyContinuityCompaction strips old continuity packets and leaves one latest packet', async () => {
  const history = [
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'system', content: '[ADDOM Continuity Packet]\n## decisions\n- old packet a' },
    { role: 'system', content: '[ADDOM Continuity Packet]\n## decisions\n- old packet b' },
  ]
  const filler = 'z'.repeat(7000)
  for (let i = 0; i < 22; i += 1) {
    history.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `${i} ${filler}` })
  }

  const packetText = '[ADDOM Continuity Packet]\n## decisions\n- latest packet'
  const result = await applyContinuityCompaction({
    history,
    modelLimit: 32_000,
    packetText,
  })

  const packets = result.history.filter((row) => String(row?.content || '').includes('[ADDOM Continuity Packet]'))
  assert.equal(packets.length, 1)
  assert.equal(String(packets[0].content || '').includes('latest packet'), true)
  assert.equal(result.history.some((row) => String(row?.content || '').includes('old packet a')), false)
  assert.equal(result.history.some((row) => String(row?.content || '').includes('old packet b')), false)
})
