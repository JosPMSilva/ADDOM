import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveProviderModelAdapter } from '../../src/main/api-clients/provider-model-adapters.mjs'
import { runToolCallBatchForRound } from '../../src/main/chat/chat-stream-rounds.mjs'
import { resolveRuntimeToolSurface } from '../../src/main/chat/runtime-tool-surface.mjs'

function buildTools(names = []) {
  return Object.fromEntries(
    names.map((name) => [name, { description: `${name} tool`, inputSchema: {} }]),
  )
}

function createBaseArgs(overrides = {}) {
  const history = overrides.history || []
  const turnToolResults = overrides.turnToolResults || []
  const loop = overrides.loop || { cancelled: false, abortController: new AbortController() }
  return {
    toolCalls: overrides.toolCalls || [],
    loop,
    sender: null,
    wid: 0,
    settings: {},
    projectFolder: process.cwd(),
    providerId: 'openai',
    model: 'gpt-test',
    activeThreadId: 'thread_recovery_reroute',
    activeTurnId: 'turn_recovery_reroute',
    history,
    turnToolResults,
    activeToolDefinitions: overrides.activeToolDefinitions || {},
    tools: overrides.tools || {},
    toolExecutionMap: overrides.toolExecutionMap || {},
    inspectedFilePathsThisTurn: new Set(),
    errorDiagnostics: overrides.errorDiagnostics || {
      approvalPromptCount: 0,
      riskyApprovalPromptCount: 0,
      approvalAutoSources: {},
      approvalApprovedCount: 0,
      approvalDeniedCount: 0,
      approvalPolicyBlockedCount: 0,
      approvalUserDeniedCount: 0,
      approvalTimeoutCount: 0,
    },
    send: overrides.send || (() => {}),
    persistTimelineEvent: overrides.persistTimelineEvent || (() => {}),
    sendTurnState: () => {},
    emitTurnRuntimeDiagnostics: () => {},
    requestFanoutConfirmation: async () => null,
    consecutiveErrorRounds: overrides.consecutiveErrorRounds || 0,
    helpers: {
      toToolEventInput: (_toolName, input) => input,
      shouldBlockEditFileWithoutInspection: () => ({ blocked: false, message: '' }),
      recordToolStepOutcome: (payload) => {
        const normalizedResult = String(payload.result || '')
        const derivedFailureClass = payload.lintResult?.failureClass
          || (/old_text not found/i.test(normalizedResult) ? 'EXACT_TEXT_NO_MATCH' : '')
        turnToolResults.push({
          toolName: payload.tc?.name,
          decision: payload.decision,
          isError: payload.isError,
          result: payload.result,
          lintCode: payload.lintResult?.lintCode || '',
          rerouteToolName: payload.lintResult?.rerouteToolName || '',
          failureClass: derivedFailureClass,
        })
      },
      buildToolResultMessage: (_id, _toolName, toolResult) => ({ role: 'tool', content: toolResult }),
      trimText: (value) => String(value ?? ''),
      extractRunCommandMeta: () => ({}),
      runDelegationToolCall: async () => ({ handled: false }),
      resolveToolApprovalForStep: async () => ({ decision: 'approved', denyReason: '' }),
      bumpRuntimeCount: () => {},
      takeShellWriteSnapshot: async () => null,
      detectShellWriteArtifactChanges: async () => [],
      executeOpenAILocalRuntimeTool: async () => null,
      isOpenAILocalRuntimeToolName: () => false,
      executeTool: overrides.executeTool || (async () => ({ result: 'unexpected execution' })),
      resolveToolWriteArtifactMeta: async () => null,
      getBaseRevisionId: () => '',
      buildMissingDependencyInstallHint: () => '',
      isAbortError: () => false,
      executeProviderNativeToolCall: async () => null,
      extractPrefixedMetaFromResultText: () => '',
      buildToolRecoveryPrompt: overrides.buildToolRecoveryPrompt || (() => 'recovery prompt'),
      recordInspectedPathForTurn: () => {},
      ...(overrides.helpers || {}),
    },
  }
}

