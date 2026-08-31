import test from 'node:test'
import assert from 'node:assert/strict'

import useTerminalStore, { mergeAttachOutput } from '../../src/renderer/store/useTerminalStore.js'
import useAppStore from '../../src/renderer/store/useAppStore.js'
import useChatStore from '../../src/renderer/store/useChatStore.js'
import useSettingsStore from '../../src/renderer/store/useSettingsStore.js'
import useToolStore from '../../src/renderer/store/useToolStore.js'

function resetStore(store) {
  if (!store || typeof store.setState !== 'function') return
  const initialState = typeof store.getInitialState === 'function'
    ? store.getInitialState()
    : store.getState()
  store.setState(initialState, true)
}

test.afterEach(async () => {
  delete global.window
  resetStore(useAppStore)
  resetStore(useChatStore)
  resetStore(useSettingsStore)
  resetStore(useToolStore)
  useTerminalStore.getState().resetState()
  await useTerminalStore.getState().disposeSubscriptions()
})

test('terminal store buffers subscription events until the attach snapshot is applied', async () => {
  let subscriptionCallback = null
  let unsubscribeCalls = 0

  global.window = {
    addom: {
      terminal: {
        subscribe: async (_options, cb) => {
          subscriptionCallback = cb
          return async () => {
            unsubscribeCalls += 1
          }
        },
        attachSession: async () => {
          subscriptionCallback?.({
            type: 'data',
            sessionId: 'term_store_1',
            session: {
              id: 'term_store_1',
              cwd: process.cwd(),
              cols: 120,
              rows: 40,
              status: 'running',
              outputSequence: 2,
            },
            chunk: {
              sequence: 2,
              data: 'two',
            },
          })
          return {
            ok: true,
            session: {
              id: 'term_store_1',
              cwd: process.cwd(),
              cols: 120,
              rows: 40,
              status: 'running',
              outputSequence: 1,
            },
            output: {
              chunks: [{ sequence: 1, data: 'one' }],
              nextSequence: 1,
              truncated: false,
            },
          }
        },
      },
    },
  }

  useTerminalStore.setState({
    hydratedProjectFolder: process.cwd(),
    hydratedPermissionMode: 'ask',
    sessions: [{
      id: 'term_store_1',
      cwd: process.cwd(),
      cols: 120,
      rows: 40,
      status: 'running',
      outputSequence: 0,
    }],
    activeSessionId: 'term_store_1',
    rawOutputBySessionId: {},
    actionError: '',
  })

  await useTerminalStore.getState().ensureSessionConnected('term_store_1')

  const outputState = useTerminalStore.getState().rawOutputBySessionId.term_store_1
  assert.equal(outputState?.rawOutput, 'onetwo')
  assert.equal(outputState?.lastSequence, 2)
  assert.equal(unsubscribeCalls, 0)
})

test('terminal store dedupes unchanged resize requests before invoking terminal IPC', async () => {
  const resizeCalls = []

  global.window = {
    addom: {
      terminal: {
        resizeSession: async (sessionId, cols, rows) => {
          resizeCalls.push({ sessionId, cols, rows })
          return {
            ok: true,
            session: {
              id: sessionId,
              cwd: process.cwd(),
              cols,
              rows,
              status: 'running',
              outputSequence: 0,
            },
          }
        },
      },
    },
  }

  useTerminalStore.setState({
    hydratedProjectFolder: process.cwd(),
    hydratedPermissionMode: 'ask',
    sessions: [{
      id: 'term_store_resize_1',
      cwd: process.cwd(),
      cols: 120,
      rows: 40,
      status: 'running',
      outputSequence: 0,
    }],
    activeSessionId: 'term_store_resize_1',
    rawOutputBySessionId: {},
    actionError: '',
  })

  const firstNoOp = await useTerminalStore.getState().resizeSession('term_store_resize_1', { cols: 120, rows: 40 })
  const firstRealResize = await useTerminalStore.getState().resizeSession('term_store_resize_1', { cols: 121, rows: 41 })
  const secondNoOp = await useTerminalStore.getState().resizeSession('term_store_resize_1', { cols: 121, rows: 41 })

  assert.equal(firstNoOp, true)
  assert.equal(firstRealResize, true)
  assert.equal(secondNoOp, true)
  assert.deepEqual(resizeCalls, [{
    sessionId: 'term_store_resize_1',
    cols: 121,
    rows: 41,
  }])
})

test('terminal store records explicit success feedback when terminal takeover and input write succeed', async () => {
  global.window = {
    addom: {
      terminal: {
        takeOverSession: async (sessionId) => ({
          ok: true,
          session: {
            id: sessionId,
            cwd: process.cwd(),
            cols: 120,
            rows: 40,
            status: 'running',
            outputSequence: 0,
            controlOwner: 'user',
            takeoverState: 'user_takeover',
          },
        }),
        writeSession: async () => ({ ok: true }),
      },
    },
  }

  useTerminalStore.setState({
    hydratedProjectFolder: process.cwd(),
    hydratedPermissionMode: 'ask',
    sessions: [{
      id: 'term_takeover_1',
      cwd: process.cwd(),
      cols: 120,
      rows: 40,
      status: 'running',
      outputSequence: 0,
      controlOwner: 'model',
      takeoverState: 'ai_controlling',
    }],
    activeSessionId: 'term_takeover_1',
    rawOutputBySessionId: {},
    actionError: '',
  })

  const takeoverOk = await useTerminalStore.getState().takeOverSession('term_takeover_1')
  assert.equal(takeoverOk, true)
  assert.deepEqual(useTerminalStore.getState().actionNotice, {
    tone: 'success',
    message: 'Takeover active. Keyboard input now goes to this session.',
  })

  const writeOk = await useTerminalStore.getState().writeInput('term_takeover_1', 'dir\n')
  const state = useTerminalStore.getState()

  assert.equal(writeOk, true)
  assert.deepEqual(state.actionNotice, {
    tone: 'success',
    message: 'Input sent to the terminal session.',
  })
})

