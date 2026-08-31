import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyAgentEventBatch,
  createAgentRunState,
  hydrateAgentRunSnapshot,
  updateAgentRunPresentation,
} from '../../src/renderer/store/agents/agent-run-reducer.mjs'
import {
  selectActiveAgentRunIds,
  selectAgentDescendantSummary,
  selectParentStreamAgentReferences,
  selectSelectedAgentConversation,
  selectVisibleAgentRows,
} from '../../src/renderer/store/agents/agent-run-selectors.mjs'
import { createAgentEventBatcher } from '../../src/renderer/store/agents/agent-run-event-batcher.mjs'

function node(id, parentNodeId, depth, status = 'completed') {
  const index = Number(id.split('_').at(-1))
  const branchPath = ['node_0']
  for (let current = 1; current <= index; current += 1) branchPath.push(`node_${current}`)
  return {
    id,
    runId: 'run_100',
    parentNodeId,
    rootNodeId: 'node_0',
    depth,
    branchPath,
    roleLabel: `Agent ${index}`,
    taskSummary: `Task ${index}`,
    status,
    childCount: index < 99 ? 1 : 0,
    resultSummary: status === 'completed' ? `Done ${index}` : null,
    errorSummary: null,
  }
}

function makeSnapshot() {
  const nodes = [node('node_0', null, 0, 'running')]
  for (let index = 1; index < 100; index += 1) {
    nodes.push(node(`node_${index}`, `node_${index - 1}`, index))
  }
  return {
    schemaVersion: 1,
    run: {
      id: 'run_100',
      projectId: 'project_01',
      threadId: 'thread_01',
      rootNodeId: 'node_0',
      status: 'running',
      lastRunSequence: 100,
    },
    nodes,
    attempts: [],
    approvals: [],
    artifacts: [],
    workspaces: [],
    mergeQueue: [],
    lastRunSequence: 100,
    nodeSequences: Object.fromEntries(nodes.map((entry) => [entry.id, 1])),
  }
}

test('normalized renderer graph restores deterministic expansion and selection for 100 nodes', () => {
  const snapshot = makeSnapshot()
  let state = hydrateAgentRunSnapshot(createAgentRunState(), snapshot)
  state = updateAgentRunPresentation(state, {
    threadId: 'thread_01',
    runId: 'run_100',
    expandedNodeIds: ['node_0', 'node_1', 'node_2'],
    selectedNodeId: 'node_3',
    returnAnchor: { messageId: 'message_01', offset: 24 },
  })
  const visibleBefore = selectVisibleAgentRows(state, {
    threadId: 'thread_01',
    runId: 'run_100',
  })
  const summaryBefore = selectAgentDescendantSummary(state, 'run_100', 'node_0')
  const serializedPresentation = JSON.parse(JSON.stringify(state.presentationByScope))

  let reloaded = hydrateAgentRunSnapshot(createAgentRunState(), snapshot)
  reloaded = {
    ...reloaded,
    presentationByScope: serializedPresentation,
  }
  const visibleAfter = selectVisibleAgentRows(reloaded, {
    threadId: 'thread_01',
    runId: 'run_100',
  })
  const summaryAfter = selectAgentDescendantSummary(reloaded, 'run_100', 'node_0')

  assert.deepEqual(visibleAfter, visibleBefore)
  assert.deepEqual(summaryAfter, summaryBefore)
  assert.deepEqual(visibleAfter.map((row) => row.nodeId), [
    'node_0',
    'node_1',
    'node_2',
    'node_3',
  ])
  assert.equal(selectSelectedAgentConversation(reloaded, 'thread_01', 'run_100').node.id, 'node_3')
  assert.equal(summaryAfter.total, 99)
  assert.equal(summaryAfter.completed, 99)
})

test('parent references remain direct-child only and transcript data stays node-scoped', () => {
  let state = hydrateAgentRunSnapshot(createAgentRunState(), makeSnapshot())
  state = {
    ...state,
    transcriptByNode: {
      'run_100:node_1': {
        summaryHydrated: true,
        itemIds: ['segment_1'],
        itemsById: {
          segment_1: { id: 'segment_1', content: 'Private child transcript' },
        },
      },
    },
  }

  const references = selectParentStreamAgentReferences(state, 'run_100', 'node_0')
  assert.deepEqual(references.map((row) => row.id), ['node_1'])
  assert.equal(JSON.stringify(references).includes('Private child transcript'), false)
})

