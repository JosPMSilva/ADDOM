import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import Database from 'better-sqlite3'

import { createManagedAgentRuntime } from '../../src/main/agents/agent-managed-runtime.mjs'
import { createAddomManagedAgentAdapter } from '../../src/main/agents/providers/addom-managed-agent-adapter.mjs'
import { createAgentProviderRegistry } from '../../src/main/agents/providers/agent-provider-registry.mjs'
import { createAgentScheduler } from '../../src/main/agents/agent-scheduler.mjs'
import { runMigrations } from '../../src/main/memory/db-migrations.mjs'
import { seedAgentWorkspace } from '../helpers/agent-runtime-fixtures.mjs'

const TS = 1_752_600_000_000

function createDatabase() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  seedAgentWorkspace(db)
  return db
}

function role(providerId, model, id, canWriteFiles = false) {
  return {
    id,
    name: id,
    providerId,
    model,
    canWriteFiles,
  }
}

function task(taskId, instruction) {
  return {
    task_id: taskId,
    instruction,
    injected_context: 'Test context',
    expected_output_format: 'Concise result',
  }
}

test('managed runtime does not persist a spawned node when scheduler admission rejects it', async () => {
  const db = createDatabase()
  try {
    const registry = createAgentProviderRegistry()
    registry.register(createAddomManagedAgentAdapter({
      runSingleAgentFn: async () => ({
        status: 'completed',
        output: 'should not run',
        usage: null,
        stagedChanges: [],
      }),
    }))
    const scheduler = createAgentScheduler(db, {
      governor: {
        evaluateAdmission() {
          return { admitted: false, reason: 'test_rejection' }
        },
        evaluateExecution() {
          return { granted: true, reason: null }
        },
      },
    })
    const runtime = createManagedAgentRuntime({
      db,
      adapterRegistry: registry,
      scheduler,
    })
    assert.equal(typeof runtime.retryAgent, 'function')

    await assert.rejects(
      runtime.executeTaskGraph({
        projectId: 'project_01',
        threadId: 'thread_01',
        turnId: 'turn_rejected_01',
        rootTaskSummary: 'Reject child admission.',
        tasks: [{
          task: task('task_rejected', 'This task should not be admitted.'),
          role: role('openai', 'gpt-5.4', 'rejected-reviewer'),
          apiKey: '',
          projectFolder: 'C:/workspace/project-01',
        }],
      }),
      /Agent spawn rejected: test_rejection/,
    )

    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM agent_nodes').get().count,
      1,
    )
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM agent_events WHERE kind = 'agent_spawned'").get().count,
      0,
    )
  } finally {
    db.close()
  }
})

