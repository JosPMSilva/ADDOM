import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildRunCommandPolicySummary,
  evaluateRunCommandPolicyDecision,
} from '../../src/main/tools/command-tools-core.mjs'

test('evaluateRunCommandPolicyDecision routes project dependency installs to install sandbox when enabled', () => {
  const policy = buildRunCommandPolicySummary(process.cwd(), {
    command: 'npm install vite',
    cwd: '.',
    shell: 'powershell',
  })
  const decision = evaluateRunCommandPolicyDecision(policy, {
    installSandboxEnabled: true,
  })

  assert.equal(decision.decision, 'route_to_sandbox')
  assert.equal(decision.executionTarget, 'install_sandbox')
  assert.equal(decision.elevationRequired, false)
})

test('evaluateRunCommandPolicyDecision keeps project dependency installs on host after explicit host_full_access approval', () => {
  const policy = buildRunCommandPolicySummary(process.cwd(), {
    command: 'npm install vite',
    cwd: '.',
    shell: 'powershell',
  })
  const decision = evaluateRunCommandPolicyDecision(policy, {
    installSandboxEnabled: true,
    allowHostFullAccessForThisCommand: true,
  })

  assert.equal(decision.decision, 'allow')
  assert.equal(decision.executionTarget, 'host')
  assert.equal(decision.elevationRequired, false)
  assert.ok(decision.reasons.includes('project_dependency_install_host_full_access'))
})

test('evaluateRunCommandPolicyDecision blocks global installs by default until explicit host_full_access approval exists', () => {
  const policy = buildRunCommandPolicySummary(process.cwd(), {
    command: 'npm install -g typescript',
    cwd: '.',
    shell: 'powershell',
  })
  const decision = evaluateRunCommandPolicyDecision(policy, {
    installSandboxEnabled: true,
  })

  assert.equal(decision.decision, 'deny')
  assert.ok(decision.hints.some((hint) => /Global\/system installs are blocked/i.test(hint)))
})

test('evaluateRunCommandPolicyDecision keeps non-install build commands on host', () => {
  const policy = buildRunCommandPolicySummary(process.cwd(), {
    command: 'npm run build',
    cwd: '.',
    shell: 'powershell',
  })
  const decision = evaluateRunCommandPolicyDecision(policy, {
    installSandboxEnabled: true,
  })

  assert.equal(decision.decision, 'allow')
  assert.equal(decision.executionTarget, 'host')
})

test('evaluateRunCommandPolicyDecision requires elevation for external network fetches', () => {
  const policy = buildRunCommandPolicySummary(process.cwd(), {
    command: 'curl https://example.com/file.txt',
    cwd: '.',
    shell: 'powershell',
  })
  const decision = evaluateRunCommandPolicyDecision(policy, {
    installSandboxEnabled: false,
  })

  assert.equal(decision.decision, 'require_elevation')
  assert.equal(decision.elevationRequired, true)
  assert.ok(decision.hints.some((hint) => /host_full_access/i.test(hint)))
})

test('evaluateRunCommandPolicyDecision requires elevation for resolved external paths', () => {
  const root = process.cwd()
  const rootInfo = process.platform === 'win32'
    ? `${root.split('\\')[0]}\\`
    : '/'
  const externalPath = process.platform === 'win32'
    ? `${rootInfo}Windows\\System32\\drivers\\etc\\hosts`
    : '/etc/hosts'
  const command = process.platform === 'win32'
    ? `type "${externalPath}"`
    : `cat "${externalPath}"`
  const policy = buildRunCommandPolicySummary(root, {
    command,
    cwd: '.',
    shell: process.platform === 'win32' ? 'powershell' : 'bash',
  })
  const decision = evaluateRunCommandPolicyDecision(policy, {
    installSandboxEnabled: false,
  })

  assert.equal(decision.decision, 'require_elevation')
  assert.equal(decision.elevationRequired, true)
})

test('evaluateRunCommandPolicyDecision hard-denies environment overrides for shell parity', () => {
  const policy = buildRunCommandPolicySummary(process.cwd(), {
    command: 'git status',
    cwd: '.',
    shell: 'powershell',
    env: { FOO: 'bar' },
  })
  const decision = evaluateRunCommandPolicyDecision(policy, {
    allowHostFullAccessForThisCommand: true,
  })

  assert.equal(decision.decision, 'deny')
  assert.ok(decision.reasons.includes('env_override_not_allowed'))
})

test('evaluateRunCommandPolicyDecision requires elevation for out-of-workspace cwd by default', () => {
  const outsideRoot = process.platform === 'win32'
    ? (process.env.SystemRoot || 'C:\\Windows')
    : '/tmp'
  const policy = buildRunCommandPolicySummary(process.cwd(), {
    command: 'git status',
    cwd: outsideRoot,
    shell: process.platform === 'win32' ? 'powershell' : 'bash',
  })
  const decision = evaluateRunCommandPolicyDecision(policy, {})

  assert.equal(decision.decision, 'require_elevation')
  assert.equal(decision.elevationRequired, true)
  assert.ok(decision.reasons.includes('outside_workspace_cwd'))
})

