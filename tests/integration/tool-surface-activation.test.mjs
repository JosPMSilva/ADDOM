import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CAPABILITY_ACTIVATION_REASONS,
  CAPABILITY_ACTIVATION_STATES,
} from '../../src/main/tools/capability-catalog-schema.mjs'
import {
  TOOL_SURFACE_ACTIVATION_REASON,
  TOOL_SURFACE_ACTIVATION_STATE,
  activateToolSurfaceCapability,
  blockToolSurfaceCapability,
  consumePrimedToolSurfaceActivation,
  createHiddenDiscoverableActivation,
  decayToolSurfaceActivationAfterAssistantToolStep,
  decayToolSurfaceActivationAtTurnBoundary,
  markToolSurfaceCapabilityUnavailable,
  restoreToolSurfaceActivationFromCompaction,
  serializeToolSurfaceActivationForCompaction,
  summarizeToolSurfaceActivation,
} from '../../src/main/chat/tool-surface-activation.mjs'
import {
  TOOL_SURFACE_ACTIVATION_REASONS,
  TOOL_SURFACE_ACTIVATION_STATES,
} from '../../src/main/chat/tool-surface-activation-reasons.mjs'

test('activation states and reasons match catalog schema constants', () => {
  assert.deepEqual(TOOL_SURFACE_ACTIVATION_STATES, CAPABILITY_ACTIVATION_STATES)
  assert.deepEqual(TOOL_SURFACE_ACTIVATION_REASONS, CAPABILITY_ACTIVATION_REASONS)
})

test('default core activation is active and survives turn decay', () => {
  const record = activateToolSurfaceCapability(null, {
    capabilityId: 'builtins.git',
    reason: TOOL_SURFACE_ACTIVATION_REASON.DEFAULT_CORE,
  })

  assert.equal(record.state, TOOL_SURFACE_ACTIVATION_STATE.ACTIVE)
  assert.equal(record.persistAcrossCompaction, true)
  assert.equal(decayToolSurfaceActivationAtTurnBoundary(record), record)
})

test('catalog reads prime the next eligible model step then decay after two tool steps', () => {
  const primed = activateToolSurfaceCapability(null, {
    capabilityId: 'builtins.browser',
    reason: TOOL_SURFACE_ACTIVATION_REASON.CATALOG_READ,
  })

  assert.equal(primed.state, TOOL_SURFACE_ACTIVATION_STATE.PRIMED)
  assert.equal(primed.primedForNextEligibleStep, true)

  const active = consumePrimedToolSurfaceActivation(primed)
  assert.equal(active.state, TOOL_SURFACE_ACTIVATION_STATE.ACTIVE)
  assert.equal(active.activeToolStepsRemaining, 2)

  const afterOne = decayToolSurfaceActivationAfterAssistantToolStep(active)
  assert.equal(afterOne.state, TOOL_SURFACE_ACTIVATION_STATE.ACTIVE)
  assert.equal(afterOne.activeToolStepsRemaining, 1)

  const afterTwo = decayToolSurfaceActivationAfterAssistantToolStep(afterOne)
  assert.equal(afterTwo.state, TOOL_SURFACE_ACTIVATION_STATE.HIDDEN_DISCOVERABLE)
})

test('hidden-known recovery primes only one eligible step', () => {
  const primed = activateToolSurfaceCapability(null, {
    capabilityId: 'builtins.files',
    reason: TOOL_SURFACE_ACTIVATION_REASON.HIDDEN_KNOWN_RECOVERY,
  })
  const active = consumePrimedToolSurfaceActivation(primed)

  assert.equal(active.state, TOOL_SURFACE_ACTIVATION_STATE.ACTIVE)
  assert.equal(active.activeToolStepsRemaining, 0)
  assert.equal(decayToolSurfaceActivationAfterAssistantToolStep(active).state, TOOL_SURFACE_ACTIVATION_STATE.HIDDEN_DISCOVERABLE)
})

test('strong intent is current-turn active and does not persist across compaction', () => {
  const record = activateToolSurfaceCapability(null, {
    capabilityId: 'builtins.terminal-sessions',
    reason: TOOL_SURFACE_ACTIVATION_REASON.STRONG_INTENT,
  })

  assert.equal(record.state, TOOL_SURFACE_ACTIVATION_STATE.ACTIVE)
  assert.equal(decayToolSurfaceActivationAtTurnBoundary(record).state, TOOL_SURFACE_ACTIVATION_STATE.HIDDEN_DISCOVERABLE)
  assert.equal(serializeToolSurfaceActivationForCompaction(record), null)
})

test('explicit request persists across compaction while still relevant', () => {
  const record = activateToolSurfaceCapability(null, {
    capabilityId: 'builtins.delegation',
    reason: TOOL_SURFACE_ACTIVATION_REASON.EXPLICIT_REQUEST,
  })
  const serialized = serializeToolSurfaceActivationForCompaction(record, {
    referencedCapabilityIds: ['builtins.delegation'],
  })

  assert.equal(serialized.state, TOOL_SURFACE_ACTIVATION_STATE.ACTIVE)
  assert.equal(restoreToolSurfaceActivationFromCompaction(serialized).capabilityId, 'builtins.delegation')
  assert.equal(serializeToolSurfaceActivationForCompaction(record, {
    referencedCapabilityIds: ['builtins.git'],
  }), null)
})

test('compaction drops primed and runtime-unavailable state', () => {
  const primed = activateToolSurfaceCapability(null, {
    capabilityId: 'builtins.browser',
    reason: TOOL_SURFACE_ACTIVATION_REASON.CATALOG_READ,
  })
  const unavailable = markToolSurfaceCapabilityUnavailable(null, {
    capabilityId: 'builtins.skills',
    unavailableReason: 'runtime offline',
  })

  assert.equal(serializeToolSurfaceActivationForCompaction(primed), null)
  assert.equal(serializeToolSurfaceActivationForCompaction(unavailable), null)
})

test('policy block and runtime unavailable are status states, not permission grants', () => {
  const active = activateToolSurfaceCapability(null, {
    capabilityId: 'builtins.shell',
    reason: TOOL_SURFACE_ACTIVATION_REASON.EXPLICIT_REQUEST,
  })
  const blocked = blockToolSurfaceCapability(active, {
    blockedReason: 'dangerous command policy',
  })
  const unavailable = markToolSurfaceCapabilityUnavailable(blocked, {
    unavailableReason: 'runtime disabled',
  })
  const summary = summarizeToolSurfaceActivation(unavailable)

  assert.equal(blocked.state, TOOL_SURFACE_ACTIVATION_STATE.BLOCKED)
  assert.equal(unavailable.state, TOOL_SURFACE_ACTIVATION_STATE.UNAVAILABLE)
  assert.equal(summary.approved, undefined)
  assert.equal(summary.permissionMode, undefined)
  assert.equal(summary.unavailableReason, 'runtime disabled')
})

test('hidden discoverable records validate capability ids and invalid reasons fail', () => {
  assert.equal(createHiddenDiscoverableActivation('builtins.git').state, TOOL_SURFACE_ACTIVATION_STATE.HIDDEN_DISCOVERABLE)
  assert.throws(
    () => activateToolSurfaceCapability(null, { capabilityId: 'builtins.git', reason: 'approval_granted' }),
    /Invalid tool surface activation reason/,
  )
  assert.throws(
    () => createHiddenDiscoverableActivation(''),
    /capabilityId is required/,
  )
})
