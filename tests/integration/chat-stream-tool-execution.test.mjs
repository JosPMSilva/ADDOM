import crypto from 'node:crypto'
import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { executeApprovedToolStep } from '../../src/main/chat/chat-stream-tool-execution.mjs'
import {
  clearGlobalRunCommandPolicyTelemetry,
  recordGlobalTerminalToolContextTelemetry,
} from '../../src/main/chat/run-command-policy-telemetry.mjs'
import { TOOL_CALL_LINT_CODES, TOOL_CALL_LINT_DECISIONS } from '../../src/main/chat/tool-call-linter.mjs'
import {
  __resetTerminalSessionRuntimeForTests,
  listVisibleTerminalSessionsForChat,
  setTerminalSessionManagerForChat,
} from '../../src/main/chat/terminal-session-events.mjs'

afterEach(() => {
  __resetTerminalSessionRuntimeForTests()
  clearGlobalRunCommandPolicyTelemetry()
})

test('executeApprovedToolStep prefers provider-native execution when a Moonshot Formula context is present', async () => {
  let genericExecuteCalled = false

  const result = await executeApprovedToolStep({
    tc: { name: 'fetch_page' },
    toolInput: { query: 'moonshot news' },
    toolExecutionMap: {
      fetch_page: 'moonshot_formula__web_search__search',
    },
    providerId: 'moonshot',
    apiKey: 'moonshot-secret',
    providerToolExecutionContext: {
      family: 'moonshot_formula',
      toolMap: new Map([
        ['moonshot_formula__web_search__search', {
          formulaUri: 'moonshot/web-search:latest',
          originalToolName: 'search',
        }],
      ]),
    },
    projectFolder: 'C:\\Users\\example\\Documents\\ADDOM',
    activeThreadId: 'thread_1',
    activeTurnId: 'turn_1',
    loop: {
      abortController: new AbortController(),
      cancelled: false,
    },
    helpers: {
      takeShellWriteSnapshot: async () => null,
      detectShellWriteArtifactChanges: async () => [],
      executeOpenAILocalRuntimeTool: async () => {
        throw new Error('unexpected openai local runtime execution')
      },
      isOpenAILocalRuntimeToolName: () => false,
      executeTool: async () => {
        genericExecuteCalled = true
        return { result: 'generic tool result' }
      },
      executeProviderNativeToolCall: async () => ({
        ok: true,
        result: 'provider-native result',
      }),
      resolveToolWriteArtifactMeta: async () => null,
      buildMissingDependencyInstallHint: () => '',
      isAbortError: () => false,
    },
  })

  assert.equal(result.result, 'provider-native result')
  assert.equal(result.isError, false)
  assert.equal(genericExecuteCalled, false)
})

test('executeApprovedToolStep rejects malformed apply_patch before executor dispatch', async () => {
  let genericExecuteCalled = false

  const result = await executeApprovedToolStep({
    tc: { name: 'apply_patch' },
    toolInput: {
      patch: [
        '*** Begin Patch',
        '*** Update File: src/app.js',
        'replace file with this content',
        '*** End Patch',
      ].join('\n'),
    },
    projectFolder: 'C:\\Users\\example\\Documents\\ADDOM',
    activeThreadId: 'thread_1',
    activeTurnId: 'turn_1',
    loop: {
      abortController: new AbortController(),
      cancelled: false,
    },
    helpers: {
      takeShellWriteSnapshot: async () => null,
      detectShellWriteArtifactChanges: async () => [],
      executeOpenAILocalRuntimeTool: async () => {
        throw new Error('unexpected openai local runtime execution')
      },
      isOpenAILocalRuntimeToolName: () => false,
      executeTool: async () => {
        genericExecuteCalled = true
        return { result: 'generic tool result' }
      },
      executeProviderNativeToolCall: async () => null,
      resolveToolWriteArtifactMeta: async () => null,
      buildMissingDependencyInstallHint: () => '',
      isAbortError: () => false,
    },
  })

  assert.equal(result.isError, true)
  assert.equal(genericExecuteCalled, false)
  assert.equal(result.lintResult?.decision, TOOL_CALL_LINT_DECISIONS.REJECT)
  assert.equal(result.lintResult?.lintCode, TOOL_CALL_LINT_CODES.APPLY_PATCH_MISSING_HUNK)
  assert.match(result.result, /^Tool error: pre-execution lint/)
})

