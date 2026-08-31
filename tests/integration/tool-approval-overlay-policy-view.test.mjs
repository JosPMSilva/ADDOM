import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'
import {
  getBrowserActionPolicyView,
  getRunCommandPolicyView,
  getTerminalSessionPolicyView,
} from '../../src/renderer/components/tool-approval-policy-view.mjs'
import { getToolMetaFromIdentity } from '../../src/main/tools/tool-identity-registry.mjs'

let ToolApprovalOverlayDialog = null

before(async () => {
  const overlayMod = await ssrLoadRendererModule('/components/ToolApprovalOverlay.jsx')
  ToolApprovalOverlayDialog = overlayMod?.ToolApprovalOverlayDialog || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('ToolApprovalOverlayDialog SSR renders run_command policy summary panel when policy view is present', () => {
  assert.equal(typeof ToolApprovalOverlayDialog, 'function')
  const pending = {
    approvalId: 'approval_1',
    responseChannel: 'tool:approval-response:approval_1',
    toolName: 'run_command',
    toolInput: {
      command: 'npm install vite',
      cwd: '.',
      shell: 'powershell',
    },
    meta: {
      label: 'Run Command',
      risk: 'high',
    },
    expiresAt: 0,
    prevContent: null,
    policy: {
      type: 'run_command_policy_v1',
      profileHint: 'install_sandbox',
      commandClass: 'dependency_install_project',
      shellPreference: 'powershell',
      resolvedCwd: 'C:\\Users\\example\\Documents\\ADDOM',
      pathScope: 'root_only',
      pathRefs: {
        hasAbsolutePathRef: false,
        hasTraversalRef: false,
        externalPathHints: [],
      },
      networkIntent: 'registry_only',
      networkHosts: [],
      install: {
        isInstallLike: true,
        isGlobalOrSystemInstall: false,
        ecosystem: 'npm',
        packagesHint: ['vite'],
      },
      longRunning: false,
      riskSignals: [],
      hints: ['Dependency install detected; preferred execution target is an install sandbox (Phase 2) rather than host shell.'],
      policyDecision: 'route_to_sandbox',
      executionTarget: 'install_sandbox',
      elevationRequired: false,
      sandbox: {
        backend: 'docker',
        available: true,
        networkPolicyMode: 'registry_allowlist',
        registryAllowlist: ['registry.npmjs.org'],
        cacheMountCount: 2,
        mountCount: 4,
      },
    },
  }
  const html = renderToStaticMarkup(React.createElement(ToolApprovalOverlayDialog, {
    pending,
    remainingMs: 0,
    approve: () => {},
    approveHostInstallFallback: () => {},
    approveHostFullAccess: () => {},
    approveHostFullAccessThisTurn: () => {},
    approveWslCompatibility: () => {},
    deny: () => {},
    toolName: pending.toolName,
    toolInput: pending.toolInput,
    meta: pending.meta,
    prevContent: pending.prevContent,
    approvalId: pending.approvalId,
    approvalExpired: false,
    countdownClass: 'text-[#8b9ab4]',
    countdownText: '0:00',
    riskColor: 'text-[#fbbf24]',
    isDiffTool: false,
    runCommandPolicyView: getRunCommandPolicyView(pending),
  }))

  assert.match(html, /Run command/)
  assert.match(html, /Runs in the install sandbox/)
  assert.match(html, /Details/)
  assert.match(html, /Command policy/)
  assert.match(html, /dependency_install_project/)
  assert.match(html, /Resolved cwd/i)
  assert.match(html, /C:\\Users\\example\\Documents\\ADDOM/)
  assert.match(html, /registry_only/)
  assert.match(html, /install_sandbox/)
  assert.match(html, /docker/)
  assert.match(html, /Registry Allowlist/i)
  assert.match(html, /Install Targets/i)
  assert.match(html, /vite/)
  assert.doesNotMatch(html, /Allow This Turn/i)
  assert.doesNotMatch(html, /Always Allow This Type/i)
})

test('ToolApprovalOverlayDialog SSR reuses the command policy panel for local_shell approvals', () => {
  assert.equal(typeof ToolApprovalOverlayDialog, 'function')
  const pending = {
    approvalId: 'approval_local_shell_1',
    responseChannel: 'tool:approval-response:approval_local_shell_1',
    toolName: 'local_shell',
    toolInput: {
      action: {
        type: 'exec',
        command: ['npm', 'run', 'build'],
        workingDirectory: '.',
      },
    },
    meta: { label: 'Local Shell', risk: 'high' },
    prevContent: null,
    policy: {
      type: 'run_command_policy_v1',
      profileHint: 'workspace_safe',
      commandClass: 'project_build_test',
      shellPreference: 'auto',
      resolvedCwd: 'C:\\Users\\example\\Documents\\ADDOM',
      pathScope: 'root_only',
      pathRefs: { hasAbsolutePathRef: false, hasTraversalRef: false, externalPathHints: [] },
      networkIntent: 'none',
      networkHosts: [],
      install: { isInstallLike: false, isGlobalOrSystemInstall: false, ecosystem: '', packagesHint: [] },
      longRunning: false,
      riskSignals: [],
      hints: [],
      policyDecision: 'allow',
      executionTarget: 'host',
      elevationRequired: false,
    },
  }

  const html = renderToStaticMarkup(React.createElement(ToolApprovalOverlayDialog, {
    pending,
    remainingMs: 0,
    approve: () => {},
    approveHostInstallFallback: () => {},
    approveHostFullAccess: () => {},
    approveHostFullAccessThisTurn: () => {},
    approveWslCompatibility: () => {},
    deny: () => {},
    toolName: pending.toolName,
    toolInput: pending.toolInput,
    meta: pending.meta,
    prevContent: pending.prevContent,
    approvalId: pending.approvalId,
    approvalExpired: false,
    countdownClass: 'text-[#8b9ab4]',
    countdownText: '0:00',
    riskColor: 'text-[#fbbf24]',
    isDiffTool: false,
    runCommandPolicyView: getRunCommandPolicyView(pending),
  }))

  assert.match(html, /Run local shell command/)
  assert.match(html, /Command policy/)
  assert.match(html, /project_build_test/)
  assert.match(html, /Resolved cwd/i)
})

test('ToolApprovalOverlayDialog SSR renders terminal session policy summary panel for explicit terminal tools', () => {
  assert.equal(typeof ToolApprovalOverlayDialog, 'function')
  const pending = {
    approvalId: 'approval_terminal_1',
    responseChannel: 'tool:approval-response:approval_terminal_1',
    threadId: 'thread_terminal_1',
    turnId: 'turn_terminal_1',
    originSurface: 'chat',
    originLabel: 'chat composer',
    toolName: 'terminal_session_open',
    toolInput: {
      cwd: '.',
      shell: 'powershell',
      cols: 120,
      rows: 40,
    },
    meta: { label: 'Open Terminal Session', risk: 'critical' },
    prevContent: null,
    policy: {
      type: 'terminal_session_policy_v1',
      action: 'open',
      sessionClass: 'interactive_workspace_shell',
      profileHint: 'workspace_terminal',
      requestedCwd: '.',
      resolvedCwd: 'C:\\Users\\example\\Documents\\ADDOM',
      requestedShell: 'powershell',
      resolvedShell: 'powershell',
      cols: 120,
      rows: 40,
      cwdOutsideWorkspace: false,
      envOverridesRequested: false,
      envOverrideKeys: [],
      policyDecision: 'allow',
      reasons: ['interactive_workspace_shell'],
      hints: ['Terminal session creation remains explicit and separate from run_command/local_shell approval.'],
      riskSignals: [],
      hostAccessRequired: false,
    },
  }

  const html = renderToStaticMarkup(React.createElement(ToolApprovalOverlayDialog, {
    pending,
    remainingMs: 0,
    approve: () => {},
    approveHostInstallFallback: () => {},
    approveHostFullAccess: () => {},
    approveHostFullAccessThisTurn: () => {},
    approveWslCompatibility: () => {},
    deny: () => {},
    toolName: pending.toolName,
    toolInput: pending.toolInput,
    meta: pending.meta,
    prevContent: pending.prevContent,
    approvalId: pending.approvalId,
    approvalExpired: false,
    countdownClass: 'text-[#8b9ab4]',
    countdownText: '0:00',
    riskColor: 'text-[#f87171]',
    isDiffTool: false,
    runCommandPolicyView: null,
    browserActionPolicyView: null,
    terminalSessionPolicyView: getTerminalSessionPolicyView(pending),
  }))

  assert.match(html, /Open terminal/)
  assert.match(html, /Terminal policy/)
  assert.match(html, /Approval provenance/i)
  assert.match(html, /chat composer/i)
  assert.match(html, /thread_terminal_1/)
  assert.match(html, /turn_terminal_1/)
  assert.match(html, /open/)
  assert.match(html, /allow/)
  assert.match(html, /interactive_workspace_shell/)
  assert.match(html, /Resolved cwd/i)
  assert.match(html, /C:\\Users\\example\\Documents\\ADDOM/)
  assert.match(html, /120x40/)
  assert.match(html, /separate from run_command\/local_shell approval/i)
  assert.match(html, /opens a visible chat terminal session/i)
  assert.doesNotMatch(html, /Host access required/i)
  assert.doesNotMatch(html, /WSL compatibility/i)
})

test('ToolApprovalOverlayDialog SSR renders account-native file change review details', () => {
  assert.equal(typeof ToolApprovalOverlayDialog, 'function')
  const pending = {
    approvalId: 'approval_file_change_1',
    responseChannel: 'tool:approval-response:approval_file_change_1',
    toolName: 'file_change',
    toolInput: {
      grantRoot: 'C:\\Users\\example\\Documents\\ADDOM',
      changes: [{
        path: 'C:\\Users\\example\\Documents\\ADDOM\\src\\main\\app.mjs',
        kind: 'modify',
        diff: '@@ -1 +1 @@\n-console.log("old")\n+console.log("new")',
      }],
    },
    changes: [{
      path: 'C:\\Users\\example\\Documents\\ADDOM\\src\\main\\app.mjs',
      kind: 'modify',
      diff: '@@ -1 +1 @@\n-console.log("old")\n+console.log("new")',
    }],
    grantRoot: 'C:\\Users\\example\\Documents\\ADDOM',
    meta: { label: 'Review File Changes', risk: 'high' },
    prevContent: null,
    availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
  }

  const html = renderToStaticMarkup(React.createElement(ToolApprovalOverlayDialog, {
    pending,
    remainingMs: 0,
    approve: () => {},
    approveForSession: () => {},
    approveHostInstallFallback: () => {},
    approveHostFullAccess: () => {},
    approveHostFullAccessThisTurn: () => {},
    approveWslCompatibility: () => {},
    deny: () => {},
    toolName: pending.toolName,
    toolInput: pending.toolInput,
    meta: pending.meta,
    prevContent: pending.prevContent,
    approvalId: pending.approvalId,
    approvalExpired: false,
    countdownClass: 'text-[#8b9ab4]',
    countdownText: '0:00',
    riskColor: 'text-[#fbbf24]',
    isDiffTool: true,
    isAccountFileChangeReview: true,
    runCommandPolicyView: null,
    browserActionPolicyView: null,
  }))

  assert.match(html, /Review file changes/i)
  assert.match(html, /Granted Root/i)
  assert.match(html, /C:\\Users\\example\\Documents\\ADDOM/)
  assert.match(html, /src\\main\\app\.mjs/i)
  assert.match(html, /console\.log\(&quot;new&quot;\)/i)
  assert.match(html, /Allow for session/i)
})

test('ToolApprovalOverlayDialog create_directory stays calm without risk badge chrome', () => {
  assert.equal(typeof ToolApprovalOverlayDialog, 'function')
  const pending = {
    approvalId: 'approval_create_directory_1',
    responseChannel: 'tool:approval-response:approval_create_directory_1',
    toolName: 'create_directory',
    toolInput: {
      path: 'field-notes-tracker',
    },
    meta: getToolMetaFromIdentity('create_directory'),
    expiresAt: 0,
    prevContent: null,
  }

  const html = renderToStaticMarkup(React.createElement(ToolApprovalOverlayDialog, {
    pending,
    remainingMs: 0,
    approve: () => {},
    approveForSession: () => {},
    approveHostInstallFallback: () => {},
    approveHostFullAccess: () => {},
    approveHostFullAccessThisTurn: () => {},
    approveWslCompatibility: () => {},
    deny: () => {},
    openCommandSafetySettings: () => {},
    toolName: pending.toolName,
    toolInput: pending.toolInput,
    meta: pending.meta,
    prevContent: pending.prevContent,
    approvalId: pending.approvalId,
    approvalExpired: false,
    approvalAction: null,
    countdownClass: 'text-[#8b9ab4]',
    countdownText: '0:00',
    riskColor: 'text-[#fbbf24]',
    isDiffTool: false,
    isAccountFileChangeReview: false,
    runCommandPolicyView: null,
    browserActionPolicyView: null,
    terminalSessionPolicyView: null,
    overlayDialogRef: { current: null },
  }))

  assert.match(html, /Create Directory/i)
  assert.doesNotMatch(html, /Writes file/)
  assert.doesNotMatch(html, /Runs code/)
  assert.doesNotMatch(html, /Read-only/)
  assert.match(html, /field-notes-tracker/)
  assert.match(html, /data-ui="approval-shortcut-esc"/)
})

test('ToolApprovalOverlayDialog SSR renders host fallback action when install sandbox is unavailable', () => {
  assert.equal(typeof ToolApprovalOverlayDialog, 'function')
  const pending = {
    approvalId: 'approval_2',
    responseChannel: 'tool:approval-response:approval_2',
    toolName: 'run_command',
    toolInput: { command: 'npm install vitest', cwd: '.', shell: 'powershell' },
    meta: { label: 'Run Command', risk: 'high' },
    prevContent: null,
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
      install: { isInstallLike: true, isGlobalOrSystemInstall: false, ecosystem: 'npm', packagesHint: ['vitest'] },
      longRunning: false,
      riskSignals: [],
      hints: ['Install sandbox is unavailable. You can deny, or explicitly allow a one-shot host fallback from the approval dialog.'],
      policyDecision: 'route_to_sandbox',
      executionTarget: 'install_sandbox',
      elevationRequired: false,
      sandbox: { backend: 'none', available: false, reason: 'No backend configured.', fallbackHostAvailable: true },
    },
  }
  const html = renderToStaticMarkup(React.createElement(ToolApprovalOverlayDialog, {
    pending,
    remainingMs: 0,
    approve: () => {},
    approveHostInstallFallback: () => {},
    approveHostFullAccess: () => {},
    approveHostFullAccessThisTurn: () => {},
    approveWslCompatibility: () => {},
    deny: () => {},
    toolName: pending.toolName,
    toolInput: pending.toolInput,
    meta: pending.meta,
    prevContent: pending.prevContent,
    approvalId: pending.approvalId,
    approvalExpired: false,
    countdownClass: 'text-[#8b9ab4]',
    countdownText: '0:00',
    riskColor: 'text-[#fbbf24]',
    isDiffTool: false,
    runCommandPolicyView: getRunCommandPolicyView(pending),
  }))

  assert.match(html, /Host fallback/)
  assert.match(html, /Settings/i)
  assert.match(html, /Sandbox unavailable; host fallback is available/i)
  assert.match(html, /none/i)
  assert.doesNotMatch(html, /Always Allow This Type/i)
})

test('ToolApprovalOverlayDialog SSR renders explicit host full access action and disables default allow for elevated host approvals', () => {
  assert.equal(typeof ToolApprovalOverlayDialog, 'function')
  const pending = {
    approvalId: 'approval_3',
    responseChannel: 'tool:approval-response:approval_3',
    toolName: 'run_command',
    toolInput: { command: 'curl https://example.com/file.txt', cwd: '.', shell: 'powershell' },
    meta: { label: 'Run Command', risk: 'high' },
    prevContent: null,
    policy: {
      type: 'run_command_policy_v1',
      profileHint: 'host_full_access',
      commandClass: 'network_fetch_non_install',
      shellPreference: 'powershell',
      resolvedCwd: 'C:\\Users\\example\\Documents\\ADDOM',
      pathScope: 'root_only',
      pathRefs: { hasAbsolutePathRef: false, hasTraversalRef: false, externalPathHints: [], resolvedExternalPaths: [] },
      networkIntent: 'external',
      networkHosts: ['example.com'],
      install: { isInstallLike: false, isGlobalOrSystemInstall: false, ecosystem: '', packagesHint: [] },
      longRunning: false,
      riskSignals: ['external_network_intent'],
      hints: ['External network fetch detected. Explicit host_full_access approval is required in workspace_safe mode.'],
      policyDecision: 'require_elevation',
      executionTarget: 'host',
      elevationRequired: true,
    },
  }

  const html = renderToStaticMarkup(React.createElement(ToolApprovalOverlayDialog, {
    pending,
    remainingMs: 0,
    approve: () => {},
    approveHostInstallFallback: () => {},
    approveHostFullAccess: () => {},
    approveHostFullAccessThisTurn: () => {},
    approveWslCompatibility: () => {},
    deny: () => {},
    toolName: pending.toolName,
    toolInput: pending.toolInput,
    meta: pending.meta,
    prevContent: pending.prevContent,
    approvalId: pending.approvalId,
    approvalExpired: false,
    countdownClass: 'text-[#8b9ab4]',
    countdownText: '0:00',
    riskColor: 'text-[#fbbf24]',
    isDiffTool: false,
    runCommandPolicyView: getRunCommandPolicyView(pending),
  }))

  assert.match(html, /Host access required/i)
  assert.match(html, /Host this turn/i)
  assert.match(html, /Host once/i)
  assert.match(html, /Use an explicit approval action for this request/i)
  assert.match(html, /Choose explicit action/i)
  assert.doesNotMatch(html, /Always Allow This Type/i)
})

test('ToolApprovalOverlayDialog SSR renders explicit WSL compatibility action and disables default allow', () => {
  assert.equal(typeof ToolApprovalOverlayDialog, 'function')
  const pending = {
    approvalId: 'approval_wsl_1',
    responseChannel: 'tool:approval-response:approval_wsl_1',
    toolName: 'run_command',
    toolInput: { command: 'npm install vite', cwd: '.', shell: 'powershell' },
    meta: { label: 'Run Command', risk: 'high' },
    prevContent: null,
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
      hints: ['WSL is a compatibility backend with host filesystem reachability via /mnt. Explicit WSL compatibility approval is required for this sandbox-routed install.'],
      policyDecision: 'route_to_sandbox',
      executionTarget: 'install_sandbox',
      elevationRequired: false,
      sandbox: {
        backend: 'wsl',
        available: true,
        requiresCompatibilityApproval: true,
        securityBoundary: false,
        compatibilityMode: 'wsl',
        networkPolicyMode: 'registry_allowlist',
        networkEnforcementMode: 'best_effort',
      },
    },
  }

  const html = renderToStaticMarkup(React.createElement(ToolApprovalOverlayDialog, {
    pending,
    remainingMs: 0,
    approve: () => {},
    approveHostInstallFallback: () => {},
    approveHostFullAccess: () => {},
    approveHostFullAccessThisTurn: () => {},
    approveWslCompatibility: () => {},
    deny: () => {},
    toolName: pending.toolName,
    toolInput: pending.toolInput,
    meta: pending.meta,
    prevContent: pending.prevContent,
    approvalId: pending.approvalId,
    approvalExpired: false,
    countdownClass: 'text-[#8b9ab4]',
    countdownText: '0:00',
    riskColor: 'text-[#fbbf24]',
    isDiffTool: false,
    runCommandPolicyView: getRunCommandPolicyView(pending),
  }))

  assert.match(html, /WSL compatibility/i)
  assert.match(html, /WSL once/i)
  assert.match(html, /Use an explicit approval action for this request/i)
  assert.match(html, /Choose explicit action/i)
  assert.doesNotMatch(html, /Always Allow This Type/i)
})

