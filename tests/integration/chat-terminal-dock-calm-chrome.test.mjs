import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let ChatTerminalDock = null
let useChatStore = null
let useTerminalStore = null
let useToolStore = null
let useWorkspaceStore = null
let useAppStore = null

before(async () => {
  const dockMod = await ssrLoadRendererModule('/components/chat/ChatTerminalDock.jsx')
  const chatStoreMod = await ssrLoadRendererModule('/store/useChatStore.js')
  const terminalStoreMod = await ssrLoadRendererModule('/store/useTerminalStore.js')
  const toolStoreMod = await ssrLoadRendererModule('/store/useToolStore.js')
  const workspaceStoreMod = await ssrLoadRendererModule('/store/useWorkspaceStore.js')
  const appStoreMod = await ssrLoadRendererModule('/store/useAppStore.js')

  ChatTerminalDock = dockMod?.default || null
  useChatStore = chatStoreMod?.default || null
  useTerminalStore = terminalStoreMod?.default || null
  useToolStore = toolStoreMod?.default || null
  useWorkspaceStore = workspaceStoreMod?.default || null
  useAppStore = appStoreMod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

function resetStore(store, nextState = {}) {
  if (!store || typeof store.setState !== 'function') return
  const baseState = typeof store.getInitialState === 'function'
    ? store.getInitialState()
    : store.getState()
  store.setState({
    ...baseState,
    ...(nextState && typeof nextState === 'object' ? nextState : {}),
  }, true)
}

function seedDockState({
  activeThreadId = 'thread_1',
  terminalDock = {},
  sessions = [],
  actionNotice = null,
  actionError = '',
  runtimeHealth = { status: 'supported', reason: 'pty_spawn_ok' },
} = {}) {
  resetStore(useChatStore, {
    activeThreadId,
    terminalDock: {
      collapsed: false,
      selectedTabId: '',
      height: 260,
      ...terminalDock,
    },
    threadStateById: {
      [activeThreadId]: {
        ...(typeof useChatStore.getState === 'function' ? useChatStore.getState().threadStateById?.[activeThreadId] : {}),
        terminalDock: {
          collapsed: false,
          selectedTabId: '',
          height: 260,
          ...terminalDock,
        },
      },
    },
  })
  resetStore(useTerminalStore, {
    sessions,
    archivedSessions: [],
    rawOutputBySessionId: Object.fromEntries(
      sessions.map((session) => [session.id, { rawOutput: 'ready\n', truncated: false }]),
    ),
    runtimeHealth,
    actionError,
    actionNotice,
  })
  resetStore(useToolStore, { pendingByThreadId: {} })
  resetStore(useWorkspaceStore, { threads: [] })
  resetStore(useAppStore, { activeThreadId, activePanel: 'chat' })
}

function renderDock(sessions, terminalDock = {}) {
  const primary = sessions[0]
  seedDockState({
    sessions,
    terminalDock: {
      collapsed: false,
      selectedTabId: primary?.id || '',
      height: 280,
      ...terminalDock,
    },
  })
  return renderToStaticMarkup(React.createElement(ChatTerminalDock, {
    activeThreadId: 'thread_1',
    projectFolder: 'C:\\repo',
    permissionMode: 'ask',
  }))
}

test('chat terminal dock calm chrome: tonal shell without header divider or pill action chrome', () => {
  assert.equal(typeof ChatTerminalDock, 'function')
  const html = renderDock([{
    id: 'term_calm_1',
    threadId: 'thread_1',
    cwd: 'C:\\repo\\packages\\api',
    shellKind: 'pwsh',
    controlOwner: 'model',
    takeoverState: 'model_control',
    lifecycleState: 'running',
    status: 'running',
    interruptCapability: true,
    closeCapability: true,
    terminateCapability: true,
    hasUnreadOutput: false,
  }])

  assert.match(html, /data-ui="chat-terminal-dock"/)
  assert.match(html, /class="[^"]*bg-surface-panel(?!-alt)[^"]*"[^>]*data-ui="chat-terminal-dock"/)
  assert.doesNotMatch(html, /class="[^"]*bg-surface-panel-alt[^"]*"[^>]*data-ui="chat-terminal-dock"/)
  assert.doesNotMatch(html, /border-t border-surface-border/)
  assert.doesNotMatch(html, /border-b border-surface-border/)
  assert.match(html, /Take over/)
  assert.match(html, /bg-surface-panel-muted-strong/)
  assert.doesNotMatch(html, /uppercase tracking-\[0\.12em\]/)
  assert.doesNotMatch(html, /rounded-full border border-surface-border\/60/)
})

test('chat terminal dock calm chrome: user takeover uses graphite status + ghost hand back', () => {
  const html = renderDock([{
    id: 'term_calm_user',
    threadId: 'thread_1',
    cwd: 'C:\\repo\\packages\\api',
    shellKind: 'pwsh',
    controlOwner: 'user',
    takeoverState: 'user_takeover',
    lifecycleState: 'running',
    status: 'running',
    interruptCapability: true,
    closeCapability: true,
    terminateCapability: true,
    hasUnreadOutput: false,
  }])

  assert.match(html, /User takeover/)
  assert.match(html, /Hand back to AI/)
  assert.match(html, /bg-surface-panel-muted-strong/)
  assert.doesNotMatch(html, /border-accent\/40 bg-accent\/10/)
  assert.doesNotMatch(html, /uppercase tracking-\[0\.12em\]/)
})

test('chat terminal dock calm chrome: last-action notice is quiet left-lead metadata', () => {
  // User-owned sessions synthesize a takeover notice in the dock; assert calm chrome on that surface.
  const html = renderDock([{
    id: 'term_calm_notice',
    threadId: 'thread_1',
    cwd: 'C:\\repo\\packages\\api',
    shellKind: 'pwsh',
    controlOwner: 'user',
    takeoverState: 'user_takeover',
    lifecycleState: 'running',
    status: 'running',
    interruptCapability: true,
    closeCapability: true,
    terminateCapability: true,
    hasUnreadOutput: false,
  }])

  assert.match(html, /data-ui="terminal-status-banner"/)
  assert.match(html, /data-ui="terminal-status-notice"/)
  assert.match(html, /Takeover active\. Keyboard input now goes to this session\./)
  assert.doesNotMatch(html, /Last action/)
  assert.doesNotMatch(html, /rounded-2xl border border-success/)
  assert.doesNotMatch(html, /uppercase tracking-\[0\.12em\]/)
})

test('chat terminal dock calm chrome: multi-session tabs use quiet rectangular chrome', () => {
  const html = renderDock([
    {
      id: 'term_calm_a',
      threadId: 'thread_1',
      cwd: 'C:\\repo\\packages\\api',
      shellKind: 'pwsh',
      controlOwner: 'model',
      lifecycleState: 'running',
      status: 'running',
      interruptCapability: true,
      closeCapability: true,
      terminateCapability: true,
    },
    {
      id: 'term_calm_b',
      threadId: 'thread_1',
      cwd: 'C:\\repo\\packages\\web',
      shellKind: 'bash',
      controlOwner: 'model',
      lifecycleState: 'running',
      status: 'running',
      interruptCapability: true,
      closeCapability: true,
      terminateCapability: true,
    },
  ])

  assert.match(html, /role="tablist"/)
  assert.match(html, /api \(pwsh\)/)
  assert.match(html, /web \(bash\)/)
  assert.doesNotMatch(html, /rounded-full border px-3 py-1\.5/)
  assert.match(html, /rounded-md/)
})