test('executeApprovedToolStep rejects edit_file no-op before executor dispatch', async () => {
  let genericExecuteCalled = false

  const result = await executeApprovedToolStep({
    tc: { name: 'edit_file' },
    toolInput: {
      path: 'src/app.js',
      old_text: 'same',
      new_text: 'same',
    },
    projectFolder: 'C:\\Users\\example\\Documents\\ADDOM',
    activeThreadId: 'thread_1',
    activeTurnId: 'turn_1',
    loop: {
      abortController: new AbortController(),
      cancelled: false,
    },
    helpers: {
      takeShellWriteSnapshot: async () => null,
      detectShellWriteArtifactChanges: async () => [],
      executeOpenAILocalRuntimeTool: async () => {
        throw new Error('unexpected openai local runtime execution')
      },
      isOpenAILocalRuntimeToolName: () => false,
      executeTool: async () => {
        genericExecuteCalled = true
        return { result: 'generic tool result' }
      },
      executeProviderNativeToolCall: async () => null,
      resolveToolWriteArtifactMeta: async () => null,
      buildMissingDependencyInstallHint: () => '',
      isAbortError: () => false,
    },
  })

  assert.equal(result.isError, true)
  assert.equal(genericExecuteCalled, false)
  assert.equal(result.lintResult?.decision, TOOL_CALL_LINT_DECISIONS.REJECT)
  assert.equal(result.lintResult?.lintCode, TOOL_CALL_LINT_CODES.EDIT_FILE_NO_OP)
  assert.match(result.result, /pre-execution lint/i)
})

test('executeApprovedToolStep routes terminal_session tools through the dedicated terminal session bridge', async () => {
  let genericExecuteCalled = false
  const emittedChunks = []
  const createCalls = []

  setTerminalSessionManagerForChat({
    createSession({ cwd, shell, cols, rows, envOverrides, policy }) {
      createCalls.push({ cwd, shell, cols, rows, envOverrides, policy })
      return {
        session: {
          id: 'term_1',
          cwd,
          shell,
          shellKind: shell,
          cols,
          rows,
          status: 'running',
          outputSequence: 2,
        },
        output: {
          nextSequence: 2,
          truncated: false,
          chunks: [
            { data: 'Windows PowerShell\r\n', at: 1000 },
            { data: 'PS C:\\Users\\example\\Documents\\ADDOM> ', at: 1001 },
          ],
        },
      }
    },
  })

  const result = await executeApprovedToolStep({
    tc: { name: 'terminal_session_open' },
    toolInput: {
      cwd: '.',
      shell: 'powershell',
      cols: 120,
      rows: 40,
    },
    projectFolder: 'C:\\Users\\example\\Documents\\ADDOM',
    activeThreadId: 'thread_1',
    activeTurnId: 'turn_1',
    stepId: 'step_terminal_1',
    stepSequence: 3,
    stepStartedAt: 1234567890,
    loop: {
      abortController: new AbortController(),
      cancelled: false,
    },
    send: (channel, payload) => {
      emittedChunks.push({ channel, payload })
    },
    helpers: {
      takeShellWriteSnapshot: async () => null,
      detectShellWriteArtifactChanges: async () => [],
      executeOpenAILocalRuntimeTool: async () => {
        throw new Error('unexpected openai local runtime execution')
      },
      isOpenAILocalRuntimeToolName: () => false,
      executeTool: async () => {
        genericExecuteCalled = true
        return { result: 'generic tool result' }
      },
      executeProviderNativeToolCall: async () => null,
      resolveToolWriteArtifactMeta: async () => null,
      buildMissingDependencyInstallHint: () => '',
      isAbortError: () => false,
    },
  })

  assert.equal(genericExecuteCalled, false)
  assert.equal(createCalls.length, 1)
  assert.equal(createCalls[0].cwd, 'C:\\Users\\example\\Documents\\ADDOM')
  assert.equal(createCalls[0].shell, 'powershell')
  assert.equal(createCalls[0].cols, 120)
  assert.equal(createCalls[0].rows, 40)
  assert.equal(createCalls[0].envOverrides, null)
  assert.equal(createCalls[0].policy?.type, 'terminal_session_policy_v1')
  assert.equal(createCalls[0].policy?.policyDecision, 'allow')

  assert.equal(result.isError, false)
  assert.equal(result.result?.sessionId, 'term_1')
  assert.match(result.result?.summary, /Opened term_1 \(ADDOM\) in the chat terminal dock/i)
  assert.match(result.result?.output?.text || '', /Windows PowerShell/i)
  assert.match(result.result?.output?.text || '', /PS C:\\Users\\example\\Documents\\ADDOM>/)
  assert.match(result.result?.output?.preview || '', /Windows PowerShell/i)
  assert.equal(result.terminalSessionActivityMeta?.terminalSession?.action, 'open')
  assert.equal(result.terminalSessionActivityMeta?.terminalSession?.sessionId, 'term_1')
  assert.equal(result.terminalSessionActivityMeta?.terminalSession?.displayName, 'term_1 (ADDOM)')
  assert.equal(result.terminalSessionActivityMeta?.terminalSession?.cwd, 'C:\\Users\\example\\Documents\\ADDOM')
  assert.equal(result.terminalSessionActivityMeta?.terminalSession?.outputChunkCount, 2)
  assert.equal(result.terminalSessionActivityMeta?.terminalSession?.panelIntent, 'open')
  assert.match(result.terminalSessionActivityMeta?.terminalSession?.outputPreview, /Windows PowerShell/i)

  assert.equal(emittedChunks.length, 1)
  assert.equal(emittedChunks[0].channel, 'chat:tool-output')
  assert.equal(emittedChunks[0].payload?.toolName, 'terminal_session_open')
  assert.match(emittedChunks[0].payload?.chunk, /Windows PowerShell/)
  assert.match(emittedChunks[0].payload?.chunk, /PS C:\\Users\\example\\Documents\\ADDOM>/)
})

