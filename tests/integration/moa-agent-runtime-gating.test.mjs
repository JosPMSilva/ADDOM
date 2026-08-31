import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveAgentRuntimeTooling } from '../../src/main/moa/agent-runtime-tooling.mjs'

test('resolveAgentRuntimeTooling gates staged write tool by policy + role capability', () => {
  const role = { canWriteFiles: true }

  const allEnabled = resolveAgentRuntimeTooling(role, {
    policy: { agentWriteAccessEnabled: true, agentWriteMode: 'staged' },
  })
  assert.equal(allEnabled.roleCanWriteFiles, true)
  assert.equal(Boolean(allEnabled.agentTools.write_file), true)
  assert.equal(Boolean(allEnabled.agentTools.apply_patch), true)
  assert.equal(Boolean(allEnabled.agentTools.create_directory), true)
  assert.equal(Boolean(allEnabled.agentTools.read_file), true)
  assert.equal(Boolean(allEnabled.agentTools.list_directory), true)
  assert.equal(Boolean(allEnabled.agentTools.search_code), true)
  assert.equal(Boolean(allEnabled.agentTools.plan_read), true)
  assert.equal(Boolean(allEnabled.agentTools.plan_update), true)
  assert.equal(Boolean(allEnabled.agentTools.question_user), false)

  const policyDisabled = resolveAgentRuntimeTooling(role, {
    policy: { agentWriteAccessEnabled: false, agentWriteMode: 'staged' },
  })
  assert.equal(policyDisabled.roleCanWriteFiles, false)
  assert.equal(Boolean(policyDisabled.agentTools.write_file), false)
  assert.equal(Boolean(policyDisabled.agentTools.apply_patch), false)
  assert.equal(Boolean(policyDisabled.agentTools.create_directory), false)

  const roleDisabled = resolveAgentRuntimeTooling({ canWriteFiles: false }, {
    policy: { agentWriteAccessEnabled: true, agentWriteMode: 'staged' },
  })
  assert.equal(roleDisabled.roleCanWriteFiles, false)
  assert.equal(Boolean(roleDisabled.agentTools.write_file), false)
  assert.equal(Boolean(roleDisabled.agentTools.apply_patch), false)
  assert.equal(Boolean(roleDisabled.agentTools.create_directory), false)
})

test('resolveAgentRuntimeTooling always keeps agent read/search tools available', () => {
  const resolved = resolveAgentRuntimeTooling({ canWriteFiles: true }, {
    policy: { agentWriteAccessEnabled: true, agentWriteMode: 'staged' },
  })

  assert.equal(Boolean(resolved.agentTools.read_file), true)
  assert.equal(Boolean(resolved.agentTools.search_code), true)
  assert.equal(Boolean(resolved.agentTools.list_directory), true)
  assert.equal(Boolean(resolved.agentTools.write_file), true)
  assert.equal(Boolean(resolved.agentTools.apply_patch), true)
  assert.equal(Boolean(resolved.agentTools.plan_read), true)
  assert.equal(Boolean(resolved.agentTools.plan_update), true)
  assert.equal(Boolean(resolved.agentTools.question_user), false)
})

test('task-level read-only access overrides a write-enabled role without changing global policy', () => {
  const resolved = resolveAgentRuntimeTooling({ canWriteFiles: true }, {
    policy: { agentWriteAccessEnabled: true, agentWriteMode: 'staged' },
    agentWriteAccessRequested: false,
  })

  assert.equal(resolved.roleCanWriteFiles, false)
  assert.equal(Boolean(resolved.agentTools.write_file), false)
  assert.equal(Boolean(resolved.agentTools.apply_patch), false)
  assert.equal(Boolean(resolved.agentTools.read_file), true)
})
