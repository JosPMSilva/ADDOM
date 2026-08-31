import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  createUseWorkspaceThreadActivity,
  createWorkspaceThreadActivitySource,
} from '../../src/renderer/components/workspace/useWorkspaceThreadActivity.js'
import { resolveWorkspaceThreadActivity } from '../../src/renderer/components/workspace/workspace-thread-activity-state.mjs'
import {
  summarizeWorkspaceRailActivity,
} from '../../src/renderer/components/workspace/workspace-rail-activity-summary.mjs'
import {
  canDismissWorkspaceThreadMenu,
  runOwningThreadMutation,
  runWorkspaceThreadMenuAction,
} from '../../src/renderer/components/workspace/workspace-thread-actions.mjs'

function createChatApi() {
  const eventNames = [
    'onTurnState',
    'onChunk',
    'onReasoningChunk',
    'onToolsPending',
    'onToolExecuting',
    'onToolOutput',
    'onToolResult',
    'onApprovalCountdown',
    'onApprovalTimeout',
    'onQuestionUserRequested',
    'onQuestionUserCleared',
    'onDone',
    'onCancelled',
    'onWriteConflict',
  ]
  const listeners = new Map(eventNames.map((name) => [name, new Set()]))
  const subscribeCalls = new Map(eventNames.map((name) => [name, 0]))
  const unsubscribeCalls = new Map(eventNames.map((name) => [name, 0]))
  const api = {}
  for (const name of eventNames) {
    api[name] = (listener) => {
      subscribeCalls.set(name, subscribeCalls.get(name) + 1)
      listeners.get(name).add(listener)
      return () => {
        unsubscribeCalls.set(name, unsubscribeCalls.get(name) + 1)
        listeners.get(name).delete(listener)
      }
    }
  }
  return {
    api,
    emit(name, payload) {
      for (const listener of listeners.get(name) || []) listener(payload)
    },
    subscribeCalls,
    unsubscribeCalls,
  }
}

test('activity remains owned by an inactive-project thread until its ID is no longer known', () => {
  let nowMs = 10_000
  const chat = createChatApi()
  const cancellationCalls = []
  const source = createWorkspaceThreadActivitySource({
    getChatApi: () => chat.api,
    now: () => nowMs,
    setInterval: () => 1,
    clearInterval: () => {},
  })
  const consumer = source.createConsumer(['t1', 't2'])
  const unsubscribe = source.subscribe(() => {})

  chat.emit('onTurnState', { threadId: 't1', state: 'started' })
  assert.deepEqual(source.getSnapshot(), { t1: 'active', t2: 'idle' })

  // Selection changes to p2/t2, but the universal tree still knows p1/t1.
  consumer.setKnownThreadIds(['t1', 't2'])
  assert.equal(source.getSnapshot().t1, 'active')
  assert.deepEqual(cancellationCalls, [])

  consumer.setKnownThreadIds(['t2'])
  assert.deepEqual(source.getSnapshot(), { t2: 'idle' })

  nowMs += 30_000
  unsubscribe()
  consumer.dispose()
})

test('activity values normalize approval, blocked, error, and completion events', () => {
  const chat = createChatApi()
  const source = createWorkspaceThreadActivitySource({
    getChatApi: () => chat.api,
    now: () => 20_000,
    setInterval: () => 1,
    clearInterval: () => {},
  })
  const consumer = source.createConsumer(['approval', 'blocked', 'failed', 'done'])
  const unsubscribe = source.subscribe(() => {})

  chat.emit('onApprovalCountdown', { threadId: 'approval', phase: 'start' })
  chat.emit('onWriteConflict', { threadId: 'blocked' })
  chat.emit('onApprovalTimeout', { threadId: 'failed' })
  chat.emit('onTurnState', { threadId: 'done', state: 'started' })
  chat.emit('onDone', { threadId: 'done' })

  assert.deepEqual(source.getSnapshot(), {
    approval: 'needs_input',
    blocked: 'blocked',
    failed: 'active',
    done: 'completed',
  })
  assert.deepEqual(new Set(Object.values(source.getSnapshot())), new Set([
    'completed',
    'needs_input',
    'blocked',
    'active',
  ]))

  unsubscribe()
  consumer.dispose()
})