test('executeApprovedToolStep lists visible terminal sessions through the dedicated terminal session bridge', async () => {
  const sessions = [
    {
      id: 'term_user_1',
      threadId: 'thread_1',
      controlOwner: 'user',
      status: 'running',
      cwd: 'C:\\Users\\example\\Documents\\ADDOM',
      shell: 'powershell',
      shellKind: 'powershell',
      outputSequence: 17,
      updatedAt: 300,
      focusedSurface: 'chat_dock',
      policy: {
        type: 'terminal_session_policy_v1',
        laterWritesStayBoundToSession: true,
        resolvedCwd: 'C:\\Users\\example\\Documents\\ADDOM',
        requestedShell: 'powershell',
        resolvedShell: 'powershell',
      },
    },
    {
      id: 'term_ai_1',
      threadId: 'thread_1',
      controlOwner: 'model',
      status: 'running',
      cwd: 'C:\\Users\\example\\Documents\\ADDOM',
      shell: 'powershell',
      shellKind: 'powershell',
      outputSequence: 42,
      updatedAt: 200,
      focusedSurface: 'chat_dock',
      policy: {
        type: 'terminal_session_policy_v1',
        laterWritesStayBoundToSession: true,
        resolvedCwd: 'C:\\Users\\example\\Documents\\ADDOM',
        requestedShell: 'powershell',
        resolvedShell: 'powershell',
      },
    },
  ]

  setTerminalSessionManagerForChat({
    createSession() {
      throw new Error('unexpected createSession call')
    },
    listSessions() {
      return sessions
    },
    getSession(sessionId) {
      return sessions.find((session) => session.id === sessionId) || null
    },
  })

  const result = await executeApprovedToolStep({
    tc: { name: 'terminal_session_list' },
    toolInput: { maxSessions: 5 },
    projectFolder: 'C:\\Users\\example\\Documents\\ADDOM',
    activeThreadId: 'thread_1',
    activeTurnId: 'turn_1',
    loop: {
      abortController: new AbortController(),
      cancelled: false,
    },
    helpers: {
      takeShellWriteSnapshot: async () => null,
      detectShellWriteArtifactChanges: async () => [],
      executeOpenAILocalRuntimeTool: async () => {
        throw new Error('unexpected openai local runtime execution')
      },
      isOpenAILocalRuntimeToolName: () => false,
      executeTool: async () => {
        throw new Error('unexpected generic tool execution')
      },
      executeProviderNativeToolCall: async () => null,
      resolveToolWriteArtifactMeta: async () => null,
      buildMissingDependencyInstallHint: () => '',
      isAbortError: () => false,
    },
  })

  assert.equal(result.isError, false)
  assert.equal(result.result?.count, 2)
  assert.match(result.result?.summary || '', /Listed 2 visible terminal sessions/i)
  assert.equal(result.result?.sessions?.[0]?.access, 'locked_by_user')
  assert.equal(result.result?.sessions?.[0]?.suggestedUse, 'visible only until the user hands it back to AI')
  assert.equal(result.result?.sessions?.[1]?.access, 'ai_reusable')
  assert.equal(result.result?.sessions?.[1]?.suggestedUse, 'reuse this session for the ongoing interactive workflow')
})