test('runToolCallBatchForRound recovers hidden-known tool calls by priming the capability for the next round', async () => {
  const history = []
  const turnToolResults = []
  const loop = { cancelled: false, abortController: new AbortController() }
  const activeToolDefinitions = {
    read_file: { description: 'read', inputSchema: {} },
  }
  const tools = { ...activeToolDefinitions }
  const errorDiagnostics = {
    approvalPromptCount: 0,
    riskyApprovalPromptCount: 0,
    approvalAutoSources: {},
    approvalApprovedCount: 0,
    approvalDeniedCount: 0,
    approvalPolicyBlockedCount: 0,
    approvalUserDeniedCount: 0,
    approvalTimeoutCount: 0,
  }
  let approvalCalls = 0
  let executeCalls = 0

  const result = await runToolCallBatchForRound(createBaseArgs({
    history,
    turnToolResults,
    loop,
    activeToolDefinitions,
    tools,
    errorDiagnostics,
    toolCalls: [{
      id: 'tc_hidden_patch_1',
      name: 'apply_patch',
      input: {
        patch: [
          '*** Begin Patch',
          '*** Add File: src/hidden.js',
          '+export const hidden = true',
          '*** End Patch',
        ].join('\n'),
      },
    }],
    helpers: {
      resolveToolApprovalForStep: async () => {
        approvalCalls += 1
        return { decision: 'approved', denyReason: '' }
      },
      executeTool: async () => {
        executeCalls += 1
        return { result: 'should not execute while hidden' }
      },
    },
  }))

  assert.equal(result.consecutiveErrorRounds, 1)
  assert.equal(approvalCalls, 0)
  assert.equal(executeCalls, 0)
  assert.equal(turnToolResults.length, 1)
  assert.equal(turnToolResults[0].failureClass, 'HIDDEN_KNOWN_TOOL')
  assert.equal(turnToolResults[0].lintCode, 'hidden_known_tool')
  assert.match(String(turnToolResults[0].result || ''), /known ADDOM tool/)
  assert.match(String(turnToolResults[0].result || ''), /primed for the next model step/)
  assert.equal(Array.isArray(loop.toolSurfaceActivations), true)
  assert.equal(loop.toolSurfaceActivations[0]?.capabilityId, 'builtins.files')
  assert.equal(loop.toolSurfaceActivations[0]?.reasons?.includes('hidden_known_recovery'), true)
  assert.equal(Object.hasOwn(activeToolDefinitions, 'apply_patch'), true)
  assert.equal(Object.hasOwn(tools, 'apply_patch'), true)
  assert.equal(errorDiagnostics.toolSurfaceHiddenKnownRecoveryCount, 1)
  assert.equal(errorDiagnostics.toolSurfaceHiddenKnownRecoveryCapabilities['builtins.files'], 1)
})

