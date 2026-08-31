import test from 'node:test'
import assert from 'node:assert/strict'

import {
  TERMINAL_SESSION_DEFAULT_ROLLOUT_POLICY,
  TERMINAL_SESSION_DISABLE_ENV_NAME,
  TERMINAL_SESSION_ROLLOUT_ENV_NAME,
  probeTerminalSessionRuntimeHealth,
  runNodePtyHealthCheck,
} from '../../src/main/tools/terminal-session-runtime-health.mjs'

test('terminal runtime health reports disabled when explicitly gated by env', async () => {
  const result = await probeTerminalSessionRuntimeHealth({
    env: { [TERMINAL_SESSION_DISABLE_ENV_NAME]: '1' },
  })

  assert.equal(result.status, 'disabled')
  assert.equal(result.reason, 'disabled_by_env')
  assert.equal(result.disabledBy, TERMINAL_SESSION_DISABLE_ENV_NAME)
  assert.equal(result.rollout?.policy, TERMINAL_SESSION_DEFAULT_ROLLOUT_POLICY)
})

test('terminal runtime health reports disabled on unsupported platforms', async () => {
  const result = await probeTerminalSessionRuntimeHealth({
    platform: 'freebsd',
    arch: 'x64',
    env: {},
  })

  assert.equal(result.status, 'disabled')
  assert.equal(result.reason, 'platform_not_supported')
  assert.equal(result.rollout?.policy, TERMINAL_SESSION_DEFAULT_ROLLOUT_POLICY)
})

test('terminal runtime health applies the default windows-first rollout gate on non-windows targets', async () => {
  const result = await probeTerminalSessionRuntimeHealth({
    platform: 'darwin',
    arch: 'arm64',
    env: {},
  })

  assert.equal(result.status, 'disabled')
  assert.equal(result.reason, 'rollout_platform_not_enabled')
  assert.equal(result.rollout?.policy, TERMINAL_SESSION_DEFAULT_ROLLOUT_POLICY)
  assert.equal(result.rollout?.status, 'gated')
  assert.equal(result.rollout?.platformEnabled, false)
  assert.deepEqual(result.rollout?.allowedPlatforms, ['win32'])
})

test('terminal runtime health can disable the subsystem through the explicit rollout flag', async () => {
  const result = await probeTerminalSessionRuntimeHealth({
    platform: 'win32',
    arch: 'x64',
    env: { [TERMINAL_SESSION_ROLLOUT_ENV_NAME]: 'off' },
  })

  assert.equal(result.status, 'disabled')
  assert.equal(result.reason, 'disabled_by_rollout_policy')
  assert.equal(result.rollout?.policy, 'off')
  assert.equal(result.rollout?.status, 'disabled')
})

test('terminal runtime health reports supported when node-pty load and probe both succeed', async () => {
  const result = await probeTerminalSessionRuntimeHealth({
    env: {},
    platform: 'win32',
    arch: 'x64',
    loadNodePty: () => ({
      nodePty: { spawn: () => null },
      packageVersion: '1.1.0',
      artifacts: [{ id: 'pty_node', present: true, path: 'C:\\node-pty\\pty.node', candidates: [] }],
    }),
    runHealthCheck: async () => ({
      ok: true,
      shell: 'cmd.exe',
      shellKind: 'cmd',
      cwd: 'C:\\repo',
      marker: 'ADDOM_TERMINAL_PTY_OK_test',
      output: 'ADDOM_TERMINAL_PTY_OK_test\r\n',
      exitCode: 0,
      exitSignal: null,
      durationMs: 12,
    }),
  })

  assert.equal(result.status, 'supported')
  assert.equal(result.reason, 'pty_spawn_ok')
  assert.equal(result.dependency.version, '1.1.0')
  assert.equal(result.probe.shell, 'cmd.exe')
  assert.equal(result.rollout?.policy, TERMINAL_SESSION_DEFAULT_ROLLOUT_POLICY)
  assert.equal(result.rollout?.status, 'enabled')
  assert.equal(result.rollout?.platformEnabled, true)
  assert.deepEqual(result.availableShells.map((shell) => shell.id), ['default'])
})

test('terminal runtime health probe enables ConPTY DLL on Windows spawns', async () => {
  const spawnCalls = []
  const fakeTerminal = {
    onData(listener) {
      queueMicrotask(() => listener('ADDOM_TERMINAL_PTY_OK_test\r\n'))
      return { dispose() {} }
    },
    onExit(listener) {
      queueMicrotask(() => listener({ exitCode: 0, signal: null }))
      return { dispose() {} }
    },
    on() {},
    removeListener() {},
    kill() {},
  }

  const result = await runNodePtyHealthCheck(
    {
      spawn(file, args, options) {
        spawnCalls.push({ file, args, options })
        return fakeTerminal
      },
    },
    {
      platform: 'win32',
      env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
      cwd: 'C:\\repo',
      timeoutMs: 1_000,
      marker: 'ADDOM_TERMINAL_PTY_OK_test',
    },
  )

  assert.equal(result.ok, true)
  assert.equal(spawnCalls.length, 1)
  assert.equal(spawnCalls[0].file, 'C:\\Windows\\System32\\cmd.exe')
  assert.deepEqual(spawnCalls[0].args, ['/d', '/c', 'echo ADDOM_TERMINAL_PTY_OK_test'])
  assert.equal(spawnCalls[0].options.useConpty, true)
  assert.equal(spawnCalls[0].options.useConptyDll, true)
})

test('terminal runtime health classifies native load failures explicitly', async () => {
  const result = await probeTerminalSessionRuntimeHealth({
    env: {},
    loadNodePty: () => {
      const error = new Error('The specified module could not be found.')
      error.code = 'ERR_DLOPEN_FAILED'
      throw error
    },
  })

  assert.equal(result.status, 'failed')
  assert.equal(result.reason, 'node_pty_native_load_failed')
  assert.match(result.error, /module could not be found/i)
  assert.equal(result.rollout?.policy, TERMINAL_SESSION_DEFAULT_ROLLOUT_POLICY)
})
