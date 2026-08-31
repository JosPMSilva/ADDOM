import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveToolApprovalPromptDecision } from '../../src/main/chat/tool-approval-rules.mjs'
import {
  buildRiskyActionSessionCandidate,
  clearRiskyActionSessionState,
  recordApprovedRiskyActionSession,
} from '../../src/main/chat/risky-action-session-state.mjs'

test.beforeEach(() => {
  clearRiskyActionSessionState()
})

test('ask mode auto-approves workspace-safe file and host command actions', () => {
  const projectRoot = process.cwd()

  const askFileAuto = resolveToolApprovalPromptDecision({
    toolName: 'write_file',
    projectFolder: projectRoot,
    permissionMode: 'ask',
  })
  assert.equal(askFileAuto.action, 'approve')
  assert.equal(askFileAuto.source, 'permission_mode_ask')

  const askBuildAuto = resolveToolApprovalPromptDecision({
    toolName: 'run_command',
    projectFolder: projectRoot,
    permissionMode: 'ask',
    approvalPolicy: {
      type: 'run_command_policy_v1',
      commandClass: 'project_build_test',
      executionTarget: 'host',
      policyDecision: 'allow',
      elevationRequired: false,
    },
  })
  assert.equal(askBuildAuto.action, 'approve')
  assert.equal(askBuildAuto.source, 'permission_mode_ask')

  const askLocalShellAuto = resolveToolApprovalPromptDecision({
    toolName: 'local_shell',
    projectFolder: projectRoot,
    permissionMode: 'ask',
    approvalPolicy: {
      type: 'run_command_policy_v1',
      commandClass: 'project_build_test',
      executionTarget: 'host',
      policyDecision: 'allow',
      elevationRequired: false,
    },
  })
  assert.equal(askLocalShellAuto.action, 'approve')
  assert.equal(askLocalShellAuto.source, 'permission_mode_ask')
})

test('first risky web fetches and project installs prompt until remembered for the project session', () => {
  const projectRoot = process.cwd()
  const fetchDecision = resolveToolApprovalPromptDecision({
    toolName: 'fetch_page',
    projectFolder: projectRoot,
    permissionMode: 'autonomy',
  })
  assert.equal(fetchDecision.action, 'prompt')
  assert.equal(fetchDecision.source, 'prompt')
  assert.equal(fetchDecision.riskyActionSessionCandidate?.sessionKey, 'network_fetch')

  const installPolicy = {
    type: 'run_command_policy_v1',
    commandClass: 'dependency_install_project',
    executionTarget: 'install_sandbox',
    policyDecision: 'route_to_sandbox',
    elevationRequired: false,
    sandbox: { available: true },
  }
  const installDecision = resolveToolApprovalPromptDecision({
    toolName: 'run_command',
    projectFolder: projectRoot,
    permissionMode: 'ask',
    approvalPolicy: installPolicy,
  })
  assert.equal(installDecision.action, 'prompt')
  assert.equal(installDecision.source, 'prompt')
  assert.equal(installDecision.riskyActionSessionCandidate?.sessionKey, 'dependency_install_project')

  recordApprovedRiskyActionSession(buildRiskyActionSessionCandidate({
    toolName: 'fetch_page',
    projectFolder: projectRoot,
  }))
  recordApprovedRiskyActionSession(buildRiskyActionSessionCandidate({
    toolName: 'run_command',
    projectFolder: projectRoot,
    approvalPolicy: installPolicy,
  }))

  const rememberedFetch = resolveToolApprovalPromptDecision({
    toolName: 'fetch_page',
    projectFolder: projectRoot,
    permissionMode: 'autonomy',
  })
  assert.equal(rememberedFetch.action, 'approve')
  assert.equal(rememberedFetch.source, 'risky_action_session')

  const rememberedInstall = resolveToolApprovalPromptDecision({
    toolName: 'run_command',
    projectFolder: projectRoot,
    permissionMode: 'ask',
    approvalPolicy: installPolicy,
  })
  assert.equal(rememberedInstall.action, 'approve')
  assert.equal(rememberedInstall.source, 'risky_action_session')
})