test('terminal store preserves path case when filtering sessions on non-Windows platforms', async () => {
  const subscribeCalls = []
  const attachCalls = []

  global.window = {
    addom: {
      terminal: {
        getRuntimeHealth: async () => ({
          status: 'supported',
          reason: 'pty_spawn_ok',
          platform: 'linux',
        }),
        listSessions: async () => ({
          ok: true,
          sessions: [
            {
              id: 'term_hidden_case_only',
              cwd: '/workspace/repo',
              cols: 120,
              rows: 40,
              status: 'running',
              outputSequence: 0,
            },
            {
              id: 'term_visible_exact_case',
              cwd: '/workspace/Repo/service',
              cols: 120,
              rows: 40,
              status: 'running',
              outputSequence: 0,
            },
          ],
        }),
        subscribe: async (options, cb) => {
          subscribeCalls.push({ options, cbType: typeof cb })
          return async () => {}
        },
        attachSession: async (sessionId) => {
          attachCalls.push(sessionId)
          return {
            ok: true,
            session: {
              id: sessionId,
              cwd: '/workspace/Repo/service',
              cols: 120,
              rows: 40,
              status: 'running',
              outputSequence: 0,
            },
            output: {
              chunks: [],
              nextSequence: 0,
              truncated: false,
            },
          }
        },
      },
    },
  }

  await useTerminalStore.getState().hydratePanel({
    projectFolder: '/workspace/Repo',
    permissionMode: 'ask',
  })

  assert.deepEqual(
    useTerminalStore.getState().sessions.map((session) => session.id),
    ['term_visible_exact_case'],
  )
  assert.deepEqual(attachCalls, ['term_visible_exact_case'])
  assert.equal(subscribeCalls.length, 1)
})

test('terminal store keeps the current raw tail on reconnect when a truncated attach snapshot has no new chunks', async () => {
  global.window = {
    addom: {
      terminal: {
        subscribe: async () => async () => {},
        attachSession: async () => ({
          ok: true,
          session: {
            id: 'term_store_reconnect_1',
            cwd: process.cwd(),
            cols: 120,
            rows: 40,
            status: 'running',
            outputSequence: 12,
          },
          output: {
            chunks: [],
            nextSequence: 12,
            truncated: true,
          },
        }),
      },
    },
  }

  useTerminalStore.setState({
    hydratedProjectFolder: process.cwd(),
    hydratedPermissionMode: 'ask',
    sessions: [{
      id: 'term_store_reconnect_1',
      cwd: process.cwd(),
      cols: 120,
      rows: 40,
      status: 'running',
      outputSequence: 12,
    }],
    activeSessionId: 'term_store_reconnect_1',
    rawOutputBySessionId: {
      term_store_reconnect_1: {
        rawOutput: 'tail-11tail-12',
        lastSequence: 12,
        truncated: true,
      },
    },
    actionError: '',
  })

  await useTerminalStore.getState().ensureSessionConnected('term_store_reconnect_1')

  assert.deepEqual(useTerminalStore.getState().rawOutputBySessionId.term_store_reconnect_1, {
    rawOutput: 'tail-11tail-12',
    lastSequence: 12,
    truncated: true,
  })
})

test('terminal store preserves the current session buffer when the panel rehydrates for the same workspace', async () => {
  const attachCalls = []

  global.window = {
    addom: {
      terminal: {
        getRuntimeHealth: async () => ({
          status: 'supported',
          reason: 'pty_spawn_ok',
          platform: 'win32',
        }),
        listSessions: async () => ({
          ok: true,
          sessions: [
            {
              id: 'term_store_rehydrate_1',
              cwd: process.cwd(),
              cols: 120,
              rows: 40,
              status: 'running',
              outputSequence: 2,
            },
          ],
        }),
        subscribe: async () => async () => {},
        attachSession: async (sessionId, options = {}) => {
          attachCalls.push({
            sessionId,
            sinceSequence: Number(options?.sinceSequence || 0) || 0,
          })
          return {
            ok: true,
            session: {
              id: sessionId,
              cwd: process.cwd(),
              cols: 120,
              rows: 40,
              status: 'running',
              outputSequence: 2,
            },
            output: {
              chunks: [],
              nextSequence: 2,
              truncated: false,
            },
          }
        },
      },
    },
  }

  useTerminalStore.setState({
    runtimeHealth: {
      status: 'supported',
      reason: 'pty_spawn_ok',
    },
    hydratedProjectFolder: process.cwd(),
    hydratedPermissionMode: 'ask',
    sessions: [{
      id: 'term_store_rehydrate_1',
      cwd: process.cwd(),
      cols: 120,
      rows: 40,
      status: 'running',
      outputSequence: 2,
    }],
    activeSessionId: 'term_store_rehydrate_1',
    rawOutputBySessionId: {
      term_store_rehydrate_1: {
        rawOutput: 'boot\r\nprompt>',
        lastSequence: 2,
        truncated: false,
      },
    },
    actionError: '',
  })

  await useTerminalStore.getState().hydratePanel({
    projectFolder: process.cwd(),
    permissionMode: 'ask',
  })

  assert.deepEqual(attachCalls, [{
    sessionId: 'term_store_rehydrate_1',
    sinceSequence: 2,
  }])
  assert.deepEqual(useTerminalStore.getState().rawOutputBySessionId.term_store_rehydrate_1, {
    rawOutput: 'boot\r\nprompt>',
    lastSequence: 2,
    truncated: false,
  })
})

