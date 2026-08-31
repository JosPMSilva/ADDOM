import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const originalUserDataPath = process.env.ADDOM_USER_DATA_PATH
const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-moa-agent-runtime-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { __resetCreateStreamWithToolsForTests, __setCreateStreamWithToolsForTests } = await import('../../src/main/api-clients/ai-provider.mjs')
const { runSingleAgent } = await import('../../src/main/moa/agent-runtime.mjs')
const { getOpenAIAccountAuthService, __testOpenAIAccountInternals } = await import('../../src/main/openai-account/openai-account-auth-service.mjs')
const { setSettingsPatch } = await import('../../src/main/settings.mjs')

test.beforeEach(async () => {
  __testOpenAIAccountInternals.resetSingleton()
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

test.after(() => {
  if (originalUserDataPath === undefined) delete process.env.ADDOM_USER_DATA_PATH
  else process.env.ADDOM_USER_DATA_PATH = originalUserDataPath
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('runSingleAgent preserves partial usage when a tool error fails the run', async () => {
  const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-moa-agent-failure-'))
  let callCount = 0

  __setCreateStreamWithToolsForTests(async () => {
    callCount += 1
    if (callCount === 1) {
      return {
        text: '',
        reasoning: '',
        usage: { totalTokens: 9, inputTokens: 5, outputTokens: 4, reasoningTokens: 0 },
        toolCalls: [
          {
            id: 'call_write',
            name: 'write_file',
            input: { path: 'notes/fix.md', content: 'patched content\n' },
          },
          {
            id: 'call_question',
            name: 'question_user',
            input: { prompt: 'Need approval?' },
          },
        ],
      }
    }
    return {
      text: '',
      reasoning: '',
      usage: { totalTokens: 2, inputTokens: 1, outputTokens: 1, reasoningTokens: 0 },
      toolCalls: [],
    }
  })

  try {
    const result = await runSingleAgent(
      {
        task_id: 'task_runtime_failure',
        instruction: 'Patch the failing note and continue.',
        injected_context: 'notes/fix.md',
        expected_output_format: 'summary',
      },
      {
        id: 'role_writer',
        name: 'Implementation Agent',
        providerId: 'openai',
        model: 'gpt-5.4',
        systemPrompt: 'Implement the requested change.',
        canWriteFiles: true,
      },
      'sk-test',
      projectFolder,
      () => {},
      new AbortController().signal,
      {
        policy: {
          maxAgentRounds: 2,
          maxAgentOutputChars: 8_000,
          agentWriteAccessEnabled: true,
          agentWriteMode: 'staged',
          maxAgentStagedBytesPerFile: 10_000,
          maxAgentStagedFilesPerTask: 5,
          maxAgentStagedFilesPerDelegation: 10,
          maxAgentStagedTotalBytesPerDelegation: 100_000,
        },
        providerRuntimeSettings: {},
      },
    )

    assert.equal(result.status, 'failed')
    assert.match(String(result.error || ''), /question_user/i)
    assert.equal(result.usage.totalTokens, 11)
    assert.equal(result.rounds, 2)
    assert.ok(Array.isArray(result.stagedChanges))
  } finally {
    try { fs.rmSync(projectFolder, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})

test('runSingleAgent coalesces whitespace-only deltas into the next managed event', async () => {
  const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-moa-ws-delta-'))
  const events = []

  __setCreateStreamWithToolsForTests(async (_provider, _key, _messages, _options, onChunk, onReasoning) => {
    onReasoning('\n')
    onReasoning('   ')
    onReasoning('Need evidence.')
    onChunk('Heading')
    onChunk('\n')
    onChunk('- item')
    onChunk('Security Vulnerability Analyzer is ALIVE.')
    return {
      text: 'Security Vulnerability Analyzer is ALIVE.',
      reasoning: '\n   Need evidence.',
      usage: { totalTokens: 3, inputTokens: 2, outputTokens: 1, reasoningTokens: 1 },
      toolCalls: [],
    }
  })

  try {
    const result = await runSingleAgent(
      {
        task_id: 'task_ws',
        instruction: 'Reply ALIVE',
        injected_context: '',
        expected_output_format: 'one sentence',
      },
      {
        id: 'role_ws',
        name: 'Security Vulnerability Analyzer',
        providerId: 'openai',
        model: 'gpt-5.6-luna',
      },
      'test-key',
      projectFolder,
      () => {},
      undefined,
      {
        onAgentStreamEvent: async (event) => {
          events.push(event)
        },
      },
    )

    assert.equal(result.status, 'completed')
    const reasoningDeltas = events.filter((event) => event.kind === 'reasoning')
    assert.equal(reasoningDeltas.length, 1)
    assert.equal(reasoningDeltas[0].payload.delta, '\n   Need evidence.')
    const assistantDeltas = events.filter((event) => event.kind === 'assistant_delta')
    assert.deepEqual(
      assistantDeltas.map((event) => event.payload.delta),
      ['Heading', '\n- item', 'Security Vulnerability Analyzer is ALIVE.'],
    )
    assert.deepEqual(
      assistantDeltas.map((event) => event.payload.presentation),
      ['internal', 'internal', 'internal'],
    )
    assert.doesNotMatch(
      JSON.stringify(events),
      /must be a non-empty string/i,
    )
  } finally {
    try { fs.rmSync(projectFolder, { recursive: true, force: true }) } catch { /* best-effort */ }
  }
})

test('runSingleAgent emits an authoritative reasoning snapshot only when streamed reconstruction differs', async () => {
  const runCase = async ({ streamed, authoritative }) => {
    const events = []
    __setCreateStreamWithToolsForTests(async (_provider, _key, _messages, _options, _onChunk, onReasoning) => {
      onReasoning(streamed)
      return {
        text: 'Final answer.',
        reasoning: authoritative,
        usage: { totalTokens: 3, inputTokens: 1, outputTokens: 2, reasoningTokens: 1 },
        toolCalls: [],
      }
    })
    const result = await runSingleAgent(
      {
        task_id: `task_reasoning_snapshot_${events.length}`,
        instruction: 'Return a concise review.',
        injected_context: '',
        expected_output_format: 'one sentence',
      },
      {
        id: 'role_reasoning_snapshot',
        name: 'Reasoning Snapshot Reviewer',
        providerId: 'openai',
        model: 'gpt-5.4',
      },
      'test-key',
      process.cwd(),
      () => {},
      undefined,
      { onAgentStreamEvent: async (event) => events.push(event) },
    )
    assert.equal(result.status, 'completed')
    return events
  }

  const exact = await runCase({
    streamed: 'The user wants a concise review.',
    authoritative: 'The user wants a concise review.',
  })
  assert.deepEqual(exact.map((event) => event.kind), [
    'reasoning_boundary', 'reasoning', 'reasoning_boundary',
  ])
  assert.equal(exact.filter((event) => event.payload?.snapshot === true).length, 0)

  const corrected = await runCase({
    streamed: 'Theuserwantsaconcisereview.',
    authoritative: 'The user wants a concise review.',
  })
  assert.deepEqual(corrected.map((event) => event.kind), [
    'reasoning_boundary', 'reasoning', 'reasoning', 'reasoning_boundary',
  ])
  assert.equal(corrected[1]?.payload?.delta, 'Theuserwantsaconcisereview.')
  assert.deepEqual(corrected[2]?.payload, {
    delta: 'The user wants a concise review.',
    snapshot: true,
  })
})

test('runSingleAgent fails closed when canonical stream persistence rejects', async () => {
  const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-moa-event-persist-'))
  let appendAttempts = 0

  __setCreateStreamWithToolsForTests(async (_provider, _key, _messages, _options, onChunk) => {
    onChunk('First.')
    onChunk('Second.')
    return {
      text: 'First.Second.',
      reasoning: '',
      usage: { totalTokens: 3, inputTokens: 1, outputTokens: 2, reasoningTokens: 0 },
      toolCalls: [],
    }
  })

  try {
    const result = await runSingleAgent(
      {
        task_id: 'task_persist_failure',
        instruction: 'Reply.',
        injected_context: '',
        expected_output_format: 'one sentence',
      },
      {
        id: 'role_persist_failure',
        name: 'Persistence Reviewer',
        providerId: 'openai',
        model: 'gpt-5.6-luna',
      },
      'test-key',
      projectFolder,
      () => {},
      undefined,
      {
        onAgentStreamEvent: async () => {
          appendAttempts += 1
          throw new Error('canonical append failed')
        },
      },
    )

    assert.equal(result.status, 'failed')
    assert.match(String(result.error || ''), /canonical append failed/i)
    assert.equal(appendAttempts, 1)
  } finally {
    try { fs.rmSync(projectFolder, { recursive: true, force: true }) } catch { /* best-effort */ }
  }
})

test('runSingleAgent separates assistant output from reasoning and tool lifecycle events', async () => {
  const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-moa-agent-stream-'))
  fs.writeFileSync(path.join(projectFolder, 'notes.txt'), 'evidence\n', 'utf8')
  const events = []
  let followupObserved = false
  let childContinuationObserved = false
  let round = 0

  __setCreateStreamWithToolsForTests(async (_provider, _key, messages, _options, onChunk, onReasoning) => {
    round += 1
    followupObserved ||= messages.some((message) => (
      message.role === 'user' && message.content === 'Check the edge case too.'
    ))
    childContinuationObserved ||= messages.some((message) => (
      message.role === 'system' && /bounded, untrusted child evidence/i.test(message.content)
    )) && messages.some((message) => (
      message.role === 'user'
      && /child_turn_continuation_evidence/.test(message.content)
      && /turn_child_01/.test(message.content)
      && !/\[object Object\]/.test(message.content)
    ))
    if (round === 1) {
      onChunk('Inspecting notes.')
      onReasoning('Need direct evidence.')
      return {
        text: '',
        reasoning: 'Need direct evidence.',
        usage: { totalTokens: 4, inputTokens: 2, outputTokens: 2, reasoningTokens: 1 },
        toolCalls: [{
          id: 'call_read_notes',
          name: 'read_file',
          input: { path: 'notes.txt' },
        }],
      }
    }
    onChunk('The note contains evidence.')
    return {
      text: 'The note contains evidence.',
      reasoning: '',
      usage: { totalTokens: 3, inputTokens: 2, outputTokens: 1, reasoningTokens: 0 },
      toolCalls: [],
    }
  })

  try {
    const result = await runSingleAgent(
      {
        task_id: 'task_managed_stream',
        instruction: 'Inspect the note.',
        injected_context: 'notes.txt',
        expected_output_format: 'summary',
      },
      {
        id: 'role_reader',
        name: 'Reader Agent',
        providerId: 'openai',
        model: 'gpt-5.4',
        canWriteFiles: false,
      },
      'sk-test',
      projectFolder,
      () => {},
      new AbortController().signal,
      {
        policy: {
          maxAgentRounds: 3,
          maxAgentOutputChars: 8_000,
        },
        providerRuntimeSettings: {},
        onAgentStreamEvent: async (event) => events.push(event),
        consumeAgentMessages: (() => {
          let delivered = false
          return () => {
            if (delivered) return []
            delivered = true
            return [
              { text: 'Check the edge case too.' },
              {
                kind: 'child_turn_final',
                continuation: {
                  schemaVersion: 1,
                  kind: 'child_turn_final',
                  source: {
                    conversationId: 'conversation_child_01', turnId: 'turn_child_01',
                    nodeId: 'agent_child_01', finalMessageId: 'final_child_01',
                  },
                  status: 'completed',
                  provenance: { authorKind: 'agent', authorId: 'agent_child_01' },
                  conclusion: 'Child found the edge case.', artifacts: [], inspectable: true,
                },
              },
            ]
          }
        })(),
      },
    )

    assert.equal(result.status, 'completed')
    assert.equal(followupObserved, true)
    assert.equal(childContinuationObserved, true)
    assert.deepEqual(events.map((event) => event.kind), [
      'assistant_delta',
      'reasoning_boundary',
      'reasoning',
      'reasoning_boundary',
      'tool_started',
      'tool_output',
      'tool_completed',
      'assistant_delta',
    ])
    assert.deepEqual(
      events.filter((event) => event.kind === 'assistant_delta').map((event) => event.payload.presentation),
      ['internal', 'internal'],
    )
    assert.deepEqual(events.filter((event) => event.kind === 'reasoning_boundary'), [
      { kind: 'reasoning_boundary', payload: { boundary: 'start' } },
      { kind: 'reasoning_boundary', payload: { boundary: 'end' } },
    ])
  } finally {
    try { fs.rmSync(projectFolder, { recursive: true, force: true }) } catch { /* best-effort */ }
  }
})

test('runSingleAgent reports accumulated rounds after a rate-limit retry succeeds', async () => {
  let attempts = 0
  __setCreateStreamWithToolsForTests(async () => {
    attempts += 1
    if (attempts === 1) {
      const error = new Error('429 too many requests')
      error.status = 429
      throw error
    }
    return {
      text: 'Recovered after retry.',
      reasoning: '',
      usage: { totalTokens: 7, inputTokens: 4, outputTokens: 3, reasoningTokens: 0 },
      toolCalls: [],
    }
  })

  const result = await runSingleAgent(
    {
      task_id: 'task_retry_success',
      instruction: 'Retry once and return a concise result.',
      injected_context: 'src/retry.ts',
      expected_output_format: 'summary',
    },
    {
      id: 'role_retry',
      name: 'Retry Agent',
      providerId: 'openai',
      model: 'gpt-5.4',
      systemPrompt: 'Return concise output.',
      canWriteFiles: false,
    },
    'sk-test',
    process.cwd(),
    () => {},
    new AbortController().signal,
    {
      policy: {
        maxAgentRounds: 1,
        maxAgentOutputChars: 8_000,
      },
      providerRuntimeSettings: {},
    },
  )

  assert.equal(result.status, 'completed')
  assert.equal(result.rounds, 2)
})

test('runSingleAgent routes OpenAI account mode through delegated runtime with ADDOM tool access', async () => {
  await setSettingsPatch({
    providerAuthSettings: {
      openai: {
        authMethod: 'account',
      },
    },
  })
  const service = getOpenAIAccountAuthService()
  service.getBridge().setAvailability({ supported: true, reason: '', message: '' })
  service.setSessionSummary({
    hasSession: true,
    status: 'connected',
  })

  const observed = []
  __setCreateStreamWithToolsForTests(async (providerId, apiKey, messages, options) => {
    observed.push({
      providerId,
      apiKey,
      toolNames: Object.keys(options?.tools || {}),
      authMethod: options?.openAIExecutionAuthContext?.authMethod || '',
      threadId: options?.requestContext?.threadId || '',
      projectFolder: options?.requestContext?.projectFolder || '',
      permissionProfile: options?.openAIAccountApprovalContext?.permissionProfile || '',
      bridgeThreadId: options?.requestContext?.openai?.accountBridgeThreadId || '',
      systemPrompt: String(messages?.[0]?.content || ''),
    })
    return {
      text: 'Delegated account-mode result.',
      reasoning: '',
      usage: { totalTokens: 4, inputTokens: 2, outputTokens: 2, reasoningTokens: 0 },
      toolCalls: [],
      providerResponseMeta: {
        accountBridgeThreadId: 'thr_moa_agent_1',
      },
    }
  })

  const result = await runSingleAgent(
    {
      task_id: 'task_account_agent',
      instruction: 'Review the auth flow and summarize the outcome.',
      injected_context: 'src/auth/session.ts',
      expected_output_format: 'summary',
    },
    {
      id: 'role_account',
      name: 'Account Agent',
      providerId: 'openai',
      model: 'gpt-5.4',
      systemPrompt: 'Review auth code.',
      canWriteFiles: true,
    },
    '',
    process.cwd(),
    () => {},
    new AbortController().signal,
    {
      delegationId: 'del_account',
      threadId: 'thread_main',
      policy: {
        maxAgentRounds: 2,
        maxAgentOutputChars: 8_000,
        agentWriteAccessEnabled: true,
        agentWriteMode: 'staged',
      },
      providerRuntimeSettings: {},
    },
  )

  assert.equal(result.status, 'completed')
  assert.equal(observed.length, 1)
  assert.equal(observed[0].providerId, 'openai')
  assert.equal(observed[0].apiKey, '')
  assert.equal(observed[0].authMethod, 'account')
  assert.ok(observed[0].toolNames.length > 0)
  assert.ok(observed[0].toolNames.includes('read_file'))
  assert.match(observed[0].systemPrompt, /You have tool access to: .*read_file/i)
  assert.match(observed[0].threadId, /^moa:del_account:role_account:task_account_agent$/)
  assert.equal(observed[0].projectFolder, process.cwd())
  assert.equal(observed[0].permissionProfile, ':read-only')
  assert.equal(observed[0].bridgeThreadId, '')
})

test('runSingleAgent honors an explicit OpenAI auth snapshot even if shared settings change mid-run', async () => {
  await setSettingsPatch({
    providerAuthSettings: {
      openai: {
        authMethod: 'api_key',
      },
    },
  })

  const observed = []
  __setCreateStreamWithToolsForTests(async (providerId, apiKey, messages, options) => {
    observed.push({
      providerId,
      apiKey,
      authMethod: options?.openAIExecutionAuthContext?.authMethod || '',
    })
    return {
      text: 'Delegated snapshot result.',
      reasoning: '',
      usage: { totalTokens: 4, inputTokens: 2, outputTokens: 2, reasoningTokens: 0 },
      toolCalls: [],
    }
  })

  const result = await runSingleAgent(
    {
      task_id: 'task_account_snapshot',
      instruction: 'Review the auth flow and summarize the outcome.',
      injected_context: 'src/auth/session.ts',
      expected_output_format: 'summary',
    },
    {
      id: 'role_account_snapshot',
      name: 'Account Agent',
      providerId: 'openai',
      model: 'gpt-5.4',
      systemPrompt: 'Review auth code.',
      canWriteFiles: true,
    },
    '',
    process.cwd(),
    () => {},
    new AbortController().signal,
    {
      openAIExecutionAuthSnapshot: {
        ok: true,
        authMethod: 'account',
        apiKey: '',
        blockedReason: '',
        blockedMessage: '',
      },
      policy: {
        maxAgentRounds: 2,
        maxAgentOutputChars: 8_000,
        agentWriteAccessEnabled: true,
        agentWriteMode: 'staged',
      },
      providerRuntimeSettings: {},
    },
  )

  assert.equal(result.status, 'completed')
  assert.equal(observed.length, 1)
  assert.equal(observed[0].providerId, 'openai')
  assert.equal(observed[0].apiKey, '')
  assert.equal(observed[0].authMethod, 'account')
})

test('runSingleAgent stops repeated identical tool batches before max rounds are exhausted', async () => {
  const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-moa-agent-loop-identical-'))
  fs.writeFileSync(path.join(projectFolder, 'notes.txt'), 'line 1\nline 2\n', 'utf8')
  let attempts = 0

  __setCreateStreamWithToolsForTests(async () => {
    attempts += 1
    return {
      text: '',
      reasoning: '',
      usage: { totalTokens: 3, inputTokens: 2, outputTokens: 1, reasoningTokens: 0 },
      toolCalls: [{
        id: `call_read_${attempts}`,
        name: 'read_file',
        input: { path: 'notes.txt' },
      }],
    }
  })

  try {
    const result = await runSingleAgent(
      {
        task_id: 'task_tool_loop_identical',
        instruction: 'Inspect the note.',
        injected_context: 'notes.txt',
        expected_output_format: 'summary',
      },
      {
        id: 'role_reader',
        name: 'Reader Agent',
        providerId: 'openai',
        model: 'gpt-5.4',
        systemPrompt: 'Inspect files.',
        canWriteFiles: false,
      },
      'sk-test',
      projectFolder,
      () => {},
      new AbortController().signal,
      {
        policy: {
          maxAgentRounds: 8,
          maxAgentOutputChars: 8_000,
          maxConsecutiveIdenticalToolRounds: 3,
          maxLoopRecoveryAttempts: 0,
        },
        providerRuntimeSettings: {},
      },
    )

    assert.equal(result.status, 'failed')
    assert.match(String(result.error || ''), /identical tool-call rounds/i)
    assert.equal(result.rounds, 3)
  } finally {
    try { fs.rmSync(projectFolder, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})

test('runSingleAgent stops near-duplicate exploration loops across overlapping file ranges', async () => {
  const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-moa-agent-loop-range-'))
  const fileContent = Array.from({ length: 700 }, (_, index) => `line ${index + 1}`).join('\n')
  fs.writeFileSync(path.join(projectFolder, 'notes.txt'), `${fileContent}\n`, 'utf8')
  let attempts = 0
  const ranges = [
    { start_line: 1, end_line: 500 },
    { start_line: 50, end_line: 550 },
    { start_line: 75, end_line: 575 },
    { start_line: 100, end_line: 600 },
  ]

  __setCreateStreamWithToolsForTests(async () => {
    const range = ranges[Math.min(attempts, ranges.length - 1)]
    attempts += 1
    return {
      text: '',
      reasoning: '',
      usage: { totalTokens: 4, inputTokens: 2, outputTokens: 2, reasoningTokens: 0 },
      toolCalls: [{
        id: `call_range_${attempts}`,
        name: 'view_file_range',
        input: { path: 'notes.txt', ...range },
      }],
    }
  })

  try {
    const result = await runSingleAgent(
      {
        task_id: 'task_tool_loop_range',
        instruction: 'Inspect the relevant range.',
        injected_context: 'notes.txt',
        expected_output_format: 'summary',
      },
      {
        id: 'role_range_reader',
        name: 'Range Reader Agent',
        providerId: 'openai',
        model: 'gpt-5.4',
        systemPrompt: 'Inspect file ranges.',
        canWriteFiles: false,
      },
      'sk-test',
      projectFolder,
      () => {},
      new AbortController().signal,
      {
        policy: {
          maxAgentRounds: 8,
          maxAgentOutputChars: 8_000,
          maxConsecutiveNearDuplicateExplorationRounds: 4,
          maxLoopRecoveryAttempts: 0,
        },
        providerRuntimeSettings: {},
      },
    )

    assert.equal(result.status, 'failed')
    assert.match(String(result.error || ''), /near-duplicate exploration rounds/i)
    assert.equal(result.rounds, 4)
  } finally {
    try { fs.rmSync(projectFolder, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})

test('runSingleAgent retries once with narrowed scope after a repeated tool loop', async () => {
  const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-moa-agent-recovery-success-'))
  fs.writeFileSync(path.join(projectFolder, 'auth.ts'), 'export const auth = true\n', 'utf8')
  const emitted = []
  const observedCalls = []
  let attempts = 0

  __setCreateStreamWithToolsForTests(async (providerId, apiKey, messages, options = {}) => {
    attempts += 1
    observedCalls.push({
      toolNames: Object.keys(options?.tools || {}).sort(),
      lastSystemMessage: String(messages?.filter((row) => row?.role === 'system').at(-1)?.content || ''),
    })
    if (attempts <= 2) {
      return {
        text: '',
        reasoning: '',
        usage: { totalTokens: 3, inputTokens: 2, outputTokens: 1, reasoningTokens: 0 },
        toolCalls: [{
          id: `call_read_${attempts}`,
          name: 'read_file',
          input: { path: 'auth.ts' },
        }],
      }
    }
    return {
      text: 'Recovered with a narrowed-scope answer.',
      reasoning: '',
      usage: { totalTokens: 2, inputTokens: 1, outputTokens: 1, reasoningTokens: 0 },
      toolCalls: [],
    }
  })

  try {
    const result = await runSingleAgent(
      {
        task_id: 'task_tool_loop_recovery',
        instruction: 'Inspect auth references and summarize the likely target file.',
        injected_context: 'auth.ts',
        expected_output_format: 'summary',
      },
      {
        id: 'role_reader',
        name: 'Reader Agent',
        providerId: 'openai',
        model: 'gpt-5.4',
        systemPrompt: 'Inspect files.',
        canWriteFiles: false,
      },
      'sk-test',
      projectFolder,
      (channel, payload = {}) => emitted.push({ channel, payload }),
      new AbortController().signal,
      {
        policy: {
          maxAgentRounds: 6,
          maxAgentOutputChars: 8_000,
          maxConsecutiveIdenticalToolRounds: 2,
          maxLoopRecoveryAttempts: 1,
        },
        providerRuntimeSettings: {},
      },
    )

    assert.equal(result.status, 'completed')
    assert.equal(result.rounds, 3)
    assert.equal(observedCalls.length, 3)
    assert.ok(observedCalls[0].toolNames.includes('read_file'))
    assert.ok(observedCalls[1].toolNames.includes('read_file'))
    assert.ok(!observedCalls[2].toolNames.includes('read_file'))
    assert.match(observedCalls[2].lastSystemMessage, /\[LOOP GUARD RECOVERY\]/i)
    const recoveryEvent = emitted.find((entry) => entry.channel === 'moa:agent-recovery')
    assert.ok(recoveryEvent)
    assert.equal(recoveryEvent.payload.triggerKind, 'identical_tool_batch')
    assert.deepEqual(recoveryEvent.payload.blockedToolNames, ['read_file'])
    assert.equal(recoveryEvent.payload.targetPath, 'auth.ts')
  } finally {
    try { fs.rmSync(projectFolder, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})

test('runSingleAgent fails if the recovery round retries a blocked tool', async () => {
  const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-moa-agent-recovery-fail-'))
  fs.writeFileSync(path.join(projectFolder, 'auth.ts'), 'export const auth = true\n', 'utf8')
  const emitted = []
  let attempts = 0

  __setCreateStreamWithToolsForTests(async () => {
    attempts += 1
    return {
      text: '',
      reasoning: '',
      usage: { totalTokens: 3, inputTokens: 2, outputTokens: 1, reasoningTokens: 0 },
      toolCalls: [{
        id: `call_read_${attempts}`,
        name: 'read_file',
        input: { path: 'auth.ts' },
      }],
    }
  })

  try {
    const result = await runSingleAgent(
      {
        task_id: 'task_tool_loop_recovery_fail',
        instruction: 'Inspect auth references and summarize the likely target file.',
        injected_context: 'auth.ts',
        expected_output_format: 'summary',
      },
      {
        id: 'role_reader',
        name: 'Reader Agent',
        providerId: 'openai',
        model: 'gpt-5.4',
        systemPrompt: 'Inspect files.',
        canWriteFiles: false,
      },
      'sk-test',
      projectFolder,
      (channel, payload = {}) => emitted.push({ channel, payload }),
      new AbortController().signal,
      {
        policy: {
          maxAgentRounds: 6,
          maxAgentOutputChars: 8_000,
          maxConsecutiveIdenticalToolRounds: 2,
          maxLoopRecoveryAttempts: 1,
        },
        providerRuntimeSettings: {},
      },
    )

    assert.equal(result.status, 'failed')
    assert.match(String(result.error || ''), /blocked tool/i)
    assert.equal(result.rounds, 3)
    assert.ok(emitted.some((entry) => entry.channel === 'moa:agent-recovery'))
  } finally {
    try { fs.rmSync(projectFolder, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})
