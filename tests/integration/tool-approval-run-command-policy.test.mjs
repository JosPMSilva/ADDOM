import test from 'node:test'
import assert from 'node:assert/strict'

import { buildApprovalRequestPayload } from '../../src/main/chat/approval-flow-payload.mjs'

test('approval request payload includes optional run_command policy metadata when provided', () => {
  const payload = buildApprovalRequestPayload({
    approvalId: 'appr_1',
    responseChannel: 'tool:approval-response:appr_1',
    toolName: 'run_command',
    toolInput: { command: 'npm install vite', cwd: '.', shell: 'powershell' },
    meta: { label: 'Run command', risk: 'high' },
    projectRoot: 'C:\\Users\\example\\Documents\\ADDOM',
    prevContent: null,
    expiresAt: 123,
    timeoutMs: 456,
    policyDecision: 'route_to_sandbox',
    executionTarget: 'install_sandbox',
    elevationRequired: false,
    grantRoot: 'C:\\Users\\example\\Documents\\ADDOM',
    changes: [{ path: 'src\\main\\app.mjs', kind: 'modify', diff: '@@ -1 +1 @@' }],
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
      hints: ['Dependency install detected; preferred execution target is an install sandbox (Phase 2) rather than host shell.'],
    },
  })

  assert.equal(payload.toolName, 'run_command')
  assert.equal(payload.policy?.type, 'run_command_policy_v1')
  assert.equal(payload.policy?.profileHint, 'install_sandbox')
  assert.equal(payload.policy?.commandClass, 'dependency_install_project')
  assert.equal(payload.policyDecision, 'route_to_sandbox')
  assert.equal(payload.executionTarget, 'install_sandbox')
  assert.equal(payload.elevationRequired, false)
  assert.equal(payload.grantRoot, 'C:\\Users\\example\\Documents\\ADDOM')
  assert.deepEqual(payload.changes, [{ path: 'src\\main\\app.mjs', kind: 'modify', diff: '@@ -1 +1 @@' }])
})

test('approval request payload omits policy metadata when absent or invalid', () => {
  const withoutPolicy = buildApprovalRequestPayload({
    approvalId: 'appr_2',
    responseChannel: 'tool:approval-response:appr_2',
    toolName: 'write_file',
    toolInput: { path: 'a.txt', content: 'x' },
    meta: { label: 'Write file', risk: 'high' },
    projectRoot: 'C:\\Users\\example\\Documents\\ADDOM',
    prevContent: 'old',
    expiresAt: 123,
    timeoutMs: 456,
  })
  assert.equal('policy' in withoutPolicy, false)

  const invalidPolicy = buildApprovalRequestPayload({
    approvalId: 'appr_3',
    responseChannel: 'tool:approval-response:appr_3',
    toolName: 'run_command',
    toolInput: { command: 'dir' },
    meta: {},
    projectRoot: '.',
    prevContent: null,
    expiresAt: 1,
    timeoutMs: 2,
    policy: 'not-an-object',
  })
  assert.equal('policy' in invalidPolicy, false)
  assert.equal('approvalRuleCandidate' in invalidPolicy, false)
})

test('approval request payload includes provenance metadata for approval provenance labeling', () => {
  const payload = buildApprovalRequestPayload({
    approvalId: 'appr_4',
    responseChannel: 'tool:approval-response:appr_4',
    toolName: 'terminal_session_open',
    toolInput: { cwd: '.', shell: 'powershell' },
    meta: { label: 'Open terminal', risk: 'high' },
    projectRoot: 'C:\\Users\\example\\Documents\\ADDOM',
    prevContent: null,
    expiresAt: 123,
    timeoutMs: 456,
    threadId: 'thread_approval',
    turnId: 'turn_approval',
    originSurface: 'chat',
    originLabel: 'chat composer',
  })

  assert.equal(payload.originSurface, 'chat')
  assert.equal(payload.originLabel, 'chat composer')
  assert.equal(payload.threadId, 'thread_approval')
  assert.equal(payload.turnId, 'turn_approval')
})