test('terminal store returns the created session before attach completes', async () => {
  let resolveAttach
  let subscribeCalls = 0
  let attachCalls = 0
  const createCalls = []

  global.window = {
    addom: {
      terminal: {
        createSession: async (payload = {}) => {
          createCalls.push(payload)
          return {
            ok: true,
            session: {
              id: 'term_store_create_fast_1',
              cwd: process.cwd(),
              cols: 120,
              rows: 40,
              status: 'running',
              outputSequence: 0,
            },
          }
        },
        subscribe: async () => {
          subscribeCalls += 1
          return async () => {}
        },
        attachSession: async () => {
          attachCalls += 1
          return new Promise((resolve) => {
            resolveAttach = () => resolve({
              ok: true,
              session: {
                id: 'term_store_create_fast_1',
                cwd: process.cwd(),
                cols: 120,
                rows: 40,
                status: 'running',
                outputSequence: 0,
              },
              output: {
                chunks: [],
                nextSequence: 0,
                truncated: false,
              },
            })
          })
        },
      },
    },
  }

  useTerminalStore.setState({
    hydratedProjectFolder: process.cwd(),
    hydratedPermissionMode: 'ask',
    actionError: '',
  })

  const createdSessionId = await Promise.race([
    useTerminalStore.getState().createSession({
      projectFolder: process.cwd(),
      cwd: process.cwd(),
      permissionMode: 'ask',
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('createSession should not wait for attachSession')), 50)),
  ])

  assert.equal(createdSessionId, 'term_store_create_fast_1')
  assert.equal(useTerminalStore.getState().creatingSession, false)
  assert.equal(useTerminalStore.getState().activeSessionId, 'term_store_create_fast_1')
  assert.equal(useTerminalStore.getState().sessions[0]?.id, 'term_store_create_fast_1')
  assert.equal(subscribeCalls, 1)
  assert.equal(attachCalls, 1)
  assert.deepEqual(createCalls, [{
    projectFolder: process.cwd(),
    cwd: process.cwd(),
    shell: 'default',
    cols: 120,
    rows: 32,
    permissionMode: 'ask',
    threadId: '',
    preferredSurface: 'chat_dock',
    sessionTitle: '',
  }])

  resolveAttach()
  await new Promise((resolve) => setTimeout(resolve, 0))
})

test('terminal store renames a live session through terminal IPC', async () => {
  const renameCalls = []

  global.window = {
    addom: {
      terminal: {
        renameSession: async (sessionId, sessionTitle, options = {}) => {
          renameCalls.push({ sessionId, sessionTitle, options })
          return {
            ok: true,
            session: {
              id: sessionId,
              cwd: process.cwd(),
              cols: 120,
              rows: 40,
              status: 'running',
              outputSequence: 0,
              sessionTitle,
            },
          }
        },
      },
    },
  }

  useTerminalStore.setState({
    hydratedProjectFolder: process.cwd(),
    hydratedPermissionMode: 'ask',
    sessions: [{
      id: 'term_store_rename_1',
      cwd: process.cwd(),
      cols: 120,
      rows: 40,
      status: 'running',
      outputSequence: 0,
      sessionTitle: 'Old title',
    }],
    activeSessionId: 'term_store_rename_1',
    actionError: '',
  })

  const renamed = await useTerminalStore.getState().renameSession('term_store_rename_1', 'Build logs')

  assert.equal(renamed, true)
  assert.deepEqual(renameCalls, [{
    sessionId: 'term_store_rename_1',
    sessionTitle: 'Build logs',
    options: {
      projectFolder: process.cwd(),
      permissionMode: 'ask',
    },
  }])
  assert.equal(useTerminalStore.getState().sessions[0]?.sessionTitle, 'Build logs')
})

test('terminal store duplicates a session using the current shell and cwd metadata', async () => {
  const createCalls = []

  global.window = {
    addom: {
      terminal: {
        createSession: async (payload = {}) => {
          createCalls.push(payload)
          return {
            ok: true,
            session: {
              id: 'term_store_duplicate_2',
              threadId: payload.threadId,
              cwd: payload.cwd,
              shell: payload.shell,
              shellKind: payload.shell,
              cols: payload.cols,
              rows: payload.rows,
              status: 'running',
              outputSequence: 0,
            },
          }
        },
        subscribe: async () => async () => {},
        attachSession: async (sessionId) => ({
          ok: true,
          session: {
            id: sessionId,
            threadId: 'thread_duplicate',
            cwd: 'C:\\repo\\packages\\api',
            shell: 'pwsh',
            shellKind: 'pwsh',
            cols: 120,
            rows: 40,
            status: 'running',
            outputSequence: 0,
          },
          output: {
            chunks: [],
            nextSequence: 0,
            truncated: false,
          },
        }),
      },
    },
  }

  useTerminalStore.setState({
    hydratedProjectFolder: 'C:\\repo',
    hydratedPermissionMode: 'ask',
    viewportMetricsByMode: {
      chat_terminal_compact: { cols: 120, rows: 32 },
    },
    sessions: [{
      id: 'term_store_duplicate_1',
      threadId: 'thread_duplicate',
      cwd: 'C:\\repo\\packages\\api',
      shell: 'pwsh',
      shellKind: 'pwsh',
      cols: 100,
      rows: 24,
      status: 'running',
      outputSequence: 0,
    }],
    activeSessionId: 'term_store_duplicate_1',
  })

  const duplicateId = await useTerminalStore.getState().duplicateSession('term_store_duplicate_1')

  assert.equal(duplicateId, 'term_store_duplicate_2')
  assert.deepEqual(createCalls, [{
    projectFolder: 'C:\\repo',
    cwd: 'C:\\repo\\packages\\api',
    shell: 'pwsh',
    cols: 120,
    rows: 32,
    permissionMode: 'ask',
    threadId: 'thread_duplicate',
    preferredSurface: 'chat_dock',
    sessionTitle: '',
  }])
})

