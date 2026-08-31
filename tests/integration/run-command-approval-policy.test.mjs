import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import {
  buildApprovalPolicyForTool,
  shouldShortCircuitToolByPolicy,
} from '../../src/main/chat/run-command-approval-policy.mjs'
import {
  __resetTerminalSessionRuntimeForTests,
  setTerminalSessionManagerForChat,
} from '../../src/main/chat/terminal-session-events.mjs'
import { resolveManagedPlanStorageRoot } from '../../src/main/chat/managed-plan-storage-paths.mjs'

test.afterEach(() => {
  __resetTerminalSessionRuntimeForTests()
})

test('managed plan storage rejects generic file mutations before approval', async () => {
  const managedPlanPath = path.join(resolveManagedPlanStorageRoot(), 'thread-1', 'Plan.md')
  const policy = await buildApprovalPolicyForTool({
    toolName: 'write_file',
    toolInput: {
      path: managedPlanPath,
      content: '# replacement',
    },
    projectFolder: process.cwd(),
  })

  assert.equal(policy?.type, 'file_tool_policy_v1')
  assert.equal(policy?.policyDecision, 'deny')
  assert.equal(policy?.denyReason, 'managed_plan_storage_reserved')
  assert.deepEqual(
    shouldShortCircuitToolByPolicy({ toolName: 'write_file', approvalPolicy: policy }),
    {
      action: 'deny',
      denyReason: 'managed_plan_storage_reserved',
      policyDecision: 'deny',
      reasons: ['reserved_managed_plan_storage'],
      hints: policy.hints,
    },
  )
})

test('managed plan storage remains reserved when it is inside the opened project root', async () => {
  const managedPlanRoot = resolveManagedPlanStorageRoot()
  const policy = await buildApprovalPolicyForTool({
    toolName: 'edit_file',
    toolInput: {
      path: path.join(managedPlanRoot, 'thread-1', 'Plan.md'),
      old_text: 'before',
      new_text: 'after',
    },
    projectFolder: path.dirname(managedPlanRoot),
  })

  assert.equal(policy?.pathScope, 'root_only')
  assert.equal(policy?.policyDecision, 'deny')
  assert.equal(policy?.denyReason, 'managed_plan_storage_reserved')
})

test('buildApprovalPolicyForTool enriches run_command install approval with policyDecision and sandbox unavailable preview', async () => {
  const policy = await buildApprovalPolicyForTool({
    toolName: 'run_command',
    toolInput: {
      command: 'npm install vite',
      cwd: '.',
      shell: 'powershell',
    },
    projectFolder: process.cwd(),
    commandSafetySettings: {
      installSandboxEnabled: true,
      preferredBackend: 'none',
      registryAllowlist: ['registry.npmjs.org'],
    },
  })

  assert.ok(policy)
  assert.equal(policy.type, 'run_command_policy_v1')
  assert.equal(policy.policyDecision, 'route_to_sandbox')
  assert.equal(policy.executionTarget, 'install_sandbox')
  assert.equal(policy.sandbox?.available, false)
  assert.equal(policy.sandbox?.fallbackHostAvailable, true)
  assert.equal(policy.sandbox?.strictEgressImplementationMode, 'none')
  assert.ok(Array.isArray(policy.hints))
  assert.ok(policy.hints.some((msg) => /one-shot host fallback/i.test(msg)))
})

test('buildApprovalPolicyForTool returns null for non-run_command tools', async () => {
  const policy = await buildApprovalPolicyForTool({
    toolName: 'question_user',
    toolInput: { question: 'x' },
    projectFolder: process.cwd(),
  })
  assert.equal(policy, null)
})

test('buildApprovalPolicyForTool keeps terminal session creation explicit and scoped', async () => {
  const policy = await buildApprovalPolicyForTool({
    toolName: 'terminal_session_open',
    toolInput: {
      cwd: '.',
      shell: 'default',
      cols: 100,
      rows: 30,
    },
    projectFolder: process.cwd(),
    permissionMode: 'ask',
  })

  assert.ok(policy)
  assert.equal(policy.type, 'terminal_session_policy_v1')
  assert.equal(policy.policyDecision, 'allow')
  assert.equal(policy.sessionClass, 'interactive_workspace_shell')
  assert.equal(policy.laterWritesStayBoundToSession, true)
})