test('runToolCallBatchForRound primes browser capability after rejected Playwright CLI reroute', async () => {
  const turnToolResults = []
  const loop = { cancelled: false, abortController: new AbortController() }
  const activeToolDefinitions = buildTools(['read_file', 'run_command', 'fetch_page'])
  const tools = { ...activeToolDefinitions }
  let executeCalls = 0

  await runToolCallBatchForRound(createBaseArgs({
    turnToolResults,
    loop,
    activeToolDefinitions,
    tools,
    toolCalls: [{
      id: 'tc_playwright_open_1',
      name: 'run_command',
      input: {
        command: 'npx playwright open http://localhost:5173',
      },
    }],
    helpers: {
      executeTool: async () => {
        executeCalls += 1
        return { result: 'should not execute' }
      },
    },
  }))

  assert.equal(executeCalls, 0)
  assert.equal(turnToolResults.length, 1)
  assert.equal(turnToolResults[0].lintCode, 'run_command_playwright_cli_browser_misuse')
  assert.equal(turnToolResults[0].rerouteToolName, 'browser_action')
  assert.equal(loop.toolSurfaceActivations[0]?.capabilityId, 'builtins.browser')
  assert.equal(loop.toolSurfaceActivations[0]?.reasons?.includes('hidden_known_recovery'), true)

  const refreshed = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    mode: 'execute',
    userMessage: 'Continue.',
    addomTools: buildTools(['read_file', 'run_command', 'fetch_page', 'browser_action']),
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4'),
    toolSurfaceActivations: loop.toolSurfaceActivations,
  })

  assert.equal(Boolean(refreshed.resolvedToolSurface.tools.run_command), true)
  assert.equal(Boolean(refreshed.resolvedToolSurface.tools.browser_action), true)
  assert.deepEqual(refreshed.resolvedToolSurface.toolSurfaceActivatedCapabilities, ['builtins.browser'])
  assert.deepEqual(refreshed.resolvedToolSurface.toolSurfaceActivationIncludedTools, ['browser_action'])
})

test('runToolCallBatchForRound blocks repeated hidden-known retries for the same turn and tool', async () => {
  const turnToolResults = []
  const loop = { cancelled: false, abortController: new AbortController() }
  const activeToolDefinitions = {
    read_file: { description: 'read', inputSchema: {} },
  }
  const tools = { ...activeToolDefinitions }

  await runToolCallBatchForRound(createBaseArgs({
    turnToolResults,
    loop,
    activeToolDefinitions,
    tools,
    toolCalls: [
      { id: 'tc_hidden_patch_1', name: 'apply_patch', input: { patch: '*** Begin Patch\n*** End Patch' } },
      { id: 'tc_hidden_patch_2', name: 'apply_patch', input: { patch: '*** Begin Patch\n*** End Patch' } },
    ],
  }))

  assert.equal(turnToolResults.length, 2)
  assert.equal(turnToolResults[0].lintCode, 'hidden_known_tool')
  assert.equal(turnToolResults[1].lintCode, 'hidden_known_tool_disabled_for_turn')
  assert.match(String(turnToolResults[1].result || ''), /disabled for this turn/)
  assert.equal(loop.blockedToolNames.has('apply_patch'), true)
})

test('runToolCallBatchForRound allows one malformed apply_patch recovery before disabling it on the second failure', async () => {
  const history = []
  const turnToolResults = []
  const loop = { cancelled: false, abortController: new AbortController() }

  const first = await runToolCallBatchForRound(createBaseArgs({
    history,
    turnToolResults,
    loop,
    toolCalls: [{
      id: 'tc_patch_1',
      name: 'apply_patch',
      input: {
        operation: {
          type: 'update_file',
          path: 'src/app.js',
          diff: 'rewrite full file',
        },
      },
    }],
    buildToolRecoveryPrompt: ({ roundResults, malformedPatchFailuresThisTurn }) => `recovery:${roundResults[0]?.failureClass || ''}:retry=${malformedPatchFailuresThisTurn || 0}:disable apply_patch for the rest of the turn`,
  }))

  assert.equal(first.consecutiveErrorRounds, 1)
  assert.match(String(history[0]?.content || ''), /MALFORMED_PATCH_SYNTAX/)
  assert.match(String(history[0]?.content || ''), /retry=1/i)
  assert.match(String(history[0]?.content || ''), /disable apply_patch for the rest of the turn/i)
  assert.equal(loop.blockedToolNames instanceof Set, true)
  assert.equal(loop.blockedToolNames.has('apply_patch'), false)

  const retryTurnToolResults = []
  const approvalCalls = { count: 0 }
  await runToolCallBatchForRound(createBaseArgs({
    history: [],
    turnToolResults: retryTurnToolResults,
    loop,
    consecutiveErrorRounds: first.consecutiveErrorRounds,
    toolCalls: [{
      id: 'tc_patch_2',
      name: 'apply_patch',
      input: {
        operation: {
          type: 'update_file',
          path: 'src/app.js',
          diff: 'still malformed patch payload',
        },
      },
    }],
    helpers: {
      resolveToolApprovalForStep: async () => {
        approvalCalls.count += 1
        return { decision: 'approved', denyReason: '' }
      },
    },
  }))

  assert.equal(approvalCalls.count, 0)
  assert.equal(loop.blockedToolNames instanceof Set, true)
  assert.equal(loop.blockedToolNames.has('apply_patch'), true)
  assert.match(String(retryTurnToolResults[0]?.result || ''), /pre-execution lint/i)

  const blockedTurnToolResults = []
  const blockedApprovalCalls = { count: 0 }
  await runToolCallBatchForRound(createBaseArgs({
    history: [],
    turnToolResults: blockedTurnToolResults,
    loop,
    consecutiveErrorRounds: first.consecutiveErrorRounds + 1,
    toolCalls: [{
      id: 'tc_patch_3',
      name: 'apply_patch',
      input: {
        operation: {
          type: 'update_file',
          path: 'src/app.js',
          diff: '@@ -1 +1 @@\n-old\n+new',
        },
      },
    }],
    helpers: {
      resolveToolApprovalForStep: async () => {
        blockedApprovalCalls.count += 1
        return { decision: 'approved', denyReason: '' }
      },
    },
  }))

  assert.equal(blockedApprovalCalls.count, 0)
  assert.match(String(blockedTurnToolResults[0]?.result || ''), /disabled for this turn/i)
})