test('tool failures remain turn-local while the owning turn is still running', () => {
  let nowMs = 30_000
  const chat = createChatApi()
  const source = createWorkspaceThreadActivitySource({
    getChatApi: () => chat.api,
    now: () => nowMs,
    setInterval: () => 1,
    clearInterval: () => {},
  })
  const consumer = source.createConsumer(['approval', 'blocked', 'failed'])
  const unsubscribe = source.subscribe(() => {})

  chat.emit('onToolExecuting', { threadId: 'blocked' })
  chat.emit('onToolExecuting', { threadId: 'failed' })
  chat.emit('onApprovalCountdown', { threadId: 'approval', phase: 'start' })
  nowMs += 100
  chat.emit('onToolResult', { threadId: 'blocked', denyReason: 'policy_denied' })
  chat.emit('onToolResult', { threadId: 'failed', isError: true })
  chat.emit('onToolResult', { threadId: 'approval' })

  assert.equal(source.getSnapshot().blocked, 'blocked')
  assert.equal(source.getSnapshot().failed, 'active')
  assert.equal(source.getSnapshot().approval, 'active')
  unsubscribe()
  consumer.dispose()
})

test('a running turn outranks a stale non-terminal tool error flag', () => {
  assert.equal(resolveWorkspaceThreadActivity({
    live: { isRunning: true, hasError: true },
  }), 'active')
})

test('activity precedence merges persisted state with live questions and foreground acknowledgement', () => {
  assert.equal(resolveWorkspaceThreadActivity({
    persisted: { status: 'completed', unread: true },
  }), 'completed')
  assert.equal(resolveWorkspaceThreadActivity({
    live: { hasPendingQuestion: true, hasBlockedConflict: true, hasError: true, isRunning: true },
  }), 'needs_input')
  assert.equal(resolveWorkspaceThreadActivity({
    live: { hasBlockedConflict: true, hasError: true, isRunning: true },
  }), 'blocked')
  assert.equal(resolveWorkspaceThreadActivity({
    persisted: { status: 'failed', unread: true },
    foreground: true,
  }), 'idle')
})

test('running activity remains active until a terminal event arrives', () => {
  assert.equal(resolveWorkspaceThreadActivity({
    live: {
      isRunning: true,
      lastHeartbeatAt: 1_000,
      lastStatusAt: 1_000,
    },
    foreground: true,
    nowMs: 120_000,
    staleAfterMs: 20_000,
  }), 'active')
})

test('collapsed rail summary reports the count for the highest-priority hidden state', () => {
  assert.deepEqual(summarizeWorkspaceRailActivity({
    one: 'active',
    two: 'needs_input',
    three: 'failed',
    four: 'needs_input',
    five: 'idle',
  }), { activity: 'needs_input', count: 2 })
  assert.deepEqual(summarizeWorkspaceRailActivity({ one: 'idle' }), { activity: 'idle', count: 0 })
})

test('question request remains owned by its hidden thread until cleared', () => {
  const chat = createChatApi()
  const source = createWorkspaceThreadActivitySource({
    getChatApi: () => chat.api,
    now: () => 40_000,
    setInterval: () => 1,
    clearInterval: () => {},
  })
  const consumer = source.createConsumer(['foreground', 'hidden'])
  consumer.setForegroundThreadId('foreground')
  const unsubscribe = source.subscribe(() => {})

  chat.emit('onQuestionUserRequested', { threadId: 'hidden', turnId: 'turn-hidden' })
  assert.equal(source.getSnapshot().hidden, 'needs_input')
  assert.equal(source.getSnapshot().foreground, 'idle')

  chat.emit('onQuestionUserCleared', { threadId: 'hidden', turnId: 'turn-hidden' })
  assert.equal(source.getSnapshot().hidden, 'active')

  unsubscribe()
  consumer.dispose()
})

