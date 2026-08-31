import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let ChatTerminalDock = null
let useChatStore = null
let useTerminalStore = null
let useToolStore = null
let useWorkspaceStore = null
let useAppStore = null
let resolveTerminalActionStates = null
let getTerminalShellChoices = null

before(async () => {
  const dockMod = await ssrLoadRendererModule('/components/chat/ChatTerminalDock.jsx')
  const dockUtilsMod = await ssrLoadRendererModule('/components/chat/chat-terminal-dock-utils.mjs')
  const shellChoicesMod = await ssrLoadRendererModule('/components/chat/chat-terminal-shell-choices.mjs')
  const chatStoreMod = await ssrLoadRendererModule('/store/useChatStore.js')
  const terminalStoreMod = await ssrLoadRendererModule('/store/useTerminalStore.js')
  const toolStoreMod = await ssrLoadRendererModule('/store/useToolStore.js')
  const workspaceStoreMod = await ssrLoadRendererModule('/store/useWorkspaceStore.js')
  const appStoreMod = await ssrLoadRendererModule('/store/useAppStore.js')

  ChatTerminalDock = dockMod?.default || null
  resolveTerminalActionStates = dockUtilsMod?.resolveTerminalActionStates || null
  getTerminalShellChoices = shellChoicesMod?.getTerminalShellChoices || null
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

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

function seedDockState({
  activeThreadId = 'thread_1',
  terminalDock = {},
  sessions = [],
  archivedSessions = [],
  pendingByThreadId = {},
  threads = [],
  appState = {},
  runtimeHealth = { status: 'supported', reason: 'pty_spawn_ok' },
  actionError = '',
  actionNotice = null,
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
    archivedSessions,
    rawOutputBySessionId: Object.fromEntries(
      sessions.map((session) => [session.id, { rawOutput: 'ready\n', truncated: false }]),
    ),
    runtimeHealth,
    actionError,
    actionNotice,
  })
  resetStore(useToolStore, { pendingByThreadId })
  resetStore(useWorkspaceStore, { threads })
  resetStore(useAppStore, { activeThreadId, activePanel: 'chat', ...appState })
}

test('chat terminal dock SSR renders successful terminal action feedback when takeover is confirmed', () => {
  seedDockState({
    sessions: [{
      id: 'term_notice_1',
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
    }],
    terminalDock: {
      collapsed: false,
      selectedTabId: 'term_notice_1',
      height: 280,
    },
    actionNotice: {
      tone: 'success',
      message: 'Takeover active. Keyboard input now goes to this session.',
    },
  })

  const html = renderToStaticMarkup(React.createElement(ChatTerminalDock, {
    activeThreadId: 'thread_1',
    projectFolder: 'C:\\repo',
    permissionMode: 'ask',
  }))

  assert.match(html, /data-ui="terminal-status-notice"/)
  assert.match(html, /Takeover active\. Keyboard input now goes to this session\./)
  assert.doesNotMatch(html, /Last action/)
})

test('chat terminal dock SSR renders a blocked pending-approval tab without an interactive shell', () => {
  assert.equal(typeof ChatTerminalDock, 'function')
  seedDockState({
    pendingByThreadId: {
      thread_1: [{
        approvalId: 'approval_1',
        threadId: 'thread_1',
        toolName: 'terminal_session_open',
        toolInput: { cwd: 'C:\\repo\\packages\\api' },
        policy: { resolvedCwd: 'C:\\repo\\packages\\api', hostAccessRequired: true },
        meta: { label: 'Open Terminal Session' },
      }],
    },
    terminalDock: {
      collapsed: false,
      selectedTabId: 'approval:approval_1',
      height: 280,
    },
  })

  const html = renderToStaticMarkup(React.createElement(ChatTerminalDock, {
    activeThreadId: 'thread_1',
    projectFolder: 'C:\\repo',
    permissionMode: 'ask',
  }))

  assert.match(html, /chat-terminal-dock/)
  assert.match(html, /Approval/)
  assert.match(html, /waiting for approval/i)
  assert.match(html, /packages\\api/)
  assert.doesNotMatch(html, /role="tablist"/)
  assert.doesNotMatch(html, /Interactive terminal viewport/)
})

test('chat terminal dock SSR hides the tab strip for a single live session and keeps only the relevant ownership control visible', () => {
  seedDockState({
    sessions: [{
      id: 'term_1',
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
    }],
    terminalDock: {
      collapsed: false,
      selectedTabId: 'term_1',
      height: 280,
    },
  })

  const html = renderToStaticMarkup(React.createElement(ChatTerminalDock, {
    activeThreadId: 'thread_1',
    projectFolder: 'C:\\repo',
    permissionMode: 'ask',
  }))

  assert.match(html, /api \(pwsh\)/)
  assert.match(html, /Take over/)
  assert.match(html, /AI controls this shell/)
  assert.match(html, /aria-label="Terminal menu"/)
  assert.doesNotMatch(html, /role="tablist"/)
  assert.doesNotMatch(html, /Hand back to AI/)
  assert.doesNotMatch(html, /uppercase tracking-\[0\.12em\]/)
})

test('chat terminal dock SSR shows tabs only when multiple sessions share the active thread', () => {
  seedDockState({
    sessions: [
      {
        id: 'term_1',
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
        id: 'term_2',
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
    ],
    terminalDock: {
      collapsed: false,
      selectedTabId: 'term_1',
      height: 280,
    },
  })

  const html = renderToStaticMarkup(React.createElement(ChatTerminalDock, {
    activeThreadId: 'thread_1',
    projectFolder: 'C:\\repo',
    permissionMode: 'ask',
  }))

  assert.match(html, /role="tablist"/)
  assert.match(html, /api \(pwsh\)/)
  assert.match(html, /web \(bash\)/)
})

test('chat terminal dock SSR prefers renamed session titles in tabs and compact headers', () => {
  seedDockState({
    sessions: [
      {
        id: 'term_named_1',
        threadId: 'thread_1',
        cwd: 'C:\\repo\\packages\\api',
        shellKind: 'pwsh',
        controlOwner: 'model',
        lifecycleState: 'running',
        status: 'running',
        interruptCapability: true,
        closeCapability: true,
        terminateCapability: true,
        sessionTitle: 'Build watcher',
      },
      {
        id: 'term_named_2',
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
    ],
    terminalDock: {
      collapsed: false,
      selectedTabId: 'term_named_1',
      height: 280,
    },
  })

  const html = renderToStaticMarkup(React.createElement(ChatTerminalDock, {
    activeThreadId: 'thread_1',
    projectFolder: 'C:\\repo',
    permissionMode: 'ask',
  }))

  assert.match(html, /Build watcher/)
  assert.match(html, /web \(bash\)/)
})

test('chat terminal dock SSR keeps state chips explicit for takeover, ended, and failed sessions without showing irrelevant ownership controls', () => {
  const cases = [
    {
      name: 'user takeover',
      session: {
        id: 'term_user',
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
      },
      expectedStateLabel: /User takeover/,
      expectedAction: /Hand back to AI/,
    },
    {
      name: 'ended',
      session: {
        id: 'term_ended',
        threadId: 'thread_1',
        cwd: 'C:\\repo\\packages\\api',
        shellKind: 'pwsh',
        controlOwner: 'model',
        lifecycleState: 'ended',
        status: 'closed',
        interruptCapability: false,
        closeCapability: true,
        terminateCapability: false,
      },
      expectedStateLabel: /Ended/,
    },
    {
      name: 'failed',
      session: {
        id: 'term_failed',
        threadId: 'thread_1',
        cwd: 'C:\\repo\\packages\\api',
        shellKind: 'pwsh',
        controlOwner: 'model',
        lifecycleState: 'ended',
        status: 'closed',
        failureReason: 'process_crashed',
        interruptCapability: false,
        closeCapability: true,
        terminateCapability: false,
      },
      expectedStateLabel: /Failed/,
    },
  ]

  for (const sample of cases) {
    seedDockState({
      sessions: [sample.session],
      terminalDock: {
        collapsed: false,
        selectedTabId: sample.session.id,
        height: 280,
      },
    })

    const html = renderToStaticMarkup(React.createElement(ChatTerminalDock, {
      activeThreadId: 'thread_1',
      projectFolder: 'C:\\repo',
      permissionMode: 'ask',
    }))

    assert.match(html, sample.expectedStateLabel, `expected state chip for ${sample.name}`)
    if (sample.expectedAction) {
      assert.match(html, sample.expectedAction, `expected ownership action for ${sample.name}`)
    } else {
      assert.doesNotMatch(html, />Take over</, `did not expect takeover action for ${sample.name}`)
      assert.doesNotMatch(html, /Hand back to AI/, `did not expect handback action for ${sample.name}`)
    }
  }
})

test('chat terminal dock SSR renders the expanded browser with exactly Current Thread, Other Live, and History sections', () => {
  seedDockState({
    sessions: [
      {
        id: 'term_current_1',
        threadId: 'thread_1',
        openedBy: 'model',
        cwd: 'C:\\repo\\packages\\api',
        shellKind: 'pwsh',
        controlOwner: 'model',
        lifecycleState: 'running',
        status: 'running',
      },
      {
        id: 'term_other_1',
        threadId: 'thread_2',
        openedBy: 'user',
        cwd: 'C:\\repo\\packages\\worker',
        shellKind: 'bash',
        controlOwner: 'user',
        takeoverState: 'user_takeover',
        lifecycleState: 'running',
        status: 'running',
      },
    ],
    archivedSessions: [{
      sessionId: 'archive_1',
      threadId: 'thread_3',
      openedBy: 'model',
      cwd: 'C:\\repo\\packages\\history',
      shellKind: 'pwsh',
      status: 'ended',
      openedAt: 10,
      closedAt: 20,
      outputTail: [{ sequence: 1, at: 11, data: 'done\\n' }],
      archived: true,
    }],
    threads: [
      { id: 'thread_1', title: 'Current thread' },
      { id: 'thread_2', title: 'Other live thread' },
      { id: 'thread_3', title: 'History thread' },
    ],
    terminalDock: {
      collapsed: false,
      browserOpen: true,
      browserSection: 'current_thread',
      browserSelectionSessionId: 'term_current_1',
      selectedTabId: 'term_current_1',
      height: 320,
    },
  })

  const html = renderToStaticMarkup(React.createElement(ChatTerminalDock, {
    activeThreadId: 'thread_1',
    projectFolder: 'C:\\repo',
    permissionMode: 'ask',
  }))

  assert.match(html, /chat-terminal-browser/)
  assert.match(html, />Current Thread</)
  assert.match(html, />Other Live</)
  assert.match(html, />History</)
  assert.match(html, /api \(pwsh\)/)
  assert.match(html, /terminal-viewport-shell/)
})

test('chat terminal dock SSR keeps archive browsing in the expanded browser and renders archived sessions read-only', () => {
  seedDockState({
    archivedSessions: [{
      sessionId: 'archive_1',
      threadId: 'thread_2',
      openedBy: 'model',
      cwd: 'C:\\repo\\packages\\history',
      shellKind: 'pwsh',
      status: 'ended',
      openedAt: 10,
      closedAt: 20,
      memoryCandidateStatus: 'pending',
      memoryCandidateSummary: 'Keep the failure tail for later.',
      outputTail: [{ sequence: 1, at: 11, data: 'history\\n' }],
      archived: true,
    }],
    threads: [{ id: 'thread_2', title: 'History thread' }],
    terminalDock: {
      collapsed: false,
      browserOpen: true,
      browserSection: 'history',
      browserSelectionSessionId: 'archive_1',
      height: 320,
    },
  })

  const html = renderToStaticMarkup(React.createElement(ChatTerminalDock, {
    activeThreadId: 'thread_1',
    projectFolder: 'C:\\repo',
    permissionMode: 'ask',
  }))

  assert.match(html, /Saved to Memory|Save to thread memory|Save to project memory|No Memory summary/)
  assert.match(html, /Timeline suggestion cards stay separate from this browser|Keep the failure tail for later/)
  assert.match(html, /Archived/)
  assert.match(html, /Read-only/)
  assert.match(html, /Open thread/)
})

test('chat terminal dock SSR keeps a launcher visible when only browser history remains in chat', () => {
  seedDockState({
    archivedSessions: [{
      sessionId: 'archive_only_1',
      threadId: 'thread_3',
      openedBy: 'model',
      cwd: 'C:\\repo\\packages\\history',
      shellKind: 'pwsh',
      status: 'ended',
      openedAt: 10,
      closedAt: 20,
      outputTail: [{ sequence: 1, at: 11, data: 'history\\n' }],
      archived: true,
    }],
    terminalDock: {
      collapsed: false,
      browserOpen: false,
      height: 260,
    },
  })

  const html = renderToStaticMarkup(React.createElement(ChatTerminalDock, {
    activeThreadId: 'thread_1',
    projectFolder: 'C:\\repo',
    permissionMode: 'ask',
  }))

  assert.match(html, /Terminal browser/)
  assert.match(html, /Browse sessions/)
  assert.doesNotMatch(html, /role="tablist"/)
  assert.doesNotMatch(html, /chat-terminal-browser/)
})

test('chat terminal dock SSR stays fully hidden for a fresh thread until the user opens it', () => {
  seedDockState({
    terminalDock: {
      collapsed: true,
      browserOpen: false,
      selectedTabId: '',
      browserSelectionSessionId: '',
      height: 260,
    },
    sessions: [],
    archivedSessions: [],
    pendingByThreadId: {},
  })

  const html = renderToStaticMarkup(React.createElement(ChatTerminalDock, {
    activeThreadId: 'thread_1',
    projectFolder: 'C:\\repo',
    permissionMode: 'ask',
  }))

  assert.equal(html, '')
})

test('chat terminal dock source keeps tabs, takeover handoff, and destructive controls explicit', () => {
  const source = [
    readSource('src/renderer/components/chat/ChatTerminalDock.jsx'),
    readSource('src/renderer/components/chat/ChatTerminalDockTitleArea.jsx'),
    readSource('src/renderer/components/chat/ChatTerminalDockToolbar.jsx'),
    readSource('src/renderer/components/chat/chat-terminal-dock-labels.mjs'),
  ].join('\n')

  assert.match(source, /role="tablist"/)
  assert.match(source, /onKeyDown=\{\(event\) => handleTabKeyDown\(event, tabs\.indexOf\(tab\)\)\}/)
  assert.match(source, /event\.key === 'ArrowRight'/)
  assert.match(source, /event\.key === 'ArrowLeft'/)
  assert.match(source, /event\.key === 'Home'/)
  assert.match(source, /event\.key === 'End'/)
  assert.match(source, /tabIndex=\{active \? 0 : -1\}/)
  assert.match(source, /role="tabpanel"/)
  assert.match(source, /Hand back to AI/)
  assert.match(source, /Take over/)
  assert.match(source, /Confirm takeover/)
  assert.match(source, /Interrupt/)
  assert.match(source, /Force terminate/)
  assert.match(source, /requestAppConfirm/)
  assert.doesNotMatch(source, /window\.confirm/)
  assert.match(source, /requestSessionSurfaceFocus\(tab\.id,\s*'chat_dock'\)/)
})

test('chat terminal dock source renames sessions with an inline editor instead of a blocking browser prompt', () => {
  const dockSource = readSource('src/renderer/components/chat/ChatTerminalDock.jsx')
  const toolbarSource = readSource('src/renderer/components/chat/ChatTerminalDockToolbar.jsx')
  const labelSource = readSource('src/renderer/components/chat/chat-terminal-dock-labels.mjs')

  assert.doesNotMatch(dockSource, /window\.prompt/)
  assert.doesNotMatch(toolbarSource, /window\.prompt/)
  assert.match(toolbarSource, /renameDraftTitle/)
  assert.match(toolbarSource, /handleRenameSubmit/)
  assert.match(toolbarSource, /onKeyDown=\{handleRenameKeyDown\}/)
  assert.match(toolbarSource, /autoFocus/)
  assert.match(toolbarSource, /onRenameSession\?\.\(renameDraftTitle\)/)
  assert.match(labelSource, /renamePrompt/)
  assert.match(labelSource, /save/)
})

test('chat terminal dock source includes duplicate-label disambiguation and unread signaling', () => {
  const dockSource = readSource('src/renderer/components/chat/ChatTerminalDock.jsx')
  const titleAreaSource = readSource('src/renderer/components/chat/ChatTerminalDockTitleArea.jsx')
  const toolbarSource = readSource('src/renderer/components/chat/ChatTerminalDockToolbar.jsx')
  const labelSource = readSource('src/renderer/components/chat/chat-terminal-dock-labels.mjs')
  const browserSource = readSource('src/renderer/components/chat/ChatTerminalDockBrowser.jsx')
  const utilsSource = readSource('src/renderer/components/chat/chat-terminal-dock-utils.mjs')
  const composerAreaSource = readSource('src/renderer/components/chat/ChatPanelComposerArea.jsx')
  const chatStoreSource = readSource('src/renderer/store/useChatStore.js')
  const storeEqualitySource = readSource('src/renderer/store/chat/store-render-equality.mjs')
  const combinedSource = [dockSource, titleAreaSource, toolbarSource, labelSource, browserSource, utilsSource].join('\n')

  assert.match(utilsSource, /buildDisambiguatedTabLabel/)
  assert.match(labelSource, /Terminal browser/)
  assert.match(labelSource, /Browse sessions/)
  assert.match(combinedSource, /Current Thread/)
  assert.match(combinedSource, /Other Live/)
  assert.match(combinedSource, /History/)
  assert.match(browserSource, /Timeline suggestion cards stay separate from this browser/)
  assert.match(titleAreaSource, /Unread/)
  assert.match(utilsSource, /approvalSuffix/)
  assert.match(dockSource, /useToolStore\(useShallow\(\(state\) => state\.getPendingListForThread\(activeThreadId\)\)\)/)
  assert.match(dockSource, /useChatStore\(useShallow\(\(state\) => state\.getThreadState\(activeThreadId\)\?\.terminalDock \|\| \{\}\)\)/)
  assert.match(dockSource, /void hydratePanel\(\{ projectFolder, permissionMode \}\)/)
  assert.match(dockSource, /requestViewportFocus\('chat_terminal_compact'\)/)
  assert.match(dockSource, /handleToggleBrowser/)
  assert.match(dockSource, /openThreadInChat/)
  assert.match(composerAreaSource, /useChatStore\(useShallow\(\(state\) => \{/)
  assert.match(composerAreaSource, /terminalDockBrowserOpen:\s*terminalDock\?\.browserOpen === true/)
  assert.match(composerAreaSource, /terminalDockBrowserSelectionSessionId:\s*String\(terminalDock\?\.browserSelectionSessionId \|\| ''\)\.trim\(\)/)
  assert.match(composerAreaSource, /terminalDockSelectedTabId:\s*String\(terminalDock\?\.selectedTabId \|\| ''\)\.trim\(\)/)
  assert.match(composerAreaSource, /commandPaletteEvent=\{commandPaletteEvent\}/)
  assert.match(composerAreaSource, /<ChatTerminalDock[\s\S]*commandPaletteEvent=\{commandPaletteEvent\}/)
  assert.match(composerAreaSource, /browserOpen:\s*true/)
  assert.match(composerAreaSource, /browserSection:\s*'current_thread'/)
  assert.match(composerAreaSource, /hasDockTarget/)
  assert.match(chatStoreSource, /import \{ providersEqual, terminalDockStatesEqual, toolActivityRenderFieldsEqual \} from '\.\/chat\/store-render-equality\.mjs'/)
  assert.match(storeEqualitySource, /export function terminalDockStatesEqual/)
  assert.match(chatStoreSource, /if \(terminalDockStatesEqual\(currentTerminalDock, nextTerminalDock\)\) return null/)
})

test('chat terminal dock source exposes explicit terminal output promotion actions', () => {
  const toolbarSource = readSource('src/renderer/components/chat/ChatTerminalDockToolbar.jsx')
  const browserSource = readSource('src/renderer/components/chat/ChatTerminalDockBrowser.jsx')
  const viewportSource = readSource('src/renderer/components/terminal/TerminalViewport.jsx')
  const contextMenuSource = readSource('src/renderer/components/terminal/TerminalContextMenu.jsx')
  const outputActionSource = readSource('src/renderer/components/terminal/use-terminal-output-actions.mjs')
  const outputContextSource = readSource('src/renderer/components/terminal/terminal-output-context.mjs')
  const memoryActionSource = readSource('src/renderer/store/terminal-store-memory-actions.js')

  for (const source of [toolbarSource, browserSource, contextMenuSource]) {
    assert.match(source, /sendOutputToChat/)
    assert.match(source, /explainLastError/)
    assert.match(source, /summarizeSession/)
    assert.match(source, /saveSnapshotToMemory/)
  }
  assert.match(viewportSource, /getTerminalOutputSnapshot/)
  assert.match(outputActionSource, /queueChatDraftInjection/)
  assert.match(outputActionSource, /setActivePanel\?\.\('chat'\)/)
  assert.match(outputContextSource, /TERMINAL_CHAT_OUTPUT_MAX_CHARS/)
  assert.match(outputContextSource, /buildTerminalChatDraftInjection/)
  assert.match(outputContextSource, /source:\s*'terminal_summary'/)
  assert.match(memoryActionSource, /saveLiveSessionSnapshotToMemory/)
  assert.match(memoryActionSource, /save_live_snapshot_to_memory/)
})

test('terminal action resolver explains command palette availability', () => {
  assert.equal(typeof resolveTerminalActionStates, 'function')

  const modelOwnedSession = {
    id: 'term_model',
    controlOwner: 'model',
    takeoverState: 'model_control',
    lifecycleState: 'running',
    interruptCapability: true,
    closeCapability: true,
    terminateCapability: true,
  }
  const modelStates = resolveTerminalActionStates({
    workspaceActive: true,
    activeThreadId: 'thread_1',
    projectFolder: 'C:\\repo',
    selectedSession: modelOwnedSession,
    hasTerminalDockTarget: true,
    terminalDockCollapsed: false,
  })

  assert.equal(modelStates.focus.enabled, true)
  assert.equal(modelStates.new.enabled, true)
  assert.equal(modelStates.browse.enabled, true)
  assert.equal(modelStates.takeover.enabled, true)
  assert.equal(modelStates.handback.enabled, false)
  assert.equal(modelStates.handback.reason, 'Terminal is already controlled by AI')
  assert.equal(modelStates.interrupt.enabled, true)
  assert.equal(modelStates.close.enabled, true)
  assert.equal(modelStates.hide.enabled, true)
  assert.equal(modelStates.terminate.enabled, true)

  const missingThreadStates = resolveTerminalActionStates({
    workspaceActive: true,
    projectFolder: 'C:\\repo',
  })
  assert.equal(missingThreadStates.new.enabled, false)
  assert.equal(missingThreadStates.new.reason, 'Open/select a thread first')

  const endedStates = resolveTerminalActionStates({
    workspaceActive: true,
    activeThreadId: 'thread_1',
    projectFolder: 'C:\\repo',
    selectedSession: {
      ...modelOwnedSession,
      lifecycleState: 'ended',
      status: 'closed',
    },
  })
  assert.equal(endedStates.takeover.enabled, false)
  assert.equal(endedStates.takeover.reason, 'Terminal session is not running')
  assert.equal(endedStates.interrupt.enabled, false)
  assert.equal(endedStates.interrupt.reason, 'Terminal session is not running')

  const userStates = resolveTerminalActionStates({
    workspaceActive: true,
    activeThreadId: 'thread_1',
    projectFolder: 'C:\\repo',
    selectedSession: {
      ...modelOwnedSession,
      controlOwner: 'user',
      takeoverState: 'user_takeover',
    },
  })
  assert.equal(userStates.takeover.enabled, false)
  assert.equal(userStates.takeover.reason, 'Terminal is already controlled by you')
  assert.equal(userStates.handback.enabled, true)
})

test('chat terminal shell menu uses runtime availability before platform fallbacks', () => {
  assert.equal(typeof getTerminalShellChoices, 'function')

  assert.deepEqual(getTerminalShellChoices({
    platform: 'win32',
    availableShells: [
      { id: 'default', shellKind: 'cmd' },
      { id: 'cmd', shellKind: 'cmd' },
      { id: 'git-bash', shellKind: 'bash' },
    ],
  }), ['default', 'cmd', 'git-bash'])

  assert.deepEqual(getTerminalShellChoices({
    platform: 'win32',
    availableShells: [{ id: 'default', shellKind: 'cmd' }],
  }), ['default'])

  assert.deepEqual(getTerminalShellChoices({ platform: 'win32' }), ['default', 'cmd', 'powershell', 'pwsh'])
})

test('chat terminal dock source keeps the Phase 4.5 session smoke path wired', () => {
  const dockSource = readSource('src/renderer/components/chat/ChatTerminalDock.jsx')
  const toolbarSource = readSource('src/renderer/components/chat/ChatTerminalDockToolbar.jsx')
  const shellChoiceSource = readSource('src/renderer/components/chat/chat-terminal-shell-choices.mjs')

  assert.match(dockSource, /getTerminalShellChoices\(runtimeHealth\)/)
  assert.match(toolbarSource, /onRenameSession\?\.\(renameDraftTitle\)/)
  assert.match(toolbarSource, /onDuplicateSession\?\.\(\)/)
  assert.match(toolbarSource, /onOpenTerminalAtProjectRoot\?\.\(\)/)
  assert.match(toolbarSource, /onOpenTerminalAtSessionCwd\?\.\(\)/)
  assert.match(toolbarSource, /onOpenTerminalAtEditorCwd\?\.\(\)/)
  assert.match(toolbarSource, /onOpenTerminalWithShell\?\.\(shell\)/)
  assert.match(dockSource, /onSwitchPreviousSessionRequest=\{\(\) => handleSwitchSession\('previous'\)\}/)
  assert.match(dockSource, /onSwitchNextSessionRequest=\{\(\) => handleSwitchSession\('next'\)\}/)
  assert.match(shellChoiceSource, /availableShells/)
})

test('command palette exposes terminal lifecycle entries backed by terminal action state', () => {
  const source = readSource('src/renderer/components/CommandPalette.jsx')
  const terminalPaletteSource = readSource('src/renderer/components/command-palette-terminal-actions.mjs')
  const actionSource = readSource('src/renderer/components/chat/chat-terminal-dock-utils.mjs')
  const sessionActionSource = readSource('src/renderer/store/terminal-store-session-actions.js')
  const coreLocale = readSource('src/renderer/i18n/locales/en/core.json')

  assert.match(source, /id:\s*'chat\.openTerminal'/)
  assert.match(source, /title:\s*'Open Terminal'/)
  assert.match(source, /aliases:\s*\[[^\]]*'terminal'[^\]]*'chat terminal'[^\]]*'terminal browser'[^\]]*\]/)
  assert.match(terminalPaletteSource, /void useTerminalStore\.getState\(\)\.openThreadTerminal\(\{/)
  assert.match(source, /workspaceActive && hasActiveThread/)

  assert.match(actionSource, /function resolveTerminalActionStates/)
  assert.match(sessionActionSource, /openNewThreadTerminal/)
  for (const id of [
    'terminal.focus',
    'terminal.new',
    'terminal.browseSessions',
    'terminal.takeOver',
    'terminal.handBack',
    'terminal.interrupt',
    'terminal.close',
    'terminal.hide',
  ]) {
    assert.match(terminalPaletteSource, new RegExp(`id:\\s*'${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`))
  }
  assert.match(terminalPaletteSource, /resolveTerminalActionStates\(\{/)
  assert.match(terminalPaletteSource, /category:\s*'Terminal'/)
  assert.match(terminalPaletteSource, /aliases:\s*\[[^\]]*'focus terminal'[^\]]*'terminal focus'[^\]]*\]/)
  assert.match(terminalPaletteSource, /aliases:\s*\[[^\]]*'new terminal'[^\]]*'create terminal'[^\]]*\]/)
  assert.match(terminalPaletteSource, /aliases:\s*\[[^\]]*'browse terminal sessions'[^\]]*'terminal history'[^\]]*\]/)
  assert.match(terminalPaletteSource, /emitCommandPaletteEvent\?\.\('terminal\.browseSessions'/)
  assert.match(coreLocale, /"terminal":\s*"Terminal"/)
  assert.match(coreLocale, /"no_terminal_session_selected":\s*"No terminal session selected"/)
})

