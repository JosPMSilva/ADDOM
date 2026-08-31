import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  buildRunCommandPolicySummary,
} from '../../src/main/tools/command-tools-core.mjs'
import {
  buildRegistryPreferenceEnvOverrides,
  buildInstallSandboxSpec,
  buildDockerRunArgs,
  buildInstallSandboxWarnings,
  classifyWslStatusProbeOutput,
  detectInstallSandboxBackend,
  isHostAllowedByRegistryPolicy,
  mapHostPathToSandboxPath,
  rewriteInstallCommandForSandbox,
  runCommandInInstallSandbox,
} from '../../src/main/tools/command-tools-sandbox.mjs'
import {
  createTrustedCommandSafetyOverride,
  runCommand,
} from '../../src/main/tools/command-tools-runner.mjs'

test('detectInstallSandboxBackend supports explicit backend configuration and unavailable fallback', async () => {
  const explicit = await detectInstallSandboxBackend({ preferredBackend: 'docker', skipProbe: true })
  assert.equal(explicit.available, true)
  assert.equal(explicit.backend, 'docker')
  assert.equal(explicit.capabilities?.strictEgressEnforcement, false)
  assert.equal(explicit.capabilities?.strictEgressImplementationMode, 'best_effort_only')

  const unavailable = await detectInstallSandboxBackend({ preferredBackend: 'none' })
  assert.equal(unavailable.available, false)
  assert.equal(unavailable.backend, 'none')
  assert.match(String(unavailable.reason || ''), /disabled/i)
  assert.equal(unavailable.capabilities?.strictEgressImplementationMode, 'none')
})

test('classifyWslStatusProbeOutput detects unusable WSL host configuration and access denied', () => {
  const unsupported = classifyWslStatusProbeOutput(
    'WSL2 nao e suportado com a configuracao atual do computador. Ative a Plataforma de Maquinas Virtuais.',
  )
  assert.equal(unsupported.usable, false)
  assert.equal(unsupported.reasonCode, 'wsl_not_supported_on_host_config')

  const denied = classifyWslStatusProbeOutput(
    'Acesso negado. Codigo de erro: Wsl/EnumerateDistros/Service/E_ACCESSDENIED',
  )
  assert.equal(denied.usable, false)
  assert.equal(denied.reasonCode, 'wsl_access_denied')

  const ok = classifyWslStatusProbeOutput('Default Distribution: Ubuntu\nDefault Version: 2')
  assert.equal(ok.usable, true)
  assert.equal(ok.reasonCode, 'wsl_status_ok')
})

test('buildInstallSandboxSpec returns project/temp/cache mount plan and registry policy', () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-sandbox-cache-'))
  const policy = buildRunCommandPolicySummary(process.cwd(), {
    command: 'npm install vite',
    cwd: '.',
    shell: 'powershell',
  })
  const spec = buildInstallSandboxSpec(process.cwd(), policy, {
    backend: 'docker',
    cacheDirs: [cacheDir],
    registryAllowlist: ['registry.npmjs.org'],
  })

  try {
    assert.equal(Array.isArray(spec.mounts), true)
    assert.ok(spec.mounts.some((m) => m.purpose === 'project_root' && m.readOnly === false))
    assert.ok(spec.mounts.some((m) => m.purpose === 'temp'))
    assert.ok(spec.mounts.some((m) => m.purpose === 'package_cache' && m.hostPath === cacheDir && m.readOnly === true))
    assert.equal(spec.networkPolicy.mode, 'registry_allowlist')
    assert.ok(spec.networkPolicy.allowHosts.includes('registry.npmjs.org'))
    assert.equal(spec.networkPolicy.enforcementMode, 'strict')
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true })
  }
})