test('terminal store switches active terminal sessions within a thread', async () => {
  const focusCalls = []

  global.window = {
    addom: {
      terminal: {
        focusSessionSurface: async (sessionId, surface) => {
          focusCalls.push({ sessionId, surface })
          return {
            ok: true,
            session: {
              id: sessionId,
              threadId: 'thread_switch',
              cwd: process.cwd(),
              cols: 120,
              rows: 40,
              status: 'running',
              outputSequence: 0,
            },
          }
        },
      },
    },
  }

  useTerminalStore.setState({
    hydratedProjectFolder: process.cwd(),
    hydratedPermissionMode: 'ask',
    sessions: [
      { id: 'term_switch_3', threadId: 'other_thread', cwd: process.cwd(), cols: 120, rows: 40, status: 'running' },
      { id: 'term_switch_2', threadId: 'thread_switch', cwd: process.cwd(), cols: 120, rows: 40, status: 'running' },
      { id: 'term_switch_1', threadId: 'thread_switch', cwd: process.cwd(), cols: 120, rows: 40, status: 'running' },
    ],
    activeSessionId: 'term_switch_1',
  })
  useChatStore.getState().setTerminalDockSelectedTab('term_switch_1', { threadId: 'thread_switch' })

  const nextId = await useTerminalStore.getState().switchThreadSession({
    threadId: 'thread_switch',
    direction: 'next',
  })
  const previousId = await useTerminalStore.getState().switchThreadSession({
    threadId: 'thread_switch',
    direction: 'previous',
  })

  assert.equal(nextId, 'term_switch_2')
  assert.equal(previousId, 'term_switch_1')
  assert.deepEqual(focusCalls, [
    { sessionId: 'term_switch_2', surface: 'chat_dock' },
    { sessionId: 'term_switch_1', surface: 'chat_dock' },
  ])
  assert.equal(useChatStore.getState().getThreadState('thread_switch')?.terminalDock?.selectedTabId, 'term_switch_1')
  assert.equal(useTerminalStore.getState().activeSessionId, 'term_switch_1')
})

test('terminal store opens a thread-scoped chat terminal and focuses the dock', async () => {
  const createCalls = []
  const focusCalls = []

  global.window = {
    addom: {
      terminal: {
        createSession: async (payload = {}) => {
          createCalls.push(payload)
          return {
            ok: true,
            session: {
              id: 'term_thread_chat_1',
              threadId: payload.threadId,
              cwd: payload.cwd || process.cwd(),
              cols: 120,
              rows: 40,
              status: 'running',
              outputSequence: 0,
            },
          }
        },
        focusSessionSurface: async (sessionId, surface) => {
          focusCalls.push({ sessionId, surface })
          return {
            ok: true,
            session: {
              id: sessionId,
              threadId: 'thread_chat_1',
              cwd: process.cwd(),
              cols: 120,
              rows: 40,
              status: 'running',
              outputSequence: 0,
            },
          }
        },
        subscribe: async () => async () => {},
        attachSession: async (sessionId) => ({
          ok: true,
          session: {
            id: sessionId,
            threadId: 'thread_chat_1',
            cwd: process.cwd(),
            cols: 120,
            rows: 40,
            status: 'running',
            outputSequence: 0,
          },
          output: {
            chunks: [],
            nextSequence: 0,
            truncated: false,
          },
        }),
      },
    },
  }

  useAppStore.setState({ activeThreadId: 'thread_chat_1' })
  useChatStore.getState().setTerminalDockState({
    collapsed: true,
    browserOpen: true,
    browserSection: 'history',
    browserSelectionSessionId: 'archived_chat_1',
  }, { threadId: 'thread_chat_1' })
  useTerminalStore.setState({
    hydratedProjectFolder: process.cwd(),
    hydratedPermissionMode: 'ask',
  })

  const sessionId = await useTerminalStore.getState().openThreadTerminal({
    threadId: 'thread_chat_1',
    projectFolder: process.cwd(),
    cwd: process.cwd(),
    permissionMode: 'ask',
  })

  assert.equal(sessionId, 'term_thread_chat_1')
  assert.deepEqual(createCalls, [{
    projectFolder: process.cwd(),
    cwd: process.cwd(),
    shell: 'default',
    cols: 120,
    rows: 32,
    permissionMode: 'ask',
    threadId: 'thread_chat_1',
    preferredSurface: 'chat_dock',
    sessionTitle: '',
  }])
  assert.deepEqual(focusCalls, [{
    sessionId: 'term_thread_chat_1',
    surface: 'chat_dock',
  }])
  assert.equal(useTerminalStore.getState().activeSessionId, 'term_thread_chat_1')
  assert.equal(useChatStore.getState().getThreadState('thread_chat_1')?.terminalDock?.collapsed, false)
  assert.equal(useChatStore.getState().getThreadState('thread_chat_1')?.terminalDock?.browserOpen, false)
  assert.equal(useChatStore.getState().getThreadState('thread_chat_1')?.terminalDock?.selectedTabId, 'term_thread_chat_1')
  const sessionOpenedEvent = useTerminalStore.getState().telemetryEvents.find((event) => event?.type === 'session_opened')
  assert.equal(sessionOpenedEvent?.detail?.source, 'chat_composer_rail')
})

