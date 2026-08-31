import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-cursor-status-storm-'))
process.env.NODE_ENV = 'test'
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { resolveVaultGetProvidersResponse } = await import('../../src/main/ipc-handlers/vault-handler-helpers.mjs')
const { createCursorAgentChatExecutor } = await import('../../src/main/cursor-agent/cursor-agent-chat-execution.mjs')
const {
  createCursorAgentProcessRunner,
  killAllTrackedCursorAgentProcesses,
  listTrackedCursorAgentPids,
  __resetTrackedCursorAgentPidsForTests,
} = await import('../../src/main/cursor-agent/cursor-agent-process.mjs')
const { buildProviderModelSelectorViewModel } = await import('../../src/renderer/components/chat/provider-model-selector-view-model.mjs')

test.after(() => {
  __resetTrackedCursorAgentPidsForTests()
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort */ }
})

function readSource(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), 'utf8')
}

function vaultDeps(overrides = {}) {
  return {
    listConfiguredProviders: () => ({ cursor: true }),
    getProviderManifest: async () => [
      { id: 'openai', name: 'OpenAI', type: 'remote' },
      { id: 'anthropic', name: 'Anthropic', type: 'remote' },
    ],
    getSettings: () => ({
      providerAuthSettings: {
        cursor: { authMethod: 'account' },
        openai: { authMethod: 'api_key' },
      },
    }),
    getOpenAIAccountState: () => ({
      sessionSummary: { availability: { supported: false } },
    }),
    getCursorAgentState: () => ({
      runtime: { status: 'runtime_ready', message: 'ready' },
      account: { status: 'authenticated', accountLabel: 'member@example.test' },
    }),
    ...overrides,
  }
}

