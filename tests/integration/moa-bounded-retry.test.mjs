import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { runDelegationToolCall } from '../../src/main/chat/moa-tool-flow.mjs'
import { DEFAULT_MOA_POLICY } from '../../src/main/moa/moa-policy.mjs'
import { createMoaRetryState } from '../../src/main/chat/moa-retry-state.mjs'

function createHarness() {
  const sent = []
  const timeline = []
  const history = []
  const turnToolResults = []
  return {
    sent,
    timeline,
    history,
    turnToolResults,
    send(channel, payload) {
      sent.push({ channel, payload })
    },
    persistTimelineEvent(kind, payload) {
      timeline.push({ kind, payload })
    },
  }
}

function buildToolInput(tasks) {
  return { tasks }
}

function buildTask(taskId, roleId, roleName, instruction = `Review refactor risks for ${taskId}`) {
  return {
    task_id: taskId,
    agent_role_id: roleId,
    agent_role: roleName,
    instruction,
    injected_context: `Context for ${taskId}`,
    expected_output_format: 'Return concise review notes.',
  }
}

function buildRole(id, name, providerId = 'ollama', model = 'llama3.1') {
  return { id, name, providerId, model, canWriteFiles: false }
}

function buildAgent(taskId, roleId, role, status, extra = {}) {
  return {
    taskId,
    roleId,
    role,
    status,
    output: status === 'completed' ? `done:${taskId}` : null,
    error: status === 'completed' ? '' : `error:${taskId}:${status}`,
    usage: { totalTokens: 10, inputTokens: 6, outputTokens: 4, reasoningTokens: 1 },
    tokenUsage: { totalTokens: 10, inputTokens: 6, outputTokens: 4, reasoningTokens: 1 },
    rounds: 1,
    truncated: false,
    stagedChanges: [],
    startedAt: 1,
    finishedAt: 2,
    durationMs: 1,
    ...extra,
  }
}

async function runDelegation({
  toolInput,
  moaRoles,
  harness,
  moaRetryState,
  executeDelegationFn,
  projectFolder = process.cwd(),
  moaPolicy = { ...DEFAULT_MOA_POLICY, promptEnhancementEnabled: false },
  agentSettings = null,
  requestFanoutConfirmation = async () => ({ decision: 'launch_all' }),
  loop = { abortController: new AbortController() },
  modelFacingToolName = 'delegate_to_agents',
  delegationSelectionIntent = '',
}) {
  return runDelegationToolCall({
    tc: {
      id: 'tc_delegate',
      name: modelFacingToolName,
      input: toolInput,
    },
    toolInput,
    stepId: 'turn_1:step:1',
    stepSequence: 1,
    stepStartedAt: Date.now(),
    activeThreadId: 'thread_1',
    activeTurnId: 'turn_1',
    projectFolder,
    loop,
    moaRoles,
    moaPolicy,
    moaBudgetPolicy: {},
    getApiKey: () => 'sk-test',
    agentSettings,
    requestFanoutConfirmation,
    history: harness.history,
    turnToolResults: harness.turnToolResults,
    send: harness.send,
    persistTimelineEvent: harness.persistTimelineEvent,
    moaRetryState,
    executeDelegationFn,
    delegationSelectionIntent,
  })
}

test('universal delegate_tasks expands application-owned all-role intent before execution', async () => {
  const harness = createHarness()
  const roles = [
    buildRole('role_security', 'Security Reviewer'),
    buildRole('role_docs', 'Docs Writer'),
    buildRole('role_architecture', 'Architecture Reviewer'),
    buildRole('role_tests', 'Test Automator'),
  ]
  const executed = []

  await runDelegation({
    modelFacingToolName: 'delegate_tasks',
    delegationSelectionIntent: 'all_configured_roles',
    toolInput: {
      tasks: [{
        instruction: 'Inspect the repository from your specialty.',
        context: 'Report concise findings.',
        paths: ['src', 'tests'],
      }],
    },
    moaRoles: roles,
    harness,
    moaRetryState: createMoaRetryState(),
    executeDelegationFn: async (tasks) => {
      executed.push(...tasks)
      return {
        status: 'completed',
        agents: tasks.map((task) => buildAgent(
          task.task_id,
          task.agent_role_id,
          task.agent_role,
          'completed',
        )),
        errors: [],
        stagedChanges: [],
        usage: { totalTokens: 40, inputTokens: 24, outputTokens: 16, reasoningTokens: 4 },
      }
    },
  })

  assert.equal(executed.length, 4)
  assert.equal(new Set(executed.map((task) => task.agent_role_key)).size, 4)
  assert.deepEqual(
    executed.map((task) => task.agent_role_key),
    ['architecture_reviewer', 'docs_writer', 'security_reviewer', 'test_automator'],
  )
})