test('runToolCallBatchForRound disables blind edit_file retries after exact-text mismatch until a read succeeds', async () => {
  const history = []
  const turnToolResults = []
  const loop = { cancelled: false, abortController: new AbortController() }

  const first = await runToolCallBatchForRound(createBaseArgs({
    history,
    turnToolResults,
    loop,
    toolCalls: [{
      id: 'tc_edit_1',
      name: 'edit_file',
      input: {
        path: 'src/app.js',
        old_text: 'missing block',
        new_text: 'next block',
      },
    }],
    executeTool: async () => {
      throw new Error('old_text not found in file content.')
    },
    buildToolRecoveryPrompt: ({ roundResults }) => `recovery:${roundResults[0]?.failureClass || ''}`,
  }))

  assert.equal(first.consecutiveErrorRounds, 1)
  assert.match(String(history[0]?.content || ''), /EXACT_TEXT_NO_MATCH/)
  assert.equal(loop.blockedToolNames.has('edit_file'), true)

  const blockedResults = []
  const approvalCalls = { count: 0 }
  await runToolCallBatchForRound(createBaseArgs({
    history: [],
    turnToolResults: blockedResults,
    loop,
    consecutiveErrorRounds: first.consecutiveErrorRounds,
    toolCalls: [{
      id: 'tc_edit_2',
      name: 'edit_file',
      input: {
        path: 'src/app.js',
        old_text: 'other block',
        new_text: 'replacement',
      },
    }],
    helpers: {
      resolveToolApprovalForStep: async () => {
        approvalCalls.count += 1
        return { decision: 'approved', denyReason: '' }
      },
    },
  }))

  assert.equal(approvalCalls.count, 0)
  assert.match(String(blockedResults[0]?.result || ''), /read the current file content first/i)

  await runToolCallBatchForRound(createBaseArgs({
    history: [],
    turnToolResults: [],
    loop,
    consecutiveErrorRounds: first.consecutiveErrorRounds,
    toolCalls: [{
      id: 'tc_read_1',
      name: 'read_file',
      input: { path: 'src/app.js' },
    }],
    executeTool: async () => ({
      result: 'file contents',
      isError: false,
      missingDependencySuspected: false,
      writeArtifactMeta: null,
      writeArtifactChanges: [],
    }),
  }))

  assert.equal(loop.blockedToolNames.has('edit_file'), false)
})