test('executeApprovedToolStep returns bounded terminal text in terminal_session_attach results', async () => {
  setTerminalSessionManagerForChat({
    createSession() {
      throw new Error('unexpected createSession call')
    },
    getSession(sessionId) {
      if (sessionId !== 'term_attach_1') return null
      return {
        id: 'term_attach_1',
        cwd: 'C:\\Users\\example\\Documents\\ADDOM',
        shell: 'powershell',
        shellKind: 'powershell',
        cols: 120,
        rows: 40,
        status: 'running',
        outputSequence: 15,
        policy: {
          type: 'terminal_session_policy_v1',
          laterWritesStayBoundToSession: true,
          resolvedCwd: 'C:\\Users\\example\\Documents\\ADDOM',
          requestedShell: 'powershell',
          resolvedShell: 'powershell',
          cols: 120,
          rows: 40,
        },
      }
    },
    attachSession(sessionId, { sinceSequence } = {}) {
      assert.equal(sessionId, 'term_attach_1')
      assert.equal(sinceSequence, 12)
      return {
        session: {
          id: 'term_attach_1',
          cwd: 'C:\\Users\\example\\Documents\\ADDOM',
          shell: 'powershell',
          shellKind: 'powershell',
          cols: 120,
          rows: 40,
          status: 'running',
          outputSequence: 15,
        },
        output: {
          nextSequence: 15,
          truncated: false,
          chunks: [
            { data: 'powershell\r\n', at: 2000 },
            { data: 'PS C:\\Users\\example\\Documents\\ADDOM> Get-Location\r\n', at: 2001 },
            { data: 'Path\r\n----\r\nC:\\Users\\example\\Documents\\ADDOM\r\n', at: 2002 },
          ],
        },
      }
    },
  })

  const result = await executeApprovedToolStep({
    tc: { name: 'terminal_session_attach' },
    toolInput: {
      sessionId: 'term_attach_1',
      sinceSequence: 12,
    },
    projectFolder: 'C:\\Users\\example\\Documents\\ADDOM',
    activeThreadId: 'thread_1',
    activeTurnId: 'turn_1',
    loop: {
      abortController: new AbortController(),
      cancelled: false,
    },
    helpers: {
      takeShellWriteSnapshot: async () => null,
      detectShellWriteArtifactChanges: async () => [],
      executeOpenAILocalRuntimeTool: async () => {
        throw new Error('unexpected openai local runtime execution')
      },
      isOpenAILocalRuntimeToolName: () => false,
      executeTool: async () => {
        throw new Error('unexpected generic tool execution')
      },
      executeProviderNativeToolCall: async () => null,
      resolveToolWriteArtifactMeta: async () => null,
      buildMissingDependencyInstallHint: () => '',
      isAbortError: () => false,
    },
  })

  assert.equal(result.isError, false)
  assert.equal(result.result?.sessionId, 'term_attach_1')
  assert.match(result.result?.summary || '', /Using term_attach_1 \(ADDOM\) in the chat terminal dock/i)
  assert.match(result.result?.output?.text || '', /Get-Location/)
  assert.match(result.result?.output?.text || '', /C:\\Users\\example\\Documents\\ADDOM/)
  assert.match(result.result?.output?.preview || '', /Get-Location/)
  assert.equal(result.result?.output?.chunkCount, 3)
  assert.equal(result.result?.output?.nextSequence, 15)
})

test('executeApprovedToolStep routes terminal_session_read_snapshot through the dedicated terminal snapshot path', async () => {
  const emittedChunks = []

  setTerminalSessionManagerForChat({
    createSession() {
      throw new Error('unexpected createSession call')
    },
    getSession(sessionId) {
      if (sessionId !== 'term_read_1') return null
      return {
        id: 'term_read_1',
        cwd: 'C:\\Users\\example\\Documents\\ADDOM',
        shell: 'powershell',
        shellKind: 'powershell',
        cols: 120,
        rows: 40,
        status: 'running',
        outputSequence: 15,
        policy: {
          type: 'terminal_session_policy_v1',
          laterWritesStayBoundToSession: true,
          resolvedCwd: 'C:\\Users\\example\\Documents\\ADDOM',
          requestedShell: 'powershell',
          resolvedShell: 'powershell',
          cols: 120,
          rows: 40,
        },
      }
    },
    readSessionSnapshot(sessionId, { sinceSequence, maxChars, mode } = {}) {
      assert.equal(sessionId, 'term_read_1')
      assert.equal(sinceSequence, 12)
      assert.equal(maxChars, 64)
      assert.equal(mode, 'buffer_tail')
      return {
        sessionId: 'term_read_1',
        session: {
          id: 'term_read_1',
          cwd: 'C:\\Users\\example\\Documents\\ADDOM',
          shell: 'powershell',
          shellKind: 'powershell',
          cols: 120,
          rows: 40,
          status: 'running',
          outputSequence: 15,
        },
        output: {
          text: 'PS C:\\Users\\example\\Documents\\ADDOM> Get-Location\r\nC:\\Users\\example\\Documents\\ADDOM\r\n',
          preview: 'PS C:\\Users\\example\\Documents\\ADDOM> Get-Location\r\nC:\\Users\\example\\Documents\\ADDOM\r\n',
          nextSequence: 15,
          chunkCount: 2,
          truncated: false,
          mode: 'buffer_tail',
          capturedAt: 2002,
        },
      }
    },
  })

  const result = await executeApprovedToolStep({
    tc: { name: 'terminal_session_read_snapshot' },
    toolInput: {
      sessionId: 'term_read_1',
      sinceSequence: 12,
      maxChars: 64,
      mode: 'buffer_tail',
    },
    projectFolder: 'C:\\Users\\example\\Documents\\ADDOM',
    activeThreadId: 'thread_1',
    activeTurnId: 'turn_1',
    stepId: 'step_terminal_read_1',
    stepSequence: 4,
    stepStartedAt: 1234567891,
    loop: {
      abortController: new AbortController(),
      cancelled: false,
    },
    send: (channel, payload) => {
      emittedChunks.push({ channel, payload })
    },
    helpers: {
      takeShellWriteSnapshot: async () => null,
      detectShellWriteArtifactChanges: async () => [],
      executeOpenAILocalRuntimeTool: async () => {
        throw new Error('unexpected openai local runtime execution')
      },
      isOpenAILocalRuntimeToolName: () => false,
      executeTool: async () => {
        throw new Error('unexpected generic tool execution')
      },
      executeProviderNativeToolCall: async () => null,
      resolveToolWriteArtifactMeta: async () => null,
      buildMissingDependencyInstallHint: () => '',
      isAbortError: () => false,
    },
  })

  assert.equal(result.isError, false)
  assert.equal(result.result?.sessionId, 'term_read_1')
  assert.match(result.result?.summary || '', /Read a terminal snapshot from term_read_1 \(ADDOM\)/i)
  assert.match(result.result?.output?.text || '', /Get-Location/)
  assert.equal(result.result?.output?.chunkCount, 2)
  assert.equal(result.result?.output?.nextSequence, 15)
  assert.equal(result.result?.output?.mode, 'buffer_tail')
  assert.equal(result.terminalSessionActivityMeta?.terminalSession?.action, 'read_snapshot')
  assert.equal(emittedChunks.length, 1)
  assert.equal(emittedChunks[0].channel, 'chat:tool-output')
  assert.equal(emittedChunks[0].payload?.toolName, 'terminal_session_read_snapshot')
  assert.match(emittedChunks[0].payload?.chunk, /Get-Location/)
})