test('live execution stream terminal metadata uses chat dock aware surface labels', () => {
  const source = readSource('src/renderer/components/chat/live-execution-stream-tooling.mjs')

  assert.match(source, /function resolveTerminalSurfaceLabel/)
  assert.match(source, /if \(normalizedSurface === 'chat_dock'\) return 'Chat dock'/)
  assert.match(source, /if \(normalizedSurface === 'terminal_panel'\) return 'Terminal browser'/)
})

test('global live-terminal indicator source exposes cross-thread status and open-thread affordance', () => {
  const dockSource = readSource('src/renderer/components/chat/ChatTerminalDock.jsx')
  const indicatorSource = readSource('src/renderer/components/chat/ChatTerminalDockGlobalIndicator.jsx')

  assert.match(dockSource, /ChatTerminalDockGlobalIndicator/)
  assert.match(indicatorSource, /chat-terminal-global-indicator/)
  assert.match(indicatorSource, /Approval needed/)
  assert.match(indicatorSource, /Waiting for user/)
  assert.match(indicatorSource, /Open thread/)
})

test('tool approval store keeps multiple terminal approvals for the same thread', () => {
  resetStore(useToolStore, { pendingByThreadId: {} })

  useToolStore.getState().setPending({
    approvalId: 'approval_a',
    threadId: 'thread_1',
    toolName: 'terminal_session_open',
  })
  useToolStore.getState().setPending({
    approvalId: 'approval_b',
    threadId: 'thread_1',
    toolName: 'terminal_session_open',
  })

  const approvals = useToolStore.getState().getPendingListForThread('thread_1')
  assert.equal(Array.isArray(approvals), true)
  assert.deepEqual(approvals.map((entry) => entry.approvalId), ['approval_b', 'approval_a'])
})

