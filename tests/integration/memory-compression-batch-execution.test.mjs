import test from 'node:test'
import assert from 'node:assert/strict'
import { executeCompressionArchiveBatch } from '../../src/main/memory/memory-compression-core.mjs'

function buildCandidate(idx) {
  return {
    id: `node_${idx + 1}`,
    sortId: idx + 1,
    topic: `Auto Log ${idx + 1}`,
    source: 'auto_log',
    tags: [],
    content: `entry ${idx + 1} ` + 'x'.repeat(800),
  }
}

test('executeCompressionArchiveBatch splits oversized candidate set and archives selected batch', async () => {
  const candidates = Array.from({ length: 120 }, (_, idx) => buildCandidate(idx))
  let addNodeCall = null
  let markedIds = null
  let markedSummaryId = null

  const result = await executeCompressionArchiveBatch({
    project: 'proj_a',
    providerId: 'openai',
    apiKey: 'test-key',
    model: 'custom-small',
    candidates,
    candidateCount: candidates.length,
    batchSize: 120,
    resolveContextLimit: () => ({
      limitTokens: 8_000,
      maxOutputTokens: 512,
      source: 'estimated',
    }),
    summarize: async ({ nodes }) => `summary for ${nodes.length} nodes`,
    addNode: async (payload) => {
      addNodeCall = payload
      return 'summary_node_1'
    },
    markNodesCompressed: (nodeIds, summaryNodeId) => {
      markedIds = [...nodeIds]
      markedSummaryId = summaryNodeId
      return nodeIds.length
    },
  })

  assert.equal(result.status, 'completed')
  assert.equal(result.batchSplitApplied, true)
  assert.ok(result.plannedBatchCount > 1)
  assert.ok(result.selectedBatchSize > 0)
  assert.ok(result.selectedBatchSize < candidates.length)
  assert.equal(result.archivedCount, result.selectedBatchSize)
  assert.equal(markedIds.length, result.selectedBatchSize)
  assert.equal(markedSummaryId, 'summary_node_1')

  const expectedIds = candidates.slice(0, result.selectedBatchSize).map((n) => n.id)
  assert.deepEqual(markedIds, expectedIds)
  assert.equal(result.rangeStart, 1)
  assert.equal(result.rangeEnd, result.selectedBatchSize)

  assert.ok(addNodeCall)
  assert.equal(addNodeCall.project, 'proj_a')
  assert.equal(addNodeCall.source, 'auto_summary')
  assert.equal(addNodeCall.scope, 'project')
  assert.match(addNodeCall.topic, /^Auto Summary #1-#\d+$/)
  assert.ok(Array.isArray(addNodeCall.tags))
  assert.ok(addNodeCall.tags.some((tag) => String(tag).startsWith('range:1-')))
  assert.match(String(addNodeCall.content), /summary for \d+ nodes/i)
})
