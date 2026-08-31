import test from 'node:test'
import assert from 'node:assert/strict'

import { createAgentResourceGovernor } from '../../src/main/agents/agent-resource-governor.mjs'
import { createAgentScheduler } from '../../src/main/agents/agent-scheduler.mjs'
import {
  createSchedulerDatabase,
  insertSchedulerOwnership,
  makeSchedulerEntry,
} from '../helpers/agent-scheduler-fixtures.mjs'

function enqueue(scheduler, db, entries) {
  for (const entry of entries) {
    insertSchedulerOwnership(db, entry)
    assert.equal(scheduler.enqueue(entry).admitted, true)
  }
}

function claimAndComplete(scheduler, count) {
  const claimed = []
  for (let index = 0; index < count; index += 1) {
    const entry = scheduler.claimNext()
    claimed.push(entry)
    scheduler.complete(entry.attemptId)
  }
  return claimed
}

test('separate projects alternate progress while retaining independent ownership', () => {
  const db = createSchedulerDatabase()
  try {
    const scheduler = createAgentScheduler(db, { now: () => 2_000 })
    enqueue(scheduler, db, [
      makeSchedulerEntry({ attemptId: 'attempt_a1', nodeId: 'node_a1', createdAt: 1_000 }),
      makeSchedulerEntry({ attemptId: 'attempt_a2', nodeId: 'node_a2', createdAt: 1_001 }),
      makeSchedulerEntry({
        attemptId: 'attempt_b1',
        runId: 'run_b',
        nodeId: 'node_b1',
        rootNodeId: 'node_b1',
        projectId: 'project_b',
        threadId: 'thread_b',
        createdAt: 1_002,
      }),
      makeSchedulerEntry({
        attemptId: 'attempt_b2',
        runId: 'run_b',
        nodeId: 'node_b2',
        rootNodeId: 'node_b2',
        projectId: 'project_b',
        threadId: 'thread_b',
        createdAt: 1_003,
      }),
    ])

    assert.deepEqual(
      claimAndComplete(scheduler, 4).map((entry) => entry.projectId),
      ['project_a', 'project_b', 'project_a', 'project_b'],
    )
  } finally {
    db.close()
  }
})

test('deep and shallow runs in one project each progress within two eligible scheduling quanta', () => {
  const db = createSchedulerDatabase()
  try {
    const scheduler = createAgentScheduler(db, { now: () => 2_000 })
    enqueue(scheduler, db, [
      makeSchedulerEntry({ attemptId: 'attempt_deep_1', nodeId: 'node_deep_1', runId: 'run_deep' }),
      makeSchedulerEntry({ attemptId: 'attempt_deep_2', nodeId: 'node_deep_2', runId: 'run_deep' }),
      makeSchedulerEntry({ attemptId: 'attempt_deep_3', nodeId: 'node_deep_3', runId: 'run_deep' }),
      makeSchedulerEntry({ attemptId: 'attempt_shallow_1', nodeId: 'node_shallow_1', runId: 'run_shallow' }),
      makeSchedulerEntry({ attemptId: 'attempt_shallow_2', nodeId: 'node_shallow_2', runId: 'run_shallow' }),
    ])

    const firstFour = claimAndComplete(scheduler, 4).map((entry) => entry.runId)
    assert.deepEqual(firstFour, ['run_deep', 'run_shallow', 'run_deep', 'run_shallow'])
  } finally {
    db.close()
  }
})

test('a saturated provider does not block an eligible entry from another provider', () => {
  const db = createSchedulerDatabase()
  try {
    const governor = createAgentResourceGovernor({
      maxGlobalLiveAgents: 2,
      maxProviderLiveAgents: { 'openai-account': 1, openrouter: 1 },
    })
    const scheduler = createAgentScheduler(db, { governor, now: () => 2_000 })
    const openaiActive = makeSchedulerEntry({ attemptId: 'attempt_openai_active', nodeId: 'node_openai_active' })
    const openaiWaiting = makeSchedulerEntry({ attemptId: 'attempt_openai_waiting', nodeId: 'node_openai_waiting' })
    const openrouter = makeSchedulerEntry({
      attemptId: 'attempt_openrouter',
      runId: 'run_openrouter',
      nodeId: 'node_openrouter',
      providerId: 'openrouter',
    })
    enqueue(scheduler, db, [openaiActive, openaiWaiting, openrouter])
    assert.equal(scheduler.claimNext().attemptId, openaiActive.attemptId)

    assert.equal(scheduler.claimNext().attemptId, openrouter.attemptId)
    assert.equal(scheduler.list().find((row) => row.attemptId === openaiWaiting.attemptId).status, 'queued')
  } finally {
    db.close()
  }
})

test('OpenAI, Anthropic, OpenRouter, and Cursor entries share the managed scheduler without provider branching', () => {
  const db = createSchedulerDatabase()
  try {
    const providerIds = ['openai-account', 'anthropic', 'openrouter', 'cursor']
    const governor = createAgentResourceGovernor({
      maxGlobalLiveAgents: 4,
      maxProviderLiveAgents: Object.fromEntries(providerIds.map((providerId) => [providerId, 1])),
    })
    const scheduler = createAgentScheduler(db, { governor, now: () => 2_000 })
    const entries = providerIds.map((providerId, index) => makeSchedulerEntry({
      attemptId: `attempt_${providerId}`,
      runId: `run_${providerId}`,
      nodeId: `node_${providerId}`,
      rootNodeId: `node_${providerId}`,
      projectId: `project_${index}`,
      threadId: `thread_${index}`,
      providerId,
      createdAt: 1_000 + index,
    }))
    enqueue(scheduler, db, entries)

    const claimed = claimAndComplete(scheduler, entries.length)
    assert.deepEqual(claimed.map((entry) => entry.providerId), providerIds)
    assert.deepEqual(claimed.map((entry) => entry.projectId), entries.map((entry) => entry.projectId))
  } finally {
    db.close()
  }
})