function createNullHostContainer() {
  const windowValue = {
    addEventListener() {},
    removeEventListener() {},
    event: undefined,
    HTMLIFrameElement: class {},
  }
  const documentValue = {
    nodeType: 9,
    defaultView: windowValue,
    addEventListener() {},
    removeEventListener() {},
    documentElement: { namespaceURI: 'http://www.w3.org/1999/xhtml' },
  }
  const container = {
    nodeType: 1,
    nodeName: 'DIV',
    tagName: 'DIV',
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: documentValue,
    addEventListener() {},
    removeEventListener() {},
    appendChild(child) { child.parentNode = this; return child },
    insertBefore(child) { child.parentNode = this; return child },
    removeChild(child) { child.parentNode = null; return child },
  }
  documentValue.body = container
  windowValue.document = documentValue
  return { container, documentValue, windowValue }
}

test('StrictMode effect replay recreates committed activity ownership without render registration', async () => {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT
  const host = createNullHostContainer()
  globalThis.window = host.windowValue
  globalThis.document = host.documentValue
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  try {
    const React = await import('react')
    const { createRoot } = await import('react-dom/client')
    const chat = createChatApi()
    const source = createWorkspaceThreadActivitySource({
      getChatApi: () => chat.api,
      setInterval: () => 1,
      clearInterval: () => {},
    })
    let createCalls = 0
    let disposeCalls = 0
    const instrumentedSource = {
      ...source,
      createConsumer(ids) {
        createCalls += 1
        const consumer = source.createConsumer(ids)
        return {
          ...consumer,
          dispose() {
            disposeCalls += 1
            consumer.dispose()
          },
        }
      },
    }
    const useActivity = createUseWorkspaceThreadActivity(instrumentedSource)
    function Probe() {
      useActivity({ enabled: true, threads: [{ id: 'strict-thread' }] })
      return null
    }
    function AbandonedProbe() {
      useActivity({ enabled: true, threads: [{ id: 'abandoned-thread' }] })
      throw new Error('abandoned render')
    }
    class Boundary extends React.Component {
      constructor(props) { super(props); this.state = { failed: false } }
      static getDerivedStateFromError() { return { failed: true } }
      render() { return this.state.failed ? null : this.props.children }
    }

    const root = createRoot(host.container)
    await React.act(async () => {
      root.render(React.createElement(React.StrictMode, null, React.createElement(Probe)))
    })
    assert.equal(createCalls, 2)
    assert.equal(disposeCalls, 1)
    await React.act(async () => {
      chat.emit('onTurnState', { threadId: 'strict-thread', state: 'started' })
    })
    assert.equal(source.getSnapshot()['strict-thread'], 'active')

    const originalConsoleError = console.error
    console.error = () => {}
    try {
      await React.act(async () => {
        root.render(React.createElement(Boundary, null, React.createElement(AbandonedProbe)))
      })
    } finally {
      console.error = originalConsoleError
    }
    assert.equal(createCalls, 2)

    await React.act(async () => root.unmount())
    assert.equal(disposeCalls, 2)
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
  }
})

test('owning-cache refresh failure attaches an error and always releases the menu pending lock', async () => {
  const pendingStates = []
  let pending = false
  const errors = []
  const refreshedProjects = []
  let dismissed = false
  const result = await runWorkspaceThreadMenuAction(
    () => runOwningThreadMutation({
      projectId: 'p1',
      mutate: async () => ({ id: 't1' }),
      refresh: async (projectId) => {
        refreshedProjects.push(projectId)
        throw new Error('Owning cache refresh failed')
      },
      onError: (error) => errors.push(error.message),
    }),
    {
      onPendingChange: (nextPending) => {
        pending = nextPending
        pendingStates.push(nextPending)
      },
      onSuccess: () => { dismissed = true },
    },
  )

  assert.equal(result, false)
  assert.deepEqual(refreshedProjects, ['p1'])
  assert.deepEqual(errors, ['Owning cache refresh failed'])
  assert.deepEqual(pendingStates, [true, false])
  assert.equal(dismissed, false)
  assert.equal(pendingStates.at(-1), false)
  assert.equal(canDismissWorkspaceThreadMenu(pending), true)
})