test('buildApprovalPolicyForTool requires elevation for outside-workspace terminal sessions until full_access is explicit', async () => {
  const policy = await buildApprovalPolicyForTool({
    toolName: 'terminal_session_open',
    toolInput: {
      cwd: path.resolve(process.cwd(), '..'),
      shell: 'default',
    },
    projectFolder: process.cwd(),
    permissionMode: 'ask',
  })

  assert.ok(policy)
  assert.equal(policy.type, 'terminal_session_policy_v1')
  assert.equal(policy.policyDecision, 'require_elevation')
  assert.equal(policy.hostAccessRequired, true)
})

test('buildApprovalPolicyForTool denies terminal session reuse when the session is outside the current workspace', async () => {
  const outsideRoot = process.platform === 'win32'
    ? 'C:\\outside-workspace'
    : '/tmp/outside-workspace'
  setTerminalSessionManagerForChat({
    createSession() {
      throw new Error('not used in this test')
    },
    getSession(sessionId) {
      return {
        id: sessionId,
        status: 'running',
        cwd: outsideRoot,
        cols: 120,
        rows: 40,
        shell: 'default',
        policy: {
          type: 'terminal_session_policy_v1',
          profileHint: 'host_full_access',
          sessionClass: 'interactive_host_shell',
          resolvedCwd: outsideRoot,
          requestedCwd: outsideRoot,
          requestedShell: 'default',
          resolvedShell: 'default',
          hostAccessRequired: true,
          laterWritesStayBoundToSession: true,
        },
      }
    },
  })

  const policy = await buildApprovalPolicyForTool({
    toolName: 'terminal_session_write',
    toolInput: {
      sessionId: 'term_scope_1',
      data: 'dir\r',
    },
    projectFolder: process.cwd(),
    permissionMode: 'ask',
  })

  assert.ok(policy)
  assert.equal(policy.type, 'terminal_session_policy_v1')
  assert.equal(policy.policyDecision, 'deny')
  assert.equal(policy.hostAccessRequired, true)
  assert.equal(policy.sessionScope, 'host_scoped_existing_session')
  assert.ok(policy.hints.some((msg) => /outside the active workspace/i.test(msg)))
})

test('buildApprovalPolicyForTool reuses runtime terminal size validation for resize actions', async () => {
  setTerminalSessionManagerForChat({
    createSession() {
      throw new Error('not used in this test')
    },
    getSession(sessionId) {
      return {
        id: sessionId,
        status: 'running',
        cwd: process.cwd(),
        cols: 120,
        rows: 40,
        shell: 'default',
        policy: {
          type: 'terminal_session_policy_v1',
          profileHint: 'workspace_terminal',
          sessionClass: 'interactive_workspace_shell',
          resolvedCwd: process.cwd(),
          requestedCwd: process.cwd(),
          requestedShell: 'default',
          resolvedShell: 'default',
          hostAccessRequired: false,
          laterWritesStayBoundToSession: true,
        },
      }
    },
  })

  const policy = await buildApprovalPolicyForTool({
    toolName: 'terminal_session_resize',
    toolInput: {
      sessionId: 'term_resize_1',
      cols: 5,
      rows: 40,
    },
    projectFolder: process.cwd(),
    permissionMode: 'full_access',
  })

  assert.ok(policy)
  assert.equal(policy.type, 'terminal_session_policy_v1')
  assert.equal(policy.policyDecision, 'deny')
  assert.ok(policy.hints.some((msg) => /between 20 and 400/i.test(msg)))
})