test('current-turn all-role intent overrides a model payload that omitted selection controls', async () => {
  const harness = createHarness()
  const roles = [
    buildRole('role_security', 'Security Reviewer'),
    buildRole('role_docs', 'Docs Writer'),
    buildRole('role_architecture', 'Architecture Reviewer'),
    buildRole('role_tests', 'Test Automator'),
  ]
  const executed = []

  await runDelegation({
    modelFacingToolName: 'delegate_tasks',
    delegationSelectionIntent: 'all_configured_roles',
    toolInput: {
      tasks: [{
        instruction: 'Inspect the repository from your specialty.',
        paths: ['.'],
      }],
    },
    moaRoles: roles,
    harness,
    moaRetryState: createMoaRetryState(),
    executeDelegationFn: async (tasks) => {
      executed.push(...tasks)
      return {
        status: 'completed',
        agents: tasks.map((task) => buildAgent(task.task_id, task.agent_role_id, task.agent_role, 'completed')),
        errors: [],
        stagedChanges: [],
        usage: { totalTokens: 40, inputTokens: 24, outputTokens: 16, reasoningTokens: 4 },
      }
    },
  })

  assert.equal(executed.length, 4)
  assert.equal(new Set(executed.map((task) => task.agent_role_key)).size, 4)
})

test('turn selection contract prevents a second model call from redispatching requested roles', async () => {
  const roles = [
    buildRole('role_security', 'Security Reviewer'),
    buildRole('role_docs', 'Docs Writer'),
    buildRole('role_architecture', 'Architecture Reviewer'),
    buildRole('role_tests', 'Test Automator'),
  ]
  const moaRetryState = createMoaRetryState()
  const calls = []
  const executeDelegationFn = async (tasks) => {
    calls.push(tasks.map((task) => task.agent_role_key))
    return {
      status: 'completed_with_errors',
      agents: tasks.map((task) => buildAgent(
        task.task_id,
        task.agent_role_id,
        task.agent_role,
        task.agent_role_key === 'architecture_reviewer' ? 'failed' : 'completed',
        task.agent_role_key === 'architecture_reviewer'
          ? { managedRetryExhausted: true }
          : {},
      )),
      errors: [],
      stagedChanges: [],
      usage: { totalTokens: 40, inputTokens: 24, outputTokens: 16, reasoningTokens: 4 },
    }
  }

  await runDelegation({
    modelFacingToolName: 'delegate_tasks',
    delegationSelectionIntent: 'all_configured_roles',
    toolInput: { tasks: [{ instruction: 'Review the repository from your specialty.' }] },
    moaRoles: roles,
    harness: createHarness(),
    moaRetryState,
    executeDelegationFn,
  })

  const secondHarness = createHarness()
  const second = await runDelegation({
    modelFacingToolName: 'delegate_tasks',
    delegationSelectionIntent: 'all_configured_roles',
    toolInput: { tasks: [{ instruction: 'Retry the architecture review.' }] },
    moaRoles: roles,
    harness: secondHarness,
    moaRetryState,
    executeDelegationFn,
  })

  assert.equal(calls.length, 1)
  const payload = lastToolResult(secondHarness)
  assert.equal(payload.isError, false)
  assert.equal(payload.moa.status, 'already_fulfilled')
  assert.equal(payload.moa.selectionContractStatus, 'already_fulfilled')
  assert.match(String(second.pendingSynthesisPrompt || ''), /Do not call delegate_tasks again/i)
})