test('buildDockerRunArgs uses none in strict mode and mounts package caches read-only', () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-docker-cache-'))
  try {
    const policy = buildRunCommandPolicySummary(process.cwd(), {
      command: 'npm install vite',
      cwd: '.',
      shell: 'powershell',
    })
    const sandboxSpec = buildInstallSandboxSpec(process.cwd(), policy, {
      backend: 'docker',
      cacheDirs: [cacheDir],
      registryAllowlist: ['registry.npmjs.org'],
      sandboxNetworkEnforcementMode: 'strict',
    })
    const invocation = buildDockerRunArgs({
      command: 'npm install vite',
      sandboxSpec,
      backendStatus: { backend: 'docker' },
      projectRoot: process.cwd(),
      cwd: '.',
      policySummary: policy,
      commandSafety: {},
    })
    const cacheMountArg = invocation.args.find((arg) => typeof arg === 'string' && arg.includes(`${cacheDir}:`))

    assert.deepEqual(invocation.args.slice(0, 5), ['run', '--rm', '--init', '--cap-drop=ALL', '--security-opt=no-new-privileges'])
    assert.ok(invocation.args.includes('--network'))
    assert.equal(invocation.args[invocation.args.indexOf('--network') + 1], 'none')
    assert.ok(cacheMountArg?.endsWith(':ro'))
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true })
  }
})

test('buildInstallSandboxWarnings makes WSL host-access risk explicit', () => {
  const warnings = buildInstallSandboxWarnings({
    backend: 'wsl',
    sandboxSpec: {
      networkPolicy: {
        mode: 'registry_allowlist',
        enforcementMode: 'best_effort',
      },
    },
  })

  assert.ok(warnings.some((warning) => /not a security sandbox/i.test(warning)))
  assert.ok(warnings.some((warning) => /host filesystem access via \/mnt/i.test(warning)))
})

test('buildRegistryPreferenceEnvOverrides pins npm/python registry envs in best-effort mode', () => {
  const npmPolicy = buildRunCommandPolicySummary(process.cwd(), {
    command: 'npm install vite',
    cwd: '.',
    shell: 'powershell',
  })
  const npmOverrides = buildRegistryPreferenceEnvOverrides(npmPolicy, {
    mode: 'registry_allowlist',
    allowHosts: ['registry.npmjs.org'],
  })
  assert.equal(npmOverrides.applied, true)
  assert.equal(npmOverrides.env.npm_config_registry, 'https://registry.npmjs.org/')

  const pyPolicy = buildRunCommandPolicySummary(process.cwd(), {
    command: 'pip install requests',
    cwd: '.',
    shell: 'powershell',
  })
  const pyOverrides = buildRegistryPreferenceEnvOverrides(pyPolicy, {
    mode: 'registry_allowlist',
    allowHosts: ['pypi.org'],
  })
  assert.equal(pyOverrides.applied, true)
  assert.equal(pyOverrides.env.PIP_INDEX_URL, 'https://pypi.org/simple')

  const unsupported = buildRegistryPreferenceEnvOverrides(
    buildRunCommandPolicySummary(process.cwd(), { command: 'cargo add serde', cwd: '.', shell: 'powershell' }),
    { mode: 'registry_allowlist', allowHosts: ['crates.io'] },
  )
  assert.equal(unsupported.applied, false)
})

test('sandbox helper maps Windows-style host paths to Linux mount targets and matches registry allowlist', () => {
  const mapped = mapHostPathToSandboxPath('C:\\Users\\example\\Documents\\ADDOM', { backend: 'docker' })
  if (process.platform === 'win32') {
    assert.equal(mapped.startsWith('/mnt/c/'), true)
  } else {
    assert.equal(typeof mapped, 'string')
    assert.ok(mapped.length > 0)
  }

  const policy = {
    mode: 'registry_allowlist',
    allowHosts: ['registry.npmjs.org', 'pypi.org'],
  }
  assert.equal(isHostAllowedByRegistryPolicy('registry.npmjs.org', policy), true)
  assert.equal(isHostAllowedByRegistryPolicy('example.com', policy), false)
})

