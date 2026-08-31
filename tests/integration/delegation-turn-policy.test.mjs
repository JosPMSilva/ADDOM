import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveDelegationRuntimeSettings,
  resolveDelegationTurnPolicy,
} from '../../src/main/chat/delegation-turn-policy.mjs'

test('delegation turn policy is provider-neutral and defers model support to ADDOM tool capability resolution', () => {
  const rows = [
    {
      input: { providerId: 'ollama', model: 'llama-local' },
      expected: { supported: true, exposeTools: true, reason: 'runtime_tool_capability' },
    },
    {
      input: { providerId: 'openrouter', model: 'unknown/model' },
      expected: { supported: true, exposeTools: true, reason: 'runtime_tool_capability' },
    },
    {
      input: { providerId: 'openai', model: 'gpt-5.4' },
      expected: { supported: true, exposeTools: true, reason: 'runtime_tool_capability' },
    },
    {
      input: {
        providerId: 'custom-provider',
        model: 'custom-model',
        registryEntry: { supportsDelegation: false, supportsAnyToolSurface: true },
      },
      expected: { supported: true, exposeTools: true, reason: 'runtime_tool_capability' },
    },
    {
      input: {
        providerId: 'openai',
        model: 'gpt-5.4',
        registryEntry: { supportsDelegation: true, supportsAnyToolSurface: false },
      },
      expected: { supported: false, exposeTools: false, reason: 'missing_tool_surface' },
    },
  ]

  for (const { input, expected } of rows) {
    assert.deepEqual(
      resolveDelegationTurnPolicy(input),
      { ...expected, rejectExplicitRequest: false },
    )
  }
})

test('delegation runtime uses the user Agent run limit instead of a legacy MoA task cap', () => {
  const resolved = resolveDelegationRuntimeSettings({
    moaRoles: [{ id: 'role_1' }],
    moaPolicy: { maxTasksPerDelegation: 3 },
    agentSettings: {
      fanoutConfirmationThreshold: 12,
      limits: { maxDescendants: 100 },
    },
  })

  assert.equal(resolved.moaPolicy.maxTasksPerDelegation, 100)
  assert.equal(resolved.agentSettings.fanoutConfirmationThreshold, 12)
  assert.equal(resolved.moaRoles.length, 1)
})
test('explicit unsupported delegation rejects before execution while non-execute modes omit tools', () => {
  assert.deepEqual(resolveDelegationTurnPolicy({
    providerId: 'openai',
    model: 'gpt-5.2',
    requestedDelegation: true,
    registryEntry: { supportsAnyToolSurface: false },
  }), {
    supported: false,
    exposeTools: false,
    rejectExplicitRequest: true,
    reason: 'missing_tool_surface',
  })

  assert.deepEqual(resolveDelegationTurnPolicy({
    providerId: 'openai',
    model: 'gpt-5.4',
    mode: 'plan',
    requestedDelegation: true,
  }), {
    supported: true,
    exposeTools: false,
    rejectExplicitRequest: false,
    reason: 'runtime_tool_capability',
  })
})

test('disabled Agents settings hide delegation tools and reject an explicit request deterministically', () => {
  assert.deepEqual(resolveDelegationTurnPolicy({
    providerId: 'openai',
    model: 'gpt-5.4',
    requestedDelegation: true,
    agentsEnabled: false,
  }), {
    supported: true,
    exposeTools: false,
    rejectExplicitRequest: true,
    reason: 'agents_disabled',
  })
})