test('compact delegation compiles the current user role contract before preflight', async () => {
  const harness = createHarness()
  harness.history.push({
    role: 'user',
    content: 'Use exactly the configured Docs Writer role once to review package.json read-only.',
  })
  const roles = [
    buildRole('role_security', 'Security Reviewer'),
    buildRole('role_docs', 'Docs Writer'),
  ]
  const executed = []

  await runDelegation({
    modelFacingToolName: 'delegate_tasks',
    toolInput: { tasks: [{ paths: ['package.json'] }] },
    moaRoles: roles,
    harness,
    moaRetryState: createMoaRetryState(),
    executeDelegationFn: async (tasks) => {
      executed.push(...tasks)
      return {
        status: 'completed',
        agents: tasks.map((task) => buildAgent(task.task_id, task.agent_role_id, task.agent_role, 'completed')),
        errors: [],
        stagedChanges: [],
        usage: { totalTokens: 10, inputTokens: 6, outputTokens: 4, reasoningTokens: 0 },
      }
    },
  })

  assert.equal(executed.length, 1)
  assert.equal(executed[0].agent_role_key, 'docs_writer')
  assert.match(executed[0].instruction, /Docs Writer role once/i)
  assert.equal(harness.sent.some((entry) => (
    entry.channel === 'moa:delegation-start' && entry.payload?.status === 'preflight_failed'
  )), false)
})

test('compact delegation normalizes instruction-only task briefs before preflight', async () => {
  const harness = createHarness()
  harness.history.push({ role: 'user', content: 'Run a documentation review of package.json.' })
  const roles = [buildRole('role_docs', 'Docs Writer')]
  const executed = []

  await runDelegation({
    modelFacingToolName: 'delegate_tasks',
    toolInput: { tasks: [{ instruction: 'Review package.json for documentation quality.' }] },
    moaRoles: roles,
    harness,
    moaRetryState: createMoaRetryState(),
    executeDelegationFn: async (tasks) => {
      executed.push(...tasks)
      return {
        status: 'completed',
        agents: tasks.map((task) => buildAgent(task.task_id, task.agent_role_id, task.agent_role, 'completed')),
        errors: [],
        stagedChanges: [],
        usage: { totalTokens: 10, inputTokens: 6, outputTokens: 4, reasoningTokens: 0 },
      }
    },
  })

  assert.equal(executed.length, 1)
  assert.match(executed[0].injected_context, /scope.*instruction/i)
  const executing = harness.sent.find((entry) => entry.channel === 'chat:tool-executing')
  assert.equal(executing?.payload?.toolInput?.instructionCount, 1)
  assert.equal(executing?.payload?.toolInput?.contextCount, 1)
})

test('fanout admission limits only after user confirmation and preserves task accounting', async () => {
  const harness = createHarness()
  const roles = Array.from({ length: 6 }, (_, index) => (
    buildRole(`role_${index + 1}`, `Reviewer ${index + 1}`)
  ))
  const tasks = roles.map((role, index) => (
    buildTask(`task_${index + 1}`, role.id, role.name)
  ))
  const executed = []

  await runDelegation({
    toolInput: buildToolInput(tasks),
    moaRoles: roles,
    harness,
    moaRetryState: createMoaRetryState(),
    agentSettings: { fanoutConfirmationThreshold: 5 },
    requestFanoutConfirmation: async ({ requestedCount, threshold }) => {
      assert.equal(requestedCount, 6)
      assert.equal(threshold, 5)
      return { decision: 'limit' }
    },
    executeDelegationFn: async (admittedTasks) => {
      executed.push(...admittedTasks.map((task) => task.task_id))
      return {
        status: 'completed',
        agents: admittedTasks.map((task, index) => (
          buildAgent(task.task_id, roles[index].id, roles[index].name, 'completed')
        )),
        errors: [],
        stagedChanges: [],
        usage: { totalTokens: 50, inputTokens: 30, outputTokens: 20, reasoningTokens: 5 },
      }
    },
  })

  assert.deepEqual(executed, ['task_1', 'task_2', 'task_3', 'task_4', 'task_5'])
  const payload = lastToolResult(harness)
  assert.equal(payload.moa.requestedTaskCount, 6)
  assert.equal(payload.moa.plannedTaskCount, 6)
  assert.equal(payload.moa.admittedTaskCount, 5)
  assert.equal(payload.moa.executedTaskCount, 5)
  assert.equal(payload.moa.limitedTaskCount, 1)
  assert.equal(payload.moa.fanoutDecision, 'limit')
})

