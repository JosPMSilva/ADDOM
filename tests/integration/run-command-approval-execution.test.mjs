import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveRunCommandApprovalExecution } from '../../src/main/chat/run-command-approval-execution.mjs'
import { runCommand } from '../../src/main/tools/command-tools-runner.mjs'

test('resolveRunCommandApprovalExecution maps host fallback approval to host execution override', () => {
  const settings = {
    installSandboxEnabled: true,
    allowHostInstalls: true,
    preferredBackend: 'docker',
  }

  const out = resolveRunCommandApprovalExecution({
    toolName: 'run_command',
    approvalPolicy: {
      policyDecision: 'route_to_sandbox',
      executionTarget: 'install_sandbox',
      elevationRequired: false,
      sandbox: { backend: 'none', available: false, reason: 'Docker not running' },
    },
    approvalMeta: {
      runCommand: { hostInstallFallback: true },
    },
    commandSafetySettings: settings,
  })

  assert.equal(out.hostInstallFallbackApproved, true)
  assert.equal(out.hostFullAccessApproved, true)
  assert.equal(out.effectiveCommandSafety.installSandboxEnabled, false)
  assert.deepEqual(out.commandSafetyOverride, {
    disableInstallSandboxForThisCommand: true,
    hostInstallFallbackApproved: true,
    hostFullAccessApproved: true,
    allowHostFullAccessForThisCommand: true,
  })
  assert.equal(out.runCommandPolicyActivityMeta.runCommandPolicy.executionTarget, 'host')
  assert.equal(out.runCommandPolicyActivityMeta.runCommandPolicy.hostInstallFallbackApproved, true)
  assert.equal(out.runCommandPolicyActivityMeta.runCommandPolicy.hostFullAccessApproved, true)
  assert.equal(out.runCommandPolicyActivityMeta.runCommandPolicy.hostApprovalKind, 'install_fallback')
  assert.equal(out.runCommandPolicyActivityMeta.runCommandPolicy.sandbox.available, false)
})

test('resolveRunCommandApprovalExecution preserves policy execution target when no host fallback was approved', () => {
  const settings = { installSandboxEnabled: true, preferredBackend: 'docker' }
  const out = resolveRunCommandApprovalExecution({
    toolName: 'run_command',
    approvalPolicy: {
      policyDecision: 'route_to_sandbox',
      executionTarget: 'install_sandbox',
      elevationRequired: false,
    },
    approvalMeta: null,
    commandSafetySettings: settings,
  })

  assert.equal(out.hostInstallFallbackApproved, false)
  assert.equal(out.hostFullAccessApproved, false)
  assert.deepEqual(out.effectiveCommandSafety, settings)
  assert.equal(out.commandSafetyOverride, null)
  assert.equal(out.runCommandPolicyActivityMeta.runCommandPolicy.executionTarget, 'install_sandbox')
})

test('resolveRunCommandApprovalExecution maps explicit host_full_access approval to host execution override', () => {
  const out = resolveRunCommandApprovalExecution({
    toolName: 'run_command',
    approvalPolicy: {
      policyDecision: 'require_elevation',
      executionTarget: 'host',
      elevationRequired: true,
    },
    approvalMeta: {
      runCommand: { hostFullAccess: true },
    },
    commandSafetySettings: { defaultExecutionProfile: 'workspace_safe' },
  })

  assert.equal(out.hostInstallFallbackApproved, false)
  assert.equal(out.hostFullAccessApproved, true)
  assert.deepEqual(out.commandSafetyOverride, {
    hostFullAccessApproved: true,
    allowHostFullAccessForThisCommand: true,
  })
  assert.equal(out.runCommandPolicyActivityMeta.runCommandPolicy.executionTarget, 'host')
  assert.equal(out.runCommandPolicyActivityMeta.runCommandPolicy.hostFullAccessApproved, true)
  assert.equal(out.runCommandPolicyActivityMeta.runCommandPolicy.hostApprovalKind, 'host_full_access')
})

test('resolveRunCommandApprovalExecution preserves turn-scoped host_full_access metadata for reuse/audit', () => {
  const out = resolveRunCommandApprovalExecution({
    toolName: 'run_command',
    approvalPolicy: {
      policyDecision: 'require_elevation',
      executionTarget: 'host',
      elevationRequired: true,
    },
    approvalMeta: {
      runCommand: { hostFullAccess: true, hostFullAccessThisTurn: true, reusedFromTurnApproval: true },
    },
    commandSafetySettings: { defaultExecutionProfile: 'workspace_safe' },
  })

  assert.equal(out.hostFullAccessApproved, true)
  assert.equal(out.hostFullAccessThisTurnApproved, true)
  assert.equal(out.hostFullAccessReusedFromTurnApproval, true)
  assert.equal(out.runCommandPolicyActivityMeta.runCommandPolicy.hostFullAccessThisTurnApproved, true)
  assert.equal(out.runCommandPolicyActivityMeta.runCommandPolicy.hostFullAccessReusedFromTurnApproval, true)
  assert.equal(out.runCommandPolicyActivityMeta.runCommandPolicy.hostApprovalKind, 'host_full_access_turn')
})