test('managed runtime executes mixed-provider siblings and a grandchild through one canonical graph', async () => {
  const db = createDatabase()
  try {
    const registry = createAgentProviderRegistry()
    const adapter = createAddomManagedAgentAdapter({
      now: (() => {
        let value = TS + 10
        return () => value += 1
      })(),
      runSingleAgentFn: async (currentTask, currentRole, _apiKey, _folder, _legacy, _signal, runtime) => {
        await runtime.onAgentStreamEvent({
          kind: 'commentary',
          payload: { delta: `Working on ${currentTask.task_id}.` },
        })
        if (currentTask.task_id === 'task_parent') {
          const spawned = await runtime.managedAgentRuntime.spawnAgent({
            owner: runtime.agentCollaborationContext,
            task: 'Inspect nested behavior.',
            role: 'nested-reviewer',
            providerId: 'openrouter',
            modelId: 'anthropic/claude-sonnet-5',
            background: false,
          })
          const nested = await runtime.managedAgentRuntime.waitAgent({
            owner: runtime.agentCollaborationContext,
            targetNodeId: spawned.nodeId,
          })
          const followed = await runtime.managedAgentRuntime.followupAgent({
            owner: runtime.agentCollaborationContext,
            targetNodeId: spawned.nodeId,
            text: 'Check the follow-up conclusion.',
          })
          const followup = await runtime.managedAgentRuntime.waitAgent({
            owner: runtime.agentCollaborationContext,
            targetNodeId: followed.nodeId,
          })
          return {
            status: 'completed',
            output: `Parent received: ${nested.resultSummary}; ${followup.resultSummary}`,
            usage: null,
            stagedChanges: [],
          }
        }
        return {
          status: 'completed',
          output: `${currentRole.name} completed ${currentTask.task_id}.`,
          usage: null,
          stagedChanges: [],
        }
      },
    })
    registry.register(adapter)
    const runtime = createManagedAgentRuntime({
      db,
      adapterRegistry: registry,
      now: (() => {
        let value = TS
        return () => value += 1
      })(),
      idFactory: (() => {
        let value = 0
        return (prefix) => `${prefix}_${String(value += 1).padStart(2, '0')}`
      })(),
      resolveChildRoute: ({ providerId, modelId, role: roleLabel }) => ({
        role: role(providerId || 'openrouter', modelId || 'model-child', roleLabel || 'child'),
        apiKey: '',
        projectFolder: 'C:/workspace/project-01',
      }),
    })

    const result = await runtime.executeTaskGraph({
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_recursive_01',
      policyProfileId: 'high',
      rootTaskSummary: 'Coordinate recursive review.',
      tasks: [
        {
          task: task('task_parent', 'Run a nested review.'),
          role: role('openai', 'gpt-5.4', 'parent-reviewer'),
          apiKey: '',
          projectFolder: 'C:/workspace/project-01',
        },
        {
          task: task('task_sibling', 'Review independently.'),
          role: role('openrouter', 'anthropic/claude-sonnet-5', 'sibling-reviewer'),
          apiKey: '',
          projectFolder: 'C:/workspace/project-01',
        },
      ],
    })

    assert.equal(result.status, 'completed')
    const graph = runtime.repository.getRunGraph(result.runId)
    assert.equal(graph.run.status, 'completed')
    assert.equal(graph.run.exclusiveUsage.scope, 'exclusive')
    assert.equal(graph.run.inclusiveUsage.scope, 'inclusive')
    const parentExecutionNode = graph.nodes.find((node) => node.taskId === 'task_parent')
    const nestedExecutionNode = graph.nodes.find((node) => node.depth === 2)
    const followupExecutionNode = graph.nodes.find((node) => (
      node.depth === 2 && node.id !== nestedExecutionNode.id
    ))
    const parentBinding = db.prepare(`
      SELECT conversation_id FROM agent_node_conversation_bindings WHERE node_id = ?
    `).get(parentExecutionNode.id)
    const nestedBinding = db.prepare(`
      SELECT conversation_id FROM agent_node_conversation_bindings WHERE node_id = ?
    `).get(nestedExecutionNode.id)
    const followupBinding = db.prepare(`
      SELECT conversation_id FROM agent_node_conversation_bindings WHERE node_id = ?
    `).get(followupExecutionNode.id)
    const parentConversation = JSON.parse(db.prepare(`
      SELECT contract_json FROM agent_conversations WHERE id = ?
    `).get(parentBinding.conversation_id).contract_json)
    const nestedConversation = JSON.parse(db.prepare(`
      SELECT contract_json FROM agent_conversations WHERE id = ?
    `).get(nestedBinding.conversation_id).contract_json)
    const authoredMessages = db.prepare(`
      SELECT contract_json FROM agent_messages WHERE kind = 'authored' ORDER BY created_at ASC
    `).all().map((row) => JSON.parse(row.contract_json))
    assert.equal(nestedConversation.parentConversationId, parentConversation.id)
    assert.equal(followupBinding.conversation_id, nestedConversation.id)
    assert.equal(nestedConversation.creatorTurnId.startsWith('agent_turn:'), true)
    assert.deepEqual(
      authoredMessages.map((message) => message.contentParts[0].text),
      [
        'Run a nested review.',
        'Review independently.',
        'Inspect nested behavior.',
        'Check the follow-up conclusion.',
      ],
    )
    assert.equal(graph.run.usageProvenance.authoritativeCostUsd, 0)
    assert.deepEqual(graph.run.providerMix.sort(), ['openai', 'openrouter'])
    assert.equal(graph.nodes.length, 5)
    assert.deepEqual(
      graph.nodes.map((node) => node.depth).sort((left, right) => left - right),
      [0, 1, 1, 2, 2],
    )
    const nestedNode = graph.nodes.find((node) => node.depth === 2)
    assert.equal(
      graph.nodes
        .filter((node) => node.id !== graph.run.rootNodeId)
        .every((node) => (
          node.permissionSnapshotHash?.length === 64
          && node.capabilitySnapshotHash?.length === 64
        )),
      true,
    )
    assert.equal(
      graph.transcript.filter((segment) => segment.kind === 'agent_context_sent').length,
      4,
    )
    assert.equal(
      graph.transcript.filter((segment) => segment.kind === 'agent_context_received').length,
      4,
    )
    const delegatedContext = graph.transcript.find((segment) => (
      segment.kind === 'agent_context_sent' && segment.payload.packet
    )).payload.packet
    assert.equal(delegatedContext.budgetLease.tokenLimit > 1_024, true)
    assert.equal(
      delegatedContext.budgetLease.tokenLimit < graph.run.budgetSnapshot.maxTotalTokens,
      true,
    )
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM agent_scheduler_entries').get().count, 0)
    const parentNode = graph.nodes.find((node) => node.id === nestedNode.parentNodeId)
    assert.equal(parentNode.taskId, 'task_parent')
    assert.match(parentNode.resultSummary, /Parent received:/)
    assert.equal(
      graph.transcript.filter((segment) => segment.kind === 'agent_commentary_delta').length,
      4,
    )
    const nestedDelivery = graph.transcript.find((segment) => (
      segment.kind === 'agent_orchestration_continuation_received'
      && segment.nodeId === parentNode.id
      && segment.payload.peerNodeId === nestedNode.id
    ))
    assert.ok(nestedDelivery)
    assert.equal(nestedDelivery.payload.continuation.source.nodeId, nestedNode.id)
    assert.equal(nestedDelivery.payload.continuation.inspectable, true)
    assert.equal(
      graph.transcript.some((segment) => (
        segment.kind === 'agent_orchestration_continuation_received'
        && segment.nodeId === graph.run.rootNodeId
        && segment.payload.peerNodeId === nestedNode.id
      )),
      false,
    )
    assert.equal(
      runtime.repository.listEvents(result.runId)
        .filter((event) => event.kind === 'agent_run_completed')
        .every((event) => event.nodeId === graph.run.rootNodeId),
      true,
    )
    const finalMessages = graph.transcript.filter((segment) => (
      segment.kind === 'agent_final_message'
    ))
    assert.equal(finalMessages.length, 4)
    assert.equal(
      finalMessages.every((segment) => String(segment.payload.text || '').includes('completed')),
      true,
    )
    const runSnapshots = runtime.repository.listEvents(result.runId)
      .filter((event) => (
        event.kind === 'agent_status_changed'
        && event.payload.entity === 'run'
      ))
      .map((event) => event.payload.snapshot)
    assert.equal(runSnapshots.some((run) => run.queuedNodeCount >= 2), true)
    assert.equal(runSnapshots.some((run) => run.activeNodeCount >= 1), true)
  } finally {
    db.close()
  }
})

