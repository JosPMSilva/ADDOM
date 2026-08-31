import assert from 'node:assert/strict'
import test from 'node:test'

import {
  projectAgentEvent,
  projectAgentRunGraph,
} from '../../src/main/agents/agent-run-renderer-projection.mjs'

const conversationIdsByNode = Object.freeze({
  child_01: 'conversation_docs_writer',
})

test('run snapshots expose durable conversation identity on bound execution nodes', () => {
  const graph = projectAgentRunGraph({
    run: { id: 'run_01', providerMix: [] },
    nodes: [{ id: 'child_01', runId: 'run_01', branchPath: [] }],
  }, { conversationIdsByNode })

  assert.equal(graph.nodes[0].conversationId, 'conversation_docs_writer')
})

test('live node events expose the same durable conversation identity', () => {
  const event = projectAgentEvent({
    eventId: 'event_01',
    runId: 'run_01',
    nodeId: 'child_01',
    kind: 'agent_spawned',
    payload: {
      node: { id: 'child_01', runId: 'run_01', branchPath: [] },
    },
  }, { conversationIdsByNode })

  assert.equal(event.payload.node.conversationId, 'conversation_docs_writer')
})