test('stopping fanout confirmation cancels the root turn without executing agents', async () => {
  const harness = createHarness()
  const roles = Array.from({ length: 6 }, (_, index) => (
    buildRole(`role_${index + 1}`, `Reviewer ${index + 1}`)
  ))
  const loop = { abortController: new AbortController(), cancelled: false, cancelReason: '' }
  let executionCount = 0

  const result = await runDelegation({
    toolInput: buildToolInput(roles.map((role, index) => (
      buildTask(`task_${index + 1}`, role.id, role.name)
    ))),
    moaRoles: roles,
    harness,
    moaRetryState: createMoaRetryState(),
    agentSettings: { fanoutConfirmationThreshold: 5 },
    requestFanoutConfirmation: async () => ({ decision: 'stop_turn' }),
    loop,
    executeDelegationFn: async () => {
      executionCount += 1
      return {}
    },
  })

  assert.equal(executionCount, 0)
  assert.equal(loop.cancelled, true)
  assert.match(loop.cancelReason, /fanout confirmation/i)
  assert.equal(result.toolIsError, true)
  const payload = lastToolResult(harness)
  assert.equal(payload.moa.status, 'cancelled')
  assert.equal(payload.moa.plannedTaskCount, 6)
  assert.equal(payload.moa.admittedTaskCount, 0)
  assert.equal(payload.moa.executedTaskCount, 0)
  assert.equal(payload.moa.fanoutDecision, 'stop_turn')
})

function lastToolResult(harness) {
  const row = [...harness.sent].reverse().find((entry) => entry.channel === 'chat:tool-result')
  assert.ok(row, 'expected chat:tool-result event')
  return row.payload
}

test('retries only failed agents once and merges successful retry result', async () => {
  const harness = createHarness()
  const moaRetryState = createMoaRetryState()
  const task1 = buildTask('task_1', 'role_ui', 'UI Reviewer')
  const task2 = buildTask('task_2', 'role_css', 'CSS Reviewer')
  const calls = []
  const executeDelegationFn = async (tasks) => {
    calls.push(tasks.map((task) => task.task_id))
    if (calls.length === 1) {
      return {
        delegationId: 'del_retry_success',
        startedAt: 1,
        finishedAt: 2,
        durationMs: 1,
        usage: { totalTokens: 20, inputTokens: 12, outputTokens: 8, reasoningTokens: 2 },
        agents: [
          buildAgent('task_1', 'role_ui', 'UI Reviewer', 'timeout'),
          buildAgent('task_2', 'role_css', 'CSS Reviewer', 'completed'),
        ],
        stagedChanges: [],
        errors: [],
      }
    }
    return {
      delegationId: 'del_retry_success',
      startedAt: 3,
      finishedAt: 4,
      durationMs: 1,
      usage: { totalTokens: 10, inputTokens: 6, outputTokens: 4, reasoningTokens: 1 },
      agents: [
        buildAgent('task_1', 'role_ui', 'UI Reviewer', 'completed'),
      ],
      stagedChanges: [],
      errors: [],
    }
  }

  const result = await runDelegation({
    toolInput: buildToolInput([task1, task2]),
    moaRoles: [buildRole('role_ui', 'UI Reviewer'), buildRole('role_css', 'CSS Reviewer')],
    harness,
    moaRetryState,
    executeDelegationFn,
  })

  assert.equal(result.handled, true)
  assert.deepEqual(calls, [['task_1', 'task_2'], ['task_1']])
  const payload = lastToolResult(harness)
  assert.equal(payload.isError, false)
  assert.equal(payload.moa.status, 'completed')
  assert.equal(payload.moa.retryAttempted, true)
  assert.equal(payload.moa.retryAttemptCount, 1)
  assert.equal(payload.moa.summary.completed, 2)
  assert.equal(payload.moa.summary.failed, 0)
  assert.equal(payload.moa.partialSuccess, false)
})

test('task-scoped preflight failure does not cancel a ready sibling and returns both to the root', async () => {
  const harness = createHarness()
  const executedTaskIds = []
  const roles = [buildRole('role_ready', 'Ready Reviewer')]
  const toolInput = buildToolInput([
    buildTask('task_ready', 'role_ready', 'Ready Reviewer'),
    buildTask('task_blocked', 'role_missing', 'Missing Reviewer'),
  ])

  const result = await runDelegation({
    toolInput,
    moaRoles: roles,
    harness,
    moaRetryState: createMoaRetryState(),
    executeDelegationFn: async (tasks) => {
      executedTaskIds.push(...tasks.map((task) => task.task_id))
      return {
        status: 'completed',
        agents: [buildAgent('task_ready', 'role_ready', 'Ready Reviewer', 'completed')],
        errors: [],
        stagedChanges: [],
        usage: { totalTokens: 10, inputTokens: 6, outputTokens: 4, reasoningTokens: 1 },
      }
    },
  })

  assert.equal(result.handled, true)
  assert.deepEqual(executedTaskIds, ['task_ready'])
  const payload = lastToolResult(harness)
  assert.equal(payload.moa.status, 'completed_with_errors')
  assert.equal(payload.moa.summary.completed, 1)
  assert.equal(payload.moa.summary.failed, 1)
  assert.deepEqual(
    payload.moa.agents.map((agent) => [agent.taskId, agent.status]),
    [['task_ready', 'completed'], ['task_blocked', 'failed']],
  )
  assert.match(payload.moa.agents[1].error, /not configured/i)
})

