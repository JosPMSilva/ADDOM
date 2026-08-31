import test from 'node:test'
import assert from 'node:assert/strict'

import { runToolCallBatchForRound } from '../../src/main/chat/chat-stream-rounds.mjs'

test('renderer approval interruption records a recoverable tool result and cancels the turn with a clear reason', async () => {
  const sendEvents = []
  const timelineEvents = []
  const turnStateEvents = []
  const toolOutcomeRecords = []
  const history = []
  const turnToolResults = []
  const loop = {
    cancelled: false,
    cancelReason: '',
  }

  const result = await runToolCallBatchForRound({
    toolCalls: [{
      id: 'tool_call_1',
      name: 'write_file',
      input: { path: 'src/example.txt', content: 'next' },
    }],
    loop,
    sender: null,
    wid: 7,
    settings: {},
    projectFolder: process.cwd(),
    providerId: 'openai',
    model: 'gpt-test',
    activeThreadId: 'thread_approval_recovery',
    activeTurnId: 'turn_approval_recovery',
    history,
    turnToolResults,
    inspectedFilePathsThisTurn: new Set(),
    errorDiagnostics: {
      approvalPromptCount: 0,
      riskyApprovalPromptCount: 0,
      approvalAutoSources: {},
      approvalApprovedCount: 0,
      approvalDeniedCount: 0,
      approvalPolicyBlockedCount: 0,
      approvalUserDeniedCount: 0,
      approvalTimeoutCount: 0,
    },
    send: (channel, payload) => {
      sendEvents.push({ channel, payload })
    },
    persistTimelineEvent: (kind, payload) => {
      timelineEvents.push({ kind, payload })
    },
    sendTurnState: (state, payload) => {
      turnStateEvents.push({ state, payload })
    },
    emitTurnRuntimeDiagnostics: () => {},
    requestFanoutConfirmation: async () => null,
    helpers: {
      toToolEventInput: (_toolName, input) => input,
      shouldBlockEditFileWithoutInspection: () => ({ blocked: false, message: '' }),
      recordToolStepOutcome: (payload) => {
        toolOutcomeRecords.push(payload)
        turnToolResults.push({
          toolName: payload.tc?.name,
          decision: payload.decision,
          denyReason: payload.denyReason,
          isError: payload.isError,
          result: payload.result,
        })
      },
      buildToolResultMessage: (_id, _toolName, toolResult) => ({ role: 'tool', content: toolResult }),
      trimText: (value) => String(value ?? ''),
      extractRunCommandMeta: () => ({}),
      runDelegationToolCall: async () => ({ handled: false }),
      resolveToolApprovalForStep: async () => ({
        cancelled: false,
        approvalId: 'approval_renderer_lost',
        approvalPolicy: null,
        approvalPromptSource: '',
        approvalPromptAction: 'prompt',
        approvalPromptShown: true,
        decision: 'denied',
        denyReason: 'renderer_unavailable',
        runCommandPolicyActivityMeta: {},
        browserActionPolicyActivityMeta: {},
        approvalEffectiveCommandSafety: null,
        approvalCommandSafetyOverride: null,
        hostFullAccessApprovedForTurn: false,
      }),
      bumpRuntimeCount: (target, key) => {
        target[key] = (Number(target[key] || 0) || 0) + 1
      },
      takeShellWriteSnapshot: async () => null,
      detectShellWriteArtifactChanges: async () => [],
      executeOpenAILocalRuntimeTool: async () => '',
      isOpenAILocalRuntimeToolName: () => false,
      executeTool: async () => '',
      resolveToolWriteArtifactMeta: () => null,
      getBaseRevisionId: () => '',
      buildMissingDependencyInstallHint: () => '',
      isAbortError: () => false,
      executeProviderNativeToolCall: async () => '',
      extractPrefixedMetaFromResultText: () => '',
      buildToolRecoveryPrompt: () => 'retry recovery prompt',
      recordInspectedPathForTurn: () => {},
    },
  })

  assert.equal(toolOutcomeRecords.length, 1)
  assert.equal(toolOutcomeRecords[0].denyReason, 'renderer_unavailable')
  assert.equal(toolOutcomeRecords[0].isError, true)
  assert.match(toolOutcomeRecords[0].result, /Approval interrupted because the window reloaded or closed/i)
  assert.equal(loop.cancelled, true)
  assert.match(loop.cancelReason, /Reopen the thread and retry/i)
  assert.equal(result.shouldBreakRoundLoop, true)
  assert.equal(history.length, 0, 'does not inject a follow-up recovery prompt into history')
  assert.equal(turnStateEvents.length, 0, 'turn finalization is deferred to the outer lifecycle')
  assert.equal(sendEvents.length, 0)
  assert.equal(timelineEvents.length, 0)
})