test('terminal store resolves terminal launch defaults from saved terminal settings', async () => {
  const createCalls = []

  global.window = {
    addom: {
      terminal: {
        createSession: async (payload = {}) => {
          createCalls.push(payload)
          return {
            ok: true,
            session: {
              id: 'term_thread_settings_1',
              threadId: payload.threadId,
              cwd: payload.cwd,
              shell: payload.shell,
              cols: 120,
              rows: 40,
              status: 'running',
              outputSequence: 0,
            },
          }
        },
        focusSessionSurface: async (sessionId) => ({
          ok: true,
          session: {
            id: sessionId,
            threadId: 'thread_settings_1',
            cwd: 'C:\\repo\\packages\\web',
            cols: 120,
            rows: 40,
            status: 'running',
            outputSequence: 0,
          },
        }),
        subscribe: async () => async () => {},
        attachSession: async (sessionId) => ({
          ok: true,
          session: {
            id: sessionId,
            threadId: 'thread_settings_1',
            cwd: 'C:\\repo\\packages\\web',
            shell: 'pwsh',
            cols: 120,
            rows: 40,
            status: 'running',
            outputSequence: 0,
          },
          output: {
            chunks: [],
            nextSequence: 0,
            truncated: false,
          },
        }),
      },
    },
  }

  useSettingsStore.setState({
    coreSettings: {
      terminal: {
        defaultShell: 'pwsh',
        defaultCwdBehavior: 'editor_folder',
      },
    },
  })
  useAppStore.setState({ activeThreadId: 'thread_settings_1' })
  useTerminalStore.setState({
    hydratedProjectFolder: 'C:\\repo',
    hydratedPermissionMode: 'ask',
  })

  const sessionId = await useTerminalStore.getState().openThreadTerminal({
    threadId: 'thread_settings_1',
    projectFolder: 'C:\\repo',
    permissionMode: 'ask',
    launchContext: {
      editorCwd: 'C:\\repo\\packages\\web',
      sessionCwd: 'C:\\repo\\packages\\api',
    },
  })

  assert.equal(sessionId, 'term_thread_settings_1')
  assert.deepEqual(createCalls, [{
    projectFolder: 'C:\\repo',
    cwd: 'C:\\repo\\packages\\web',
    shell: 'pwsh',
    cols: 120,
    rows: 32,
    permissionMode: 'ask',
    threadId: 'thread_settings_1',
    preferredSurface: 'chat_dock',
    sessionTitle: '',
  }])
})

test('terminal store focuses an existing thread terminal instead of creating another one', async () => {
  let createCalls = 0
  const focusCalls = []

  global.window = {
    addom: {
      terminal: {
        createSession: async () => {
          createCalls += 1
          throw new Error('createSession should not be called when the thread already has a live terminal')
        },
        focusSessionSurface: async (sessionId, surface) => {
          focusCalls.push({ sessionId, surface })
          return {
            ok: true,
            session: {
              id: sessionId,
              threadId: 'thread_chat_existing',
              cwd: process.cwd(),
              cols: 120,
              rows: 40,
              status: 'running',
              outputSequence: 0,
            },
          }
        },
      },
    },
  }

  useTerminalStore.setState({
    sessions: [{
      id: 'term_existing_1',
      threadId: 'thread_chat_existing',
      cwd: process.cwd(),
      cols: 120,
      rows: 40,
      status: 'running',
      outputSequence: 0,
    }],
    activeSessionId: '',
  })
  useChatStore.getState().setTerminalDockState({
    collapsed: true,
    browserOpen: true,
  }, { threadId: 'thread_chat_existing' })

  const focusedSessionId = await useTerminalStore.getState().openThreadTerminal({
    threadId: 'thread_chat_existing',
    projectFolder: process.cwd(),
    cwd: process.cwd(),
    permissionMode: 'ask',
  })

  assert.equal(focusedSessionId, 'term_existing_1')
  assert.equal(createCalls, 0)
  assert.deepEqual(focusCalls, [{
    sessionId: 'term_existing_1',
    surface: 'chat_dock',
  }])
  assert.equal(useTerminalStore.getState().activeSessionId, 'term_existing_1')
  assert.equal(useChatStore.getState().getThreadState('thread_chat_existing')?.terminalDock?.collapsed, false)
  assert.equal(useChatStore.getState().getThreadState('thread_chat_existing')?.terminalDock?.browserOpen, false)
  assert.equal(useChatStore.getState().getThreadState('thread_chat_existing')?.terminalDock?.selectedTabId, 'term_existing_1')
})

