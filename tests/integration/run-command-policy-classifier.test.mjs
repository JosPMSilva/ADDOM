import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildRunCommandPolicySummary,
  classifyCommandIntent,
  extractCommandInstallIntent,
  extractCommandNetworkIntent,
  extractCommandPathRefs,
} from '../../src/main/tools/command-tools-core.mjs'

test('classifyCommandIntent identifies project dependency installs and buildRunCommandPolicySummary suggests install_sandbox', () => {
  const intent = classifyCommandIntent('npm install vite')
  assert.equal(intent.commandClass, 'dependency_install_project')

  const install = extractCommandInstallIntent('npm install vite')
  assert.equal(install.isInstallLike, true)
  assert.equal(install.isGlobalOrSystemInstall, false)
  assert.equal(install.ecosystem, 'npm')
  assert.ok(install.packagesHint.includes('vite'))

  const network = extractCommandNetworkIntent('npm install vite')
  assert.equal(network.networkIntent, 'registry_only')

  const policy = buildRunCommandPolicySummary(process.cwd(), {
    command: 'npm install vite',
    cwd: '.',
    shell: 'powershell',
    background: false,
  })
  assert.equal(policy.type, 'run_command_policy_v1')
  assert.equal(policy.profileHint, 'install_sandbox')
  assert.equal(policy.commandClass, 'dependency_install_project')
  assert.equal(policy.pathScope, 'root_only')
  assert.match(policy.resolvedCwd, /ADDOM/i)
})

test('global or system installs are classified as elevated host risk in Phase 1 policy summary', () => {
  const npmGlobal = buildRunCommandPolicySummary(process.cwd(), {
    command: 'npm install -g typescript',
    cwd: '.',
  })
  assert.equal(npmGlobal.commandClass, 'dependency_install_global_or_system')
  assert.equal(npmGlobal.profileHint, 'host_full_access')
  assert.ok(npmGlobal.install.isGlobalOrSystemInstall)

  const systemInstall = classifyCommandIntent('winget install Git.Git')
  assert.equal(systemInstall.commandClass, 'dependency_install_global_or_system')
})

test('path and network extractors flag external intent in obvious cases', () => {
  const paths = extractCommandPathRefs('type ..\\secrets.txt')
  assert.equal(paths.hasTraversalRef, true)

  const curlPolicy = buildRunCommandPolicySummary(process.cwd(), {
    command: 'curl https://example.com/install.sh',
    cwd: '.',
    shell: 'powershell',
  })
  assert.equal(curlPolicy.commandClass, 'network_fetch_non_install')
  assert.equal(curlPolicy.networkIntent, 'external')
  assert.equal(curlPolicy.profileHint, 'host_full_access')
  assert.ok(curlPolicy.networkHosts.includes('example.com'))
  assert.ok(curlPolicy.riskSignals.includes('external_network_intent'))
})