test('executeApprovedToolStep routes terminal_session_wait_for_output through the dedicated terminal wait path', async () => {
  const emittedChunks = []

  setTerminalSessionManagerForChat({
    createSession() {
      throw new Error('unexpected createSession call')
    },
    getSession(sessionId) {
      if (sessionId !== 'term_wait_1') return null
      return {
        id: 'term_wait_1',
        cwd: 'C:\\Users\\example\\Documents\\ADDOM',
        shell: 'powershell',
        shellKind: 'powershell',
        cols: 120,
        rows: 40,
        status: 'running',
        outputSequence: 18,
        policy: {
          type: 'terminal_session_policy_v1',
          laterWritesStayBoundToSession: true,
          resolvedCwd: 'C:\\Users\\example\\Documents\\ADDOM',
          requestedShell: 'powershell',
          resolvedShell: 'powershell',
          cols: 120,
          rows: 40,
        },
      }
    },
    waitForOutput(sessionId, options = {}) {
      assert.equal(sessionId, 'term_wait_1')
      assert.equal(options.pattern, 'server ready')
      assert.equal(options.text, undefined)
      assert.equal(options.sinceSequence, 12)
      assert.equal(options.timeoutMs, 4000)
      assert.equal(options.maxChars, 96)
      assert.equal(options.mode, 'plain_text_tail')
      return Promise.resolve({
        sessionId: 'term_wait_1',
        session: {
          id: 'term_wait_1',
          cwd: 'C:\\Users\\example\\Documents\\ADDOM',
          shell: 'powershell',
          shellKind: 'powershell',
          cols: 120,
          rows: 40,
          status: 'running',
          outputSequence: 18,
        },
        wait: {
          matched: true,
          timedOut: false,
          reason: 'matched',
          matchType: 'pattern',
          pattern: 'server ready',
          text: '',
          timeoutMs: 4000,
          sinceSequence: 12,
        },
        output: {
          text: 'Starting dev server...\nserver ready on http://localhost:5173\n',
          preview: 'Starting dev server...\nserver ready on http://localhost:5173\n',
          nextSequence: 18,
          chunkCount: 2,
          truncated: false,
          mode: 'plain_text_tail',
          capturedAt: 3002,
        },
      })
    },
  })

  const result = await executeApprovedToolStep({
    tc: { name: 'terminal_session_wait_for_output' },
    toolInput: {
      sessionId: 'term_wait_1',
      pattern: 'server ready',
      sinceSequence: 12,
      timeoutMs: 4000,
      maxChars: 96,
      mode: 'plain_text_tail',
    },
    projectFolder: 'C:\\Users\\example\\Documents\\ADDOM',
    activeThreadId: 'thread_1',
    activeTurnId: 'turn_1',
    stepId: 'step_terminal_wait_1',
    stepSequence: 5,
    stepStartedAt: 1234567892,
    loop: {
      abortController: new AbortController(),
      cancelled: false,
    },
    send: (channel, payload) => {
      emittedChunks.push({ channel, payload })
    },
    helpers: {
      takeShellWriteSnapshot: async () => null,
      detectShellWriteArtifactChanges: async () => [],
      executeOpenAILocalRuntimeTool: async () => {
        throw new Error('unexpected openai local runtime execution')
      },
      isOpenAILocalRuntimeToolName: () => false,
      executeTool: async () => {
        throw new Error('unexpected generic tool execution')
      },
      executeProviderNativeToolCall: async () => null,
      resolveToolWriteArtifactMeta: async () => null,
      buildMissingDependencyInstallHint: () => '',
      isAbortError: () => false,
    },
  })

  assert.equal(result.isError, false)
  assert.equal(result.result?.sessionId, 'term_wait_1')
  assert.equal(result.result?.wait?.matched, true)
  assert.equal(result.result?.wait?.matchType, 'pattern')
  assert.equal(result.result?.output?.mode, 'plain_text_tail')
  assert.match(result.result?.summary || '', /Waited for expected output in term_wait_1 \(ADDOM\) and matched it/i)
  assert.equal(result.terminalSessionActivityMeta?.terminalSession?.action, 'wait_for_output')
  assert.equal(result.terminalSessionActivityMeta?.terminalSession?.matched, true)
  assert.equal(result.terminalSessionActivityMeta?.terminalSession?.timedOut, false)
  assert.equal(emittedChunks.length, 1)
  assert.equal(emittedChunks[0].channel, 'chat:tool-output')
  assert.equal(emittedChunks[0].payload?.toolName, 'terminal_session_wait_for_output')
  assert.match(emittedChunks[0].payload?.chunk, /server ready/i)
})