test('does not create a second run after the managed runtime exhausts node retry', async () => {
  const harness = createHarness()
  const calls = []
  const task = buildTask('task_1', 'role_ui', 'UI Reviewer')
  const executeDelegationFn = async (tasks) => {
    calls.push(tasks.map((entry) => entry.task_id))
    return {
      delegationId: 'del_managed_retry_exhausted',
      startedAt: 1,
      finishedAt: 2,
      durationMs: 1,
      usage: { totalTokens: 10, inputTokens: 6, outputTokens: 4, reasoningTokens: 1 },
      agents: [
        buildAgent('task_1', 'role_ui', 'UI Reviewer', 'timeout', {
          managedAttemptCount: 2,
          managedRetryExhausted: true,
        }),
      ],
      stagedChanges: [],
      errors: [],
    }
  }

  const result = await runDelegation({
    toolInput: buildToolInput([task]),
    moaRoles: [buildRole('role_ui', 'UI Reviewer')],
    harness,
    moaRetryState: createMoaRetryState(),
    executeDelegationFn,
  })

  assert.equal(result.handled, true)
  assert.deepEqual(calls, [['task_1']])
  const payload = lastToolResult(harness)
  assert.equal(payload.moa.retryAttempted, false)
  assert.equal(payload.moa.status, 'completed_with_errors')
})

test('does not retry an aborted agent after the root turn is cancelled', async () => {
  const harness = createHarness()
  const loop = { abortController: new AbortController(), cancelled: false }
  const calls = []
  const task = buildTask('task_cancelled', 'role_architecture', 'Architecture Reviewer')

  const result = await runDelegation({
    toolInput: buildToolInput([task]),
    moaRoles: [buildRole('role_architecture', 'Architecture Reviewer')],
    harness,
    loop,
    moaRetryState: createMoaRetryState(),
    executeDelegationFn: async (tasks) => {
      calls.push(tasks.map((entry) => entry.task_id))
      loop.abortController.abort()
      return {
        status: 'aborted',
        agents: [buildAgent(
          'task_cancelled',
          'role_architecture',
          'Architecture Reviewer',
          'aborted',
        )],
        errors: [],
        stagedChanges: [],
        usage: { totalTokens: 1, inputTokens: 1, outputTokens: 0, reasoningTokens: 0 },
      }
    },
  })

  assert.equal(result.handled, true)
  assert.deepEqual(calls, [['task_cancelled']])
  assert.equal(lastToolResult(harness).moa.retryAttempted, false)
})

test('marks retry-exhausted tasks terminal for the turn and continues with partial results', async () => {
  const harness = createHarness()
  const moaRetryState = createMoaRetryState()
  const task1 = buildTask('task_1', 'role_ui', 'UI Reviewer')
  const task2 = buildTask('task_2', 'role_css', 'CSS Reviewer')
  const calls = []
  const executeDelegationFn = async (tasks) => {
    calls.push(tasks.map((task) => task.task_id))
    if (calls.length === 1) {
      return {
        delegationId: 'del_partial',
        startedAt: 1,
        finishedAt: 2,
        durationMs: 1,
        usage: { totalTokens: 20, inputTokens: 12, outputTokens: 8, reasoningTokens: 2 },
        agents: [
          buildAgent('task_1', 'role_ui', 'UI Reviewer', 'timeout'),
          buildAgent('task_2', 'role_css', 'CSS Reviewer', 'completed'),
        ],
        stagedChanges: [],
        errors: [],
      }
    }
    return {
      delegationId: 'del_partial',
      startedAt: 3,
      finishedAt: 4,
      durationMs: 1,
      usage: { totalTokens: 10, inputTokens: 6, outputTokens: 4, reasoningTokens: 1 },
      agents: [
        buildAgent('task_1', 'role_ui', 'UI Reviewer', 'timeout'),
      ],
      stagedChanges: [],
      errors: [],
    }
  }

  const result = await runDelegation({
    toolInput: buildToolInput([task1, task2]),
    moaRoles: [buildRole('role_ui', 'UI Reviewer'), buildRole('role_css', 'CSS Reviewer')],
    harness,
    moaRetryState,
    executeDelegationFn,
  })

  assert.equal(result.handled, true)
  assert.deepEqual(calls, [['task_1', 'task_2'], ['task_1']])
  const payload = lastToolResult(harness)
  assert.equal(payload.isError, false)
  assert.equal(payload.moa.status, 'completed_with_errors')
  assert.equal(payload.moa.partialSuccess, true)
  assert.equal(payload.moa.allAgentsFailed, false)
  assert.equal(payload.moa.retryExhaustedTasks.length, 1)
  assert.match(String(result.pendingSynthesisPrompt || ''), /Do not call delegate_tasks again/)
  assert.match(String(result.pendingSynthesisPrompt || ''), /Some agents succeeded/)
})

