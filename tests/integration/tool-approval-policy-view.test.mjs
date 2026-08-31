import test from 'node:test'
import assert from 'node:assert/strict'

import { getRunCommandPolicyView } from '../../src/renderer/components/tool-approval-policy-view.mjs'

test('getRunCommandPolicyView returns normalized rows, badges, warnings, and hints for run_command approvals', () => {
  const view = getRunCommandPolicyView({
    toolName: 'run_command',
    policy: {
      type: 'run_command_policy_v1',
      profileHint: 'host_full_access',
      commandClass: 'dependency_install_global_or_system',
      shellPreference: 'powershell',
      resolvedCwd: 'C:\\Users\\example\\Documents\\ADDOM',
      pathScope: 'external_requested',
      pathRefs: {
        hasAbsolutePathRef: true,
        hasTraversalRef: false,
        externalPathHints: ['C:\\Users\\example'],
      },
      networkIntent: 'external',
      networkHosts: ['example.com'],
      install: {
        isInstallLike: true,
        isGlobalOrSystemInstall: true,
        ecosystem: 'npm',
        packagesHint: ['typescript'],
      },
      longRunning: false,
      riskSignals: ['absolute_path_ref', 'external_network_intent', 'global_or_system_install'],
      hints: ['Global/system install detected; require explicit elevated host approval.'],
    },
  })

  assert.ok(view)
  assert.ok(view.badges.some((badge) => badge.label.includes('profile: host_full_access')))
  assert.ok(view.badges.some((badge) => /Dependency Install Global Or System/i.test(badge.label)))
  assert.ok(view.rows.some((row) => row.key === 'resolvedCwd' && /ADDOM/i.test(String(row.value))))
  assert.ok(view.rows.some((row) => row.key === 'networkHosts' && /example\.com/.test(String(row.value))))
  assert.ok(view.warnings.some((msg) => /Global\/system install detected/i.test(msg)))
  assert.ok(view.hintCallouts.some((msg) => /elevated host approval/i.test(msg)))
})

test('getRunCommandPolicyView exposes sandbox-unavailable host fallback action for project installs', () => {
  const view = getRunCommandPolicyView({
    toolName: 'run_command',
    policy: {
      type: 'run_command_policy_v1',
      profileHint: 'install_sandbox',
      commandClass: 'dependency_install_project',
      shellPreference: 'powershell',
      resolvedCwd: 'C:\\Users\\example\\Documents\\ADDOM',
      pathScope: 'root_only',
      pathRefs: { hasAbsolutePathRef: false, hasTraversalRef: false, externalPathHints: [] },
      networkIntent: 'registry_only',
      networkHosts: [],
      install: {
        isInstallLike: true,
        isGlobalOrSystemInstall: false,
        ecosystem: 'npm',
        packagesHint: ['vite'],
      },
      longRunning: false,
      riskSignals: [],
      hints: ['Install sandbox is unavailable. You can deny, or explicitly allow a one-shot host fallback from the approval dialog.'],
      policyDecision: 'route_to_sandbox',
      executionTarget: 'install_sandbox',
      elevationRequired: false,
      sandbox: {
        backend: 'none',
        available: false,
        reason: 'No install sandbox backend configured.',
        fallbackHostAvailable: true,
        strictEgressImplementationMode: 'none',
        registryAllowlist: ['registry.npmjs.org'],
        cacheMountCount: 2,
        mountCount: 4,
      },
    },
  })

  assert.ok(view)
  assert.equal(view.actionsVariant?.showHostInstallFallback, true)
  assert.ok(view.badges.some((badge) => /target: install_sandbox/i.test(badge.label)))
  assert.ok(view.badges.some((badge) => /sandbox: none \(unavailable\)/i.test(badge.label)))
  assert.ok(view.warnings.some((msg) => /Install sandbox is unavailable/i.test(msg)))
  assert.ok(view.hintCallouts.some((msg) => /No install sandbox backend configured/i.test(msg)))
})