test('ToolApprovalOverlayDialog SSR uses bounded fallback diff for large write previews to keep UI responsive', () => {
  assert.equal(typeof ToolApprovalOverlayDialog, 'function')
  const bigPrev = new Array(1200).fill(0).map((_, i) => `line_${i}`).join('\n')
  const bigNext = new Array(1200).fill(0).map((_, i) => i === 600 ? `line_${i}_changed` : `line_${i}`).join('\n')
  const pending = {
    approvalId: 'approval_write_large',
    responseChannel: 'tool:approval-response:approval_write_large',
    toolName: 'write_file',
    toolInput: {
      path: 'src/huge.txt',
      content: bigNext,
    },
    meta: { label: 'Write File', risk: 'high' },
    prevContent: bigPrev,
    expiresAt: 0,
  }

  const html = renderToStaticMarkup(React.createElement(ToolApprovalOverlayDialog, {
    pending,
    remainingMs: 0,
    approve: () => {},
    approveHostInstallFallback: () => {},
    approveHostFullAccess: () => {},
    approveHostFullAccessThisTurn: () => {},
    approveWslCompatibility: () => {},
    deny: () => {},
    openCommandSafetySettings: () => {},
    toolName: pending.toolName,
    toolInput: pending.toolInput,
    meta: pending.meta,
    prevContent: pending.prevContent,
    approvalId: pending.approvalId,
    approvalExpired: false,
    countdownClass: 'text-[#8b9ab4]',
    countdownText: '0:00',
    riskColor: 'text-[#fbbf24]',
    isDiffTool: true,
    runCommandPolicyView: null,
  }))

  assert.match(html, /Large diff detected; showing partial diff to keep UI responsive/i)
  assert.match(html, /unchanged .* omitted|added lines omitted|removed lines omitted/i)
})