test('buildApprovalPolicyForTool flags out-of-root file tool access for approval', async () => {
  const externalPath = process.platform === 'win32'
    ? path.join(process.env.TEMP || process.cwd(), 'approval-host-file.txt')
    : '/tmp/approval-host-file.txt'
  const policy = await buildApprovalPolicyForTool({
    toolName: 'read_file',
    toolInput: { path: externalPath },
    projectFolder: process.cwd(),
  })

  assert.ok(policy)
  assert.equal(policy.type, 'file_tool_policy_v1')
  assert.equal(policy.hostAccessRequired, true)
  assert.ok(Array.isArray(policy.externalPaths))
  assert.ok(policy.externalPaths.length >= 1)
})

test('buildApprovalPolicyForTool classifies public and private browser navigation targets', async () => {
  const publicPolicy = await buildApprovalPolicyForTool({
    toolName: 'browser_action',
    toolInput: {
      action: 'navigate',
      url: 'http://93.184.216.34/docs',
    },
    projectFolder: process.cwd(),
  })
  assert.ok(publicPolicy)
  assert.equal(publicPolicy.type, 'browser_action_policy_v1')
  assert.equal(publicPolicy.targetClass, 'public_network')
  assert.equal(publicPolicy.approvalClass, 'browser_public_network')
  assert.equal(publicPolicy.policyDecision, 'prompt')

  const privatePolicy = await buildApprovalPolicyForTool({
    toolName: 'browser_action',
    toolInput: {
      action: 'navigate',
      url: 'http://127.0.0.1:3000',
    },
    projectFolder: process.cwd(),
  })
  assert.ok(privatePolicy)
  assert.equal(privatePolicy.targetClass, 'private_network')
  assert.equal(privatePolicy.approvalClass, 'browser_private_network')
  assert.equal(privatePolicy.policyDecision, 'prompt')
})

test('buildApprovalPolicyForTool denies blocked browser targets and auto-approves lifecycle actions', async () => {
  const blockedPolicy = await buildApprovalPolicyForTool({
    toolName: 'browser_action',
    toolInput: {
      action: 'navigate',
      url: 'http://169.254.169.254/latest/meta-data',
    },
    projectFolder: process.cwd(),
  })
  assert.ok(blockedPolicy)
  assert.equal(blockedPolicy.policyDecision, 'deny')
  assert.equal(blockedPolicy.targetClass, 'blocked')
  assert.ok(blockedPolicy.hints.some((msg) => /blocked/i.test(msg)))

  const launchPolicy = await buildApprovalPolicyForTool({
    toolName: 'browser_action',
    toolInput: {
      action: 'launch',
      headless: true,
    },
    projectFolder: process.cwd(),
  })
  assert.ok(launchPolicy)
  assert.equal(launchPolicy.policyDecision, 'approve')
  assert.equal(launchPolicy.targetClass, 'none')
  assert.equal(launchPolicy.approvalClass, '')
})

test('buildApprovalPolicyForTool normalizes OpenAI local_shell exec actions through the same policy engine', async () => {
  const policy = await buildApprovalPolicyForTool({
    toolName: 'local_shell',
    toolInput: {
      action: {
        type: 'exec',
        command: ['npm', 'run', 'build'],
        workingDirectory: '.',
      },
    },
    projectFolder: process.cwd(),
    commandSafetySettings: {
      installSandboxEnabled: true,
      allowHostInstalls: false,
    },
  })

  assert.ok(policy)
  assert.equal(policy.type, 'run_command_policy_v1')
  assert.equal(policy.commandClass, 'project_build_test')
  assert.equal(policy.policyDecision, 'allow')
  assert.equal(policy.executionTarget, 'host')
  assert.equal(policy.elevationRequired, false)
})

test('buildApprovalPolicyForTool denies shell env overrides through the shared command policy', async () => {
  const policy = await buildApprovalPolicyForTool({
    toolName: 'local_shell',
    toolInput: {
      action: {
        type: 'exec',
        command: ['git', 'status'],
        workingDirectory: '.',
        env: { FOO: 'bar' },
      },
    },
    projectFolder: process.cwd(),
    permissionMode: 'full_access',
    commandSafetySettings: {},
  })

  assert.ok(policy)
  assert.equal(policy.type, 'run_command_policy_v1')
  assert.equal(policy.policyDecision, 'deny')
  assert.equal(policy.elevationRequired, true)
  assert.ok(policy.hints.some((msg) => /environment overrides/i.test(msg)))
})