test('getRunCommandPolicyView exposes explicit host_full_access action and disables default allow for elevated host commands', () => {
  const view = getRunCommandPolicyView({
    toolName: 'run_command',
    policy: {
      type: 'run_command_policy_v1',
      profileHint: 'host_full_access',
      commandClass: 'network_fetch_non_install',
      shellPreference: 'powershell',
      resolvedCwd: 'C:\\Users\\example\\Documents\\ADDOM',
      pathScope: 'root_only',
      pathRefs: {
        hasAbsolutePathRef: false,
        hasTraversalRef: false,
        externalPathHints: [],
        resolvedExternalPaths: [],
      },
      networkIntent: 'external',
      networkHosts: ['example.com'],
      install: { isInstallLike: false, isGlobalOrSystemInstall: false, ecosystem: '', packagesHint: [] },
      longRunning: false,
      riskSignals: ['external_network_intent'],
      hints: ['External network fetch detected. Explicit host_full_access approval is required in workspace_safe mode.'],
      policyDecision: 'require_elevation',
      executionTarget: 'host',
      elevationRequired: true,
    },
  })

  assert.ok(view)
  assert.equal(view.actionsVariant?.showHostFullAccessApproval, true)
  assert.equal(view.actionsVariant?.showHostFullAccessTurnApproval, true)
  assert.equal(view.actionsVariant?.disableDefaultAllow, true)
  assert.equal(view.actionsVariant?.requireExplicitHostFullAccess, true)
  assert.ok(view.warnings.some((msg) => /one-shot host_full_access approval/i.test(msg)))
})

test('getRunCommandPolicyView exposes explicit WSL compatibility action and disables default allow for WSL sandbox installs', () => {
  const view = getRunCommandPolicyView({
    toolName: 'run_command',
    policy: {
      type: 'run_command_policy_v1',
      profileHint: 'install_sandbox',
      commandClass: 'dependency_install_project',
      shellPreference: 'powershell',
      resolvedCwd: 'C:\\Users\\example\\Documents\\ADDOM',
      pathScope: 'root_only',
      pathRefs: { hasAbsolutePathRef: false, hasTraversalRef: false, externalPathHints: [] },
      networkIntent: 'registry_only',
      networkHosts: [],
      install: { isInstallLike: true, isGlobalOrSystemInstall: false, ecosystem: 'npm', packagesHint: ['vite'] },
      longRunning: false,
      riskSignals: [],
      hints: ['WSL is a compatibility backend with host filesystem reachability via /mnt. Explicit WSL compatibility approval is required for this sandbox-routed install.'],
      policyDecision: 'route_to_sandbox',
      executionTarget: 'install_sandbox',
      elevationRequired: false,
      sandbox: {
        backend: 'wsl',
        available: true,
        requiresCompatibilityApproval: true,
        securityBoundary: false,
        compatibilityMode: 'wsl',
        networkPolicyMode: 'registry_allowlist',
        networkEnforcementMode: 'best_effort',
      },
    },
  })

  assert.ok(view)
  assert.equal(view.actionsVariant?.showWslCompatibilityApproval, true)
  assert.equal(view.actionsVariant?.requireExplicitWslCompatibilityApproval, true)
  assert.equal(view.actionsVariant?.disableDefaultAllow, true)
  assert.ok(view.rows.some((row) => row.key === 'sandboxCompatibilityMode' && /wsl/i.test(String(row.value))))
  assert.ok(view.rows.some((row) => row.key === 'sandboxSecurityBoundary' && /no/i.test(String(row.value))))
  assert.ok(view.warnings.some((msg) => /WSL is not a security boundary/i.test(msg)))
})

test('getRunCommandPolicyView returns null for non-run_command tool or missing policy', () => {
  assert.equal(getRunCommandPolicyView({ toolName: 'write_file', policy: {} }), null)
  assert.equal(getRunCommandPolicyView({ toolName: 'run_command', policy: null }), null)
})

test('getRunCommandPolicyView tolerates sparse policy payloads and ignores unknown fields', () => {
  const view = getRunCommandPolicyView({
    toolName: 'run_command',
    policy: {
      type: 'run_command_policy_v1',
      commandClass: 'project_build_test',
      profileHint: 'workspace_safe',
      unknownFutureField: { nested: true },
      pathRefs: {},
      install: {},
      sandbox: {
        weirdExtra: 'ignored',
        strictEgressImplementationMode: 'best_effort_only',
      },
    },
  })

  assert.ok(view)
  assert.ok(view.rows.some((row) => row.key === 'resolvedCwd' && /\(unresolved\)/.test(String(row.value))))
  assert.ok(view.rows.some((row) => row.key === 'sandboxStrictEgressImpl' && /best_effort_only/i.test(String(row.value))))
  assert.ok(view.badges.some((badge) => /profile: workspace_safe/i.test(badge.label)))
  assert.equal(view.actionsVariant.showHostInstallFallback, false)
})
