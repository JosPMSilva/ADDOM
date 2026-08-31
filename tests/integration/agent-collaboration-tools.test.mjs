import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildAgentCollaborationTools,
} from '../../src/main/agents/tools/agent-collaboration-tools.mjs'
import {
  executeAgentCollaborationTool,
} from '../../src/main/agents/tools/agent-collaboration-tool-executor.mjs'
import {
  executeAgentToolCall,
  resolveAgentRuntimeTooling,
} from '../../src/main/moa/agent-runtime-tooling.mjs'
import {
  makeAgentCapabilities,
  makeAgentPermission,
} from '../helpers/agent-runtime-fixtures.mjs'

function context(overrides = {}) {
  return {
    runId: 'run_01',
    nodeId: 'agent_parent',
    attemptId: 'attempt_parent_1',
    depth: 1,
    capabilitySnapshot: makeAgentCapabilities(),
    permissionSnapshot: makeAgentPermission('read_only'),
    policyLimits: {
      maxDepth: 6,
      maxFanOut: 16,
    },
    ...overrides,
  }
}

test('collaboration tool surface is filtered by effective node capabilities and depth policy', () => {
  assert.deepEqual(Object.keys(buildAgentCollaborationTools(context())).sort(), [
    'followup_agent',
    'interrupt_agent',
    'list_agents',
    'send_message',
    'spawn_agent',
    'wait_agent',
  ])

  assert.deepEqual(Object.keys(buildAgentCollaborationTools(context({
    depth: 6,
    capabilitySnapshot: makeAgentCapabilities({
      childMessaging: false,
      childCancellation: false,
    }),
  }))).sort(), [
    'list_agents',
    'wait_agent',
  ])

  assert.deepEqual(Object.keys(buildAgentCollaborationTools(context({
    capabilitySnapshot: makeAgentCapabilities({
      recursiveAgents: false,
      addressableChildren: false,
      childMessaging: false,
      childCancellation: false,
    }),
  }))), [])
})

test('collaboration tool execution delegates only through the owning managed runtime', async () => {
  const calls = []
  const managedRuntime = {
    async spawnAgent(input) {
      calls.push(['spawn', input])
      return { nodeId: 'agent_child' }
    },
    async sendMessage(input) {
      calls.push(['message', input])
      return { delivered: true }
    },
    async followupAgent(input) {
      calls.push(['followup', input])
      return { delivered: true }
    },
    async waitAgent(input) {
      calls.push(['wait', input])
      return { status: 'completed', result: 'done' }
    },
    listAgents(input) {
      calls.push(['list', input])
      return [{ nodeId: 'agent_child' }]
    },
    interruptAgent(input) {
      calls.push(['interrupt', input])
      return { interrupted: true }
    },
  }
  const owner = context()

  const result = await executeAgentCollaborationTool({
    toolCall: {
      name: 'spawn_agent',
      input: {
        task: 'Inspect the parser.',
        role: 'reviewer',
        provider_id: 'openrouter',
        model_id: 'anthropic/claude-sonnet-5',
      },
    },
    context: owner,
    managedRuntime,
  })

  assert.deepEqual(result, { nodeId: 'agent_child' })
  assert.deepEqual(calls[0], ['spawn', {
    owner,
    task: 'Inspect the parser.',
    role: 'reviewer',
    providerId: 'openrouter',
    modelId: 'anthropic/claude-sonnet-5',
    background: false,
  }])

  await assert.rejects(
    executeAgentCollaborationTool({
      toolCall: { name: 'not_a_collaboration_tool', input: {} },
      context: owner,
      managedRuntime,
    }),
    /unsupported collaboration tool/i,
  )
})

test('managed collaboration tools join the existing agent tool loop without bypassing its executor', async () => {
  const owner = context()
  const calls = []
  const managedRuntime = {
    async spawnAgent(input) {
      calls.push(input)
      return { nodeId: 'agent_child' }
    },
  }
  const runtime = {
    agentCollaborationContext: owner,
    managedAgentRuntime: managedRuntime,
  }
  const resolved = resolveAgentRuntimeTooling(
    { canWriteFiles: false },
    runtime,
  )

  assert.ok(resolved.agentTools.read_file)
  assert.ok(resolved.agentTools.spawn_agent)

  const execution = await executeAgentToolCall({
    toolCall: {
      name: 'spawn_agent',
      input: { task: 'Inspect the parser.', role: 'reviewer' },
    },
    runtime,
  })

  assert.equal(execution.isToolError, false)
  assert.deepEqual(JSON.parse(execution.result), { nodeId: 'agent_child' })
  assert.equal(calls[0].owner, owner)
})