test('managed runtime continues the same completed conversation after runtime re-instantiation', async () => {
  const db = createDatabase()
  const observedContexts = []
  try {
    const registry = createAgentProviderRegistry()
    registry.register(createAddomManagedAgentAdapter({
      runSingleAgentFn: async (currentTask) => {
        observedContexts.push(currentTask.injected_context)
        return {
          status: 'completed',
          output: `Completed: ${currentTask.instruction}`,
          usage: null,
          stagedChanges: [],
        }
      },
    }))
    const firstRuntime = createManagedAgentRuntime({ db, adapterRegistry: registry })
    const first = await firstRuntime.executeTaskGraph({
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_before_restart',
      rootTaskSummary: 'Initial conversation turn.',
      tasks: [{
        task: task('task_before_restart', 'Inspect before restart.'),
        role: role('openai', 'gpt-5.4', 'restart-reviewer'),
        apiKey: '',
        projectFolder: 'C:/workspace/project-01',
      }],
    })
    const firstNode = first.results[0].node
    const conversationId = db.prepare(`
      SELECT conversation_id FROM agent_node_conversation_bindings WHERE node_id = ?
    `).get(firstNode.id).conversation_id
    const direct = await firstRuntime.continueConversation({
      conversationId,
      text: 'Inspect through the user conversation route.',
      role: role('openai', 'gpt-5.4', 'restart-reviewer'),
      apiKey: '',
      projectFolder: 'C:/workspace/project-01',
      authorKind: 'user',
      authorId: 'user_local',
    })
    assert.equal(direct.status, 'completed')
    await firstRuntime.shutdown()

    const reloadedRuntime = createManagedAgentRuntime({ db, adapterRegistry: registry })
    const continued = await reloadedRuntime.continueConversation({
      conversationId,
      text: 'Inspect after restart.',
      role: role('openai', 'gpt-5.4', 'restart-reviewer'),
      apiKey: '',
      projectFolder: 'C:/workspace/project-01',
    })
    assert.equal(continued.status, 'completed')
    assert.match(observedContexts[1], /Inspect before restart\./)
    assert.match(observedContexts[1], /Completed: Inspect before restart\./)
    assert.match(observedContexts[2], /Inspect through the user conversation route\./)
    assert.match(observedContexts[2], /Completed: Inspect through the user conversation route\./)
    const projection = reloadedRuntime.conversationRepository.getConversationProjection(conversationId)
    assert.deepEqual(projection.turns.map((turn) => turn.status), ['completed', 'completed', 'completed'])
    assert.deepEqual(
      projection.messages.map((message) => message.contentParts[0].text),
      [
        'Inspect before restart.',
        'Completed: Inspect before restart.',
        'Inspect through the user conversation route.',
        'Completed: Inspect through the user conversation route.',
        'Inspect after restart.',
        'Completed: Inspect after restart.',
      ],
    )
    assert.equal(new Set(db.prepare(`
      SELECT conversation_id FROM agent_node_conversation_bindings WHERE conversation_id = ?
    `).all(conversationId).map((row) => row.conversation_id)).size, 1)
    await reloadedRuntime.shutdown()
  } finally {
    db.close()
  }
})