test('executeApprovedToolStep blocks terminal_session_wait_for_output after repeated timeout loops with no progress', async () => {
  let waitForOutputCalled = false

  recordGlobalTerminalToolContextTelemetry({
    kind: 'terminal_session',
    action: 'wait_for_output',
    sessionId: 'term_wait_blocked_1',
    outputSequence: 12,
    sinceSequence: 12,
    timedOut: true,
    matched: false,
    outputProgress: false,
  })
  recordGlobalTerminalToolContextTelemetry({
    kind: 'terminal_session',
    action: 'wait_for_output',
    sessionId: 'term_wait_blocked_1',
    outputSequence: 12,
    sinceSequence: 12,
    timedOut: true,
    matched: false,
    outputProgress: false,
  })

  setTerminalSessionManagerForChat({
    createSession() {
      throw new Error('unexpected createSession call')
    },
    getSession(sessionId) {
      if (sessionId !== 'term_wait_blocked_1') return null
      return {
        id: 'term_wait_blocked_1',
        cwd: 'C:\\Users\\example\\Documents\\ADDOM',
        shell: 'powershell',
        shellKind: 'powershell',
        cols: 120,
        rows: 40,
        status: 'running',
        outputSequence: 12,
        policy: {
          type: 'terminal_session_policy_v1',
          laterWritesStayBoundToSession: true,
          resolvedCwd: 'C:\\Users\\example\\Documents\\ADDOM',
          requestedShell: 'powershell',
          resolvedShell: 'powershell',
          cols: 120,
          rows: 40,
        },
      }
    },
    waitForOutput() {
      waitForOutputCalled = true
      throw new Error('unexpected waitForOutput call')
    },
  })

  const result = await executeApprovedToolStep({
    tc: { name: 'terminal_session_wait_for_output' },
    toolInput: {
      sessionId: 'term_wait_blocked_1',
      pattern: 'server ready',
      sinceSequence: 12,
      timeoutMs: 4000,
      maxChars: 96,
      mode: 'plain_text_tail',
    },
    projectFolder: 'C:\\Users\\example\\Documents\\ADDOM',
    activeThreadId: 'thread_1',
    activeTurnId: 'turn_1',
    loop: {
      abortController: new AbortController(),
      cancelled: false,
    },
    helpers: {
      takeShellWriteSnapshot: async () => null,
      detectShellWriteArtifactChanges: async () => [],
      executeOpenAILocalRuntimeTool: async () => {
        throw new Error('unexpected openai local runtime execution')
      },
      isOpenAILocalRuntimeToolName: () => false,
      executeTool: async () => {
        throw new Error('unexpected generic tool execution')
      },
      executeProviderNativeToolCall: async () => null,
      resolveToolWriteArtifactMeta: async () => null,
      buildMissingDependencyInstallHint: () => '',
      isAbortError: () => false,
    },
  })

  assert.equal(waitForOutputCalled, false)
  assert.equal(result.isError, true)
  assert.match(result.result || '', /Terminal loop guard blocked terminal_session_wait_for_output/i)
  assert.match(result.result || '', /Read a fresh terminal snapshot or change the command before waiting again/i)
})

