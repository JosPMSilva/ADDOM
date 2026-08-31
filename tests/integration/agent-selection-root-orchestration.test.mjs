import assert from 'node:assert/strict'
import test from 'node:test'

import {
  executeOrchestratedAgentCommand,
} from '../../src/renderer/components/chat/chat-panel-helpers.mjs'
import {
  runRequiredAgentDelegationBeforeRoot,
} from '../../src/main/chat/chat-stream-rounds.mjs'

test('explicit agent selection enters the canonical chat stream instead of finalizing in the renderer', async () => {
  const sent = []
  const localFinals = []
  const handled = await executeOrchestratedAgentCommand({
    rawContent: '@{Security Reviewer} review the authentication changes and report findings',
    activeThreadId: 'thread_01',
    projectFolder: 'C:/workspace',
    moaRoles: [{ id: 'role_security', name: 'Security Reviewer' }],
    isDirectAgentCommandTextFn: () => true,
    parseDirectAgentCommandFn: () => ({
      ok: true,
      route: 'orchestrated_single',
      tasks: [{
        task_id: 'task_1',
        agentRoleId: 'role_security',
        agentRole: 'Security Reviewer',
        instruction: 'review the authentication changes and report findings',
      }],
    }),
    sendMessage: async (...args) => {
      sent.push(args)
      return true
    },
    finalizeMessage: (...args) => localFinals.push(args),
  })

  assert.equal(handled, true)
  assert.equal(sent.length, 1)
  assert.equal(sent[0][0], '@{Security Reviewer} review the authentication changes and report findings')
  assert.equal(sent[0][1], 'execute')
  assert.deepEqual(sent[0][2]?.turnOptions?.requiredAgentDelegation, {
    route: 'orchestrated_single',
    tasks: [{
      task_id: 'task_1',
      agentRoleId: 'role_security',
      agentRole: 'Security Reviewer',
      instruction: 'review the authentication changes and report findings',
    }],
  })
  assert.deepEqual(localFinals, [])
})

test('required agent delegation is inserted as a valid tool exchange before the root model continues', async () => {
  const history = [{ role: 'user', content: 'Review this and report findings.' }]
  const calls = []
  const outcome = await runRequiredAgentDelegationBeforeRoot({
    requiredAgentDelegation: {
      route: 'orchestrated_single',
      tasks: [{
        task_id: 'task_1',
        agentRoleId: 'role_security',
        agentRole: 'Security Reviewer',
        instruction: 'Review this and report findings.',
      }],
    },
    orchestratorIntent: 'review_only',
    history,
    loop: { cancelled: false, abortController: new AbortController() },
    activeThreadId: 'thread_01',
    activeTurnId: 'turn_01',
    activeAssistantMessageId: 'assistant_01',
    stepSequence: 0,
    stepStartedAt: 100,
    helpers: {
      buildAssistantToolUseMessage: (_text, toolCalls) => ({
        role: 'assistant',
        content: toolCalls,
      }),
      runDelegationToolCall: async (args) => {
        calls.push(args)
        args.history.push({ role: 'tool', content: 'bounded tool result' })
        return {
          handled: true,
          pendingSynthesisMessages: [
            { role: 'system', content: 'Review-only synthesis guidance.' },
            { role: 'user', content: '<delegation_evidence>bounded</delegation_evidence>' },
          ],
        }
      },
    },
  })

  assert.equal(outcome.stepSequence, 1)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].orchestratorIntent, 'review_only')
  assert.equal(calls[0].tc.name, 'delegate_to_agents')
  assert.deepEqual(calls[0].toolInput.tasks, [{
    task_id: 'task_1',
    agentRoleId: 'role_security',
    agentRole: 'Security Reviewer',
    instruction: 'Review this and report findings.',
  }])
  assert.deepEqual(history.map((entry) => entry.role), [
    'user',
    'assistant',
    'tool',
    'system',
    'user',
  ])
})