test('terminal store replaces the local replay tail when a truncated attach snapshot reveals a sequence gap', () => {
  const merged = mergeAttachOutput({
    rawOutput: 'one-two-three',
    lastSequence: 3,
    truncated: false,
  }, {
    chunks: [
      { sequence: 5, data: 'five' },
      { sequence: 6, data: 'six' },
    ],
    nextSequence: 6,
    truncated: true,
  })

  assert.deepEqual(merged, {
    rawOutput: 'fivesix',
    lastSequence: 6,
    truncated: true,
  })
})

test('terminal store reflects model-driven close activity immediately', () => {
  useTerminalStore.setState({
    sessions: [{
      id: 'term_store_close_1',
      cwd: process.cwd(),
      cols: 120,
      rows: 40,
      status: 'running',
      closeRequested: false,
      outputSequence: 8,
    }],
    activeSessionId: 'term_store_close_1',
    rawOutputBySessionId: {
      term_store_close_1: {
        rawOutput: 'prompt>',
        lastSequence: 8,
        truncated: false,
      },
    },
  })

  useTerminalStore.getState().noteModelSessionActivity({
    sessionId: 'term_store_close_1',
    action: 'close',
    status: 'closing',
    closeRequested: true,
    displayName: 'term_store_close_1',
  })

  assert.equal(useTerminalStore.getState().sessions[0]?.status, 'closing')
  assert.equal(useTerminalStore.getState().sessions[0]?.closeRequested, true)

  useTerminalStore.getState().noteModelSessionActivity({
    sessionId: 'term_store_close_1',
    action: 'close',
    status: 'closed',
    closeRequested: true,
    displayName: 'term_store_close_1',
  })

  assert.deepEqual(useTerminalStore.getState().sessions, [])
  assert.equal(useTerminalStore.getState().activeSessionId, '')
  assert.equal(useTerminalStore.getState().rawOutputBySessionId.term_store_close_1, undefined)
})

test('terminal store hydrates archived sessions separately and selects archive detail in read-only mode', async () => {
  global.window = {
    addom: {
      terminal: {
        getRuntimeHealth: async () => ({
          status: 'disabled',
          reason: 'disabled_by_env',
          platform: 'win32',
        }),
        listArchivedSessions: async () => ({
          ok: true,
          archives: [{
            sessionId: 'term_archive_store_1',
            cwd: 'C:\\repo\\feature-a',
            shell: 'pwsh',
            shellKind: 'pwsh',
            status: 'ended',
            openedAt: 10,
            closedAt: 20,
            openedBy: 'model',
            closedBy: 'model',
            sessionTitle: 'Archive selection',
            outputTail: [{ sequence: 1, at: 11, data: 'done\n' }],
          }],
        }),
        getArchivedSession: async () => ({
          ok: true,
          archive: {
            sessionId: 'term_archive_store_1',
            cwd: 'C:\\repo\\feature-a',
            shell: 'pwsh',
            shellKind: 'pwsh',
            status: 'ended',
            openedAt: 10,
            closedAt: 20,
            openedBy: 'model',
            closedBy: 'model',
            sessionTitle: 'Archive selection',
            outputTail: [{ sequence: 1, at: 11, data: 'done\n' }],
            memoryCandidateStatus: 'pending',
          },
        }),
      },
    },
  }

  await useTerminalStore.getState().hydratePanel({
    projectFolder: 'C:\\repo',
    permissionMode: 'ask',
  })

  assert.deepEqual(useTerminalStore.getState().sessions, [])
  assert.equal(useTerminalStore.getState().archivedSessions.length, 1)
  assert.equal(useTerminalStore.getState().archivedSessions[0]?.sessionId, 'term_archive_store_1')

  const selected = await useTerminalStore.getState().selectArchivedSession('term_archive_store_1')
  assert.equal(selected?.sessionId, 'term_archive_store_1')
  assert.equal(useTerminalStore.getState().activeArchivedSessionId, 'term_archive_store_1')
  assert.equal(useTerminalStore.getState().archivedSessions[0]?.memoryCandidateStatus, 'pending')
})

test('terminal store refreshes archived sessions when a live session closes', async () => {
  let archiveListCalls = 0
  global.window = {
    addom: {
      terminal: {
        listArchivedSessions: async () => {
          archiveListCalls += 1
          return {
            ok: true,
            archives: [{
              sessionId: 'term_store_closed_to_archive_1',
              cwd: process.cwd(),
              shell: 'bash',
              shellKind: 'bash',
              status: 'ended',
              openedAt: 1,
              closedAt: 2,
              openedBy: 'user',
              closedBy: 'user',
              outputTail: [{ sequence: 1, at: 2, data: 'archived\n' }],
            }],
          }
        },
      },
    },
  }

  useTerminalStore.setState({
    hydratedProjectFolder: process.cwd(),
    hydratedPermissionMode: 'ask',
    sessions: [{
      id: 'term_store_closed_to_archive_1',
      cwd: process.cwd(),
      cols: 120,
      rows: 40,
      status: 'running',
      outputSequence: 1,
    }],
    activeSessionId: 'term_store_closed_to_archive_1',
    rawOutputBySessionId: {
      term_store_closed_to_archive_1: {
        rawOutput: 'prompt>',
        lastSequence: 1,
        truncated: false,
      },
    },
    archivedSessions: [],
  })

  useTerminalStore.getState().applySessionEvent({
    type: 'closed',
    sessionId: 'term_store_closed_to_archive_1',
    session: {
      id: 'term_store_closed_to_archive_1',
      cwd: process.cwd(),
      cols: 120,
      rows: 40,
      status: 'closed',
      outputSequence: 1,
    },
  })

  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(archiveListCalls, 1)
  assert.deepEqual(useTerminalStore.getState().sessions, [])
  assert.equal(useTerminalStore.getState().archivedSessions[0]?.sessionId, 'term_store_closed_to_archive_1')
})

