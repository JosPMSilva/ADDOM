import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'
import { getRunCommandPolicyView } from '../../src/renderer/components/tool-approval-policy-view.mjs'

let ToolApprovalOverlayDialog = null

before(async () => {
  const overlayMod = await ssrLoadRendererModule('/components/ToolApprovalOverlay.jsx')
  ToolApprovalOverlayDialog = overlayMod?.ToolApprovalOverlayDialog || null
})

after(async () => {
  await closeViteSsrLoader()
})

function renderDialog(overrides = {}) {
  const pending = {
    approvalId: 'approval_calm_1',
    responseChannel: 'tool:approval-response:approval_calm_1',
    toolName: 'run_command',
    toolInput: {
      command: 'npm install',
      cwd: '.',
      shell: 'powershell',
    },
    meta: {
      label: 'Run Command',
      risk: 'critical',
    },
    expiresAt: Date.now() + 60_000,
    prevContent: null,
    ...overrides.pending,
  }
  return renderToStaticMarkup(React.createElement(ToolApprovalOverlayDialog, {
    pending,
    remainingMs: 45_000,
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
    countdownClass: 'text-text-tertiary',
    countdownText: '0:45',
    isDiffTool: false,
    isAccountFileChangeReview: false,
    runCommandPolicyView: getRunCommandPolicyView(pending),
    browserActionPolicyView: null,
    terminalSessionPolicyView: null,
    overlayDialogRef: { current: null },
    ...overrides,
  }))
}

test('ToolApprovalOverlayDialog calm chrome: single tonal card, no risk badge, Esc/Enter chips, neutral Allow', () => {
  assert.equal(typeof ToolApprovalOverlayDialog, 'function')
  const html = renderDialog()

  assert.match(html, /data-ui="tool-approval-dialog"/)
  assert.match(html, /Run command/)
  assert.match(html, /0:45/)
  // Modal card sits one tone above the scrim (panel, not raised/shell).
  assert.match(html, /bg-surface-panel/)
  assert.doesNotMatch(html, /bg-surface-raised/)
  assert.doesNotMatch(html, /Expires in/)
  assert.doesNotMatch(html, /Runs code/)
  assert.doesNotMatch(html, /Writes file/)
  assert.doesNotMatch(html, /Read-only/)

  // No segmented header/footer bands.
  assert.doesNotMatch(html, /border-b border-surface-border/)
  assert.doesNotMatch(html, /border-t border-surface-border bg-surface-panel/)

  assert.match(html, /data-ui="approval-shortcut-esc"/)
  assert.match(html, />esc</)
  assert.match(html, /data-ui="approval-shortcut-enter"/)
  assert.match(html, /Deny \(Esc\)/)
  assert.match(html, /Allow \(Enter\)/)

  // Critical Allow stays neutral graphite — not a danger fill.
  assert.doesNotMatch(html, /bg-danger-bg/)
  assert.match(html, /bg-surface-panel-muted-strong/)
})
