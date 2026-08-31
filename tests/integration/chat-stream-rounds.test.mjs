import test from 'node:test'
import assert from 'node:assert/strict'

import { runToolCallBatchForRound } from '../../src/main/chat/chat-stream-rounds.mjs'

test('runToolCallBatchForRound preserves the resolved prompt budget profile for tool result budgeting', async () => {
  const promptBudgetProfile = {
    id: 'anthropic_strict',
    family: 'anthropic',
    explorationToolBudgetMode: 'relaxed',
    localPreflightInputCeilingTokens: 60_000,
  }
  let receivedPromptBudgetProfile = null

  await runToolCallBatchForRound({
    toolCalls: [{
      name: 'apply_patch',
      input: {
        target_file: 'src/example.js',
        patch: '*** Begin Patch',
      },
    }],
    loop: {
      cancelled: false,
      blockedToolNames: new Set(['apply_patch']),
      blockedToolStates: new Map(),
    },
    providerId: 'anthropic',
    model: 'claude-sonnet-4-6',
    promptBudgetProfile,
    activeThreadId: 'thread_1',
    activeTurnId: 'turn_1',
    history: [],
    turnToolResults: [],
    turnReasoningSegments: [],
    helpers: {
      toToolEventInput: (_toolName, input) => input,
      shouldBlockEditFileWithoutInspection: () => ({ blocked: false }),
      recordToolStepOutcome: (args = {}) => {
        receivedPromptBudgetProfile = args.promptBudgetProfile || null
        args.turnToolResults.push({
          toolName: args.tc?.name || '',
          promptBudgetProfileId: args.promptBudgetProfile?.id || '',
        })
      },
      buildToolResultMessage: () => ({}),
      trimText: (value) => String(value ?? ''),
      extractRunCommandMeta: () => ({}),
      runDelegationToolCall: async () => ({ handled: false }),
      resolveToolApprovalForStep: async () => ({ decision: 'approved' }),
      bumpRuntimeCount: () => {},
      takeShellWriteSnapshot: async () => null,
      detectShellWriteArtifactChanges: () => [],
      executeOpenAILocalRuntimeTool: async () => ({}),
      isOpenAILocalRuntimeToolName: () => false,
      executeTool: async () => ({}),
      resolveToolWriteArtifactMeta: () => null,
      getBaseRevisionId: () => '',
      buildMissingDependencyInstallHint: () => '',
      isAbortError: () => false,
      executeProviderNativeToolCall: async () => ({}),
      extractPrefixedMetaFromResultText: () => '',
      buildToolRecoveryPrompt: () => '',
      recordInspectedPathForTurn: () => {},
    },
  })

  assert.equal(receivedPromptBudgetProfile, promptBudgetProfile)
})
