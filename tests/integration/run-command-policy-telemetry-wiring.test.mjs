import test from 'node:test'
import assert from 'node:assert/strict'

import { runCommand } from '../../src/main/tools/command-tools-runner.mjs'
import {
  clearGlobalRunCommandPolicyTelemetry,
  getGlobalRunCommandPolicyTelemetrySnapshot,
} from '../../src/main/chat/run-command-policy-telemetry.mjs'

test('runCommand telemetry wiring records sandbox route events', async () => {
  clearGlobalRunCommandPolicyTelemetry()

  const output = await runCommand(process.cwd(), {
    command: 'npm install vite',
    shell: 'powershell',
    cwd: '.',
  }, {
    commandSafety: {
      installSandboxEnabled: true,
      preferredBackend: 'docker',
      sandboxNetworkEnforcementMode: 'best_effort',
    },
    installSandboxAdapter: {
      async detectBackend() {
        return { available: true, backend: 'docker' }
      },
      async run() {
        return 'sandbox adapter executed'
      },
    },
  })

  assert.equal(output, 'sandbox adapter executed')
  const snap = getGlobalRunCommandPolicyTelemetrySnapshot()
  assert.equal(snap.counters.sandboxRoutesTaken >= 1, true)
  assert.equal((snap.breakdowns.eventKinds.routed_to_sandbox || 0) >= 1, true)
})

test('runCommand telemetry wiring records shell dialect mistakes when hints are emitted', async () => {
  clearGlobalRunCommandPolicyTelemetry()

  await assert.rejects(
    () => runCommand(process.cwd(), {
      command: 'dir /a',
      shell: 'powershell',
      cwd: '.',
    }, {
      async runWithCandidateImpl() {
        throw new Error([
          'Command failed with exit code 1 (powershell).',
          "dir : Cannot find path 'C:\\a' because it does not exist.",
          '+ dir /a',
          'FullyQualifiedErrorId : PathNotFound,Microsoft.PowerShell.Commands.GetChildItemCommand',
        ].join('\n'))
      },
    }),
    /Shell hints:/i,
  )

  const snap = getGlobalRunCommandPolicyTelemetrySnapshot()
  assert.equal(snap.counters.shellDialectMistakesDetected >= 1, true)
  assert.equal((snap.breakdowns.shellDialectMistakeKinds.powershell_dir_slash_a || 0) >= 1, true)
})