test('executeApprovedToolStep blocks terminal_session_write when the same command repeats without output progress', async () => {
  let writeSessionCalled = false
  const repeatedCommand = 'npm run dev\n'
  const commandHash = crypto
    .createHash('sha256')
    .update('npm run dev', 'utf8')
    .digest('hex')

  recordGlobalTerminalToolContextTelemetry({
    kind: 'terminal_session',
    action: 'write',
    sessionId: 'term_write_blocked_1',
    commandHash,
    outputSequence: 21,
    outputProgress: false,
  })
  recordGlobalTerminalToolContextTelemetry({
    kind: 'terminal_session',
    action: 'write',
    sessionId: 'term_write_blocked_1',
    commandHash,
    outputSequence: 21,
    outputProgress: false,
  })

  setTerminalSessionManagerForChat({
    createSession() {
      throw new Error('unexpected createSession call')
    },
    getSession(sessionId) {
      if (sessionId !== 'term_write_blocked_1') return null
      return {
        id: 'term_write_blocked_1',
        cwd: 'C:\\Users\\example\\Documents\\ADDOM',
        shell: 'powershell',
        shellKind: 'powershell',
        cols: 120,
        rows: 40,
        status: 'running',
        outputSequence: 21,
        policy: {
          type: 'terminal_session_policy_v1',
          laterWritesStayBoundToSession: true,
          resolvedCwd: 'C:\\Users\\example\\Documents\\ADDOM',
          requestedShell: 'powershell',
          resolvedShell: 'powershell',
          cols: 120,
          rows: 40,
        },
      }
    },
    writeSession() {
      writeSessionCalled = true
      throw new Error('unexpected writeSession call')
    },
  })

  const result = await executeApprovedToolStep({
    tc: { name: 'terminal_session_write' },
    toolInput: {
      sessionId: 'term_write_blocked_1',
      data: repeatedCommand,
    },
    projectFolder: 'C:\\Users\\example\\Documents\\ADDOM',
    activeThreadId: 'thread_1',
    activeTurnId: 'turn_1',
    loop: {
      abortController: new AbortController(),
      cancelled: false,
    },
    helpers: {
      takeShellWriteSnapshot: async () => null,
      detectShellWriteArtifactChanges: async () => [],
      executeOpenAILocalRuntimeTool: async () => {
        throw new Error('unexpected openai local runtime execution')
      },
      isOpenAILocalRuntimeToolName: () => false,
      executeTool: async () => {
        throw new Error('unexpected generic tool execution')
      },
      executeProviderNativeToolCall: async () => null,
      resolveToolWriteArtifactMeta: async () => null,
      buildMissingDependencyInstallHint: () => '',
      isAbortError: () => false,
    },
  })

  assert.equal(writeSessionCalled, false)
  assert.equal(result.isError, true)
  assert.match(result.result || '', /Terminal loop guard blocked terminal_session_write/i)
  assert.match(result.result || '', /Inspect the terminal state or send a different command instead of repeating the same write/i)
})

