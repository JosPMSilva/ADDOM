import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { __resetCreateStreamWithToolsForTests } from '../../src/main/api-clients/ai-provider.mjs'
import { executeDelegation } from '../../src/main/tools/agent-executor.mjs'
import { __testOpenAIAccountInternals } from '../../src/main/openai-account/openai-account-auth-service.mjs'
import { setSettingsPatch } from '../../src/main/settings.mjs'

test.beforeEach(async () => {
  await setSettingsPatch({
    providerAuthSettings: {
      openai: {
        authMethod: 'api_key',
      },
    },
  })
})

test.afterEach(() => {
  __resetCreateStreamWithToolsForTests()
  __testOpenAIAccountInternals.resetSingleton()
})

test('executeDelegation preserves task and role identity for unexpected parallel executor failures', async () => {
  const roles = [
    {
      id: 'role_sec',
      name: 'Security Reviewer',
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
    },
  ]

  const envelope = await executeDelegation(
    [{
      task_id: 'task_1',
      agent_role_id: 'role_sec',
      instruction: 'Review the auth flow.',
      injected_context: 'File: src/auth.mjs',
      expected_output_format: 'Return JSON findings.',
    }],
    roles,
    () => {
      throw new Error('vault exploded')
    },
    process.cwd(),
    () => {},
    null,
    {
      policy: {
        requireConfiguredApiKey: false,
      },
      pattern: 'parallel_independent',
    },
  )

  assert.equal(envelope.status, 'completed_with_errors')
  assert.equal(envelope.agents.length, 1)
  assert.equal(envelope.agents[0].taskId, 'task_1')
  assert.equal(envelope.agents[0].roleId, 'role_sec')
  assert.equal(envelope.agents[0].role, 'Security Reviewer')
  assert.equal(envelope.agents[0].providerId, 'anthropic')
  assert.equal(envelope.agents[0].model, 'claude-sonnet-4-6')
  assert.equal(envelope.agents[0].status, 'failed')
  assert.match(String(envelope.agents[0].error || ''), /vault exploded/)
})

test('executeDelegation translates flat tasks through the canonical managed runtime', async () => {
  const calls = []
  let inheritedChildRoute = null
  const managedAgentRuntime = {
    repository: {
      getRunGraph() {
        return {
          run: { id: 'run_canonical_01', rootNodeId: 'root_canonical_01' },
          transcript: [{
            kind: 'agent_orchestration_continuation_received',
            nodeId: 'root_canonical_01',
            payload: {
              continuation: {
                schemaVersion: 1,
                kind: 'child_turn_final',
                source: {
                  conversationId: 'conversation_review_01',
                  turnId: 'turn_review_01',
                  nodeId: 'node_review_01',
                  finalMessageId: 'final_review_01',
                },
                status: 'completed',
                provenance: { authorKind: 'agent', authorId: 'node_review_01' },
                conclusion: 'Canonical reviewer conclusion.',
                artifacts: [],
                inspectable: true,
              },
            },
          }],
        }
      },
    },
    async executeTaskGraph(input) {
      calls.push(input)
      inheritedChildRoute = await input.childRouteResolver({
        parentRole: input.tasks[0].role,
        providerId: '',
        modelId: '',
        role: 'Nested researcher',
      })
      return {
        runId: 'run_canonical_01',
        status: 'completed',
        results: input.tasks.map(({ task, role }) => ({
          providerResult: {
            legacyResult: {
              taskId: task.task_id,
              roleId: role.id,
              role: role.name,
              providerId: role.providerId,
              model: role.model,
              status: 'completed',
              output: `Completed ${task.task_id}`,
              usage: { inputTokens: 2, outputTokens: 1, reasoningTokens: 0, totalTokens: 3 },
              stagedChanges: [],
              rounds: 1,
              attempted: true,
            },
          },
        })),
      }
    },
  }
  const roles = [{
    id: 'role_review',
    name: 'Reviewer',
    providerId: 'anthropic',
    model: 'claude-sonnet-4-6',
  }]

  const envelope = await executeDelegation(
    [{
      task_id: 'task_review',
      agent_role_id: 'role_review',
      instruction: 'Review the parser.',
      injected_context: 'src/parser.mjs',
      expected_output_format: 'Concise report.',
    }],
    roles,
    () => 'sk-test',
    process.cwd(),
    () => {},
    null,
    {
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_01',
      policy: { requireConfiguredApiKey: false },
      managedAgentRuntime,
      orchestratorIntent: 'review_only',
    },
  )

  assert.equal(calls.length, 1)
  assert.equal(calls[0].tasks[0].role, roles[0])
  assert.equal(inheritedChildRoute.role.name, 'Nested researcher')
  assert.equal(inheritedChildRoute.role.providerId, 'anthropic')
  assert.equal(inheritedChildRoute.role.model, 'claude-sonnet-4-6')
  assert.equal(envelope.agentRunId, 'run_canonical_01')
  assert.equal(envelope.agents[0].output, 'Completed task_review')
  assert.equal(envelope.childSynthesis.intent, 'review_only')
  assert.equal(envelope.childSynthesis.totals.observed, 1)
  assert.equal(envelope.childSynthesis.contributions[0].source.turnId, 'turn_review_01')
  const source = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src/main/tools/agent-executor.mjs'),
    'utf8',
  )
  assert.doesNotMatch(source, /Promise\.allSettled/)
})