test('delegation result preserves requested, planned, admitted, and executed task counts', async () => {
  const harness = createHarness()
  const moaRetryState = createMoaRetryState()
  const tasks = [
    buildTask('task_1', 'role_ui', 'UI Reviewer', 'Review landing page spacing'),
    buildTask('task_2', 'role_css', 'CSS Reviewer', 'Review settings form spacing'),
    buildTask('task_3', 'role_db', 'DB Reviewer', 'Review docs wording'),
  ]
  const calls = []
  const executeDelegationFn = async (plannedTasks) => {
    calls.push(plannedTasks.map((task) => task.task_id))
    return {
      delegationId: 'del_counts',
      startedAt: 1,
      finishedAt: 2,
      durationMs: 1,
      usage: { totalTokens: 10, inputTokens: 6, outputTokens: 4, reasoningTokens: 0 },
      agents: plannedTasks.map((task) => (
        buildAgent(task.task_id, task.agent_role_id, task.agent_role, 'completed')
      )),
      stagedChanges: [],
      errors: [],
    }
  }

  const result = await runDelegation({
    toolInput: buildToolInput(tasks),
    moaRoles: [
      buildRole('role_ui', 'UI Reviewer'),
      buildRole('role_css', 'CSS Reviewer'),
      buildRole('role_db', 'DB Reviewer'),
    ],
    harness,
    moaRetryState,
    executeDelegationFn,
  })

  assert.equal(result.handled, true)
  assert.deepEqual(calls, [['task_1', 'task_2', 'task_3']])
  const payload = lastToolResult(harness)
  assert.equal(payload.moa.requestedTaskCount, 3)
  assert.equal(payload.moa.plannedTaskCount, 3)
  assert.equal(payload.moa.admittedTaskCount, 3)
  assert.equal(payload.moa.executedTaskCount, 3)
  assert.equal(payload.moa.skippedTaskCount, 0)
})

test('skips same exhausted delegation signature later in the same turn', async () => {
  const harness = createHarness()
  const moaRetryState = createMoaRetryState()
  const task1 = buildTask('task_1', 'role_ui', 'UI Reviewer')
  let callCount = 0
  const executeDelegationFn = async (tasks) => {
    callCount += 1
    return {
      delegationId: `del_skip_${callCount}`,
      startedAt: 1,
      finishedAt: 2,
      durationMs: 1,
      usage: { totalTokens: 10, inputTokens: 6, outputTokens: 4, reasoningTokens: 1 },
      agents: tasks.map((task) => buildAgent(task.task_id, 'role_ui', 'UI Reviewer', 'timeout')),
      stagedChanges: [],
      errors: [],
    }
  }

  await runDelegation({
    toolInput: buildToolInput([task1]),
    moaRoles: [buildRole('role_ui', 'UI Reviewer')],
    harness,
    moaRetryState,
    executeDelegationFn,
  })

  assert.equal(callCount, 2, 'initial attempt plus one retry')

  const secondHarness = createHarness()
  const result = await runDelegation({
    toolInput: buildToolInput([task1]),
    moaRoles: [buildRole('role_ui', 'UI Reviewer')],
    harness: secondHarness,
    moaRetryState,
    executeDelegationFn,
  })

  assert.equal(callCount, 2, 'exhausted task should not execute again')
  const payload = lastToolResult(secondHarness)
  assert.equal(payload.isError, false)
  assert.equal(payload.moa.skippedRetryExhaustedTasks.length, 1)
  assert.match(String(result.pendingSynthesisPrompt || ''), /Do not call delegate_tasks again/)
  assert.ok(secondHarness.sent.some((entry) => entry.channel === 'moa:delegation-skip'))
})

