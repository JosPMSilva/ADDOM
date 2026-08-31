import test from 'node:test'
import assert from 'node:assert/strict'

async function withToolStore(testFn) {
  const prevWindow = globalThis.window
  const respondCalls = []
  globalThis.window = {
    addom: {
      tool: {
        respond: (...args) => {
          respondCalls.push(args)
        },
      },
    },
  }

  try {
    const mod = await import(`../../src/renderer/store/useToolStore.js?hostFallback=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
    const store = mod.default
    if (typeof store?.setState === 'function' && typeof store?.getInitialState === 'function') {
      store.setState(store.getInitialState(), true)
    } else if (typeof store?.setState === 'function') {
      store.setState({ pendingByThreadId: {}, history: [] }, true)
    }
    return await testFn({ store, respondCalls })
  } finally {
    globalThis.window = prevWindow
  }
}

test('approveHostInstallFallback sends explicit one-shot host fallback metadata and clears pending approval', async () => {
  await withToolStore(async ({ store, respondCalls }) => {
    store.getState().setPending({
      approvalId: 'approval_host_fallback_1',
      threadId: 'thread_host_fallback',
      responseChannel: 'tool:approval-response:approval_host_fallback_1',
      toolName: 'run_command',
      toolInput: { command: 'npm install vite', cwd: '.', shell: 'powershell' },
      meta: { label: 'Run Command', risk: 'high' },
      policy: {
        type: 'run_command_policy_v1',
        commandClass: 'dependency_install_project',
        policyDecision: 'route_to_sandbox',
        executionTarget: 'install_sandbox',
        install: { isInstallLike: true, isGlobalOrSystemInstall: false, ecosystem: 'npm', packagesHint: ['vite'] },
        sandbox: { backend: 'none', available: false, fallbackHostAvailable: true },
      },
    })

    store.getState().approveHostInstallFallback('approval_host_fallback_1')

    assert.equal(respondCalls.length, 1)
    const [approvalId, decision, responseChannel, denyReason, approvalMeta] = respondCalls[0]
    assert.equal(approvalId, 'approval_host_fallback_1')
    assert.equal(decision, 'approved')
    assert.equal(responseChannel, 'tool:approval-response:approval_host_fallback_1')
    assert.equal(denyReason, '')
    assert.deepEqual(approvalMeta, {
      runCommand: {
        hostInstallFallback: true,
      },
    })
    assert.equal(store.getState().getPendingForThread('thread_host_fallback'), null)
  })
})

test('approveHostFullAccess sends explicit one-shot host_full_access metadata and clears pending approval', async () => {
  await withToolStore(async ({ store, respondCalls }) => {
    store.getState().setPending({
      approvalId: 'approval_host_full_access_1',
      threadId: 'thread_host_full_access',
      responseChannel: 'tool:approval-response:approval_host_full_access_1',
      toolName: 'run_command',
      toolInput: { command: 'curl https://example.com', cwd: '.', shell: 'powershell' },
      meta: { label: 'Run Command', risk: 'high' },
      policy: {
        type: 'run_command_policy_v1',
        commandClass: 'network_fetch_non_install',
        policyDecision: 'require_elevation',
        executionTarget: 'host',
        elevationRequired: true,
      },
    })

    store.getState().approveHostFullAccess('approval_host_full_access_1')

    assert.equal(respondCalls.length, 1)
    const [approvalId, decision, responseChannel, denyReason, approvalMeta] = respondCalls[0]
    assert.equal(approvalId, 'approval_host_full_access_1')
    assert.equal(decision, 'approved')
    assert.equal(responseChannel, 'tool:approval-response:approval_host_full_access_1')
    assert.equal(denyReason, '')
    assert.deepEqual(approvalMeta, {
      runCommand: {
        hostFullAccess: true,
      },
    })
    assert.equal(store.getState().getPendingForThread('thread_host_full_access'), null)
  })
})

test('approveHostFullAccessThisTurn sends explicit turn-scoped host_full_access metadata and clears pending approval', async () => {
  await withToolStore(async ({ store, respondCalls }) => {
    store.getState().setPending({
      approvalId: 'approval_host_full_access_turn_1',
      threadId: 'thread_host_full_access_turn',
      responseChannel: 'tool:approval-response:approval_host_full_access_turn_1',
      toolName: 'run_command',
      toolInput: { command: 'curl https://example.com', cwd: '.', shell: 'powershell' },
      meta: { label: 'Run Command', risk: 'high' },
      policy: {
        type: 'run_command_policy_v1',
        commandClass: 'network_fetch_non_install',
        policyDecision: 'require_elevation',
        executionTarget: 'host',
        elevationRequired: true,
      },
    })

    store.getState().approveHostFullAccessThisTurn('approval_host_full_access_turn_1')

    assert.equal(respondCalls.length, 1)
    const [approvalId, decision, responseChannel, denyReason, approvalMeta] = respondCalls[0]
    assert.equal(approvalId, 'approval_host_full_access_turn_1')
    assert.equal(decision, 'approved')
    assert.equal(responseChannel, 'tool:approval-response:approval_host_full_access_turn_1')
    assert.equal(denyReason, '')
    assert.deepEqual(approvalMeta, {
      runCommand: {
        hostFullAccess: true,
        hostFullAccessThisTurn: true,
      },
    })
    assert.equal(store.getState().getPendingForThread('thread_host_full_access_turn'), null)
  })
})
