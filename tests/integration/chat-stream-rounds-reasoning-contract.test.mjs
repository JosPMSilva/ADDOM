import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { runSingleStreamRound } from '../../src/main/chat/chat-stream-round-runner.mjs'
import { runStreamRounds } from '../../src/main/chat/chat-stream-rounds.mjs'
import {
  emitReasoningDone,
  finalizeRoundWithoutTools,
  recordToolStepOutcome,
} from '../../src/main/chat/chat-turn-events.mjs'
import { REASONING_PHASE_BOUNDARY } from '../../src/common/chat/reasoning-phase-boundary.mjs'
import {
  __resetTerminalSessionRuntimeForTests,
  setTerminalSessionManagerForChat,
} from '../../src/main/chat/terminal-session-events.mjs'

afterEach(() => {
  __resetTerminalSessionRuntimeForTests()
})

function createErrorDiagnostics() {
  return {
    mode: 'execute',
    requestedToolCount: 0,
    toolCallCount: 0,
    usedTools: [],
    guardrailFailures: [],
    rollingTotalTokens: 0,
    modelTextualApprovalCueCount: 0,
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
}

function createToolBatchHelpers({ executeTool = async () => ({ result: 'ok' }) } = {}) {
  return {
    toToolEventInput: (_toolName, input) => input,
    shouldBlockEditFileWithoutInspection: () => ({ blocked: false, message: '' }),
    recordToolStepOutcome,
    buildToolResultMessage: (_id, toolName, result) => ({
      role: 'tool',
      content: `${String(toolName || '').trim()}: ${String(result ?? '')}`.trim(),
    }),
    trimText: (value) => String(value ?? ''),
    extractRunCommandMeta: () => ({}),
    runDelegationToolCall: async () => ({ handled: false }),
    resolveToolApprovalForStep: async () => ({
      decision: 'approved',
      denyReason: '',
      approvalId: 'approval_test',
      approvalPromptShown: false,
      approvalPromptSource: '',
      approvalPromptAction: 'approve',
      approvalPolicy: null,
      hostFullAccessApprovedForTurn: false,
      runCommandPolicyActivityMeta: {},
      browserActionPolicyActivityMeta: {},
    }),
    bumpRuntimeCount: () => {},
    takeShellWriteSnapshot: async () => null,
    detectShellWriteArtifactChanges: async () => [],
    executeOpenAILocalRuntimeTool: async () => null,
    isOpenAILocalRuntimeToolName: () => false,
    executeTool,
    resolveToolWriteArtifactMeta: async () => null,
    getBaseRevisionId: () => '',
    buildMissingDependencyInstallHint: () => '',
    isAbortError: () => false,
    executeProviderNativeToolCall: async () => null,
    extractPrefixedMetaFromResultText: () => '',
    buildToolRecoveryPrompt: () => '',
    recordInspectedPathForTurn: () => {},
  }
}

function createRoundHelpers({
  createStreamWithTools = async () => ({
    stopReason: 'stop',
    text: '',
    toolCalls: [],
    usage: null,
    reasoning: '',
  }),
  toolBatchHelpers = createToolBatchHelpers(),
} = {}) {
  return {
    getApiKey: () => '',
    getCachedModelCapabilities: () => null,
    buildPreCallContinuityInput: () => ({
      preCallOccupancyEstimateTokens: 0,
      continuityInput: null,
    }),
    compactHistoryForContextWindow: async () => ({ history: [] }),
    applyCompactionIfNeeded: () => false,
    estimateHistoryTokens: () => 0,
    resolveOpenAIThreadContinuation: () => null,
    pushUniqueRuntimeValue: (target, value) => {
      if (!Array.isArray(target)) return
      if (!target.includes(value)) target.push(value)
    },
    upsertOpenAIThreadState: () => {},
    prepareOpenAIBackgroundTurn: async () => ({ eligible: false }),
    createOpenAIBackgroundJob: async () => ({}),
    finalizeOpenAIBackgroundJob: () => {},
    buildChatUsagePayload: () => null,
    emitUsageEvent: () => {},
    emitReasoningDone,
    updateOpenAIContinuationContext: (context) => context,
    resolveOpenAIContinuationPersistence: () => ({}),
    recordRepeatedToolCallBatch: () => ({ blocked: false }),
    finalizeRoundWithoutTools,
    buildAssistantToolUseMessage: (text, toolCalls, options = {}) => ({
      role: 'assistant',
      content: String(text || '').trim(),
      toolCalls,
      reasoningText: String(options.reasoningText || ''),
    }),
    createStreamWithTools,
    detectTextualApprovalRequestWithoutToolCall: () => false,
    touchProjectUsageByThread: () => {},
    runPostTurnTasks: () => {},
    asTokenCount: (value) => Number(value || 0) || 0,
    isAbortError: () => false,
    toolBatchHelpers,
  }
}

test('runSingleStreamRound emits reasoning_done before the final assistant message for no-tool turns', async () => {
  const sent = []
  const persisted = []

  const result = await runSingleStreamRound({
    round: 1,
    loop: { cancelled: false, abortController: new AbortController() },
    history: [{ role: 'user', content: 'Summarize this.' }],
    rollingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    userMessage: 'Summarize this.',
    mode: 'chat',
    projectFolder: process.cwd(),
    providerId: 'gemini',
    model: 'gemini-2.5-flash',
    apiKey: 'test-key',
    options: {},
    tools: {},
    activeToolDefinitions: {},
    modelContext: {},
    continuityRuntime: null,
    providerRuntimeSettings: null,
    activeProjectId: 'project_round_reasoning',
    activeThreadId: 'thread_round_reasoning',
    activeTurnId: 'turn_round_reasoning',
    activeAssistantMessageId: 'message_round_reasoning',
    errorDiagnostics: createErrorDiagnostics(),
    turnStartedAt: Date.now(),
    send: (channel, payload) => sent.push({ channel, payload }),
    sendNotice: () => {},
    sendTurnState: () => {},
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    emitTurnRuntimeDiagnostics: () => {},
    turnToolResults: [],
    turnReasoningSegments: [],
    helpers: createRoundHelpers({
      createStreamWithTools: async () => ({
        stopReason: 'stop',
        text: 'Final answer.',
        toolCalls: [],
        usage: { reasoningTokens: 11 },
        reasoning: 'Final reasoning summary.',
      }),
    }),
  })

  assert.equal(result.shouldBreakRoundLoop, true)
  const reasoningDoneIndex = sent.findIndex((entry) => entry.channel === 'chat:reasoning-done')
  const finalDoneIndex = sent.findIndex((entry) => entry.channel === 'chat:done')
  assert.ok(reasoningDoneIndex >= 0)
  assert.ok(finalDoneIndex > reasoningDoneIndex)
  assert.equal(sent[reasoningDoneIndex]?.payload?.full, 'Final reasoning summary.')
  assert.equal(sent[reasoningDoneIndex]?.payload?.reasoningTokens, 11)

  const persistedKinds = persisted.map((entry) => entry.kind)
  const persistedReasoningIndex = persistedKinds.indexOf('reasoning_done')
  const persistedAssistantIndex = persistedKinds.indexOf('assistant_message')
  assert.ok(persistedReasoningIndex >= 0)
  assert.ok(persistedAssistantIndex > persistedReasoningIndex)
  assert.equal(String(persisted[persistedReasoningIndex]?.payload?.meta?.full || ''), 'Final reasoning summary.')
})

test('runSingleStreamRound preserves provider-declared reasoning phase boundaries in root chat', async () => {
  const sent = []
  const persisted = []
  await runSingleStreamRound({
    round: 1,
    loop: { cancelled: false, abortController: new AbortController() },
    history: [{ role: 'user', content: 'Inspect this.' }],
    rollingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    userMessage: 'Inspect this.',
    mode: 'chat', projectFolder: process.cwd(), providerId: 'openrouter', model: 'openai/gpt-5.4',
    apiKey: 'test-key', options: {}, tools: {}, activeToolDefinitions: {}, modelContext: {},
    continuityRuntime: null, providerRuntimeSettings: null,
    activeProjectId: 'project_boundary', activeThreadId: 'thread_boundary',
    activeTurnId: 'turn_boundary', activeAssistantMessageId: 'message_boundary',
    errorDiagnostics: createErrorDiagnostics(), turnStartedAt: Date.now(),
    send: (channel, payload) => sent.push({ channel, payload }),
    sendNotice: () => {}, sendTurnState: () => {},
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    emitTurnRuntimeDiagnostics: () => {}, turnToolResults: [], turnReasoningSegments: [],
    helpers: createRoundHelpers({
      createStreamWithTools: async (_provider, _key, _history, _options, _onChunk, onReasoning) => {
        onReasoning('Inspecting the workspace.')
        onReasoning('Checking the result.', { boundaryBefore: true })
        return { stopReason: 'stop', text: 'Done.', toolCalls: [], usage: null, reasoning: '' }
      },
    }),
  })

  assert.deepEqual(
    sent.filter((entry) => entry.channel === 'chat:reasoning-chunk').map((entry) => entry.payload.chunk),
    ['Inspecting the workspace.', REASONING_PHASE_BOUNDARY, 'Checking the result.'],
  )
  const persistedReasoning = persisted.filter((entry) => entry.kind === 'execution_reasoning_chunk')
  assert.deepEqual(
    persistedReasoning.map((entry) => entry.payload.content),
    [
      'Inspecting the workspace.',
      `Inspecting the workspace.${REASONING_PHASE_BOUNDARY}`,
      `Inspecting the workspace.${REASONING_PHASE_BOUNDARY}Checking the result.`,
      `Inspecting the workspace.${REASONING_PHASE_BOUNDARY}Checking the result.`,
    ],
  )
  assert.deepEqual(persistedReasoning.map((entry) => entry.payload.lifecycle), [
    'active',
    'active',
    'active',
    'completed',
  ])
})

test('runStreamRounds forwards toolExecutionMap so compact delegation executes through delegate_to_agents', async () => {
  const delegationCalls = []

  await runStreamRounds({
    loop: { cancelled: false, abortController: new AbortController() },
    history: [{ role: 'user', content: "Ask an agent of MoA to review the current work." }],
    rollingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    userMessage: "Ask an agent of MoA to review the current work.",
    mode: 'execute',
    permissionMode: 'ask',
    projectFolder: process.cwd(),
    providerId: 'anthropic',
    model: 'claude-haiku-4-5',
    apiKey: 'test-key',
    options: {},
    tools: {
      delegate_tasks: {
        description: 'Delegate review',
        inputSchema: { jsonSchema: { type: 'object', additionalProperties: false, properties: {}, required: [] } },
      },
    },
    activeToolDefinitions: {
      delegate_tasks: {
        description: 'Delegate review',
        inputSchema: { jsonSchema: { type: 'object', additionalProperties: false, properties: {}, required: [] } },
      },
    },
    toolExecutionMap: { delegate_tasks: 'delegate_to_agents' },
    modelContext: {},
    continuityRuntime: null,
    providerRuntimeSettings: null,
    activeProjectId: 'project_round_alias_forwarding',
    activeThreadId: 'thread_round_alias_forwarding',
    activeTurnId: 'turn_round_alias_forwarding',
    activeAssistantMessageId: 'message_round_alias_forwarding',
    errorDiagnostics: createErrorDiagnostics(),
    turnStartedAt: Date.now(),
    send: () => {},
    sendCancelled: () => {},
    sendNotice: () => {},
    sendTurnState: () => {},
    persistTimelineEvent: () => {},
    emitTurnRuntimeDiagnostics: () => {},
    requestFanoutConfirmation: async () => ({ decision: 'launch_all' }),
    turnToolResults: [],
    turnReasoningSegments: [],
    maxToolRounds: 1,
    helpers: createRoundHelpers({
      createStreamWithTools: async () => ({
        stopReason: 'tool_calls',
        text: '',
        toolCalls: [{
          id: 'tc_delegate_tasks',
          name: 'delegate_tasks',
          input: {
            tasks: [{
              kind: 'review',
              instruction: 'Review the current work and report issues.',
              context: 'Focus on the active changes.',
              expected_output_format: 'Return concise findings.',
            }],
          },
        }],
        usage: null,
        reasoning: '',
      }),
      toolBatchHelpers: {
        ...createToolBatchHelpers(),
        runDelegationToolCall: async ({ tc, toolInput }) => {
          delegationCalls.push({ tc, toolInput })
          return {
            handled: true,
            pendingSynthesisPrompt: '',
            preflightRepairTriggered: false,
          }
        },
      },
    }),
  })

  assert.equal(delegationCalls.length, 1)
  assert.equal(delegationCalls[0].tc.name, 'delegate_tasks')
  assert.equal(delegationCalls[0].tc.visibleToolName, undefined)
})

test('runSingleStreamRound preserves final-only reasoning for openrouter openai/gpt-5.4 before the final assistant message', async () => {
  const sent = []
  const persisted = []

  const result = await runSingleStreamRound({
    round: 1,
    loop: { cancelled: false, abortController: new AbortController() },
    history: [{ role: 'user', content: 'Answer after reasoning.' }],
    rollingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    userMessage: 'Answer after reasoning.',
    mode: 'chat',
    projectFolder: process.cwd(),
    providerId: 'openrouter',
    model: 'openai/gpt-5.4',
    apiKey: 'test-key',
    options: {},
    tools: {},
    activeToolDefinitions: {},
    modelContext: {},
    continuityRuntime: null,
    providerRuntimeSettings: null,
    activeProjectId: 'project_openrouter_reasoning',
    activeThreadId: 'thread_openrouter_reasoning',
    activeTurnId: 'turn_openrouter_reasoning',
    activeAssistantMessageId: 'message_openrouter_reasoning',
    errorDiagnostics: createErrorDiagnostics(),
    turnStartedAt: Date.now(),
    send: (channel, payload) => sent.push({ channel, payload }),
    sendNotice: () => {},
    sendTurnState: () => {},
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    emitTurnRuntimeDiagnostics: () => {},
    turnToolResults: [],
    turnReasoningSegments: [],
    helpers: createRoundHelpers({
      createStreamWithTools: async () => ({
        stopReason: 'stop',
        text: 'OpenRouter final answer.',
        toolCalls: [],
        usage: { reasoningTokens: 13 },
        reasoning: 'OpenRouter final reasoning summary.',
      }),
    }),
  })

  assert.equal(result.shouldBreakRoundLoop, true)
  const reasoningDoneIndex = sent.findIndex((entry) => entry.channel === 'chat:reasoning-done')
  const finalDoneIndex = sent.findIndex((entry) => entry.channel === 'chat:done')
  assert.ok(reasoningDoneIndex >= 0)
  assert.ok(finalDoneIndex > reasoningDoneIndex)
  assert.equal(sent[reasoningDoneIndex]?.payload?.providerId, 'openrouter')
  assert.equal(sent[reasoningDoneIndex]?.payload?.model, 'openai/gpt-5.4')
  assert.equal(sent[reasoningDoneIndex]?.payload?.full, 'OpenRouter final reasoning summary.')
  assert.equal(sent[reasoningDoneIndex]?.payload?.reasoningTokens, 13)
  assert.equal(sent[finalDoneIndex]?.payload?.providerId, 'openrouter')
  assert.equal(sent[finalDoneIndex]?.payload?.model, 'openai/gpt-5.4')
  assert.equal(sent[finalDoneIndex]?.payload?.full, 'OpenRouter final answer.')

  const persistedKinds = persisted.map((entry) => entry.kind)
  const persistedReasoningIndex = persistedKinds.indexOf('reasoning_done')
  const persistedAssistantIndex = persistedKinds.indexOf('assistant_message')
  assert.ok(persistedReasoningIndex >= 0)
  assert.ok(persistedAssistantIndex > persistedReasoningIndex)
  assert.equal(persisted[persistedReasoningIndex]?.payload?.meta?.providerId, 'openrouter')
  assert.equal(persisted[persistedReasoningIndex]?.payload?.meta?.model, 'openai/gpt-5.4')
  assert.equal(String(persisted[persistedReasoningIndex]?.payload?.meta?.full || ''), 'OpenRouter final reasoning summary.')
})

test('runSingleStreamRound preserves final-only reasoning for openai gpt-5.4 before the final assistant message', async () => {
  const sent = []
  const persisted = []

  const result = await runSingleStreamRound({
    round: 1,
    loop: { cancelled: false, abortController: new AbortController() },
    history: [{ role: 'user', content: 'Answer after reasoning.' }],
    rollingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    userMessage: 'Answer after reasoning.',
    mode: 'chat',
    projectFolder: process.cwd(),
    providerId: 'openai',
    model: 'gpt-5.4',
    apiKey: 'test-key',
    options: {},
    tools: {},
    activeToolDefinitions: {},
    modelContext: {},
    continuityRuntime: null,
    providerRuntimeSettings: null,
    activeProjectId: 'project_openai_reasoning',
    activeThreadId: 'thread_openai_reasoning',
    activeTurnId: 'turn_openai_reasoning',
    activeAssistantMessageId: 'message_openai_reasoning',
    errorDiagnostics: createErrorDiagnostics(),
    turnStartedAt: Date.now(),
    send: (channel, payload) => sent.push({ channel, payload }),
    sendNotice: () => {},
    sendTurnState: () => {},
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    emitTurnRuntimeDiagnostics: () => {},
    turnToolResults: [],
    turnReasoningSegments: [],
    helpers: createRoundHelpers({
      createStreamWithTools: async () => ({
        stopReason: 'stop',
        text: 'OpenAI final answer.',
        toolCalls: [],
        usage: { reasoningTokens: 12 },
        reasoning: 'OpenAI final reasoning summary.',
      }),
    }),
  })

  assert.equal(result.shouldBreakRoundLoop, true)
  const reasoningDoneIndex = sent.findIndex((entry) => entry.channel === 'chat:reasoning-done')
  const finalDoneIndex = sent.findIndex((entry) => entry.channel === 'chat:done')
  assert.ok(reasoningDoneIndex >= 0)
  assert.ok(finalDoneIndex > reasoningDoneIndex)
  assert.equal(sent[reasoningDoneIndex]?.payload?.providerId, 'openai')
  assert.equal(sent[reasoningDoneIndex]?.payload?.model, 'gpt-5.4')
  assert.equal(sent[reasoningDoneIndex]?.payload?.full, 'OpenAI final reasoning summary.')
  assert.equal(sent[reasoningDoneIndex]?.payload?.reasoningTokens, 12)
  assert.equal(sent[finalDoneIndex]?.payload?.providerId, 'openai')
  assert.equal(sent[finalDoneIndex]?.payload?.model, 'gpt-5.4')
  assert.equal(sent[finalDoneIndex]?.payload?.full, 'OpenAI final answer.')

  const persistedKinds = persisted.map((entry) => entry.kind)
  const persistedReasoningIndex = persistedKinds.indexOf('reasoning_done')
  const persistedAssistantIndex = persistedKinds.indexOf('assistant_message')
  assert.ok(persistedReasoningIndex >= 0)
  assert.ok(persistedAssistantIndex > persistedReasoningIndex)
  assert.equal(persisted[persistedReasoningIndex]?.payload?.meta?.providerId, 'openai')
  assert.equal(persisted[persistedReasoningIndex]?.payload?.meta?.model, 'gpt-5.4')
  assert.equal(String(persisted[persistedReasoningIndex]?.payload?.meta?.full || ''), 'OpenAI final reasoning summary.')
})

test('runSingleStreamRound preserves full_access for host-scoped terminal_session_open', async () => {
  const createCalls = []

  setTerminalSessionManagerForChat({
    createSession({ cwd, shell, cols, rows, envOverrides, policy }) {
      createCalls.push({ cwd, shell, cols, rows, envOverrides, policy })
      return {
        session: {
          id: 'term_round_host_1',
          cwd,
          shell,
          shellKind: shell,
          cols,
          rows,
          status: 'running',
          outputSequence: 0,
        },
        output: {
          nextSequence: 0,
          truncated: false,
          chunks: [],
        },
      }
    },
  })

  const result = await runSingleStreamRound({
    round: 1,
    loop: { cancelled: false, abortController: new AbortController() },
    history: [{ role: 'user', content: 'Open a host shell.' }],
    rollingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    userMessage: 'Open a host shell.',
    mode: 'chat',
    permissionMode: 'full_access',
    projectFolder: 'C:\\Users\\example\\Documents\\ADDOM',
    providerId: 'openai',
    model: 'gpt-5.4',
    apiKey: 'test-key',
    options: {},
    tools: {
      terminal_session_open: {},
    },
    activeToolDefinitions: {},
    modelContext: {},
    continuityRuntime: null,
    providerRuntimeSettings: null,
    activeProjectId: 'project_round_host_terminal',
    activeThreadId: 'thread_round_host_terminal',
    activeTurnId: 'turn_round_host_terminal',
    activeAssistantMessageId: 'message_round_host_terminal',
    errorDiagnostics: createErrorDiagnostics(),
    turnStartedAt: Date.now(),
    send: () => {},
    sendNotice: () => {},
    sendTurnState: () => {},
    persistTimelineEvent: () => {},
    emitTurnRuntimeDiagnostics: () => {},
    turnToolResults: [],
    turnReasoningSegments: [],
    helpers: createRoundHelpers({
      createStreamWithTools: async () => ({
        stopReason: 'tool_calls',
        text: '',
        toolCalls: [{
          id: 'tool_terminal_host_1',
          name: 'terminal_session_open',
          input: {
            cwd: 'C:\\Users\\example\\Documents',
            shell: 'powershell',
            cols: 100,
            rows: 30,
          },
        }],
        usage: null,
        reasoning: '',
      }),
    }),
  })

  assert.equal(result.shouldBreakRoundLoop, false)
  assert.equal(createCalls.length, 1)
  assert.equal(createCalls[0].cwd, 'C:\\Users\\example\\Documents')
  assert.equal(createCalls[0].policy?.policyDecision, 'allow')
  assert.equal(createCalls[0].policy?.hostAccessRequired, true)
  assert.equal(createCalls[0].policy?.profileHint, 'host_full_access')
})

test('runStreamRounds preserves reasoning across a tool round and the final answer round', async () => {
  const sent = []
  const persisted = []
  const executedTools = []
  let streamCallCount = 0

  const history = [
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'user', content: 'Inspect the file and answer.' },
  ]
  const turnToolResults = []
  const turnReasoningSegments = []

  await runStreamRounds({
    loop: { cancelled: false, abortController: new AbortController() },
    sender: null,
    wid: 0,
    settings: {},
    history,
    rollingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    userMessage: 'Inspect the file and answer.',
    mode: 'chat',
    projectFolder: process.cwd(),
    providerId: 'anthropic',
    model: 'claude-sonnet-4-6',
    adapterProfile: null,
    apiKey: 'test-key',
    options: {},
    tools: {
      read_file: {
        description: 'Read a file.',
      },
    },
    activeToolDefinitions: {},
    modelContext: {},
    continuityRuntime: null,
    providerRuntimeSettings: null,
    activeProjectId: 'project_loop_reasoning',
    activeThreadId: 'thread_loop_reasoning',
    activeTurnId: 'turn_loop_reasoning',
    activeAssistantMessageId: 'message_loop_reasoning',
    providerToolExecutionContext: null,
    assistantFinalPhase: 'final_answer',
    assistantCommentaryPhase: 'commentary',
    repeatedToolCallState: { lastSignature: '', repeatedCount: 0 },
    errorDiagnostics: createErrorDiagnostics(),
    turnStartedAt: Date.now(),
    send: (channel, payload) => sent.push({ channel, payload }),
    sendCancelled: () => {},
    sendNotice: () => {},
    sendTurnState: () => {},
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    emitTurnRuntimeDiagnostics: () => {},
    requestFanoutConfirmation: async () => null,
    turnToolResults,
    turnReasoningSegments,
    maxToolRounds: 4,
    maxConsecutiveErrorRounds: 3,
    maxConsecutiveIdenticalToolRounds: 3,
    helpers: createRoundHelpers({
      createStreamWithTools: async (_providerId, _apiKey, _history, _options, _onChunk, onReasoning) => {
        streamCallCount += 1
        if (streamCallCount === 1) {
          onReasoning('Plan the inspection.')
          return {
            stopReason: 'tool_calls',
            text: 'I will inspect the file first.',
            toolCalls: [{ id: 'call_readme_1', name: 'read_file', input: { path: 'README.md' } }],
            usage: null,
            reasoning: '',
          }
        }
        onReasoning('The file confirms the answer.')
        return {
          stopReason: 'stop',
          text: 'Final answer.',
          toolCalls: [],
          usage: { reasoningTokens: 9 },
          reasoning: '',
        }
      },
      toolBatchHelpers: createToolBatchHelpers({
        executeTool: async (_projectFolder, toolName, toolInput) => {
          executedTools.push({ toolName, toolInput })
          return { result: 'README contents' }
        },
      }),
    }),
  })

  assert.equal(streamCallCount, 2)
  assert.deepEqual(executedTools, [{
    toolName: 'read_file',
    toolInput: { path: 'README.md' },
  }])

  const reasoningDoneEvents = sent.filter((entry) => entry.channel === 'chat:reasoning-done')
  assert.equal(reasoningDoneEvents.length, 2)
  assert.equal(reasoningDoneEvents[0]?.payload?.full, 'Plan the inspection.')
  assert.equal(
    reasoningDoneEvents[1]?.payload?.full,
    'Plan the inspection.\n\n---\n\nThe file confirms the answer.',
  )
  assert.equal(reasoningDoneEvents[1]?.payload?.current, 'The file confirms the answer.')

  const commentaryIndex = sent.findIndex((entry) => entry.channel === 'chat:assistant-commentary')
  const toolPendingIndex = sent.findIndex((entry) => entry.channel === 'chat:tools-pending')
  const toolExecutingIndex = sent.findIndex((entry) => entry.channel === 'chat:tool-executing')
  const toolResultIndex = sent.findIndex((entry) => entry.channel === 'chat:tool-result')
  const finalDoneIndex = sent.findIndex((entry) => entry.channel === 'chat:done')
  assert.ok(commentaryIndex >= 0)
  assert.ok(toolPendingIndex > commentaryIndex)
  assert.ok(toolExecutingIndex > toolPendingIndex)
  assert.ok(toolResultIndex > toolExecutingIndex)
  assert.ok(finalDoneIndex > toolResultIndex)

  const persistedKinds = persisted.map((entry) => entry.kind)
  const firstReasoningIndex = persistedKinds.indexOf('reasoning_done')
  const commentaryPersistedIndex = persistedKinds.indexOf('execution_commentary_chunk')
  const toolResultPersistedIndex = persistedKinds.indexOf('tool_result')
  const finalReasoningIndex = persistedKinds.lastIndexOf('reasoning_done')
  const finalAssistantIndex = persistedKinds.indexOf('assistant_message')
  assert.ok(firstReasoningIndex >= 0)
  assert.ok(commentaryPersistedIndex > firstReasoningIndex)
  assert.ok(toolResultPersistedIndex > commentaryPersistedIndex)
  assert.ok(finalReasoningIndex > toolResultPersistedIndex)
  assert.ok(finalAssistantIndex > finalReasoningIndex)
  assert.deepEqual(turnReasoningSegments, [
    'Plan the inspection.',
    'The file confirms the answer.',
  ])
})