test('autonomy still prompts for risky or elevated command paths', () => {
  const projectRoot = process.cwd()

  const gitStatusAuto = resolveToolApprovalPromptDecision({
    toolName: 'git_status',
    projectFolder: projectRoot,
    permissionMode: 'autonomy',
  })
  assert.equal(gitStatusAuto.action, 'approve')
  assert.equal(gitStatusAuto.source, 'permission_mode_autonomy')

  const gitDiffAuto = resolveToolApprovalPromptDecision({
    toolName: 'git_diff',
    projectFolder: projectRoot,
    permissionMode: 'autonomy',
  })
  assert.equal(gitDiffAuto.action, 'approve')
  assert.equal(gitDiffAuto.source, 'permission_mode_autonomy')

  const gitLogAuto = resolveToolApprovalPromptDecision({
    toolName: 'git_log',
    projectFolder: projectRoot,
    permissionMode: 'autonomy',
  })
  assert.equal(gitLogAuto.action, 'approve')
  assert.equal(gitLogAuto.source, 'permission_mode_autonomy')

  const mutationAuto = resolveToolApprovalPromptDecision({
    toolName: 'run_command',
    projectFolder: projectRoot,
    permissionMode: 'autonomy',
    approvalPolicy: {
      type: 'run_command_policy_v1',
      commandClass: 'project_mutation',
      executionTarget: 'host',
      policyDecision: 'allow',
      elevationRequired: false,
    },
  })
  assert.equal(mutationAuto.action, 'approve')
  assert.equal(mutationAuto.source, 'permission_mode_autonomy')

  const networkPrompt = resolveToolApprovalPromptDecision({
    toolName: 'run_command',
    projectFolder: projectRoot,
    permissionMode: 'autonomy',
    approvalPolicy: {
      type: 'run_command_policy_v1',
      commandClass: 'network_fetch_non_install',
      executionTarget: 'host',
      policyDecision: 'require_elevation',
      elevationRequired: true,
    },
  })
  assert.equal(networkPrompt.action, 'prompt')
  assert.equal(networkPrompt.source, 'prompt')

  const localShellAuto = resolveToolApprovalPromptDecision({
    toolName: 'local_shell',
    projectFolder: projectRoot,
    permissionMode: 'autonomy',
    approvalPolicy: {
      type: 'run_command_policy_v1',
      commandClass: 'project_build_test',
      executionTarget: 'host',
      policyDecision: 'allow',
      elevationRequired: false,
    },
  })
  assert.equal(localShellAuto.action, 'approve')
  assert.equal(localShellAuto.source, 'permission_mode_autonomy')
})

test('ask and autonomy prompt for out-of-root file access while full_access auto-approves it', () => {
  const projectRoot = process.cwd()
  const filePolicy = {
    type: 'file_tool_policy_v1',
    hostAccessRequired: true,
    externalPaths: [process.platform === 'win32' ? 'C:\\outside.txt' : '/tmp/outside.txt'],
  }

  const askPrompt = resolveToolApprovalPromptDecision({
    toolName: 'read_file',
    projectFolder: projectRoot,
    permissionMode: 'ask',
    approvalPolicy: filePolicy,
  })
  assert.equal(askPrompt.action, 'prompt')

  const autonomyPrompt = resolveToolApprovalPromptDecision({
    toolName: 'read_file',
    projectFolder: projectRoot,
    permissionMode: 'autonomy',
    approvalPolicy: filePolicy,
  })
  assert.equal(autonomyPrompt.action, 'prompt')

  const fullAccessApprove = resolveToolApprovalPromptDecision({
    toolName: 'read_file',
    projectFolder: projectRoot,
    permissionMode: 'full_access',
    approvalPolicy: filePolicy,
  })
  assert.equal(fullAccessApprove.action, 'approve')
  assert.equal(fullAccessApprove.approvalMeta?.fileSystem?.hostFullAccess, true)
})