test('managed runtime durably queues a user follow-up while the conversation turn is active', async () => {
  const db = createDatabase()
  let releaseInitial = null
  let reportStarted = null
  const initialGate = new Promise((resolve) => { releaseInitial = resolve })
  const started = new Promise((resolve) => { reportStarted = resolve })
  try {
    const registry = createAgentProviderRegistry()
    registry.register(createAddomManagedAgentAdapter({
      runSingleAgentFn: async (currentTask, _role, _key, _folder, _legacy, _signal, executionRuntime) => {
        if (currentTask.instruction === 'Hold the active turn.') {
          reportStarted(executionRuntime.agentCollaborationContext)
          await initialGate
        }
        return {
          status: 'completed',
          output: `Completed: ${currentTask.instruction}`,
          usage: null,
          stagedChanges: [],
        }
      },
    }))
    const runtime = createManagedAgentRuntime({ db, adapterRegistry: registry })
    const runPromise = runtime.executeTaskGraph({
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_queue_followup',
      rootTaskSummary: 'Queue a follow-up.',
      tasks: [{
        task: task('task_queue_followup', 'Hold the active turn.'),
        role: role('openai', 'gpt-5.4', 'queue-reviewer'),
        apiKey: '',
        projectFolder: 'C:/workspace/project-01',
      }],
    })
    const owner = await started
    const conversationId = db.prepare(`
      SELECT conversation_id FROM agent_node_conversation_bindings WHERE node_id = ?
    `).get(owner.nodeId).conversation_id
    const queued = await runtime.continueConversation({
      conversationId,
      text: 'Run after the active turn.',
      role: role('openai', 'gpt-5.4', 'queue-reviewer'),
      apiKey: '',
      projectFolder: 'C:/workspace/project-01',
      authorKind: 'user',
      authorId: 'user_local',
    })
    assert.equal(queued.queued, true)
    releaseInitial()
    const result = await runPromise
    const projection = runtime.conversationRepository.getConversationProjection(conversationId)
    assert.equal(result.status, 'completed')
    assert.deepEqual(projection.turns.map((turn) => turn.status), ['completed', 'completed'])
    assert.equal(projection.messages.at(-1).contentParts[0].text, 'Completed: Run after the active turn.')
    assert.deepEqual(projection.mailbox.map((entry) => entry.deliveryState), ['delivered', 'delivered'])
    await runtime.shutdown()
  } finally {
    releaseInitial?.()
    db.close()
  }
})