test('workspace store openThreadInChat switches thread deliberately and keeps chat active', async () => {
  global.window = {
    addom: {
      workspace: {
        setActiveThread: async (_projectId, threadId) => ({
          thread: { id: threadId, title: `Thread ${threadId}` },
        }),
        listProjects: async () => [],
        listThreads: async () => [],
        listTimeline: async () => [],
      },
    },
  }

  resetStore(useWorkspaceStore, {
    activeProjectId: 'project_1',
    activeThreadId: 'thread_1',
    threads: [],
  })
  resetStore(useAppStore, {
    activeProjectId: 'project_1',
    activeThreadId: 'thread_1',
    activePanel: 'memory',
  })
  resetStore(useChatStore, {
    activeThreadId: 'thread_1',
    threadStateById: {
      thread_1: useChatStore.getState().threadStateById?.thread_1 || {},
    },
  })

  const result = await useWorkspaceStore.getState().openThreadInChat('thread_2')

  assert.equal(result?.id, 'thread_2')
  assert.equal(useWorkspaceStore.getState().activeThreadId, 'thread_2')
  assert.equal(useAppStore.getState().activeThreadId, 'thread_2')
  assert.equal(useAppStore.getState().activePanel, 'chat')
})

test('workspace store openThreadInChat preserves the selected live terminal when crossing threads', async () => {
  global.window = {
    addom: {
      workspace: {
        setActiveThread: async (_projectId, threadId) => ({
          thread: { id: threadId, title: `Thread ${threadId}` },
        }),
        listProjects: async () => [],
        listThreads: async () => [],
        listTimeline: async () => [],
      },
    },
  }

  resetStore(useWorkspaceStore, {
    activeProjectId: 'project_1',
    activeThreadId: 'thread_1',
    threads: [],
  })
  resetStore(useAppStore, {
    activeProjectId: 'project_1',
    activeThreadId: 'thread_1',
    activePanel: 'memory',
  })
  resetStore(useChatStore, {
    activeThreadId: 'thread_1',
    threadStateById: {
      thread_1: useChatStore.getState().threadStateById?.thread_1 || {},
      thread_2: {
        ...(useChatStore.getState().threadStateById?.thread_2 || {}),
        terminalDock: {
          collapsed: true,
          selectedTabId: '',
          browserOpen: true,
          browserSection: 'other_live',
          browserSelectionSessionId: '',
          height: 260,
        },
      },
    },
  })
  resetStore(useTerminalStore, {
    sessions: [
      {
        id: 'term_thread_2_a',
        threadId: 'thread_2',
        cwd: 'C:\\repo\\packages\\alpha',
        shellKind: 'pwsh',
      },
      {
        id: 'term_thread_2_b',
        threadId: 'thread_2',
        cwd: 'C:\\repo\\packages\\beta',
        shellKind: 'bash',
      },
    ],
  })

  const result = await useWorkspaceStore.getState().openThreadInChat('thread_2', {
    terminal: {
      selectedTabId: 'term_thread_2_b',
      activeSessionId: 'term_thread_2_b',
      focusMode: 'compact',
    },
  })

  const threadTwoDock = useChatStore.getState().getThreadState('thread_2')?.terminalDock || {}
  assert.equal(result?.id, 'thread_2')
  assert.equal(useAppStore.getState().activePanel, 'chat')
  assert.equal(threadTwoDock.collapsed, false)
  assert.equal(threadTwoDock.browserOpen, false)
  assert.equal(threadTwoDock.selectedTabId, 'term_thread_2_b')
  assert.equal(useTerminalStore.getState().activeSessionId, 'term_thread_2_b')
})