test('rewriteInstallCommandForSandbox appends --ignore-scripts for npm installs when enabled', () => {
  const policy = buildRunCommandPolicySummary(process.cwd(), {
    command: 'npm install vite',
    cwd: '.',
    shell: 'powershell',
  })
  const rewritten = rewriteInstallCommandForSandbox('npm install vite', policy, {
    installSandboxIgnoreScriptsFirstPass: true,
  })
  assert.equal(rewritten.applied, true)
  assert.match(rewritten.command, /--ignore-scripts\b/)

  const untouched = rewriteInstallCommandForSandbox('npm install vite --ignore-scripts', policy, {
    installSandboxIgnoreScriptsFirstPass: true,
  })
  assert.equal(untouched.applied, false)
})

test('runCommandInInstallSandbox returns actionable unavailable error when backend is explicitly disabled', async () => {
  await assert.rejects(
    () => runCommandInInstallSandbox(process.cwd(), { command: 'npm install vite' }, {
      policySummary: buildRunCommandPolicySummary(process.cwd(), { command: 'npm install vite', cwd: '.' }),
      commandSafety: { installSandboxEnabled: true, preferredBackend: 'none' },
    }),
    (err) => {
      assert.equal(err?.code, 'INSTALL_SANDBOX_UNAVAILABLE')
      assert.match(String(err?.message || ''), /Install sandbox unavailable/i)
      assert.match(String(err?.message || ''), /Safe default: command was not executed on the host shell/i)
      return true
    },
  )
})

test('runCommandInInstallSandbox blocks explicit non-allowlisted hosts before sandbox execution', async () => {
  const command = 'npm install vite --registry https://example.com/'
  await assert.rejects(
    () => runCommandInInstallSandbox(process.cwd(), { command, shell: 'powershell', cwd: '.' }, {
      policySummary: buildRunCommandPolicySummary(process.cwd(), { command, shell: 'powershell', cwd: '.' }),
      commandSafety: {
        installSandboxEnabled: true,
        registryAllowlist: ['registry.npmjs.org'],
      },
      installSandboxAdapter: {
        async detectBackend() {
          return { available: true, backend: 'docker' }
        },
        async run() {
          throw new Error('sandbox adapter should not run when host is blocked by policy')
        },
      },
    }),
    (err) => {
      assert.equal(err?.code, 'INSTALL_SANDBOX_NETWORK_BLOCKED')
      assert.ok(Array.isArray(err?.sandboxDiagnostics?.blockedHosts))
      assert.ok(err.sandboxDiagnostics.blockedHosts.includes('example.com'))
      return true
    },
  )
})

test('runCommandInInstallSandbox fails safe when strict egress mode is requested but backend lacks strict enforcement support', async () => {
  await assert.rejects(
    () => runCommandInInstallSandbox(process.cwd(), {
      command: 'npm install vite',
      shell: 'powershell',
      cwd: '.',
    }, {
      policySummary: buildRunCommandPolicySummary(process.cwd(), { command: 'npm install vite', shell: 'powershell', cwd: '.' }),
      commandSafety: {
        installSandboxEnabled: true,
        sandboxNetworkEnforcementMode: 'strict',
        registryAllowlist: ['registry.npmjs.org'],
      },
      installSandboxAdapter: {
        async detectBackend() {
          return { available: true, backend: 'docker', capabilities: { strictEgressEnforcement: false } }
        },
        async run() {
          throw new Error('sandbox adapter should not run when strict mode is unsupported')
        },
      },
    }),
    (err) => {
      assert.equal(err?.code, 'INSTALL_SANDBOX_STRICT_EGRESS_UNAVAILABLE')
      assert.equal(err?.sandboxDiagnostics?.strictEgressRequested, true)
      assert.equal(err?.sandboxDiagnostics?.strictEgressSupported, false)
      assert.equal(err?.sandboxDiagnostics?.strictEgressImplementationMode, 'best_effort_only')
      return true
    },
  )
})