test('terminal store keeps chat-thread suggestion archives separate from the expanded browser archive list', async () => {
  global.window = {
    addom: {
      terminal: {
        listArchivedSessions: async (options = {}) => {
          const threadId = String(options?.threadId || '')
          if (threadId === 'thread-chat-suggestion') {
            return {
              ok: true,
              archives: [{
                sessionId: 'term_store_suggestion_1',
                threadId: 'thread-chat-suggestion',
                cwd: process.cwd(),
                shell: 'bash',
                shellKind: 'bash',
                status: 'ended',
                openedAt: 1,
                closedAt: 2,
                openedBy: 'model',
                closedBy: 'model',
                memoryCandidateStatus: 'pending',
                memoryCandidateSummary: 'Use pnpm through Corepack in this repo.',
                memoryCandidateReason: 'Future dependency work should follow the same flow.',
              }],
            }
          }
          return {
            ok: true,
            archives: [{
              sessionId: 'term_store_archive_panel_1',
              cwd: process.cwd(),
              shell: 'bash',
              shellKind: 'bash',
              status: 'ended',
              openedAt: 10,
              closedAt: 20,
              openedBy: 'user',
              closedBy: 'user',
            }],
          }
        },
      },
    },
  }

  useTerminalStore.setState({
    hydratedProjectFolder: process.cwd(),
    archivedSessions: [{
      sessionId: 'term_store_archive_panel_1',
      cwd: process.cwd(),
      shell: 'bash',
      shellKind: 'bash',
      status: 'ended',
      openedAt: 10,
      closedAt: 20,
      openedBy: 'user',
      closedBy: 'user',
    }],
  })

  const archives = await useTerminalStore.getState().refreshThreadSuggestionArchives({
    projectFolder: process.cwd(),
    threadId: 'thread-chat-suggestion',
  })

  assert.equal(archives.length, 1)
  assert.equal(useTerminalStore.getState().archivedSessions[0]?.sessionId, 'term_store_archive_panel_1')
  assert.equal(
    useTerminalStore.getState().threadSuggestionArchivesByThreadId?.['thread-chat-suggestion']?.[0]?.sessionId,
    'term_store_suggestion_1',
  )
})

test('terminal store marks thread suggestion actions busy while save and dismiss are in flight', async () => {
  let resolveDismiss
  let resolveAccept
  global.window = {
    addom: {
      terminal: {
        dismissArchivedSessionSuggestion: () => new Promise((resolve) => {
          resolveDismiss = () => resolve({
            ok: true,
            archive: {
              sessionId: 'term_store_pending_action_1',
              threadId: 'thread-chat-suggestion',
              cwd: process.cwd(),
              shell: 'bash',
              shellKind: 'bash',
              status: 'ended',
              openedAt: 1,
              closedAt: 2,
              openedBy: 'model',
              closedBy: 'model',
              memoryCandidateStatus: 'dismissed',
              memoryCandidateSummary: 'Use pnpm through Corepack in this repo.',
              memoryCandidateReason: 'Future dependency work should follow the same flow.',
            },
          })
        }),
        acceptArchivedSessionSuggestion: () => new Promise((resolve) => {
          resolveAccept = () => resolve({
            ok: true,
            archive: {
              sessionId: 'term_store_pending_action_1',
              threadId: 'thread-chat-suggestion',
              cwd: process.cwd(),
              shell: 'bash',
              shellKind: 'bash',
              status: 'ended',
              openedAt: 1,
              closedAt: 2,
              openedBy: 'model',
              closedBy: 'model',
              memoryCandidateStatus: 'accepted',
              memoryCandidateSummary: 'Use pnpm through Corepack in this repo.',
              memoryCandidateReason: 'Future dependency work should follow the same flow.',
              memoryNodeId: 'memory-node-1',
            },
          })
        }),
      },
    },
  }

  useTerminalStore.setState({
    hydratedProjectFolder: process.cwd(),
    threadSuggestionArchivesByThreadId: {
      'thread-chat-suggestion': [{
        sessionId: 'term_store_pending_action_1',
        threadId: 'thread-chat-suggestion',
        cwd: process.cwd(),
        shell: 'bash',
        shellKind: 'bash',
        status: 'ended',
        openedAt: 1,
        closedAt: 2,
        openedBy: 'model',
        closedBy: 'model',
        memoryCandidateStatus: 'pending',
        memoryCandidateSummary: 'Use pnpm through Corepack in this repo.',
        memoryCandidateReason: 'Future dependency work should follow the same flow.',
      }],
    },
  })

  const dismissPromise = useTerminalStore.getState().dismissArchivedSessionSuggestion('term_store_pending_action_1')
  assert.equal(useTerminalStore.getState().threadSuggestionArchivesPendingByThreadId?.['thread-chat-suggestion'], true)
  resolveDismiss()
  await dismissPromise
  assert.equal(useTerminalStore.getState().threadSuggestionArchivesPendingByThreadId?.['thread-chat-suggestion'], false)

  useTerminalStore.setState({
    threadSuggestionArchivesByThreadId: {
      'thread-chat-suggestion': [{
        sessionId: 'term_store_pending_action_1',
        threadId: 'thread-chat-suggestion',
        cwd: process.cwd(),
        shell: 'bash',
        shellKind: 'bash',
        status: 'ended',
        openedAt: 1,
        closedAt: 2,
        openedBy: 'model',
        closedBy: 'model',
        memoryCandidateStatus: 'pending',
        memoryCandidateSummary: 'Use pnpm through Corepack in this repo.',
        memoryCandidateReason: 'Future dependency work should follow the same flow.',
      }],
    },
  })

  const acceptPromise = useTerminalStore.getState().acceptArchivedSessionSuggestion('term_store_pending_action_1')
  assert.equal(useTerminalStore.getState().threadSuggestionArchivesPendingByThreadId?.['thread-chat-suggestion'], true)
  resolveAccept()
  await acceptPromise
  assert.equal(useTerminalStore.getState().threadSuggestionArchivesPendingByThreadId?.['thread-chat-suggestion'], false)
})