test('workspace store openThreadInChat can reopen archive browsing on the owning thread', async () => {
  global.window = {
    addom: {
      workspace: {
        setActiveThread: async (_projectId, threadId) => ({
          thread: { id: threadId, title: `Thread ${threadId}` },
        }),
        listProjects: async () => [],
        listThreads: async () => [],
        listTimeline: async () => [],
      },
    },
  }

  resetStore(useWorkspaceStore, {
    activeProjectId: 'project_1',
    activeThreadId: 'thread_1',
    threads: [],
  })
  resetStore(useAppStore, {
    activeProjectId: 'project_1',
    activeThreadId: 'thread_1',
    activePanel: 'artifacts',
  })
  resetStore(useChatStore, {
    activeThreadId: 'thread_1',
    threadStateById: {
      thread_1: useChatStore.getState().threadStateById?.thread_1 || {},
      thread_2: {
        ...(useChatStore.getState().threadStateById?.thread_2 || {}),
        terminalDock: {
          collapsed: true,
          selectedTabId: '',
          browserOpen: false,
          browserSection: 'current_thread',
          browserSelectionSessionId: '',
          height: 260,
        },
      },
    },
  })
  resetStore(useTerminalStore, {
    archivedSessions: [{
      sessionId: 'archive_thread_2',
      threadId: 'thread_2',
      cwd: 'C:\\repo\\packages\\history',
      shellKind: 'pwsh',
      status: 'ended',
      archived: true,
    }],
  })

  const result = await useWorkspaceStore.getState().openThreadInChat('thread_2', {
    terminal: {
      browserOpen: true,
      browserSection: 'history',
      browserSelectionSessionId: 'archive_thread_2',
      archivedSessionId: 'archive_thread_2',
      focusMode: 'browser',
    },
  })

  const threadTwoDock = useChatStore.getState().getThreadState('thread_2')?.terminalDock || {}
  assert.equal(result?.id, 'thread_2')
  assert.equal(useAppStore.getState().activePanel, 'chat')
  assert.equal(threadTwoDock.collapsed, false)
  assert.equal(threadTwoDock.browserOpen, true)
  assert.equal(threadTwoDock.browserSection, 'history')
  assert.equal(threadTwoDock.browserSelectionSessionId, 'archive_thread_2')
  assert.equal(useTerminalStore.getState().activeArchivedSessionId, 'archive_thread_2')
  assert.ok(Number(useTerminalStore.getState().focusRequestKeyByMode?.chat_terminal_expanded || 0) > 0)
})
