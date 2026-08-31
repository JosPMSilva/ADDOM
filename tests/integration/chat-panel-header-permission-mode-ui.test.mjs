import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let ChatPanelHeaderBar = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/ChatPanelHeaderBar.jsx')
  ChatPanelHeaderBar = mod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

function renderHeader(overrides = {}) {
  return renderToStaticMarkup(React.createElement(ChatPanelHeaderBar, {
    activeThreadId: 'thread_1',
    activeThreadTitle: 'Primary thread',
    timelineLength: 3,
    permissionMode: 'ask',
    permissionModeChangePending: false,
    onPermissionModeChange: () => {},
    onClearConversation: () => {},
    activeThreadIsEmpty: false,
    providerSwitchHint: null,
    actionsDisabled: false,
    onInjectSwitchContext: () => {},
    onDismissProviderSwitchHint: () => {},
    onCreateThread: () => {},
    ...overrides,
  }))
}

test('chat header renders permission mode alongside thread drawer controls', () => {
  assert.equal(typeof ChatPanelHeaderBar, 'function')

  const html = renderHeader()

  assert.match(html, /Permission/)
  assert.match(html, /aria-label="Permission mode"/)
  assert.match(html, />Ask</)
  assert.match(html, /aria-haspopup="listbox"/)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /data-ui="chat-permission-mode-trigger"/)
  assert.doesNotMatch(html, />Autonomy</)
  assert.doesNotMatch(html, />Full access</)
  assert.match(html, /title="Prompt before risky actions"/)
  assert.doesNotMatch(html, /data-ui="workspace-rail-open"/)
})

test('chat header exposes exactly one workspace rail recovery control only while closed', () => {
  const closed = renderHeader({
    workspaceRailEnabled: true,
    workspaceRailOpen: false,
    onOpenWorkspaceRail: () => {},
  })
  assert.match(closed, /data-ui="workspace-rail-open"/)
  assert.match(closed, /aria-label="Show projects and threads"/)
  assert.equal((closed.match(/data-ui="workspace-rail-open"/g) || []).length, 1)

  const open = renderHeader({ workspaceRailEnabled: true, workspaceRailOpen: true })
  assert.doesNotMatch(open, /data-ui="workspace-rail-open"/)
})

test('closed rail control announces the highest-priority hidden thread state', () => {
  const closed = renderHeader({
    workspaceRailEnabled: true,
    workspaceRailOpen: false,
    workspaceRailActivitySummary: { activity: 'needs_input', count: 2 },
    onOpenWorkspaceRail: () => {},
  })
  assert.match(closed, /aria-label="Show projects and threads\. 2 hidden threads; highest priority: Needs input\."/)
})

test('chat header derives Agents visibility from the active thread only', () => {
  const source = fs.readFileSync(path.resolve('src/renderer/components/chat/ChatPanelHeaderBar.jsx'), 'utf8')
  assert.match(source, /threadId: activeThreadId,/)
  assert.match(source, /selectAgentCompanionStatus\(s, \{/)
  assert.match(source, /shouldShowAgentCompanionTrigger\(agentStatus, activeChatCompanion\)/)
  assert.match(source, /showAgentStatus \? \(/)
  assert.match(source, /data-ui="agents-companion-toggle"/)
})

test('ChatPanel forwards App-owned workspace rail state to the header', () => {
  const panelSource = fs.readFileSync(path.resolve('src/renderer/components/ChatPanel.jsx'), 'utf8')
  const viewSource = fs.readFileSync(path.resolve('src/renderer/components/chat/ChatPanelView.jsx'), 'utf8')

  assert.match(panelSource, /export default function ChatPanel\(\{[\s\S]*workspaceRailEnabled[\s\S]*workspaceRailOpen[\s\S]*onOpenWorkspaceRail/)
  assert.match(panelSource, /workspaceRailEnabled, workspaceRailOpen, onOpenWorkspaceRail/)
  assert.match(viewSource, /workspaceRailEnabled, workspaceRailOpen, onOpenWorkspaceRail/)
  assert.match(viewSource, /workspaceRailEnabled=\{workspaceRailEnabled\}/)
  assert.match(viewSource, /workspaceRailOpen=\{workspaceRailOpen\}/)
  assert.match(viewSource, /onOpenWorkspaceRail=\{onOpenWorkspaceRail\}/)
})

test('chat header preserves the active permission mode without plan-mode dormancy text', () => {
  const html = renderHeader({
    permissionMode: 'autonomy',
  })

  assert.match(html, />Autonomy</)
  assert.doesNotMatch(html, /Plan mode disables tool execution for this turn\./)
  assert.doesNotMatch(html, /disabled=""/)
})

test('chat header disables permission control only while permission mode save is pending', () => {
  const savingHtml = renderHeader({
    permissionMode: 'autonomy',
    permissionModeChangePending: true,
  })
  assert.match(savingHtml, /disabled=""/)
  assert.doesNotMatch(savingHtml, /Thinking mode disables tool execution for this turn\./)
  assert.doesNotMatch(savingHtml, /Saving permission mode\.\.\./)
})

test('chat header renders provider switch continuity as a compact action row', () => {
  const html = renderHeader({
    providerSwitchHint: {
      fromProvider: 'lmstudio',
      fromModel: 'claude-sonnet-4-5',
      toProvider: 'anthropic',
      toModel: 'claude-sonnet-4-5',
      createdAt: Date.now(),
    },
  })

  assert.match(html, /data-ui="provider-switch-context-banner"/)
  assert.match(html, /Provider\/model changed/)
  assert.match(html, /lmstudio/)
  assert.match(html, /anthropic/)
  assert.match(html, /data-ui="provider-switch-inject-both"/)
  assert.match(html, /data-ui="provider-switch-inject-memory"/)
  assert.match(html, /data-ui="provider-switch-inject-artifacts"/)
  assert.match(html, /data-ui="provider-switch-dismiss"/)
  assert.doesNotMatch(html, /shadow-\[/)
  assert.doesNotMatch(html, /rounded-xl/)
  assert.doesNotMatch(html, /bg-blue|text-blue|border-blue|bg-slate|text-slate|border-slate/)
})