test('executeApprovedToolStep preserves full_access for host-scoped terminal sessions', async () => {
  const createCalls = []

  setTerminalSessionManagerForChat({
    createSession({ cwd, shell, cols, rows, envOverrides, policy }) {
      createCalls.push({ cwd, shell, cols, rows, envOverrides, policy })
      return {
        session: {
          id: 'term_host_1',
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

  const result = await executeApprovedToolStep({
    tc: { name: 'terminal_session_open' },
    toolInput: {
      cwd: '..',
      shell: 'default',
      cols: 100,
      rows: 30,
    },
    projectFolder: 'C:\\Users\\example\\Documents\\ADDOM',
    permissionMode: 'full_access',
    activeThreadId: 'thread_host_1',
    activeTurnId: 'turn_host_1',
    loop: {
      abortController: new AbortController(),
      cancelled: false,
    },
    helpers: {
      takeShellWriteSnapshot: async () => null,
      detectShellWriteArtifactChanges: async () => [],
      executeOpenAILocalRuntimeTool: async () => {
        throw new Error('unexpected openai local runtime execution')
      },
      isOpenAILocalRuntimeToolName: () => false,
      executeTool: async () => {
        throw new Error('unexpected generic tool execution')
      },
      executeProviderNativeToolCall: async () => null,
      resolveToolWriteArtifactMeta: async () => null,
      buildMissingDependencyInstallHint: () => '',
      isAbortError: () => false,
    },
  })

  assert.equal(result.isError, false)
  assert.equal(createCalls.length, 1)
  assert.equal(createCalls[0].policy?.policyDecision, 'allow')
  assert.equal(createCalls[0].policy?.hostAccessRequired, true)
  assert.equal(createCalls[0].policy?.profileHint, 'host_full_access')
  assert.equal(createCalls[0].cwd, 'C:\\Users\\example\\Documents')
})

test('listVisibleTerminalSessionsForChat reports lock state and reusable state separately', () => {
  const sessions = [
    {
      id: 'term_user_1',
      threadId: 'thread_1',
      controlOwner: 'user',
      status: 'running',
      cwd: 'C:\\Users\\example\\Documents\\ADDOM',
      shell: 'powershell',
      shellKind: 'powershell',
      outputSequence: 17,
      updatedAt: 300,
      policy: {
        type: 'terminal_session_policy_v1',
        laterWritesStayBoundToSession: true,
        resolvedCwd: 'C:\\Users\\example\\Documents\\ADDOM',
        requestedShell: 'powershell',
        resolvedShell: 'powershell',
      },
    },
    {
      id: 'term_ai_1',
      threadId: 'thread_1',
      controlOwner: 'model',
      status: 'running',
      cwd: 'C:\\Users\\example\\Documents\\ADDOM',
      shell: 'powershell',
      shellKind: 'powershell',
      outputSequence: 42,
      updatedAt: 200,
      policy: {
        type: 'terminal_session_policy_v1',
        laterWritesStayBoundToSession: true,
        resolvedCwd: 'C:\\Users\\example\\Documents\\ADDOM',
        requestedShell: 'powershell',
        resolvedShell: 'powershell',
      },
    },
    {
      id: 'term_other_1',
      threadId: 'thread_2',
      controlOwner: 'model',
      status: 'running',
      cwd: 'C:\\Users\\example\\Documents\\ADDOM',
      shell: 'powershell',
      shellKind: 'powershell',
      outputSequence: 99,
      updatedAt: 500,
      policy: {
        type: 'terminal_session_policy_v1',
        laterWritesStayBoundToSession: true,
        resolvedCwd: 'C:\\Users\\example\\Documents\\ADDOM',
        requestedShell: 'powershell',
        resolvedShell: 'powershell',
      },
    },
  ]

  setTerminalSessionManagerForChat({
    createSession() {
      throw new Error('unexpected createSession call')
    },
    listSessions() {
      return sessions
    },
    getSession(sessionId) {
      return sessions.find((session) => session.id === sessionId) || null
    },
  })

  const visible = listVisibleTerminalSessionsForChat({
    projectFolder: 'C:\\Users\\example\\Documents\\ADDOM',
    permissionMode: 'ask',
    activeThreadId: 'thread_1',
  })

  assert.deepEqual(visible, [
    {
      sessionId: 'term_user_1',
      sessionTitle: '',
      cwd: 'C:\\Users\\example\\Documents\\ADDOM',
      shell: 'powershell',
      shellKind: 'powershell',
      outputSequence: 17,
      focusedSurface: 'chat_dock',
      controlOwner: 'user',
      owner: 'user',
      threadId: 'thread_1',
      status: 'running',
      access: 'locked_by_user',
      attachAllowed: false,
      suggestedUse: 'visible only until the user hands it back to AI',
    },
    {
      sessionId: 'term_ai_1',
      sessionTitle: '',
      cwd: 'C:\\Users\\example\\Documents\\ADDOM',
      shell: 'powershell',
      shellKind: 'powershell',
      outputSequence: 42,
      focusedSurface: 'chat_dock',
      controlOwner: 'model',
      owner: 'model',
      threadId: 'thread_1',
      status: 'running',
      access: 'ai_reusable',
      attachAllowed: true,
      suggestedUse: 'reuse this session for the ongoing interactive workflow',
    },
  ])
})

test('executeApprovedToolStep denies terminal snapshot reads while the user controls the session', async () => {
  let readSnapshotCalled = false

  setTerminalSessionManagerForChat({
    createSession() {
      throw new Error('unexpected createSession call')
    },
    getSession(sessionId) {
      if (sessionId !== 'term_locked_1') return null
      return {
        id: 'term_locked_1',
        threadId: 'thread_1',
        controlOwner: 'user',
        status: 'running',
        cwd: 'C:\\Users\\example\\Documents\\ADDOM',
        shell: 'powershell',
        shellKind: 'powershell',
        cols: 120,
        rows: 40,
        outputSequence: 18,
        policy: {
          type: 'terminal_session_policy_v1',
          laterWritesStayBoundToSession: true,
          resolvedCwd: 'C:\\Users\\example\\Documents\\ADDOM',
          requestedShell: 'powershell',
          resolvedShell: 'powershell',
        },
      }
    },
    readSessionSnapshot() {
      readSnapshotCalled = true
      throw new Error('unexpected readSessionSnapshot call')
    },
  })

  const result = await executeApprovedToolStep({
    tc: { name: 'terminal_session_read_snapshot' },
    toolInput: {
      sessionId: 'term_locked_1',
      sinceSequence: 0,
      maxChars: 256,
      mode: 'buffer_tail',
    },
    projectFolder: 'C:\\Users\\example\\Documents\\ADDOM',
    activeThreadId: 'thread_1',
    activeTurnId: 'turn_1',
    loop: {
      abortController: new AbortController(),
      cancelled: false,
    },
    helpers: {
      takeShellWriteSnapshot: async () => null,
      detectShellWriteArtifactChanges: async () => [],
      executeOpenAILocalRuntimeTool: async () => {
        throw new Error('unexpected openai local runtime execution')
      },
      isOpenAILocalRuntimeToolName: () => false,
      executeTool: async () => {
        throw new Error('unexpected generic tool execution')
      },
      executeProviderNativeToolCall: async () => null,
      resolveToolWriteArtifactMeta: async () => null,
      buildMissingDependencyInstallHint: () => '',
      isAbortError: () => false,
    },
  })

  assert.equal(readSnapshotCalled, false)
  assert.equal(result.isError, true)
  assert.match(result.result || '', /policy denied terminal_session_read_snapshot/i)
})