test('executeDelegation preserves sequential handoffs inside one canonical run', async () => {
  const seenInputs = []
  const managedAgentRuntime = {
    async executeTaskGraph(input) {
      assert.equal(input.sequential, true)
      const firstResult = {
        node: { status: 'completed' },
        providerResult: {
          legacyResult: {
            taskId: 'task_review',
            roleId: 'role_review',
            role: 'Reviewer',
            providerId: 'anthropic',
            model: 'claude-sonnet-4-6',
            status: 'completed',
            output: '{"summary":"Review complete","findings":[]}',
            usage: {},
            stagedChanges: [],
          },
        },
      }
      seenInputs.push(input.tasks[0])
      seenInputs.push(await input.prepareSequentialInput({
        input: input.tasks[1],
        priorResults: [firstResult],
        index: 1,
      }))
      return {
        runId: 'run_sequential_01',
        status: 'completed',
        results: [
          firstResult,
          {
            node: { status: 'completed' },
            providerResult: {
              legacyResult: {
                taskId: 'task_fix',
                roleId: 'role_fix',
                role: 'Fixer',
                providerId: 'anthropic',
                model: 'claude-sonnet-4-6',
                status: 'completed',
                output: 'Fix complete',
                usage: {},
                stagedChanges: [],
              },
            },
          },
        ],
      }
    },
  }
  const roles = [
    { id: 'role_review', name: 'Reviewer', providerId: 'anthropic', model: 'claude-sonnet-4-6' },
    { id: 'role_fix', name: 'Fixer', providerId: 'anthropic', model: 'claude-sonnet-4-6' },
  ]

  const envelope = await executeDelegation(
    [
      {
        task_id: 'task_review',
        agent_role_id: 'role_review',
        instruction: 'Review the parser.',
        injected_context: 'src/parser.mjs',
        expected_output_format: 'JSON findings.',
      },
      {
        task_id: 'task_fix',
        agent_role_id: 'role_fix',
        instruction: 'Fix the parser.',
        injected_context: 'src/parser.mjs',
        expected_output_format: 'Concise report.',
      },
    ],
    roles,
    () => 'sk-test',
    process.cwd(),
    () => {},
    null,
    {
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_01',
      pattern: 'sequential_pipeline',
      policy: { requireConfiguredApiKey: false },
      managedAgentRuntime,
    },
  )

  assert.equal(envelope.agentRunId, 'run_sequential_01', JSON.stringify({
    agents: envelope.agents,
    errors: envelope.errors,
  }))
  assert.match(String(seenInputs[1].task.runtime_handoff || ''), /Review complete/)
  assert.deepEqual(envelope.agents.map((agent) => agent.status), ['completed', 'completed'])
})

test('executeDelegation reports downstream sequential tasks as unattempted aborts', async () => {
  const managedAgentRuntime = {
    async executeTaskGraph() {
      return {
        runId: 'run_sequential_failure_01',
        status: 'completed',
        results: [
          {
            node: { status: 'failed', errorSummary: 'Review failed.' },
            providerResult: {
              legacyResult: {
                taskId: 'task_review',
                roleId: 'role_review',
                role: 'Reviewer',
                providerId: 'anthropic',
                model: 'claude-sonnet-4-6',
                status: 'failed',
                error: 'Review failed.',
                output: null,
                usage: {},
                stagedChanges: [],
              },
            },
          },
          {
            node: { status: 'cancelled', errorSummary: null },
            providerResult: undefined,
          },
        ],
      }
    },
  }
  const roles = [
    { id: 'role_review', name: 'Reviewer', providerId: 'anthropic', model: 'claude-sonnet-4-6' },
    { id: 'role_fix', name: 'Fixer', providerId: 'anthropic', model: 'claude-sonnet-4-6' },
  ]
  const envelope = await executeDelegation(
    [
      {
        task_id: 'task_review',
        agent_role_id: 'role_review',
        instruction: 'Review the parser.',
        injected_context: 'src/parser.mjs',
        expected_output_format: 'Concise report.',
      },
      {
        task_id: 'task_fix',
        agent_role_id: 'role_fix',
        instruction: 'Fix the parser.',
        injected_context: 'src/parser.mjs',
        expected_output_format: 'Concise report.',
      },
    ],
    roles,
    () => 'sk-test',
    process.cwd(),
    () => {},
    null,
    {
      projectId: 'project_01',
      threadId: 'thread_01',
      pattern: 'review_gate',
      policy: { requireConfiguredApiKey: false },
      managedAgentRuntime,
    },
  )

  assert.equal(envelope.status, 'completed_with_errors')
  assert.equal(envelope.agents[1].status, 'aborted')
  assert.equal(envelope.agents[1].attempted, false)
  assert.match(envelope.agents[1].error, /upstream sequential step/i)
})

test('executeDelegation enables account runtime readiness for OpenAI roles', () => {
  const source = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src/main/tools/agent-executor.mjs'),
    'utf8',
  )
  assert.match(source, /allowOpenAIAccountRuntime:\s*true/)
})
