import test from 'node:test'
import assert from 'node:assert/strict'

import {
  clearRunCommandPolicyTelemetry,
  createRunCommandPolicyTelemetryState,
  getRunCommandPolicyTelemetrySnapshot,
  recordTerminalToolContextTelemetry,
  recordToolApprovalPromptDecisionTelemetry,
  recordRunCommandApprovalTelemetryDecision,
  recordRunCommandApprovalTelemetryShown,
  recordRunCommandPolicyTelemetryEvent,
  recordRunCommandShellDialectHints,
} from '../../src/main/chat/run-command-policy-telemetry.mjs'

function samplePolicy(overrides = {}) {
  return {
    type: 'run_command_policy_v1',
    policyDecision: 'allow_with_warning',
    executionTarget: 'host',
    elevationRequired: true,
    commandClass: 'dependency_install_global_or_system',
    hints: ['Global/system install detected; require explicit elevated host approval.'],
    policyReasons: ['global_or_system_install'],
    ...overrides,
  }
}

test('run_command policy telemetry records warnings, elevations, session auto-allows, and permission-mode suppressions', () => {
  const state = createRunCommandPolicyTelemetryState({ maxRecentEvents: 5 })

  recordRunCommandPolicyTelemetryEvent(state, 'routed_to_sandbox', { commandClass: 'dependency_install_project' })
  recordRunCommandApprovalTelemetryShown(state, samplePolicy())
  recordRunCommandApprovalTelemetryDecision(state, { policy: samplePolicy(), decision: 'approved' })
  recordRunCommandApprovalTelemetryDecision(state, { policy: samplePolicy(), decision: 'denied' })
  recordRunCommandPolicyTelemetryEvent(state, 'host_policy_elevation_required', {
    reasons: ['external_path_access', 'external_network_fetch'],
  })
  recordToolApprovalPromptDecisionTelemetry(state, {
    source: 'risky_action_session',
    action: 'approve',
    toolName: 'run_command',
    permissionMode: 'autonomy',
  })
  recordToolApprovalPromptDecisionTelemetry(state, {
    source: 'permission_mode_ask',
    action: 'approve',
    toolName: 'run_command',
    permissionMode: 'ask',
  })
  recordToolApprovalPromptDecisionTelemetry(state, {
    source: 'permission_mode_autonomy',
    action: 'approve',
    toolName: 'write_file',
    permissionMode: 'autonomy',
  })
  recordToolApprovalPromptDecisionTelemetry(state, {
    source: 'permission_mode_full_access',
    action: 'approve',
    toolName: 'run_command',
    permissionMode: 'full_access',
  })
  recordRunCommandShellDialectHints(state, {
    command: 'dir /a',
    shell: 'powershell',
    stderr: "dir : Cannot find path 'C:\\a' because it does not exist.",
    hints: ['In PowerShell use Get-ChildItem -Force (or dir -Force) instead of dir /a.'],
  })

  const snap = getRunCommandPolicyTelemetrySnapshot(state)
  assert.equal(snap.counters.sandboxRoutesTaken, 1)
  assert.equal(snap.counters.policyAdvisoryWarningsShown, 1)
  assert.equal(snap.counters.elevationRequestsShown, 1)
  assert.equal(snap.counters.elevationRequestsApproved, 1)
  assert.equal(snap.counters.elevationRequestsDenied, 1)
  assert.equal(snap.counters.shellDialectMistakesDetected, 1)
  assert.equal(snap.counters.sessionRiskyAutoAllows, 1)
  assert.equal(snap.counters.permissionModePromptSuppressions, 3)
  assert.equal(snap.breakdowns.shellDialectMistakeKinds.powershell_dir_slash_a, 1)
  assert.equal(snap.breakdowns.eventKinds.routed_to_sandbox, 1)
  assert.equal(snap.breakdowns.promptSuppressionsByPermissionMode.ask, 1)
  assert.equal(snap.breakdowns.promptSuppressionsByPermissionMode.autonomy, 1)
  assert.equal(snap.breakdowns.promptSuppressionsByPermissionMode.full_access, 1)
  assert.equal(snap.breakdowns.toolApprovalAutoAllowSources.risky_action_session, 1)
  assert.equal(snap.breakdowns.toolApprovalAutoAllowSources.permission_mode_ask, 1)
  assert.equal(snap.breakdowns.toolApprovalAutoAllowSources.permission_mode_autonomy, 1)
  assert.equal(snap.breakdowns.toolApprovalAutoAllowSources.permission_mode_full_access, 1)
  assert.equal(snap.breakdowns.elevationReasonKindsShown.global_or_system_install, 1)
  assert.equal(snap.breakdowns.elevationReasonKindsResult['global_or_system_install:approved'], 1)
  assert.equal(snap.breakdowns.elevationReasonKindsResult['global_or_system_install:denied'], 1)
  assert.equal(snap.breakdowns.hostPolicyReasonKinds.external_path_access, 1)
  assert.equal(snap.breakdowns.hostPolicyReasonKinds.external_network_fetch, 1)
  assert.ok(snap.recentEvents.length <= 5)
})