test('full_access auto-approves tools and injects host full access meta for shell execution', () => {
  const projectRoot = process.cwd()

  const fullAccessFetch = resolveToolApprovalPromptDecision({
    toolName: 'fetch_page',
    projectFolder: projectRoot,
    permissionMode: 'full_access',
  })
  assert.equal(fullAccessFetch.action, 'approve')
  assert.equal(fullAccessFetch.source, 'permission_mode_full_access')

  const fullAccessCommand = resolveToolApprovalPromptDecision({
    toolName: 'run_command',
    projectFolder: projectRoot,
    permissionMode: 'full_access',
    approvalPolicy: {
      type: 'run_command_policy_v1',
      commandClass: 'network_fetch_non_install',
      executionTarget: 'host',
      policyDecision: 'require_elevation',
      elevationRequired: true,
    },
  })
  assert.equal(fullAccessCommand.action, 'approve')
  assert.equal(fullAccessCommand.source, 'permission_mode_full_access')
  assert.equal(fullAccessCommand.approvalMeta?.runCommand?.hostFullAccess, true)
  assert.equal(fullAccessCommand.approvalMeta?.runCommand?.hostFullAccessThisTurn, true)
})

test('policy-denied shell actions stay denied even in full_access mode', () => {
  const projectRoot = process.cwd()

  const deniedRunCommand = resolveToolApprovalPromptDecision({
    toolName: 'run_command',
    projectFolder: projectRoot,
    permissionMode: 'full_access',
    approvalPolicy: {
      type: 'run_command_policy_v1',
      commandClass: 'project_readonly_shell',
      executionTarget: 'host',
      policyDecision: 'deny',
      elevationRequired: true,
    },
  })
  assert.equal(deniedRunCommand.action, 'deny')
  assert.equal(deniedRunCommand.denyReason, 'policy_denied')

  const deniedLocalShell = resolveToolApprovalPromptDecision({
    toolName: 'local_shell',
    projectFolder: projectRoot,
    permissionMode: 'full_access',
    approvalPolicy: {
      type: 'run_command_policy_v1',
      commandClass: 'project_readonly_shell',
      executionTarget: 'host',
      policyDecision: 'deny',
      elevationRequired: true,
    },
  })
  assert.equal(deniedLocalShell.action, 'deny')
  assert.equal(deniedLocalShell.denyReason, 'policy_denied')
})

test('browser_action reuses approvals only for the same reviewed origin', () => {
  const projectRoot = process.cwd()
  const publicPolicy = {
    type: 'browser_action_policy_v1',
    action: 'navigate',
    targetClass: 'public_network',
    targetOrigin: 'https://example.com',
    targetHost: 'example.com',
    resolvedAddresses: ['93.184.216.34'],
    approvalClass: 'browser_public_network',
    policyDecision: 'prompt',
    hints: [],
  }
  const otherPublicPolicy = {
    type: 'browser_action_policy_v1',
    action: 'navigate',
    targetClass: 'public_network',
    targetOrigin: 'https://other.example',
    targetHost: 'other.example',
    resolvedAddresses: ['93.184.216.35'],
    approvalClass: 'browser_public_network',
    policyDecision: 'prompt',
    hints: [],
  }
  const privatePolicy = {
    type: 'browser_action_policy_v1',
    action: 'navigate',
    targetClass: 'private_network',
    targetOrigin: 'http://127.0.0.1:3000',
    targetHost: '127.0.0.1',
    resolvedAddresses: ['127.0.0.1'],
    approvalClass: 'browser_private_network',
    policyDecision: 'prompt',
    hints: [],
  }

  const firstPublic = resolveToolApprovalPromptDecision({
    toolName: 'browser_action',
    projectFolder: projectRoot,
    permissionMode: 'ask',
    approvalPolicy: publicPolicy,
  })
  assert.equal(firstPublic.action, 'prompt')
  assert.equal(firstPublic.riskyActionSessionCandidate?.sessionKey, 'browser_public_network|https://example.com')

  const firstPrivate = resolveToolApprovalPromptDecision({
    toolName: 'browser_action',
    projectFolder: projectRoot,
    permissionMode: 'ask',
    approvalPolicy: privatePolicy,
  })
  assert.equal(firstPrivate.action, 'prompt')
  assert.equal(firstPrivate.riskyActionSessionCandidate?.sessionKey, 'browser_private_network|http://127.0.0.1:3000')

  recordApprovedRiskyActionSession(buildRiskyActionSessionCandidate({
    toolName: 'browser_action',
    projectFolder: projectRoot,
    approvalPolicy: publicPolicy,
  }))

  const rememberedPublic = resolveToolApprovalPromptDecision({
    toolName: 'browser_action',
    projectFolder: projectRoot,
    permissionMode: 'autonomy',
    approvalPolicy: publicPolicy,
  })
  assert.equal(rememberedPublic.action, 'approve')
  assert.equal(rememberedPublic.source, 'risky_action_session')

  const otherPublicOrigin = resolveToolApprovalPromptDecision({
    toolName: 'browser_action',
    projectFolder: projectRoot,
    permissionMode: 'autonomy',
    approvalPolicy: otherPublicPolicy,
  })
  assert.equal(otherPublicOrigin.action, 'prompt')

  const stillPromptPrivate = resolveToolApprovalPromptDecision({
    toolName: 'browser_action',
    projectFolder: projectRoot,
    permissionMode: 'autonomy',
    approvalPolicy: privatePolicy,
  })
  assert.equal(stillPromptPrivate.action, 'prompt')
})