test('OpenAI session-updated reloads providers only on hasSession credential flips', () => {
  const storeSource = readSource('src/renderer/store/useVaultStore.js')
  assert.match(
    storeSource,
    /onSessionUpdated\(\(sessionSummary\) => \{[\s\S]*?set\(\{[\s\S]*?openAIAccountSession/,
  )
  assert.match(storeSource, /openAIAccountSessionCredentialChanged\(previousSession, nextSession\)/)
  assert.match(
    storeSource,
    /if \(openAIAccountSessionCredentialChanged\(previousSession, nextSession\)\) \{\s*void get\(\)\.loadProviders\(true\)\s*\}/,
  )
  assert.match(storeSource, /loadProvidersInFlight/)
})

test('vault:getProviders still builds a Cursor row via cached auth state deps', async () => {
  let cursorStateCalls = 0
  const providers = await resolveVaultGetProvidersResponse({}, vaultDeps({
    getCursorAgentState: async () => {
      cursorStateCalls += 1
      return {
        runtime: { status: 'runtime_ready', message: 'ready' },
        account: { status: 'authenticated', accountLabel: 'member@example.test' },
      }
    },
  }))
  assert.equal(cursorStateCalls, 1)
  assert.equal(providers.find((provider) => provider.id === 'cursor')?.ready, true)
})

test('api_key Cursor mode does not require a live account status CLI for provider readiness', async () => {
  const deps = vaultDeps({
    listConfiguredProviders: () => ({ cursor: true }),
    getSettings: () => ({ providerAuthSettings: { cursor: { authMethod: 'api_key' } } }),
    getCursorAgentRuntimeState: () => ({
      status: 'runtime_ready',
      message: 'ready',
      commandPath: 'cursor-agent.cmd',
    }),
  })
  delete deps.getCursorAgentState
  const providers = await resolveVaultGetProvidersResponse({}, deps)
  const cursor = providers.find((provider) => provider.id === 'cursor')
  assert.equal(cursor?.ready, true)
  assert.equal(cursor?.hasCredential, true)
})

test('account-auth Cursor that is not logged in drops out of the composer selector', async () => {
  const providers = await resolveVaultGetProvidersResponse({}, vaultDeps({
    listConfiguredProviders: () => ({}),
    getCursorAgentState: () => ({
      runtime: { status: 'runtime_ready', message: 'ready' },
      account: { status: 'unauthenticated', accountLabel: '' },
    }),
  }))
  const cursor = providers.find((provider) => provider.id === 'cursor')
  const selector = buildProviderModelSelectorViewModel({
    providers,
    loaded: true,
    selectedProvider: 'cursor',
    selectedModel: 'cursor-grok-4.5-high-fast',
  })
  assert.equal(cursor?.ready, false)
  assert.equal(selector.activeProvider, null)
})

test('Cursor chat execution force-refreshes auth state before spawning', async () => {
  const calls = []
  const execute = createCursorAgentChatExecutor({
    readSettings: () => ({ providerAuthSettings: { cursor: { authMethod: 'account' } } }),
    authService: {
      getState: async (options = {}) => {
        calls.push(options)
        return {
          runtime: { status: 'runtime_ready', commandPath: 'C:\\runtime\\cursor-agent.cmd' },
          account: { status: 'authenticated', accountLabel: 'Cursor user' },
        }
      },
    },
    processRunner: {
      start: () => ({
        completed: Promise.resolve({ status: 'completed', code: 0, events: [], stderr: '', error: null }),
        cancel: async () => true,
      }),
    },
    touchUsage: () => {},
    sessionRegistry: { get: () => null, set: () => {}, deleteThread: () => 0 },
  })
  await execute({
    mode: 'execute',
    permissionMode: 'full_access',
    projectId: 'project-1',
    threadId: 'thread-1',
    activeProjectPath: 'C:\\repo',
    requestedProjectPath: 'C:\\repo',
    prompt: 'hi',
    model: 'composer-2.5',
    loop: { abortController: new AbortController(), cancelled: false },
    send: () => {},
    persistTimelineEvent: () => {},
    sendTurnState: () => {},
    sendCancelled: () => {},
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.forceRefresh, true)
})

test('stale-session retry cancels the first Cursor process before starting the second', async () => {
  const cancels = []
  const starts = []
  const processRunner = {
    start(options) {
      starts.push(options.sessionId || '')
      const index = starts.length
      return {
        completed: Promise.resolve({
          status: 'failed',
          code: 1,
          events: [],
          stderr: index === 1 ? 'session not found' : '',
          error: index === 1 ? new Error('session not found') : null,
        }),
        cancel: async () => {
          cancels.push(index)
          return true
        },
      }
    },
  }
  const execute = createCursorAgentChatExecutor({
    readSettings: () => ({ providerAuthSettings: { cursor: { authMethod: 'account' } } }),
    authService: {
      getState: async () => ({
        runtime: { status: 'runtime_ready', commandPath: 'C:\\runtime\\cursor-agent.cmd' },
        account: { status: 'authenticated', accountLabel: 'Cursor user' },
      }),
    },
    processRunner,
    touchUsage: () => {},
    sessionRegistry: {
      get: () => ({ sessionId: 'stale-session' }),
      set: () => {},
      deleteThread: () => 1,
    },
  })
  await execute({
    mode: 'execute',
    permissionMode: 'full_access',
    projectId: 'project-1',
    threadId: 'thread-1',
    activeProjectPath: 'C:\\repo',
    requestedProjectPath: 'C:\\repo',
    prompt: 'retry',
    model: 'composer-2.5',
    loop: { abortController: new AbortController(), cancelled: false },
    send: () => {},
    persistTimelineEvent: () => {},
    sendTurnState: () => {},
    sendCancelled: () => {},
  }).catch(() => {})
  assert.equal(starts.length >= 1, true)
  assert.equal(cancels[0], 1)
})

test('Cursor process runner tracks PIDs for quit-time sweep', async () => {
  __resetTrackedCursorAgentPidsForTests()
  let closeHandler = null
  const child = {
    pid: 4242,
    stdout: { setEncoding() {}, on() {} },
    stderr: { setEncoding() {}, on() {} },
    stdin: { end() {} },
    once(event, handler) {
      if (event === 'close') closeHandler = handler
    },
  }
  const runner = createCursorAgentProcessRunner({
    spawnProcess: () => child,
    killProcessTree: async () => {
      closeHandler?.(0, null)
      return true
    },
  })
  const run = runner.start({
    commandPath: 'cursor-agent',
    cwd: 'C:\\repo',
    prompt: 'hi',
  })
  assert.deepEqual(listTrackedCursorAgentPids(), [4242])
  closeHandler?.(0, null)
  await run.completed
  assert.deepEqual(listTrackedCursorAgentPids(), [])

  const run2 = runner.start({
    commandPath: 'cursor-agent',
    cwd: 'C:\\repo',
    prompt: 'hi',
  })
  assert.deepEqual(listTrackedCursorAgentPids(), [4242])
  const killed = []
  await killAllTrackedCursorAgentProcesses({
    killProcessTree: async (pid) => {
      killed.push(pid)
      closeHandler?.(0, null)
      return true
    },
  })
  assert.deepEqual(killed, [4242])
  assert.deepEqual(listTrackedCursorAgentPids(), [])
  await run2.completed
})

test('app quit path sweeps tracked Cursor agent processes', () => {
  const source = readSource('src/main/app-runtime-shutdown.mjs')
  assert.match(source, /killAllTrackedCursorAgentProcesses/)
})

test('Settings login poll must not reload providers on every tick', () => {
  const source = readSource('src/renderer/components/settings/CursorProviderSettingsRow.jsx')
  assert.match(source, /setInterval\(\(\) => \{/)
  assert.doesNotMatch(
    source,
    /setInterval\(\(\) => \{[\s\S]*?refreshCursorState\(\{ refreshProviders: true \}\)/,
  )
  assert.match(source, /refreshCursorState\(\{ refreshProviders: false \}\)|refreshCursorState\(\)/)
  assert.match(source, /void loadProviders\(true\)/)
})

test('OpenAI rate-limit bridge updates refresh account state that emits session-updated', () => {
  const source = readSource('src/main/openai-account/openai-account-auth-service.mjs')
  assert.match(source, /sourceBridge\.on\('account\/rateLimits\/updated',\s*onRateLimitsUpdated\)/)
  assert.match(source, /const onRateLimitsUpdated = \(\) => \{[\s\S]*?void this\.refreshState\(\)/)
})
