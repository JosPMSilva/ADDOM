import test from 'node:test'
import assert from 'node:assert/strict'

import { runToolCallBatchForRound } from '../../src/main/chat/chat-stream-rounds.mjs'

test('runToolCallBatchForRound stops the turn after approved question_user', async () => {
  const executedToolNames = []

  const result = await runToolCallBatchForRound({
    toolCalls: [
      {
        id: 'tc_question',
        name: 'question_user',
        input: {
          header: 'Need input',
          question: 'Which path should be edited?',
          options: [{ label: 'src/app.js', description: 'Primary entry file' }],
        },
      },
      {
        id: 'tc_read',
        name: 'read_file',
        input: { path: 'src/app.js' },
      },
    ],
    loop: { cancelled: false, abortController: new AbortController() },
    activeThreadId: 'thread_1',
    activeTurnId: 'turn_1',
    history: [],
    turnToolResults: [],
    send: () => {},
    persistTimelineEvent: () => {},
    sendTurnState: () => {},
    emitTurnRuntimeDiagnostics: () => {},
    helpers: {
      toToolEventInput: (_name, input) => input,
      shouldBlockEditFileWithoutInspection: () => ({ blocked: false, message: '' }),
      recordToolStepOutcome: ({ tc }) => {
        executedToolNames.push(tc.name)
      },
      buildToolResultMessage: () => ({}),
      trimText: (value) => String(value || ''),
      extractRunCommandMeta: () => ({}),
      runDelegationToolCall: async () => ({ handled: false }),
      resolveToolApprovalForStep: async () => ({ decision: 'approved', denyReason: '' }),
      bumpRuntimeCount: () => {},
      takeShellWriteSnapshot: async () => null,
      detectShellWriteArtifactChanges: () => [],
      executeOpenAILocalRuntimeTool: async () => null,
      isOpenAILocalRuntimeToolName: () => false,
      executeTool: async (_projectFolder, toolName) => {
        if (toolName === 'question_user') {
          return {
            result: {
              header: 'Need input',
              question: 'Which path should be edited?',
              options: [{ label: 'src/app.js', description: 'Primary entry file' }],
            },
          }
        }
        executedToolNames.push(`unexpected:${toolName}`)
        return { result: 'unexpected' }
      },
      resolveToolWriteArtifactMeta: () => null,
      buildMissingDependencyInstallHint: () => '',
      isAbortError: () => false,
      extractPrefixedMetaFromResultText: () => ({}),
      buildToolRecoveryPrompt: () => '',
      recordInspectedPathForTurn: () => {},
    },
  })

  assert.equal(result.shouldBreakRoundLoop, true)
  assert.match(String(result.questionUserRequest?.assistantText || ''), /Need input:/)
  assert.match(String(result.questionUserRequest?.assistantText || ''), /Which path should be edited\?/)
  assert.match(String(result.questionUserRequest?.assistantText || ''), /Reply with your choice or provide the missing detail/)
  assert.deepEqual(executedToolNames, ['question_user'])
})