test('browser_action execute_js approval reuse is origin-scoped', () => {
  const projectRoot = process.cwd()
  const firstOriginPolicy = {
    type: 'browser_action_policy_v1',
    action: 'execute_js',
    targetClass: 'public_network',
    targetOrigin: 'https://example.com',
    targetHost: 'example.com',
    resolvedAddresses: ['93.184.216.34'],
    approvalClass: 'browser_public_execute_js',
    policyDecision: 'prompt',
    hints: [],
  }
  const secondOriginPolicy = {
    ...firstOriginPolicy,
    targetOrigin: 'https://other.example',
    targetHost: 'other.example',
    resolvedAddresses: ['93.184.216.35'],
  }

  recordApprovedRiskyActionSession(buildRiskyActionSessionCandidate({
    toolName: 'browser_action',
    projectFolder: projectRoot,
    approvalPolicy: firstOriginPolicy,
  }))

  const rememberedFirstOrigin = resolveToolApprovalPromptDecision({
    toolName: 'browser_action',
    projectFolder: projectRoot,
    permissionMode: 'autonomy',
    approvalPolicy: firstOriginPolicy,
  })
  assert.equal(rememberedFirstOrigin.action, 'approve')

  const secondOriginDecision = resolveToolApprovalPromptDecision({
    toolName: 'browser_action',
    projectFolder: projectRoot,
    permissionMode: 'autonomy',
    approvalPolicy: secondOriginPolicy,
  })
  assert.equal(secondOriginDecision.action, 'prompt')
  assert.equal(
    secondOriginDecision.riskyActionSessionCandidate?.sessionKey,
    'browser_public_execute_js|https://other.example',
  )
})

test('browser_action auto-approves safe lifecycle actions but denies blocked targets', () => {
  const projectRoot = process.cwd()

  const launchDecision = resolveToolApprovalPromptDecision({
    toolName: 'browser_action',
    projectFolder: projectRoot,
    permissionMode: 'ask',
    approvalPolicy: {
      type: 'browser_action_policy_v1',
      action: 'launch',
      targetClass: 'none',
      approvalClass: '',
      policyDecision: 'approve',
    },
  })
  assert.equal(launchDecision.action, 'approve')

  const blockedDecision = resolveToolApprovalPromptDecision({
    toolName: 'browser_action',
    projectFolder: projectRoot,
    permissionMode: 'ask',
    approvalPolicy: {
      type: 'browser_action_policy_v1',
      action: 'navigate',
      targetClass: 'blocked',
      approvalClass: '',
      policyDecision: 'deny',
      hints: ['blocked'],
    },
  })
  assert.equal(blockedDecision.action, 'deny')
  assert.equal(blockedDecision.denyReason, 'policy_denied')

  const fullAccessExecuteJs = resolveToolApprovalPromptDecision({
    toolName: 'browser_action',
    projectFolder: projectRoot,
    permissionMode: 'full_access',
    approvalPolicy: {
      type: 'browser_action_policy_v1',
      action: 'execute_js',
      targetClass: 'private_network',
      approvalClass: 'browser_private_execute_js',
      policyDecision: 'prompt',
      elevated: true,
    },
  })
  assert.equal(fullAccessExecuteJs.action, 'approve')
  assert.equal(fullAccessExecuteJs.source, 'permission_mode_full_access')
})