test('event batches deduplicate IDs, detect gaps, and never apply later events across a gap', () => {
  const snapshot = makeSnapshot()
  snapshot.lastRunSequence = 10
  snapshot.run.lastRunSequence = 10
  let state = hydrateAgentRunSnapshot(createAgentRunState(), snapshot)
  const event11 = {
    eventId: 'event_11',
    runId: 'run_100',
    nodeId: 'node_1',
    runSequence: 11,
    nodeSequence: 2,
    kind: 'agent_commentary_delta',
    payload: { delta: 'eleven' },
    createdAt: 11,
  }
  const event13 = {
    ...event11,
    eventId: 'event_13',
    runSequence: 13,
    nodeSequence: 3,
    payload: { delta: 'thirteen' },
  }

  state = applyAgentEventBatch(state, [event11, event11, event13])

  assert.deepEqual(state.eventIdsByNode['run_100:node_1'], ['event_11'])
  assert.deepEqual(state.gapByRun.run_100, {
    expectedSequence: 12,
    receivedSequence: 13,
  })
  assert.deepEqual(state.pendingEventsByRun.run_100.map((event) => event.eventId), ['event_13'])
})

test('event batcher collapses a burst into one store update', async () => {
  const batches = []
  const batcher = createAgentEventBatcher({
    applyBatch(events) {
      batches.push(events)
    },
  })
  for (let index = 0; index < 100; index += 1) {
    batcher.push({ eventId: `event_${index}` })
  }
  await new Promise((resolve) => queueMicrotask(resolve))

  assert.equal(batches.length, 1)
  assert.equal(batches[0].length, 100)
})

test('normalized store isolates simultaneous active roots from different projects', () => {
  const first = makeSnapshot()
  const second = {
    ...makeSnapshot(),
    run: {
      ...makeSnapshot().run,
      id: 'run_other',
      projectId: 'project_other',
      threadId: 'thread_other',
      rootNodeId: 'other_root',
    },
    nodes: [{
      ...makeSnapshot().nodes[0],
      id: 'other_root',
      runId: 'run_other',
      rootNodeId: 'other_root',
      branchPath: ['other_root'],
    }],
    lastRunSequence: 2,
    nodeSequences: { other_root: 2 },
  }
  let state = hydrateAgentRunSnapshot(createAgentRunState(), first)
  state = hydrateAgentRunSnapshot(state, second)

  assert.deepEqual(
    selectActiveAgentRunIds(state, 'project_01', 'thread_01'),
    ['run_100'],
  )
  assert.deepEqual(
    selectActiveAgentRunIds(state, 'project_other', 'thread_other'),
    ['run_other'],
  )
  assert.equal(state.nodesById.node_0.runId, 'run_100')
  assert.equal(state.nodesById.other_root.runId, 'run_other')
})

test('authoritative hydration removes approvals and artifacts no longer in the run snapshot', () => {
  const withPendingRows = {
    ...makeSnapshot(),
    approvals: [{
      id: 'approval_01',
      runId: 'run_100',
      nodeId: 'node_1',
      status: 'pending',
    }],
    artifacts: [{
      id: 'artifact_01',
      runId: 'run_100',
      nodeId: 'node_1',
      status: 'staged',
    }],
  }
  let state = hydrateAgentRunSnapshot(createAgentRunState(), withPendingRows)
  assert.deepEqual(state.approvalIdsByRun.run_100, ['approval_01'])
  assert.deepEqual(state.artifactIdsByRun.run_100, ['artifact_01'])

  state = hydrateAgentRunSnapshot(state, makeSnapshot())

  assert.deepEqual(state.approvalIdsByRun.run_100, [])
  assert.deepEqual(state.artifactIdsByRun.run_100, [])
  assert.equal(state.approvalsById.approval_01, undefined)
  assert.equal(state.artifactsById.artifact_01, undefined)
})