test('managed runtime preserves the full final message while keeping graph summaries bounded', async () => {
  const db = createDatabase()
  try {
    const fullFinal = `Completed the long review.\n\n${'Evidence line.\n'.repeat(500)}`
    const registry = createAgentProviderRegistry()
    registry.register(createAddomManagedAgentAdapter({
      runSingleAgentFn: async () => ({
        status: 'completed',
        output: fullFinal,
        reportMarkdown: fullFinal,
        usage: null,
        stagedChanges: [],
      }),
    }))
    const runtime = createManagedAgentRuntime({
      db,
      adapterRegistry: registry,
    })

    const result = await runtime.executeTaskGraph({
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_full_final_01',
      rootTaskSummary: 'Preserve a rich child answer.',
      tasks: [{
        task: task('task_full_final', 'Return detailed evidence.'),
        role: role('openai', 'gpt-5.4', 'reviewer'),
        apiKey: '',
        projectFolder: 'C:/workspace/project-01',
      }],
    })

    const graph = runtime.repository.getRunGraph(result.runId)
    const child = graph.nodes.find((node) => node.id !== graph.run.rootNodeId)
    const final = graph.transcript.find((segment) => (
      segment.nodeId === child.id && segment.kind === 'agent_final_message'
    ))
    assert.equal(final.payload.text, fullFinal.trim())
    assert.equal(child.resultSummary.length, 4_000)
  } finally {
    db.close()
  }
})

test('managed runtime schedules sequential inputs one at a time and applies handoff preparation', async () => {
  const db = createDatabase()
  let active = 0
  let peakActive = 0
  const seenTasks = []
  try {
    const registry = createAgentProviderRegistry()
    registry.register(createAddomManagedAgentAdapter({
      runSingleAgentFn: async (currentTask, currentRole) => {
        active += 1
        peakActive = Math.max(peakActive, active)
        seenTasks.push(currentTask)
        await Promise.resolve()
        active -= 1
        return {
          status: 'completed',
          output: `${currentRole.name} completed.`,
          usage: null,
          stagedChanges: [],
        }
      },
    }))
    const runtime = createManagedAgentRuntime({
      db,
      adapterRegistry: registry,
    })
    const inputs = [
      {
        task: task('task_review', 'Review first.'),
        role: role('openai', 'gpt-5.4', 'reviewer'),
        apiKey: '',
        projectFolder: 'C:/workspace/project-01',
      },
      {
        task: task('task_fix', 'Fix second.'),
        role: role('openrouter', 'anthropic/claude-sonnet-5', 'fixer'),
        apiKey: '',
        projectFolder: 'C:/workspace/project-01',
      },
    ]

    const result = await runtime.executeTaskGraph({
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_sequential_01',
      rootTaskSummary: 'Run a sequential review and fix.',
      tasks: inputs,
      sequential: true,
      prepareSequentialInput: ({ input, priorResults }) => ({
        ...input,
        task: {
          ...input.task,
          runtime_handoff: `Prior results: ${priorResults.length}`,
        },
      }),
    })

    assert.equal(result.status, 'completed')
    assert.equal(peakActive, 1)
    assert.equal(seenTasks.length, 2)
    assert.equal(seenTasks[1].runtime_handoff, 'Prior results: 1')
    assert.deepEqual(result.results.map((entry) => entry.node.status), ['completed', 'completed'])
  } finally {
    db.close()
  }
})

test('managed runtime cancels unstarted sequential nodes after an upstream failure', async () => {
  const db = createDatabase()
  const attemptedTasks = []
  try {
    const registry = createAgentProviderRegistry()
    registry.register(createAddomManagedAgentAdapter({
      runSingleAgentFn: async (currentTask) => {
        attemptedTasks.push(currentTask.task_id)
        return {
          status: 'failed',
          error: 'Review failed.',
          output: null,
          usage: null,
          stagedChanges: [],
        }
      },
    }))
    const runtime = createManagedAgentRuntime({ db, adapterRegistry: registry })
    const result = await runtime.executeTaskGraph({
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_sequential_failure_01',
      rootTaskSummary: 'Stop after a failed review.',
      sequential: true,
      tasks: [
        {
          task: task('task_review', 'Review first.'),
          role: role('openai', 'gpt-5.4', 'reviewer'),
          apiKey: '',
          projectFolder: 'C:/workspace/project-01',
        },
        {
          task: task('task_fix', 'Do not run this fix.'),
          role: role('openai', 'gpt-5.4', 'fixer'),
          apiKey: '',
          projectFolder: 'C:/workspace/project-01',
        },
      ],
    })

    assert.deepEqual(attemptedTasks, ['task_review'])
    assert.deepEqual(result.results.map((entry) => entry.node.status), ['failed', 'cancelled'])
    const failedConversationId = db.prepare(`
      SELECT conversation_id FROM agent_node_conversation_bindings WHERE node_id = ?
    `).get(result.results[0].node.id).conversation_id
    assert.deepEqual(
      runtime.conversationRepository.getConversationProjection(failedConversationId)
        .turns.map((turn) => turn.status),
      ['failed'],
    )
    assert.equal(
      runtime.repository.listEvents(result.runId)
        .some((event) => (
          event.kind === 'agent_cancelled'
          && event.payload.attempt.stopReason === 'upstream_sequential_step_failed'
        )),
      true,
    )
    const failedContinuation = runtime.repository.getRunGraph(result.runId).transcript.find((segment) => (
      segment.kind === 'agent_orchestration_continuation_received'
      && segment.payload.continuation.status === 'failed'
    ))
    assert.ok(failedContinuation)
    assert.equal(failedContinuation.payload.continuation.inspectable, true)
  } finally {
    db.close()
  }
})