test('terminal session open stays explicit while existing-session controls auto-approve', () => {
  const projectRoot = process.cwd()

  const listDecision = resolveToolApprovalPromptDecision({
    toolName: 'terminal_session_list',
    projectFolder: projectRoot,
    permissionMode: 'ask',
    approvalPolicy: {
      type: 'terminal_session_policy_v1',
      action: 'list',
      policyDecision: 'allow',
      sessionScope: 'thread_workspace_visible',
    },
  })
  assert.equal(listDecision.action, 'approve')
  assert.equal(listDecision.source, 'terminal_session_ask')

  const openDecision = resolveToolApprovalPromptDecision({
    toolName: 'terminal_session_open',
    projectFolder: projectRoot,
    permissionMode: 'ask',
    approvalPolicy: {
      type: 'terminal_session_policy_v1',
      action: 'open',
      policyDecision: 'allow',
      hostAccessRequired: false,
    },
  })
  assert.equal(openDecision.action, 'prompt')
  assert.equal(openDecision.source, 'prompt')

  const writeDecision = resolveToolApprovalPromptDecision({
    toolName: 'terminal_session_write',
    projectFolder: projectRoot,
    permissionMode: 'ask',
    approvalPolicy: {
      type: 'terminal_session_policy_v1',
      action: 'write',
      policyDecision: 'allow',
      sessionId: 'term_123',
      sessionScope: 'existing_session_only',
    },
  })
  assert.equal(writeDecision.action, 'approve')
  assert.equal(writeDecision.source, 'terminal_session_ask')

  const readSnapshotDecision = resolveToolApprovalPromptDecision({
    toolName: 'terminal_session_read_snapshot',
    projectFolder: projectRoot,
    permissionMode: 'ask',
    approvalPolicy: {
      type: 'terminal_session_policy_v1',
      action: 'read_snapshot',
      policyDecision: 'allow',
      sessionId: 'term_123',
      sessionScope: 'existing_session_only',
    },
  })
  assert.equal(readSnapshotDecision.action, 'approve')
  assert.equal(readSnapshotDecision.source, 'terminal_session_ask')

  const waitDecision = resolveToolApprovalPromptDecision({
    toolName: 'terminal_session_wait_for_output',
    projectFolder: projectRoot,
    permissionMode: 'ask',
    approvalPolicy: {
      type: 'terminal_session_policy_v1',
      action: 'wait_for_output',
      policyDecision: 'allow',
      sessionId: 'term_123',
      sessionScope: 'existing_session_only',
    },
  })
  assert.equal(waitDecision.action, 'approve')
  assert.equal(waitDecision.source, 'terminal_session_ask')

  const autonomyAttachDecision = resolveToolApprovalPromptDecision({
    toolName: 'terminal_session_attach',
    projectFolder: projectRoot,
    permissionMode: 'autonomy',
    approvalPolicy: {
      type: 'terminal_session_policy_v1',
      action: 'attach',
      policyDecision: 'allow',
      sessionId: 'term_123',
      sessionScope: 'existing_session_only',
    },
  })
  assert.equal(autonomyAttachDecision.action, 'approve')
  assert.equal(autonomyAttachDecision.source, 'terminal_session_autonomy')
})

test('terminal session policy denies stay blocked and full_access preserves explicit terminal identity', () => {
  const projectRoot = process.cwd()

  const deniedDecision = resolveToolApprovalPromptDecision({
    toolName: 'terminal_session_write',
    projectFolder: projectRoot,
    permissionMode: 'full_access',
    approvalPolicy: {
      type: 'terminal_session_policy_v1',
      action: 'write',
      policyDecision: 'deny',
    },
  })
  assert.equal(deniedDecision.action, 'deny')
  assert.equal(deniedDecision.denyReason, 'policy_denied')

  const fullAccessOpenDecision = resolveToolApprovalPromptDecision({
    toolName: 'terminal_session_open',
    projectFolder: projectRoot,
    permissionMode: 'full_access',
    approvalPolicy: {
      type: 'terminal_session_policy_v1',
      action: 'open',
      policyDecision: 'allow',
      hostAccessRequired: true,
    },
  })
  assert.equal(fullAccessOpenDecision.action, 'approve')
  assert.equal(fullAccessOpenDecision.source, 'permission_mode_full_access')
  assert.equal(fullAccessOpenDecision.approvalMeta?.terminalSession?.hostFullAccess, true)
})
