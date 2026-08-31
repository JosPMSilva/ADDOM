import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createTrustedCommandSafetyOverride,
  runCommand,
} from '../../src/main/tools/command-tools-runner.mjs'

test('runCommand blocks external network fetch unless explicit host_full_access override is provided', async () => {
  let hostRunnerInvoked = false

  await assert.rejects(
    () => runCommand(process.cwd(), {
      command: 'curl https://example.com/file.txt',
      shell: 'powershell',
      cwd: '.',
    }, {
      commandSafety: {},
      async runWithCandidateImpl() {
        hostRunnerInvoked = true
        return 'unexpected host execution'
      },
    }),
    (err) => {
      assert.match(String(err?.message || ''), /host_full_access approval/i)
      return true
    },
  )
  assert.equal(hostRunnerInvoked, false)

  const output = await runCommand(process.cwd(), {
    command: 'curl https://example.com/file.txt',
    shell: 'powershell',
    cwd: '.',
  }, {
    commandSafety: {},
    commandSafetyOverride: createTrustedCommandSafetyOverride({
      hostFullAccessApproved: true,
      allowHostFullAccessForThisCommand: true,
    }),
    async runWithCandidateImpl(_candidate, ctx) {
      hostRunnerInvoked = true
      assert.equal(ctx.command, 'curl https://example.com/file.txt')
      return 'host network fetch executed after explicit elevation'
    },
  })

  assert.equal(output, 'host network fetch executed after explicit elevation')
  assert.equal(hostRunnerInvoked, true)
})

test('runCommand rejects privileged host overrides from untrusted plain objects', async () => {
  await assert.rejects(
    () => runCommand(process.cwd(), {
      command: 'curl https://example.com/file.txt',
      shell: 'powershell',
      cwd: '.',
    }, {
      commandSafety: {},
      commandSafetyOverride: {
        hostFullAccessApproved: true,
        allowHostFullAccessForThisCommand: true,
      },
    }),
    /Privileged command safety overrides can only be set by the approval flow/i,
  )
})

test('runCommand blocks resolved external path access without explicit host_full_access override', async () => {
  let hostRunnerInvoked = false
  const externalPath = process.platform === 'win32'
    ? 'C:\\Windows\\System32\\drivers\\etc\\hosts'
    : '/etc/hosts'
  const command = process.platform === 'win32'
    ? `type "${externalPath}"`
    : `cat "${externalPath}"`
  const shell = process.platform === 'win32' ? 'powershell' : 'bash'

  await assert.rejects(
    () => runCommand(process.cwd(), { command, shell, cwd: '.' }, {
      commandSafety: {},
      async runWithCandidateImpl() {
        hostRunnerInvoked = true
        return 'unexpected'
      },
    }),
    (err) => {
      assert.match(String(err?.message || ''), /host_full_access approval/i)
      return true
    },
  )

  assert.equal(hostRunnerInvoked, false)
})

test('runCommand blocks global installs unless explicit host_full_access override is provided', async () => {
  let hostRunnerInvoked = false
  await assert.rejects(
    () => runCommand(process.cwd(), {
      command: 'npm install -g typescript',
      shell: 'powershell',
      cwd: '.',
    }, {
      commandSafety: {},
      async runWithCandidateImpl() {
        hostRunnerInvoked = true
        return 'unexpected global install'
      },
    }),
    (err) => {
      assert.match(String(err?.message || ''), /blocked by command safety policy/i)
      return true
    },
  )
  assert.equal(hostRunnerInvoked, false)

  const output = await runCommand(process.cwd(), {
    command: 'npm install -g typescript',
    shell: 'powershell',
    cwd: '.',
  }, {
    commandSafety: { allowGlobalSystemInstalls: true },
    commandSafetyOverride: createTrustedCommandSafetyOverride({
      hostFullAccessApproved: true,
      allowHostFullAccessForThisCommand: true,
    }),
    async runWithCandidateImpl() {
      hostRunnerInvoked = true
      return 'global install executed after explicit host_full_access'
    },
  })

  assert.equal(output, 'global install executed after explicit host_full_access')
  assert.equal(hostRunnerInvoked, true)
})

test('runCommand ignores removed default host_full_access profile labels', async () => {
  let hostRunnerInvoked = false

  await assert.rejects(
    () => runCommand(process.cwd(), {
      command: 'curl https://example.com/file.txt',
      shell: 'powershell',
      cwd: '.',
    }, {
      commandSafety: { defaultExecutionProfile: 'host_full_access' },
      async runWithCandidateImpl() {
        hostRunnerInvoked = true
        return 'unexpected host execution'
      },
    }),
    (err) => {
      assert.match(String(err?.message || ''), /host_full_access approval/i)
      return true
    },
  )

  assert.equal(hostRunnerInvoked, false)
})

test('runCommand bypasses install sandbox entirely for project installs when host_full_access is already approved', async () => {
  let hostRunnerInvoked = false
  let sandboxRunnerInvoked = false

  const output = await runCommand(process.cwd(), {
    command: 'npm install vite',
    shell: 'powershell',
    cwd: '.',
  }, {
    commandSafety: {
      installSandboxEnabled: true,
      preferredBackend: 'docker',
    },
    commandSafetyOverride: createTrustedCommandSafetyOverride({
      hostFullAccessApproved: true,
      allowHostFullAccessForThisCommand: true,
    }),
    installSandboxAdapter: {
      async detectBackend() {
        return {
          backend: 'docker',
          available: false,
          reason: 'Docker not available in test',
        }
      },
      async run() {
        sandboxRunnerInvoked = true
        return 'sandbox path'
      },
    },
    async runWithCandidateImpl() {
      hostRunnerInvoked = true
      return 'host install path executed'
    },
  })

  assert.equal(sandboxRunnerInvoked, false)
  assert.equal(hostRunnerInvoked, true)
  assert.equal(output, 'host install path executed')
})
