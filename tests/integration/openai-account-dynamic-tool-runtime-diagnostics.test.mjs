import test from 'node:test'
import assert from 'node:assert/strict'

import { createOpenAIAccountDynamicToolExecutor } from '../../src/main/ipc-handlers/chat-stream-handler-account-tool-executor.mjs'

test('OpenAI account dynamic tools reject catalog entries that are unavailable for the current turn', async () => {
  const executor = createOpenAIAccountDynamicToolExecutor({
    providerId: 'openai',
    model: 'gpt-5.6-luna',
    authMethod: 'account',
    activeToolNames: [],
    resolvedToolSurface: {
      toolExecutionMap: {},
      promptBudgetProfile: {},
    },
    permissionMode: 'full_access',
    settings: {
      permissionMode: 'full_access',
      commandSafety: {},
    },
    activeThreadId: 'thread_capability_guard',
    activeTurnId: 'turn_capability_guard',
  })

  const outcome = typeof executor === 'function'
    ? await executor({
        toolName: 'delegate_tasks',
        input: { task: 'Review the current change.' },
      }).catch((error) => ({ thrown: String(error?.message || error) }))
    : { missingExecutor: true }

  assert.deepEqual(outcome, {
    result: 'Tool error: delegate_tasks is not available for this turn.',
    isError: true,
    reason: 'capability_unavailable',
  })
})

for (const mode of ['plan', 'thinking']) {
  test(`OpenAI account dynamic tools enforce the ${mode} capability ceiling`, async () => {
    const executor = createOpenAIAccountDynamicToolExecutor({
      providerId: 'openai',
      model: 'gpt-5.6-luna',
      authMethod: 'account',
      mode,
      activeToolNames: ['read_file', 'write_file'],
      resolvedToolSurface: {
        toolExecutionMap: {},
        promptBudgetProfile: {},
      },
      activeThreadId: `thread_${mode}_guard`,
      activeTurnId: `turn_${mode}_guard`,
    })

    const outcome = await executor({
      toolName: 'write_file',
      input: { path: 'README.md', content: 'blocked' },
    })

    assert.deepEqual(outcome, {
      result: `Tool error: write_file is not allowed in ${mode} mode.`,
      isError: true,
      reason: 'mode_capability_denied',
    })
  })
}

test('OpenAI account dynamic write-tool attempts update shared workflow diagnostics', async () => {
  const errorDiagnostics = {
    mode: 'execute',
    toolWorkflowFamilyCounts: {},
    toolWorkflowToolAttemptCounts: {},
    toolWorkflowFailureClassCounts: {},
    toolWorkflowToolFailureCounts: {},
    toolWorkflowWriteFailureCounts: {},
    toolWorkflowWriteIntentDetected: false,
    toolWorkflowSuccessfulMutationCount: 0,
  }
  const executor = createOpenAIAccountDynamicToolExecutor({
    providerId: 'openai',
    model: 'gpt-5.6-luna',
    authMethod: 'account',
    activeToolNames: ['edit_file'],
    resolvedToolSurface: {
      toolExecutionMap: {},
      promptBudgetProfile: {},
    },
    activeThreadId: 'thread_live_smoke',
    activeTurnId: 'turn_live_smoke',
    activeAssistantMessageId: 'message_live_smoke',
    effectiveProjectFolder: 'C:\\workspace',
    errorDiagnostics,
  })

  const outcome = await executor({
    toolName: 'edit_file',
    input: {
      path: 'README.md',
      content: 'not applied',
    },
  })

  assert.equal(outcome.isError, true)
  assert.equal(errorDiagnostics.toolWorkflowWriteIntentDetected, true)
  assert.equal(errorDiagnostics.toolWorkflowToolAttemptCounts.edit_file, 1)
  assert.equal(errorDiagnostics.toolWorkflowWriteFailureCounts.edit_file, 1)
  assert.equal(errorDiagnostics.toolWorkflowSuccessfulMutationCount, 0)
})