test('two mounted consumers share one bridge registration and cleanup after the last subscriber', () => {
  const chat = createChatApi()
  let intervalStarts = 0
  let intervalStops = 0
  const source = createWorkspaceThreadActivitySource({
    getChatApi: () => chat.api,
    setInterval: () => {
      intervalStarts += 1
      return intervalStarts
    },
    clearInterval: () => {
      intervalStops += 1
    },
  })
  const drawer = source.createConsumer(['t1'])
  const tree = source.createConsumer(['t1', 't2'])
  const unsubscribeDrawer = source.subscribe(() => {})
  const unsubscribeTree = source.subscribe(() => {})

  for (const count of chat.subscribeCalls.values()) assert.equal(count, 1)
  assert.equal(intervalStarts, 1)

  unsubscribeDrawer()
  for (const count of chat.unsubscribeCalls.values()) assert.equal(count, 0)

  unsubscribeTree()
  for (const count of chat.unsubscribeCalls.values()) assert.equal(count, 1)
  assert.equal(intervalStops, 1)

  // Strict Mode remount registers one fresh effective subscription set.
  const unsubscribeRemount = source.subscribe(() => {})
  for (const count of chat.subscribeCalls.values()) assert.equal(count, 2)
  unsubscribeRemount()
  for (const count of chat.unsubscribeCalls.values()) assert.equal(count, 2)

  drawer.dispose()
  tree.dispose()
})

test('workspace thread row and menu expose dense accessible explicit-owner contracts', () => {
  const rowSource = fs.readFileSync(
    new URL('../../src/renderer/components/workspace/WorkspaceThreadRow.jsx', import.meta.url),
    'utf8',
  )
  const menuSource = fs.readFileSync(
    new URL('../../src/renderer/components/workspace/WorkspaceThreadActionsMenu.jsx', import.meta.url),
    'utf8',
  )
  const treeSource = fs.readFileSync(
    new URL('../../src/renderer/components/workspace/WorkspaceProjectTree.jsx', import.meta.url),
    'utf8',
  )
  const controllerSource = fs.readFileSync(
    new URL('../../src/renderer/components/workspace/useWorkspaceProjectTree.js', import.meta.url),
    'utf8',
  )
  const runtimeStyles = fs.readFileSync(
    new URL('../../src/renderer/styles/globals-runtime.css', import.meta.url),
    'utf8',
  )
  const designGuide = fs.readFileSync(
    new URL('../../DESIGN.md', import.meta.url),
    'utf8',
  )

  assert.match(rowSource, /aria-current=\{active \? 'page' : undefined\}/)
  assert.match(rowSource, /aria-haspopup="menu"/)
  assert.match(rowSource, /aria-controls=\{menuId\}/)
  assert.match(rowSource, /aria-expanded=\{menuOpen\}/)
  assert.match(rowSource, /activityLabel/)
  assert.match(menuSource, /createPortal/)
  assert.match(menuSource, /role="menu"/)
  assert.match(menuSource, /role="menuitem"/)
  assert.match(menuSource, /requestAnimationFrame/)
  assert.match(menuSource, /event\.key === 'Escape'/)
  assert.match(menuSource, /data-ui="workspace-thread-rename-input"/)
  assert.match(menuSource, /data-focus-origin=\{renameFocusOrigin\}/)
  assert.match(menuSource, /focus-visible:outline-none/)
  assert.match(menuSource, /bg-surface-panel-alt/)
  assert.match(runtimeStyles, /\[data-ui="workspace-thread-rename-input"\]\[data-focus-origin="pointer"\]:focus-visible/)
  assert.match(designGuide, /Mouse-initiated focus must not render an outer focus ring/)
  assert.match(treeSource, /useWorkspaceThreadActivity/)
  assert.match(controllerSource, /reportError: false, throwOnError: true/)
  assert.match(controllerSource, /loadProjectThreads\(projectId, \{ force: true \}\)/)
  assert.doesNotMatch(`${rowSource}\n${menuSource}\n${treeSource}\n${controllerSource}`, /\.(?:cancel|stop|abort)\s*\(/)
})