test('managed runtime cancellation waits for the provider attempt to settle through the control plane', async () => {
  const db = createDatabase()
  let markStarted
  const started = new Promise((resolve) => {
    markStarted = resolve
  })
  try {
    const registry = createAgentProviderRegistry()
    registry.register(createAddomManagedAgentAdapter({
      runSingleAgentFn: async (_currentTask, _currentRole, _key, _folder, _emit, signal) => {
        markStarted()
        await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }))
        return {
          status: 'aborted',
          error: 'Parent cancelled.',
          output: null,
          usage: null,
          stagedChanges: [],
        }
      },
    }))
    const runtime = createManagedAgentRuntime({ db, adapterRegistry: registry })
    const controller = new AbortController()
    const execution = runtime.executeTaskGraph({
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_cancel_01',
      rootTaskSummary: 'Cancel a running child.',
      abortSignal: controller.signal,
      tasks: [{
        task: task('task_cancel', 'Wait for cancellation.'),
        role: role('openai', 'gpt-5.4', 'worker'),
        apiKey: '',
        projectFolder: 'C:/workspace/project-01',
      }],
    })

    await started
    controller.abort('user_stop')
    const result = await execution
    const graph = runtime.repository.getRunGraph(result.runId)

    assert.equal(result.status, 'cancelled')
    assert.equal(result.results[0].node.status, 'cancelled')
    assert.equal(result.results[0].providerResult.status, 'cancelled')
    assert.equal(graph.run.completionReason, 'user_stop')
    const cancelledConversationId = db.prepare(`
      SELECT conversation_id FROM agent_node_conversation_bindings WHERE node_id = ?
    `).get(result.results[0].node.id).conversation_id
    assert.deepEqual(
      runtime.conversationRepository.getConversationProjection(cancelledConversationId)
        .turns.map((turn) => turn.status),
      ['cancelled'],
    )
    assert.equal(
      runtime.repository.listEvents(result.runId)
        .some((event) => event.kind === 'agent_run_completed'),
      false,
    )
  } finally {
    db.close()
  }
})

