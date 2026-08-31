import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_COMMAND_SAFETY,
  normalizeCommandSafety,
} from '../../src/main/settings-command-safety.mjs'

test('normalizeCommandSafety applies defaults and omits legacy command-access state', () => {
  const normalized = normalizeCommandSafety({})
  assert.equal('commandAccessMode' in normalized, false)
  assert.equal('trustedWorkspaceRoots' in normalized, false)
  assert.equal('approvalRules' in normalized, false)
  assert.equal('defaultExecutionProfile' in normalized, false)
  assert.equal('allowHostInstalls' in normalized, false)
  assert.equal(normalized.showDeveloperOptions, DEFAULT_COMMAND_SAFETY.showDeveloperOptions)
  assert.equal(normalized.installSandboxEnabled, DEFAULT_COMMAND_SAFETY.installSandboxEnabled)
  assert.equal(normalized.installSandboxIgnoreScriptsFirstPass, false)
  assert.equal(normalized.preferredBackend, 'auto')
  assert.equal(normalized.sandboxNetworkEnforcementMode, 'strict')
  assert.deepEqual(normalized.registryAllowlist, [])
  assert.deepEqual(normalized.cacheDirs, [])
  assert.equal(normalized.allowGlobalSystemInstalls, false)
  assert.equal(normalized.allowOutsideWorkspaceMutation, false)
  assert.equal(normalized.allowPrivilegedHostOps, false)
  assert.equal(normalized.allowPrivateNetworkTargets, false)
})

test('normalizeCommandSafety normalizes backend and dedupes allowlist/cache entries while dropping legacy execution profile inputs', () => {
  const normalized = normalizeCommandSafety({
    commandAccessMode: 'LIMITED',
    showDeveloperOptions: true,
    defaultExecutionProfile: 'workspace_safe',
    installSandboxEnabled: true,
    allowHostInstalls: true,
    installSandboxIgnoreScriptsFirstPass: true,
    preferredBackend: 'DOCKER',
    sandboxNetworkEnforcementMode: 'STRICT',
    allowGlobalSystemInstalls: true,
    allowOutsideWorkspaceMutation: true,
    allowPrivilegedHostOps: true,
    allowPrivateNetworkTargets: true,
    registryAllowlist: [' registry.npmjs.org ', 'registry.npmjs.org', '', 'pypi.org'],
    cacheDirs: [' C:\\tmp\\npm ', 'C:\\tmp\\npm', 'C:\\tmp\\pip'],
    trustedWorkspaceRoots: [' C:\\Users\\example\\Documents\\ADDOM ', 'C:\\Users\\example\\Documents\\ADDOM', 'C:\\Users\\example\\Documents\\Other'],
    approvalRules: [{ id: 'r1', workspaceRoot: 'C:\\Users\\example\\Documents\\ADDOM', toolName: 'run_command' }],
  })

  assert.equal('commandAccessMode' in normalized, false)
  assert.equal('defaultExecutionProfile' in normalized, false)
  assert.equal('allowHostInstalls' in normalized, false)
  assert.equal(normalized.showDeveloperOptions, true)
  assert.equal(normalized.installSandboxEnabled, true)
  assert.equal(normalized.installSandboxIgnoreScriptsFirstPass, true)
  assert.equal(normalized.preferredBackend, 'docker')
  assert.equal(normalized.sandboxNetworkEnforcementMode, 'strict')
  assert.equal(normalized.allowGlobalSystemInstalls, true)
  assert.equal(normalized.allowOutsideWorkspaceMutation, true)
  assert.equal(normalized.allowPrivilegedHostOps, true)
  assert.equal(normalized.allowPrivateNetworkTargets, true)
  assert.deepEqual(normalized.registryAllowlist, ['registry.npmjs.org', 'pypi.org'])
  assert.deepEqual(normalized.cacheDirs, ['C:\\tmp\\npm', 'C:\\tmp\\pip'])
  assert.equal('trustedWorkspaceRoots' in normalized, false)
  assert.equal('approvalRules' in normalized, false)
})

test('normalizeCommandSafety accepts non-mode legacy aliases and clamps unsupported values safely', () => {
  const fromLegacy = normalizeCommandSafety({
    commandAccess: 'off',
    developerOptionsVisible: true,
    commandExecutionProfile: 'host_full_access',
    installSandboxBackend: 'wsl',
    ignoreScriptsFirstPass: true,
    networkEnforcementMode: 'strict',
  })
  assert.equal('commandAccessMode' in fromLegacy, false)
  assert.equal('defaultExecutionProfile' in fromLegacy, false)
  assert.equal('allowHostInstalls' in fromLegacy, false)
  assert.equal(fromLegacy.showDeveloperOptions, true)
  assert.equal(fromLegacy.preferredBackend, 'wsl')
  assert.equal(fromLegacy.installSandboxIgnoreScriptsFirstPass, true)
  assert.equal(fromLegacy.sandboxNetworkEnforcementMode, 'strict')

  const invalid = normalizeCommandSafety({
    commandAccessMode: 'always',
    preferredBackend: 'podman',
    registryAllowlist: new Array(80).fill(0).map((_, i) => `h${i}.example.com`),
    cacheDirs: new Array(50).fill(0).map((_, i) => `C:\\cache\\${i}`),
    trustedWorkspaces: [' C:\\repo ', 'C:\\repo'],
  })
  assert.equal('commandAccessMode' in invalid, false)
  assert.equal(invalid.preferredBackend, 'auto')
  assert.equal(invalid.sandboxNetworkEnforcementMode, 'strict')
  assert.equal(invalid.registryAllowlist.length, 50)
  assert.equal(invalid.cacheDirs.length, 20)
  assert.equal('trustedWorkspaceRoots' in invalid, false)
})