test('buildApprovalPolicyForTool lets full_access preserve an outside-workspace cwd request for shell parity', async () => {
  const outsideRoot = process.platform === 'win32'
    ? path.resolve(process.cwd(), '..')
    : path.resolve('/tmp')
  const policy = await buildApprovalPolicyForTool({
    toolName: 'local_shell',
    toolInput: {
      action: {
        type: 'exec',
        command: ['git', 'status'],
        workingDirectory: outsideRoot,
      },
    },
    projectFolder: process.cwd(),
    permissionMode: 'full_access',
    commandSafetySettings: {},
  })

  assert.ok(policy)
  assert.equal(policy.type, 'run_command_policy_v1')
  assert.equal(policy.policyDecision, 'allow')
  assert.equal(policy.elevationRequired, false)
})

test('buildApprovalPolicyForTool accepts workdir as a run_command cwd alias', async () => {
  const policy = await buildApprovalPolicyForTool({
    toolName: 'run_command',
    toolInput: {
      command: 'Get-ChildItem -Force',
      workdir: 'src',
      shell: 'powershell',
    },
    projectFolder: process.cwd(),
    commandSafetySettings: {},
  })

  assert.ok(policy)
  assert.equal(policy.type, 'run_command_policy_v1')
  assert.equal(policy.resolvedCwd, path.join(process.cwd(), 'src'))
  assert.equal(policy.executionTarget, 'host')
})

test('buildApprovalPolicyForTool applies full_access command policy overrides before approval short-circuiting', async () => {
  const externalPath = process.platform === 'win32'
    ? path.join(process.env.TEMP || process.cwd(), 'approval-host-file.txt')
    : '/tmp/approval-host-file.txt'
  const command = process.platform === 'win32'
    ? `Get-Content "${externalPath}"`
    : `cat "${externalPath}"`
  const policy = await buildApprovalPolicyForTool({
    toolName: 'run_command',
    toolInput: {
      command,
      cwd: '.',
      shell: process.platform === 'win32' ? 'powershell' : 'bash',
    },
    projectFolder: process.cwd(),
    permissionMode: 'full_access',
    commandSafetySettings: {},
  })

  assert.ok(policy)
  assert.equal(policy.type, 'run_command_policy_v1')
  assert.notEqual(policy.policyDecision, 'deny')
})

test('buildApprovalPolicyForTool denies malformed OpenAI local_shell actions instead of falling back', async () => {
  const policy = await buildApprovalPolicyForTool({
    toolName: 'local_shell',
    toolInput: {
      action: {
        type: 'unsupported',
        command: [],
      },
    },
    projectFolder: process.cwd(),
    commandSafetySettings: {},
  })

  assert.ok(policy)
  assert.equal(policy.policyDecision, 'deny')
  assert.equal(policy.executionTarget, 'host')
  assert.equal(policy.elevationRequired, true)
  assert.ok(policy.hints.some((msg) => /blocked this step instead of falling back/i.test(msg)))
})

test('shouldShortCircuitToolByPolicy denies blocked global/system installs before approval', async () => {
  const policy = await buildApprovalPolicyForTool({
    toolName: 'run_command',
    toolInput: {
      command: 'npm install -g typescript',
      cwd: '.',
      shell: 'powershell',
    },
    projectFolder: process.cwd(),
    commandSafetySettings: {
      allowHostInstalls: false,
      installSandboxEnabled: true,
    },
  })

  assert.ok(policy)
  assert.equal(policy.policyDecision, 'deny')
  const shortCircuit = shouldShortCircuitToolByPolicy({
    toolName: 'run_command',
    approvalPolicy: policy,
  })
  assert.deepEqual(shortCircuit && shortCircuit.action, 'deny')
  assert.equal(shortCircuit?.denyReason, 'policy_denied')
})
