import test from 'node:test'
import assert from 'node:assert/strict'

import { runToolCallBatchForRound } from '../../src/main/chat/chat-stream-rounds.mjs'

test('runToolCallBatchForRound blocks lint-rejected tool calls before approval and tool-executing emit', async () => {
  const sendEvents = []
  const toolOutcomeRecords = []
  let approvalCalls = 0
  let executeToolCalls = 0
  const errorDiagnostics = {
    approvalPromptCount: 0,
    riskyApprovalPromptCount: 0,
    approvalAutoSources: {},
    approvalApprovedCount: 0,
    approvalDeniedCount: 0,
    approvalPolicyBlockedCount: 0,
    approvalUserDeniedCount: 0,
    approvalTimeoutCount: 0,
    toolWorkflowLintRejectCount: 0,
    toolWorkflowLintWarnCount: 0,
    toolWorkflowRerouteCount: 0,
    toolWorkflowWrongToolRetryCount: 0,
    toolWorkflowWriteIntentDetected: false,
    toolWorkflowFirstSuccessfulMutationLatencyMs: 0,
    toolWorkflowFailureClassCounts: {},
    toolWorkflowLintCodeCounts: {},
    toolWorkflowFamilyCounts: {},
  }

  await runToolCallBatchForRound({
    toolCalls: [{
      id: 'tool_call_1',
      name: 'apply_patch',
      input: {
        operation: {
          type: 'update_file',
          path: 'src/example.txt',
          diff: 'rewrite entire file content',
        },
      },
    }],
    loop: {
      cancelled: false,
      abortController: new AbortController(),
    },
    sender: null,
    wid: 0,
    settings: {},
    projectFolder: process.cwd(),
    providerId: 'openai',
    model: 'gpt-test',
    activeThreadId: 'thread_lint_gate',
    activeTurnId: 'turn_lint_gate',
    history: [],
    turnToolResults: [],
    inspectedFilePathsThisTurn: new Set(),
    errorDiagnostics,
    send: (channel, payload) => {
      sendEvents.push({ channel, payload })
    },
    persistTimelineEvent: () => {},
    sendTurnState: () => {},
    emitTurnRuntimeDiagnostics: () => {},
    requestFanoutConfirmation: async () => null,
    helpers: {
      toToolEventInput: (_toolName, input) => input,
      shouldBlockEditFileWithoutInspection: () => ({ blocked: false, message: '' }),
      recordToolStepOutcome: (payload) => {
        toolOutcomeRecords.push(payload)
      },
      buildToolResultMessage: (_id, _toolName, toolResult) => ({ role: 'tool', content: toolResult }),
      trimText: (value) => String(value ?? ''),
      extractRunCommandMeta: () => ({}),
      runDelegationToolCall: async () => ({ handled: false }),
      resolveToolApprovalForStep: async () => {
        approvalCalls += 1
        return { decision: 'approved', denyReason: '' }
      },
      bumpRuntimeCount: () => {},
      takeShellWriteSnapshot: async () => null,
      detectShellWriteArtifactChanges: async () => [],
      executeOpenAILocalRuntimeTool: async () => null,
      isOpenAILocalRuntimeToolName: () => false,
      executeTool: async () => {
        executeToolCalls += 1
        return { result: 'should not execute' }
      },
      resolveToolWriteArtifactMeta: async () => null,
      getBaseRevisionId: () => '',
      buildMissingDependencyInstallHint: () => '',
      isAbortError: () => false,
      executeProviderNativeToolCall: async () => null,
      extractPrefixedMetaFromResultText: () => '',
      buildToolRecoveryPrompt: () => '',
      recordInspectedPathForTurn: () => {},
    },
  })

  assert.equal(approvalCalls, 0)
  assert.equal(executeToolCalls, 0)
  assert.equal(toolOutcomeRecords.length, 1)
  assert.equal(toolOutcomeRecords[0].lintResult?.lintCode, 'apply_patch_empty_diff')
  assert.equal(sendEvents.some((row) => row.channel === 'chat:tool-executing'), false)
  assert.match(String(toolOutcomeRecords[0].result || ''), /^Tool error: pre-execution lint/i)
  assert.equal(
    toolOutcomeRecords[0].lintResult?.rerouteToolName,
    'write_file',
  )
  assert.equal(
    toolOutcomeRecords[0].lintResult?.failureClass,
    'MALFORMED_PATCH_SYNTAX',
  )
  assert.equal(errorDiagnostics.toolWorkflowLintRejectCount, 1)
  assert.equal(errorDiagnostics.toolWorkflowRerouteCount, 1)
  assert.equal(errorDiagnostics.toolWorkflowWriteIntentDetected, true)
  assert.deepEqual(errorDiagnostics.toolWorkflowFailureClassCounts, {
    MALFORMED_PATCH_SYNTAX: 2,
  })
  assert.deepEqual(errorDiagnostics.toolWorkflowLintCodeCounts, {
    apply_patch_empty_diff: 1,
  })
})