test('run_command policy telemetry records terminal timeout streaks and repeated writes without output progress', () => {
  const state = createRunCommandPolicyTelemetryState({ maxRecentEvents: 12 })

  recordTerminalToolContextTelemetry(state, {
    kind: 'terminal_session',
    action: 'write',
    sessionId: 'term_1',
    commandHash: 'hash_same',
    outputSequence: 12,
  })
  recordTerminalToolContextTelemetry(state, {
    kind: 'terminal_session',
    action: 'write',
    sessionId: 'term_1',
    commandHash: 'hash_same',
    outputSequence: 12,
  })
  recordTerminalToolContextTelemetry(state, {
    kind: 'terminal_session',
    action: 'wait_for_output',
    sessionId: 'term_1',
    outputSequence: 12,
    sinceSequence: 12,
    timedOut: true,
    matched: false,
    outputProgress: false,
  })
  recordTerminalToolContextTelemetry(state, {
    kind: 'terminal_session',
    action: 'wait_for_output',
    sessionId: 'term_1',
    outputSequence: 12,
    sinceSequence: 12,
    timedOut: true,
    matched: false,
    outputProgress: false,
  })

  const snap = getRunCommandPolicyTelemetrySnapshot(state)
  assert.equal(snap.counters.terminalToolCycles, 4)
  assert.equal(snap.counters.terminalWaitTimeouts, 2)
  assert.equal(snap.counters.terminalLoopAlerts, 2)
  assert.equal(snap.breakdowns.terminalToolActions.write, 2)
  assert.equal(snap.breakdowns.terminalToolActions.wait_for_output, 2)
  assert.equal(snap.breakdowns.terminalLoopAlertKinds.repeated_write_no_output_progress, 1)
  assert.equal(snap.breakdowns.terminalLoopAlertKinds.wait_timeout_streak, 1)
  assert.equal(snap.recentEvents.some((row) => row.type === 'terminal_loop_alert'), true)
})

test('run_command policy telemetry clear resets counters and events', () => {
  const state = createRunCommandPolicyTelemetryState()
  recordRunCommandPolicyTelemetryEvent(state, 'routed_to_sandbox', {})
  recordRunCommandApprovalTelemetryShown(state, samplePolicy({ elevationRequired: false }))
  assert.equal(getRunCommandPolicyTelemetrySnapshot(state).recentEvents.length > 0, true)

  clearRunCommandPolicyTelemetry(state)
  const snap = getRunCommandPolicyTelemetrySnapshot(state)
  assert.equal(snap.counters.sandboxRoutesTaken, 0)
  assert.equal(snap.counters.policyAdvisoryWarningsShown, 0)
  assert.equal(snap.counters.sessionRiskyAutoAllows, 0)
  assert.equal(snap.counters.permissionModePromptSuppressions, 0)
  assert.equal(snap.recentEvents.length, 0)
})