test('resolveRunCommandApprovalExecution maps explicit WSL compatibility approval to trusted sandbox override', () => {
  const out = resolveRunCommandApprovalExecution({
    toolName: 'run_command',
    approvalPolicy: {
      policyDecision: 'route_to_sandbox',
      executionTarget: 'install_sandbox',
      elevationRequired: false,
      sandbox: { backend: 'wsl', available: true, requiresCompatibilityApproval: true },
    },
    approvalMeta: {
      runCommand: { wslCompatibility: true },
    },
    commandSafetySettings: { installSandboxEnabled: true, preferredBackend: 'wsl' },
  })

  assert.equal(out.wslCompatibilityApproved, true)
  assert.deepEqual(out.commandSafetyOverride, {
    wslCompatibilityApproved: true,
  })
  assert.equal(out.runCommandPolicyActivityMeta.runCommandPolicy.wslCompatibilityApproved, true)
  assert.equal(out.runCommandPolicyActivityMeta.runCommandPolicy.executionTarget, 'install_sandbox')
})

test('resolveRunCommandApprovalExecution returns no run_command overrides for non-run_command tools', () => {
  const out = resolveRunCommandApprovalExecution({
    toolName: 'write_file',
    approvalPolicy: { policyDecision: 'allow' },
    approvalMeta: { runCommand: { hostInstallFallback: true } },
    commandSafetySettings: { installSandboxEnabled: true },
  })

  assert.equal(out.hostInstallFallbackApproved, false)
  assert.deepEqual(out.runCommandPolicyActivityMeta, {})
  assert.equal(out.commandSafetyOverride, null)
  assert.equal(out.fileSystemHostFullAccess, false)
})

test('resolveRunCommandApprovalExecution grants host file access after approved external file prompt', () => {
  const out = resolveRunCommandApprovalExecution({
    toolName: 'read_file',
    approvalPolicy: {
      type: 'file_tool_policy_v1',
      hostAccessRequired: true,
      externalPaths: [process.platform === 'win32' ? 'C:\\outside.txt' : '/tmp/outside.txt'],
    },
    approvalMeta: null,
    approvalDecision: 'approved',
    permissionMode: 'ask',
    commandSafetySettings: {},
  })

  assert.equal(out.fileSystemHostFullAccess, true)
  assert.equal(out.commandSafetyOverride, null)
})

test('resolveRunCommandApprovalExecution grants host file access automatically in full_access mode', () => {
  const out = resolveRunCommandApprovalExecution({
    toolName: 'read_file',
    approvalPolicy: {
      type: 'file_tool_policy_v1',
      hostAccessRequired: true,
      externalPaths: [process.platform === 'win32' ? 'C:\\outside.txt' : '/tmp/outside.txt'],
    },
    approvalMeta: {
      fileSystem: { hostFullAccess: true },
    },
    approvalDecision: 'approved',
    permissionMode: 'full_access',
    commandSafetySettings: {},
  })

  assert.equal(out.fileSystemHostFullAccess, true)
})

test('resolveRunCommandApprovalExecution records auto-approval source metadata for run_command', () => {
  const out = resolveRunCommandApprovalExecution({
    toolName: 'run_command',
    approvalPolicy: {
      policyDecision: 'allow',
      executionTarget: 'host',
      elevationRequired: false,
    },
    approvalMeta: {
      runCommand: { hostFullAccess: true },
    },
    approvalPromptSource: 'permission_mode_full_access',
    approvalPromptAction: 'approve',
    approvalPromptShown: false,
    commandSafetySettings: {},
  })

  assert.equal(out.runCommandPolicyActivityMeta.runCommandPolicy.autoApprovedBy, 'permission_mode_full_access')
})

test('resolveRunCommandApprovalExecution expands host command safety in full_access mode', () => {
  const out = resolveRunCommandApprovalExecution({
    toolName: 'run_command',
    approvalPolicy: {
      policyDecision: 'require_elevation',
      executionTarget: 'host',
      elevationRequired: true,
    },
    approvalMeta: {
      runCommand: { hostFullAccess: true },
    },
    permissionMode: 'full_access',
    commandSafetySettings: {
      allowGlobalSystemInstalls: false,
      allowOutsideWorkspaceMutation: false,
      allowPrivilegedHostOps: false,
      allowPrivateNetworkTargets: false,
    },
  })

  assert.equal(out.effectiveCommandSafety.allowGlobalSystemInstalls, true)
  assert.equal(out.effectiveCommandSafety.allowOutsideWorkspaceMutation, true)
  assert.equal(out.effectiveCommandSafety.allowPrivilegedHostOps, true)
  assert.equal(out.effectiveCommandSafety.allowPrivateNetworkTargets, true)
})

test('main-process host install fallback path composes approval resolution with runCommand host execution override', async () => {
  const resolved = resolveRunCommandApprovalExecution({
    toolName: 'run_command',
    approvalPolicy: {
      policyDecision: 'route_to_sandbox',
      executionTarget: 'install_sandbox',
      elevationRequired: true,
      sandbox: { backend: 'none', available: false, reason: 'Docker not running' },
    },
    approvalMeta: { runCommand: { hostInstallFallback: true } },
    commandSafetySettings: { installSandboxEnabled: true, preferredBackend: 'docker' },
  })

  let sandboxCalled = false
  let hostCalled = false

  const output = await runCommand(process.cwd(), {
    command: 'npm install vite',
    shell: 'powershell',
    cwd: '.',
  }, {
    commandSafety: resolved.effectiveCommandSafety,
    commandSafetyOverride: resolved.commandSafetyOverride,
    installSandboxAdapter: {
      async detectBackend() {
        sandboxCalled = true
        return { available: true, backend: 'docker' }
      },
      async run() {
        sandboxCalled = true
        return 'sandbox path'
      },
    },
    async runWithCandidateImpl() {
      hostCalled = true
      return 'host path after explicit fallback approval'
    },
  })

  assert.equal(sandboxCalled, false)
  assert.equal(hostCalled, true)
  assert.equal(output, 'host path after explicit fallback approval')
})