test('runCommandInInstallSandbox blocks path refs outside allowed mounts before sandbox execution', async () => {
  const externalPath = path.join(path.parse(process.cwd()).root, 'outside-install-cache')
  const command = `npm install vite --cache "${externalPath}"`
  await assert.rejects(
    () => runCommandInInstallSandbox(process.cwd(), { command, shell: 'powershell', cwd: '.' }, {
      policySummary: buildRunCommandPolicySummary(process.cwd(), { command, shell: 'powershell', cwd: '.' }),
      commandSafety: {
        installSandboxEnabled: true,
        registryAllowlist: ['registry.npmjs.org'],
      },
      installSandboxAdapter: {
        async detectBackend() {
          return { available: true, backend: 'docker' }
        },
        async run() {
          throw new Error('sandbox adapter should not run when path refs are blocked')
        },
      },
    }),
    (err) => {
      assert.equal(err?.code, 'INSTALL_SANDBOX_PATH_BLOCKED')
      assert.ok(Array.isArray(err?.sandboxDiagnostics?.blockedPathRefs))
      assert.ok(err.sandboxDiagnostics.blockedPathRefs.some((entry) => String(entry?.ref || '').includes('outside-install-cache')))
      return true
    },
  )
})

test('runCommand routes dependency installs to install sandbox adapter when enabled', async () => {
  const output = await runCommand(process.cwd(), {
    command: 'npm install vite',
    shell: 'powershell',
    cwd: '.',
  }, {
    commandSafety: { installSandboxEnabled: true, preferredBackend: 'docker', sandboxNetworkEnforcementMode: 'best_effort' },
    installSandboxAdapter: {
      async detectBackend() {
        return { available: true, backend: 'docker' }
      },
      async run(ctx) {
        assert.equal(ctx?.backendStatus?.backend, 'docker')
        assert.equal(ctx?.execOptions?.policyDecision?.decision, 'route_to_sandbox')
        assert.ok(ctx?.sandboxSpec?.mounts?.some((m) => m.purpose === 'project_root'))
        return 'sandbox adapter executed'
      },
    },
  })

  assert.equal(output, 'sandbox adapter executed')
})

test('runCommand keeps non-install commands on host even when install sandbox is enabled', async () => {
  let adapterInvoked = false
  const output = await runCommand(process.cwd(), {
    command: 'git status --short',
    shell: 'auto',
    cwd: '.',
  }, {
    commandSafety: { installSandboxEnabled: true, preferredBackend: 'docker', sandboxNetworkEnforcementMode: 'best_effort' },
    installSandboxAdapter: {
      async detectBackend() {
        adapterInvoked = true
        return { available: true, backend: 'docker' }
      },
      async run() {
        adapterInvoked = true
        return 'unexpected sandbox execution'
      },
    },
  })

  assert.equal(adapterInvoked, false)
  assert.equal(typeof output, 'string')
})

test('runCommand keeps build/test commands on host path when install sandbox is enabled', async () => {
  let adapterInvoked = false
  let hostRunnerInvoked = false

  const output = await runCommand(process.cwd(), {
    command: 'npm test -- --help',
    shell: 'powershell',
    cwd: '.',
  }, {
    commandSafety: { installSandboxEnabled: true, preferredBackend: 'docker', sandboxNetworkEnforcementMode: 'best_effort' },
    installSandboxAdapter: {
      async detectBackend() {
        adapterInvoked = true
        return { available: true, backend: 'docker' }
      },
      async run() {
        adapterInvoked = true
        return 'unexpected sandbox execution'
      },
    },
    async runWithCandidateImpl(candidate, ctx) {
      hostRunnerInvoked = true
      assert.equal(typeof candidate?.label, 'string')
      assert.equal(ctx.command, 'npm test -- --help')
      return 'host build/test path executed'
    },
  })

  assert.equal(adapterInvoked, false)
  assert.equal(hostRunnerInvoked, true)
  assert.equal(output, 'host build/test path executed')
})