test('managed runtime shutdown bounds provider settlement and preserves isolated work for recovery', {
  timeout: 1_000,
}, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-managed-shutdown-'))
  const projectFolder = path.join(root, 'project')
  const workspaceStorageRoot = path.join(root, 'agent-workspaces')
  fs.mkdirSync(projectFolder)
  fs.writeFileSync(path.join(projectFolder, 'base.txt'), 'source\n', 'utf8')
  const db = createDatabase()
  let markStarted
  const started = new Promise((resolve) => {
    markStarted = resolve
  })
  try {
    const registry = createAgentProviderRegistry()
    registry.register(createAddomManagedAgentAdapter({
      runSingleAgentFn: async (
        _currentTask,
        _currentRole,
        _key,
        isolatedProjectFolder,
      ) => {
        fs.writeFileSync(path.join(isolatedProjectFolder, 'recover-me.txt'), 'draft\n', 'utf8')
        markStarted()
        return new Promise(() => {})
      },
    }))
    const runtime = createManagedAgentRuntime({
      db,
      adapterRegistry: registry,
      workspaceStorageRoot,
    })
    void runtime.executeTaskGraph({
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_shutdown_01',
      rootTaskSummary: 'Preserve interrupted work.',
      tasks: [{
        task: task('task_shutdown', 'Wait through shutdown.'),
        role: role('openai', 'gpt-5.4', 'worker', true),
        apiKey: '',
        projectFolder,
      }],
    })

    await started
    const shutdown = await runtime.shutdown({
      reason: 'test_shutdown',
      timeoutMs: 10,
    })

    assert.equal(shutdown.timedOut, true)
    assert.equal(shutdown.stoppedRunIds.length, 1)
    assert.equal(fs.existsSync(path.join(projectFolder, 'recover-me.txt')), false)
    const [workspace] = runtime.workspaceManager.list()
    assert.equal(workspace.status, 'reviewable')
    const graph = runtime.repository.getRunGraph(workspace.runId)
    assert.deepEqual(graph.artifacts.map((artifact) => artifact.path), ['recover-me.txt'])
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('managed runtime keeps the run open until recursively spawned background work is terminal', {
  timeout: 2_000,
}, async () => {
  const db = createDatabase()
  let markChildStarted
  let releaseChild
  const childStarted = new Promise((resolve) => {
    markChildStarted = resolve
  })
  const childRelease = new Promise((resolve) => {
    releaseChild = resolve
  })
  try {
    const registry = createAgentProviderRegistry()
    registry.register(createAddomManagedAgentAdapter({
      runSingleAgentFn: async (currentTask, _role, _key, _folder, _emit, _signal, runtime) => {
        if (currentTask.task_id === 'task_parent_background') {
          await runtime.managedAgentRuntime.spawnAgent({
            owner: runtime.agentCollaborationContext,
            task: 'Finish in the background.',
            role: 'background-reviewer',
            providerId: 'openrouter',
            modelId: 'anthropic/claude-sonnet-5',
            background: true,
          })
          return {
            status: 'completed',
            output: 'Parent returned.',
            usage: null,
            stagedChanges: [],
          }
        }
        markChildStarted()
        await childRelease
        return {
          status: 'completed',
          output: 'Background child returned.',
          usage: null,
          stagedChanges: [],
        }
      },
    }))
    const runtime = createManagedAgentRuntime({
      db,
      adapterRegistry: registry,
      resolveChildRoute: ({ providerId, modelId, role: roleLabel }) => ({
        role: role(providerId, modelId, roleLabel),
        apiKey: '',
        projectFolder: 'C:/workspace/project-01',
      }),
    })
    let executionSettled = false
    const execution = runtime.executeTaskGraph({
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_background_01',
      rootTaskSummary: 'Run background work.',
      tasks: [{
        task: task('task_parent_background', 'Spawn background work.'),
        role: role('openai', 'gpt-5.4', 'parent'),
        apiKey: '',
        projectFolder: 'C:/workspace/project-01',
      }],
    }).then((result) => {
      executionSettled = true
      return result
    })

    await childStarted
    await Promise.resolve()
    assert.equal(executionSettled, false)
    releaseChild()
    const result = await execution
    const graph = runtime.repository.getRunGraph(result.runId)

    assert.equal(graph.run.status, 'completed')
    assert.equal(graph.nodes.find((node) => node.depth === 2).status, 'completed')
  } finally {
    db.close()
  }
})

test('managed runtime retries a transient failure as a new attempt under the same node', async () => {
  const db = createDatabase()
  let calls = 0
  try {
    const registry = createAgentProviderRegistry()
    registry.register(createAddomManagedAgentAdapter({
      runSingleAgentFn: async () => {
        calls += 1
        if (calls === 1) {
          return {
            status: 'rate_limited',
            error: 'Transient provider rate limit.',
            output: null,
            usage: null,
            stagedChanges: [],
          }
        }
        return {
          status: 'completed',
          output: 'Recovered on the retry attempt.',
          usage: null,
          stagedChanges: [],
        }
      },
    }))
    const runtime = createManagedAgentRuntime({ db, adapterRegistry: registry })
    const result = await runtime.executeTaskGraph({
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_retry_01',
      rootTaskSummary: 'Retry transient work.',
      tasks: [{
        task: task('task_retry', 'Retry once if transient.'),
        role: role('openai', 'gpt-5.4', 'worker'),
        apiKey: '',
        projectFolder: 'C:/workspace/project-01',
      }],
    })
    const graph = runtime.repository.getRunGraph(result.runId)

    assert.equal(calls, 2)
    assert.equal(result.results[0].attemptCount, 2)
    assert.equal(result.results[0].providerResult.status, 'completed')
    assert.equal(graph.nodes.filter((node) => node.depth === 1).length, 1)
    assert.deepEqual(
      graph.attempts.map((attempt) => attempt.attemptNumber),
      [1, 2],
    )
    assert.equal(graph.attempts[0].stopReason, 'retryable_failure')
    assert.equal(graph.attempts[1].status, 'completed')
    assert.equal(new Set(graph.attempts.map((attempt) => attempt.workspaceId)).size, 2)
    assert.equal(runtime.workspaceManager.list({ runId: result.runId }).length, 2)
  } finally {
    db.close()
  }
})

test('managed runtime isolates concurrent cross-provider writes across projects and captures artifacts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-managed-workspaces-'))
  const projectA = path.join(root, 'project-a')
  const projectB = path.join(root, 'project-b')
  const storageRoot = path.join(root, 'agent-workspaces')
  fs.mkdirSync(projectA)
  fs.mkdirSync(projectB)
  fs.writeFileSync(path.join(projectA, 'base.txt'), 'project-a\n', 'utf8')
  fs.writeFileSync(path.join(projectB, 'base.txt'), 'project-b\n', 'utf8')
  const db = createDatabase()
  try {
    db.prepare('UPDATE workspace_projects SET path = ? WHERE id = ?')
      .run(projectA, 'project_01')
    db.prepare(`
      INSERT INTO workspace_projects (
        id, path, name, created_at, last_opened_at, last_worked_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('project_02', projectB, 'Project 02', TS, TS, TS)
    db.prepare(`
      INSERT INTO chat_threads (
        id, project_id, title, created_at, updated_at, last_viewed_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('thread_02', 'project_02', 'Second project', TS, TS, TS)
    const seenFolders = []
    const registry = createAgentProviderRegistry()
    registry.register(createAddomManagedAgentAdapter({
      runSingleAgentFn: async (currentTask, currentRole, _key, projectFolder) => {
        seenFolders.push(projectFolder)
        const content = `${currentRole.providerId}:${currentTask.task_id}\n`
        fs.writeFileSync(path.join(projectFolder, 'agent-result.txt'), content, 'utf8')
        return {
          status: 'completed',
          output: `${currentRole.name} completed.`,
          usage: null,
          stagedChanges: [],
        }
      },
    }))
    const runtime = createManagedAgentRuntime({
      db,
      adapterRegistry: registry,
      workspaceStorageRoot: storageRoot,
    })

    const [first, second] = await Promise.all([
      runtime.executeTaskGraph({
        projectId: 'project_01',
        threadId: 'thread_01',
        turnId: 'turn_workspace_a',
        rootTaskSummary: 'Write in project A.',
        tasks: [{
          task: task('task_workspace_a', 'Write A.'),
          role: role('openai', 'gpt-5.4', 'writer-a', true),
          apiKey: '',
          projectFolder: projectA,
        }],
      }),
      runtime.executeTaskGraph({
        projectId: 'project_02',
        threadId: 'thread_02',
        turnId: 'turn_workspace_b',
        rootTaskSummary: 'Write in project B.',
        tasks: [{
          task: task('task_workspace_b', 'Write B.'),
          role: role('openrouter', 'anthropic/claude-sonnet-5', 'writer-b', true),
          apiKey: '',
          projectFolder: projectB,
        }],
      }),
    ])

    assert.equal(first.status, 'completed')
    assert.equal(second.status, 'completed')
    assert.equal(fs.existsSync(path.join(projectA, 'agent-result.txt')), false)
    assert.equal(fs.existsSync(path.join(projectB, 'agent-result.txt')), false)
    assert.equal(seenFolders.every((folder) => ![projectA, projectB].includes(folder)), true)
    const firstGraph = runtime.repository.getRunGraph(first.runId)
    const secondGraph = runtime.repository.getRunGraph(second.runId)
    assert.deepEqual(firstGraph.artifacts.map((artifact) => artifact.path), ['agent-result.txt'])
    assert.deepEqual(secondGraph.artifacts.map((artifact) => artifact.path), ['agent-result.txt'])
    assert.equal(firstGraph.artifacts[0].nodeId, first.results[0].node.id)
    assert.equal(secondGraph.artifacts[0].nodeId, second.results[0].node.id)
    assert.notEqual(firstGraph.artifacts[0].workspaceId, secondGraph.artifacts[0].workspaceId)
    assert.equal(runtime.workspaceManager.list({ status: 'reviewable' }).length, 2)
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