test('prompt-driven delegation enhances planned tasks with project context before execution', async () => {
  const harness = createHarness()
  const moaRetryState = createMoaRetryState()
  const tempProject = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-moa-enhance-'))
  fs.writeFileSync(path.join(tempProject, 'index.html'), '<main>hello</main>\n')
  fs.writeFileSync(path.join(tempProject, 'styles.css'), 'body { color: black; }\n')

  const task = buildTask(
    'task_1',
    'role_ui',
    'UI Reviewer',
    'Review only index.html for UI quality and return 3 short bullets.',
  )
  let receivedTasks = []
  const executeDelegationFn = async (tasks) => {
    receivedTasks = tasks
    return {
      delegationId: 'del_enhanced',
      startedAt: 1,
      finishedAt: 2,
      durationMs: 1,
      usage: { totalTokens: 10, inputTokens: 6, outputTokens: 4, reasoningTokens: 0 },
      agents: [buildAgent('task_1', 'role_ui', 'UI Reviewer', 'completed')],
      stagedChanges: [],
      errors: [],
    }
  }

  await runDelegation({
    toolInput: buildToolInput([task]),
    moaRoles: [buildRole('role_ui', 'UI Reviewer')],
    harness,
    moaRetryState,
    executeDelegationFn,
    projectFolder: tempProject,
    moaPolicy: {
      ...DEFAULT_MOA_POLICY,
      promptEnhancementEnabled: true,
      agentMemoryEnabled: false,
    },
  })

  assert.equal(receivedTasks.length, 1)
  const injected = String(receivedTasks[0]?.injected_context || '')
  assert.match(injected, /Project Context \(auto-enriched\)/)
  assert.match(injected, /Project structure:/)
  assert.match(injected, /Files likely relevant to this task:/)
  assert.match(injected, /index\.html/)
})

test('runs only new tasks when delegation mixes exhausted and fresh signatures', async () => {
  const harness = createHarness()
  const moaRetryState = createMoaRetryState()
  const exhaustedTask = buildTask('task_1', 'role_ui', 'UI Reviewer')
  const freshTask = buildTask('task_2', 'role_perf', 'Performance Reviewer')
  const calls = []
  const executeDelegationFn = async (tasks) => {
    calls.push(tasks.map((task) => task.task_id))
    if (calls.length <= 2) {
      return {
        delegationId: 'del_mixed',
        startedAt: 1,
        finishedAt: 2,
        durationMs: 1,
        usage: { totalTokens: 10, inputTokens: 6, outputTokens: 4, reasoningTokens: 1 },
        agents: tasks.map((task) => buildAgent(task.task_id, 'role_ui', 'UI Reviewer', 'timeout')),
        stagedChanges: [],
        errors: [],
      }
    }
    return {
      delegationId: 'del_mixed',
      startedAt: 3,
      finishedAt: 4,
      durationMs: 1,
      usage: { totalTokens: 10, inputTokens: 6, outputTokens: 4, reasoningTokens: 1 },
      agents: [
        buildAgent('task_2', 'role_perf', 'Performance Reviewer', 'completed'),
      ],
      stagedChanges: [],
      errors: [],
    }
  }

  await runDelegation({
    toolInput: buildToolInput([exhaustedTask]),
    moaRoles: [buildRole('role_ui', 'UI Reviewer'), buildRole('role_perf', 'Performance Reviewer')],
    harness,
    moaRetryState,
    executeDelegationFn,
  })

  const secondHarness = createHarness()
  await runDelegation({
    toolInput: buildToolInput([exhaustedTask, freshTask]),
    moaRoles: [buildRole('role_ui', 'UI Reviewer'), buildRole('role_perf', 'Performance Reviewer')],
    harness: secondHarness,
    moaRetryState,
    executeDelegationFn,
  })

  assert.deepEqual(calls, [['task_1'], ['task_1'], ['task_2']])
  const payload = lastToolResult(secondHarness)
  assert.equal(payload.isError, false)
  assert.equal(payload.moa.summary.completed, 1)
  assert.equal(payload.moa.skippedRetryExhaustedTasks.length, 1)
  assert.equal(payload.moa.partialSuccess, true)
})