test('runCommand executes install command on host when one-shot host install fallback override is approved', async () => {
  let adapterInvoked = false
  let hostRunnerInvoked = false

  const output = await runCommand(process.cwd(), {
    command: 'npm install vite',
    shell: 'powershell',
    cwd: '.',
  }, {
    commandSafety: { installSandboxEnabled: true, preferredBackend: 'docker', sandboxNetworkEnforcementMode: 'best_effort' },
    commandSafetyOverride: createTrustedCommandSafetyOverride({
      disableInstallSandboxForThisCommand: true,
      hostInstallFallbackApproved: true,
    }),
    installSandboxAdapter: {
      async detectBackend() {
        adapterInvoked = true
        return { available: true, backend: 'docker' }
      },
      async run() {
        adapterInvoked = true
        return 'unexpected sandbox execution'
      },
    },
    async runWithCandidateImpl(candidate, ctx) {
      hostRunnerInvoked = true
      assert.equal(typeof candidate?.label, 'string')
      assert.equal(ctx.command, 'npm install vite')
      return 'host override executed'
    },
  })

  assert.equal(adapterInvoked, false)
  assert.equal(hostRunnerInvoked, true)
  assert.equal(output, 'host override executed')
})

test('runCommand bypasses install sandbox for project installs after explicit host_full_access approval', async () => {
  let adapterInvoked = false
  let hostRunnerInvoked = false

  const output = await runCommand(process.cwd(), {
    command: 'npm install vite',
    shell: 'powershell',
    cwd: '.',
  }, {
    commandSafety: { installSandboxEnabled: true, preferredBackend: 'docker', sandboxNetworkEnforcementMode: 'best_effort' },
    commandSafetyOverride: createTrustedCommandSafetyOverride({
      hostFullAccessApproved: true,
      allowHostFullAccessForThisCommand: true,
    }),
    installSandboxAdapter: {
      async detectBackend() {
        adapterInvoked = true
        return { available: true, backend: 'docker' }
      },
      async run() {
        adapterInvoked = true
        return 'unexpected sandbox execution'
      },
    },
    async runWithCandidateImpl(candidate, ctx) {
      hostRunnerInvoked = true
      assert.equal(typeof candidate?.label, 'string')
      assert.equal(ctx.command, 'npm install vite')
      return 'host full access install executed'
    },
  })

  assert.equal(adapterInvoked, false)
  assert.equal(hostRunnerInvoked, true)
  assert.equal(output, 'host full access install executed')
})

test('runCommandInInstallSandbox rejects WSL backend execution without explicit compatibility approval', async () => {
  await assert.rejects(
    () => runCommandInInstallSandbox(process.cwd(), {
      command: 'npm install vite',
      shell: 'powershell',
      cwd: '.',
    }, {
      policySummary: buildRunCommandPolicySummary(process.cwd(), { command: 'npm install vite', shell: 'powershell', cwd: '.' }),
      commandSafety: {
        installSandboxEnabled: true,
        sandboxNetworkEnforcementMode: 'best_effort',
        preferredBackend: 'wsl',
      },
      installSandboxAdapter: {
        async detectBackend() {
          return { available: true, backend: 'wsl', capabilities: { strictEgressEnforcement: false } }
        },
        async run() {
          throw new Error('WSL sandbox adapter should not run without explicit compatibility approval')
        },
      },
    }),
    (err) => {
      assert.equal(err?.code, 'INSTALL_SANDBOX_WSL_APPROVAL_REQUIRED')
      assert.match(String(err?.message || ''), /Explicit WSL compatibility approval is required/i)
      return true
    },
  )
})

test('runCommandInInstallSandbox allows WSL backend execution after explicit compatibility approval', async () => {
  const output = await runCommandInInstallSandbox(process.cwd(), {
    command: 'npm install vite',
    shell: 'powershell',
    cwd: '.',
  }, {
    policySummary: buildRunCommandPolicySummary(process.cwd(), { command: 'npm install vite', shell: 'powershell', cwd: '.' }),
    commandSafety: {
      installSandboxEnabled: true,
      sandboxNetworkEnforcementMode: 'best_effort',
      preferredBackend: 'wsl',
    },
    wslCompatibilityApproved: true,
    installSandboxAdapter: {
      async detectBackend() {
        return { available: true, backend: 'wsl', capabilities: { strictEgressEnforcement: false } }
      },
      async run(ctx) {
        assert.equal(ctx?.backendStatus?.backend, 'wsl')
        assert.equal(ctx?.execOptions?.wslCompatibilityApproved, true)
        return 'wsl compatibility run executed'
      },
    },
  })

  assert.equal(output, 'wsl compatibility run executed')
})