test('terminal store supports manual archive-to-memory promotion with per-session pending state', async () => {
  let resolveSave
  global.window = {
    addom: {
      terminal: {
        saveArchivedSessionToMemory: () => new Promise((resolve) => {
          resolveSave = () => resolve({
            ok: true,
            archive: {
              sessionId: 'term_store_manual_memory_1',
              threadId: 'thread-terminal-panel',
              cwd: process.cwd(),
              shell: 'bash',
              shellKind: 'bash',
              status: 'ended',
              openedAt: 1,
              closedAt: 2,
              openedBy: 'model',
              closedBy: 'model',
              memoryCandidateStatus: 'accepted',
              memoryCandidateSummary: 'Use pnpm through Corepack in this repo.',
              memoryCandidateReason: 'Future dependency work should follow the same flow.',
              memoryNodeId: 'memory-node-manual-1',
            },
          })
        }),
      },
    },
  }

  useTerminalStore.setState({
    hydratedProjectFolder: process.cwd(),
    archivedSessions: [{
      sessionId: 'term_store_manual_memory_1',
      threadId: 'thread-terminal-panel',
      cwd: process.cwd(),
      shell: 'bash',
      shellKind: 'bash',
      status: 'ended',
      openedAt: 1,
      closedAt: 2,
      openedBy: 'model',
      closedBy: 'model',
      memoryCandidateStatus: 'dismissed',
      memoryCandidateSummary: 'Use pnpm through Corepack in this repo.',
      memoryCandidateReason: 'Future dependency work should follow the same flow.',
    }],
  })

  const savePromise = useTerminalStore.getState().saveArchivedSessionToMemory('term_store_manual_memory_1')
  assert.equal(useTerminalStore.getState().archiveMemoryActionPendingBySessionId?.['term_store_manual_memory_1'], true)
  resolveSave()
  const archive = await savePromise
  assert.equal(archive?.memoryCandidateStatus, 'accepted')
  assert.equal(useTerminalStore.getState().archiveMemoryActionPendingBySessionId?.['term_store_manual_memory_1'], false)
  assert.equal(useTerminalStore.getState().archivedSessions[0]?.memoryNodeId, 'memory-node-manual-1')
})

test('terminal store deletes archived sessions and clears panel plus thread-scoped archive state', async () => {
  let resolveDelete
  global.window = {
    addom: {
      terminal: {
        deleteArchivedSession: () => new Promise((resolve) => {
          resolveDelete = () => resolve({
            ok: true,
            sessionId: 'term_store_delete_archive_1',
            deletedArchive: {
              sessionId: 'term_store_delete_archive_1',
            },
          })
        }),
      },
    },
  }

  useTerminalStore.setState({
    hydratedProjectFolder: process.cwd(),
    archivedSessions: [{
      sessionId: 'term_store_delete_archive_1',
      threadId: 'thread-terminal-panel',
      cwd: process.cwd(),
      shell: 'bash',
      shellKind: 'bash',
      status: 'ended',
      openedAt: 1,
      closedAt: 2,
      openedBy: 'model',
      closedBy: 'model',
    }],
    threadSuggestionArchivesByThreadId: {
      'thread-terminal-panel': [{
        sessionId: 'term_store_delete_archive_1',
        threadId: 'thread-terminal-panel',
        cwd: process.cwd(),
        shell: 'bash',
        shellKind: 'bash',
        status: 'ended',
        openedAt: 1,
        closedAt: 2,
        openedBy: 'model',
        closedBy: 'model',
      }],
    },
    activeArchivedSessionId: 'term_store_delete_archive_1',
    expandedArchivedSessionIds: ['term_store_delete_archive_1'],
  })

  const deletePromise = useTerminalStore.getState().deleteArchivedSession('term_store_delete_archive_1')
  assert.equal(useTerminalStore.getState().archiveDeletePendingBySessionId?.['term_store_delete_archive_1'], true)
  resolveDelete()
  const deleted = await deletePromise
  assert.equal(deleted, true)
  assert.equal(useTerminalStore.getState().archiveDeletePendingBySessionId?.['term_store_delete_archive_1'], undefined)
  assert.deepEqual(useTerminalStore.getState().archivedSessions, [])
  assert.equal(useTerminalStore.getState().activeArchivedSessionId, '')
  assert.deepEqual(useTerminalStore.getState().expandedArchivedSessionIds, [])
  assert.deepEqual(useTerminalStore.getState().threadSuggestionArchivesByThreadId, {})
})