test('ToolApprovalOverlayDialog SSR renders browser action policy summary panel for localhost approvals', () => {
  assert.equal(typeof ToolApprovalOverlayDialog, 'function')
  const pending = {
    approvalId: 'approval_browser_local_1',
    responseChannel: 'tool:approval-response:approval_browser_local_1',
    toolName: 'browser_action',
    toolInput: {
      action: 'navigate',
      url: 'http://127.0.0.1:9222',
    },
    meta: { label: 'Browser Action', risk: 'medium' },
    prevContent: null,
    policy: {
      type: 'browser_action_policy_v1',
      action: 'navigate',
      targetClass: 'private_network',
      targetOrigin: 'http://127.0.0.1:9222',
      targetHost: '127.0.0.1',
      resolvedAddresses: ['127.0.0.1'],
      approvalClass: 'browser_private_network',
      policyDecision: 'prompt',
      hints: ['This target is on localhost or a private network and requires a separate project-session approval.'],
      elevated: false,
    },
  }

  const html = renderToStaticMarkup(React.createElement(ToolApprovalOverlayDialog, {
    pending,
    remainingMs: 0,
    approve: () => {},
    approveHostInstallFallback: () => {},
    approveHostFullAccess: () => {},
    approveHostFullAccessThisTurn: () => {},
    approveWslCompatibility: () => {},
    deny: () => {},
    openCommandSafetySettings: () => {},
    toolName: pending.toolName,
    toolInput: pending.toolInput,
    meta: pending.meta,
    prevContent: pending.prevContent,
    approvalId: pending.approvalId,
    approvalExpired: false,
    countdownClass: 'text-[#8b9ab4]',
    countdownText: '0:00',
    riskColor: 'text-[#93c5fd]',
    isDiffTool: false,
    runCommandPolicyView: null,
    browserActionPolicyView: getBrowserActionPolicyView(pending),
  }))

  assert.match(html, /Use browser/i)
  assert.match(html, /Browser policy/i)
  assert.match(html, /private_network/i)
  assert.match(html, /localhost or a private network/i)
  assert.match(html, /127\.0\.0\.1:9222/)
  assert.doesNotMatch(html, /Host once/i)
})