test('evaluateRunCommandPolicyDecision allows out-of-workspace cwd after host_full_access approval', () => {
  const outsideRoot = process.platform === 'win32'
    ? (process.env.SystemRoot || 'C:\\Windows')
    : '/tmp'
  const policy = buildRunCommandPolicySummary(process.cwd(), {
    command: 'git status',
    cwd: outsideRoot,
    shell: process.platform === 'win32' ? 'powershell' : 'bash',
  })
  const decision = evaluateRunCommandPolicyDecision(policy, {
    allowHostFullAccessForThisCommand: true,
  })

  assert.equal(decision.decision, 'allow')
  assert.equal(decision.elevationRequired, false)
  assert.ok(decision.reasons.includes('outside_workspace_cwd_host_full_access'))
})

test('evaluateRunCommandPolicyDecision allows one-shot host_full_access override for external network fetch', () => {
  const policy = buildRunCommandPolicySummary(process.cwd(), {
    command: 'curl https://example.com/file.txt',
    cwd: '.',
    shell: 'powershell',
  })
  const decision = evaluateRunCommandPolicyDecision(policy, {
    allowHostFullAccessForThisCommand: true,
  })

  assert.equal(decision.decision, 'allow')
  assert.equal(decision.elevationRequired, false)
  assert.ok(decision.reasons.includes('host_full_access_override'))
})

test('evaluateRunCommandPolicyDecision hard-denies private network targets by default even with host_full_access override', () => {
  const policy = buildRunCommandPolicySummary(process.cwd(), {
    command: 'curl http://localhost:3000/health',
    cwd: '.',
    shell: 'powershell',
  })
  const decision = evaluateRunCommandPolicyDecision(policy, {
    allowHostFullAccessForThisCommand: true,
  })

  assert.equal(decision.decision, 'deny')
  assert.ok(decision.reasons.includes('private_network_target_hard_denied'))
})

test('evaluateRunCommandPolicyDecision allows private network targets when explicitly enabled and elevated', () => {
  const policy = buildRunCommandPolicySummary(process.cwd(), {
    command: 'curl http://localhost:3000/health',
    cwd: '.',
    shell: 'powershell',
  })
  const decision = evaluateRunCommandPolicyDecision(policy, {
    allowPrivateNetworkTargets: true,
    allowHostFullAccessForThisCommand: true,
  })

  assert.equal(decision.decision, 'allow')
  assert.equal(decision.elevationRequired, false)
})

test('evaluateRunCommandPolicyDecision hard-denies privileged host operations by default', () => {
  const policy = buildRunCommandPolicySummary(process.cwd(), {
    command: 'netsh interface show interface',
    cwd: '.',
    shell: 'powershell',
  })
  const decision = evaluateRunCommandPolicyDecision(policy, {})

  assert.equal(decision.decision, 'deny')
  assert.ok(decision.reasons.includes('privileged_host_operation_hard_denied'))
})

test('evaluateRunCommandPolicyDecision requires elevation for outside-workspace mutations by default', () => {
  const command = process.platform === 'win32'
    ? 'copy .\\package.json C:\\temp\\outside-package.json'
    : 'cp ./package.json /tmp/outside-package.json'
  const shell = process.platform === 'win32' ? 'powershell' : 'bash'
  const policy = buildRunCommandPolicySummary(process.cwd(), {
    command,
    cwd: '.',
    shell,
  })
  const decision = evaluateRunCommandPolicyDecision(policy, {})

  assert.equal(decision.decision, 'require_elevation')
  assert.equal(decision.elevationRequired, true)
  assert.ok(decision.reasons.includes('outside_workspace_mutation'))
})

test('evaluateRunCommandPolicyDecision allows outside-workspace mutations after host_full_access approval', () => {
  const command = process.platform === 'win32'
    ? 'copy .\\package.json C:\\temp\\outside-package.json'
    : 'cp ./package.json /tmp/outside-package.json'
  const shell = process.platform === 'win32' ? 'powershell' : 'bash'
  const policy = buildRunCommandPolicySummary(process.cwd(), {
    command,
    cwd: '.',
    shell,
  })
  const decision = evaluateRunCommandPolicyDecision(policy, {
    allowHostFullAccessForThisCommand: true,
  })

  assert.equal(decision.decision, 'allow')
  assert.equal(decision.elevationRequired, false)
  assert.ok(decision.reasons.includes('outside_workspace_mutation_host_full_access'))
})

test('evaluateRunCommandPolicyDecision ignores removed saved host_full_access profile labels', () => {
  const policy = buildRunCommandPolicySummary(process.cwd(), {
    command: 'curl https://example.com/file.txt',
    cwd: '.',
    shell: 'powershell',
  })
  const decision = evaluateRunCommandPolicyDecision(policy, {
    defaultExecutionProfile: 'host_full_access',
  })

  assert.equal(decision.decision, 'require_elevation')
  assert.equal(decision.elevationRequired, true)
  assert.ok(!decision.reasons.includes('host_full_access_profile_selected'))
})
