import test from 'node:test'
import assert from 'node:assert/strict'

function createMemoryLocalStorage() {
  const map = new Map()
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null
    },
    setItem(key, value) {
      map.set(String(key), String(value))
    },
    removeItem(key) {
      map.delete(String(key))
    },
    clear() {
      map.clear()
    },
  }
}

async function withWorkspaceAndChatStores({
  workspaceApi = {},
  addomApi = {},
} = {}, testFn) {
  const prevWindow = globalThis.window
  const prevLocalStorage = globalThis.localStorage
  const localStorage = createMemoryLocalStorage()
  let injectedCrypto = false
  if (!globalThis.crypto) {
    globalThis.crypto = { randomUUID: () => `uuid_${Math.random().toString(36).slice(2, 10)}` }
    injectedCrypto = true
  }
  globalThis.window = {
    localStorage,
    addEventListener() {},
    removeEventListener() {},
    addom: {
      workspace: {
        listTimeline: async () => [],
        listProjects: async () => [],
        listThreads: async () => [],
        setActiveThread: async (_projectId, threadId) => ({ thread: { id: threadId } }),
        ...workspaceApi,
      },
      ...addomApi,
    },
  }
  globalThis.localStorage = localStorage

  try {
    const chatMod = await import('../../src/renderer/store/useChatStore.js')
    const workspaceMod = await import('../../src/renderer/store/useWorkspaceStore.js')
    const appMod = await import('../../src/renderer/store/useAppStore.js')

    const chatStore = chatMod.default
    const workspaceStore = workspaceMod.default
    const appStore = appMod.default

    if (typeof chatStore?.setState === 'function' && typeof chatStore?.getInitialState === 'function') {
      chatStore.setState(chatStore.getInitialState(), true)
    }
    if (typeof workspaceStore?.setState === 'function' && typeof workspaceStore?.getInitialState === 'function') {
      workspaceStore.setState(workspaceStore.getInitialState(), true)
    }
    if (typeof appStore?.setState === 'function' && typeof appStore?.getInitialState === 'function') {
      appStore.setState(appStore.getInitialState(), true)
    }

    return await testFn({ chatStore, workspaceStore, appStore })
  } finally {
    globalThis.window = prevWindow
    globalThis.localStorage = prevLocalStorage
    if (injectedCrypto) delete globalThis.crypto
  }
}

test('loadTimeline preserves live in-memory streaming state for the target thread', async () => {
  await withWorkspaceAndChatStores({
    workspaceApi: {
      listTimeline: async () => ([
        {
          eventId: 1,
          createdAt: Date.now(),
          kind: 'assistant_message',
          turnId: 'turn_live',
          content: 'persisted older content',
          meta: { threadId: 'thread_live' },
        },
      ]),
    },
  }, async ({ chatStore, workspaceStore, appStore }) => {
    const chat = chatStore.getState()
    appStore.getState().setActiveThreadId?.('thread_live')
    chat.setActiveThread('thread_live')
    const assistantId = chat.addAssistantPlaceholder({ threadId: 'thread_live' })
    chat.appendChunk(assistantId, 'live chunk', { threadId: 'thread_live' })

    await workspaceStore.getState().loadTimeline('thread_live')

    const next = chatStore.getState()
    const assistant = next.messages.find((message) => message?.id === assistantId)
    assert.equal(next.streamingId, assistantId)
    assert.equal(String(assistant?.status || ''), 'streaming')
    assert.equal(String(assistant?.content || ''), 'live chunk')
    assert.equal(next.messages.some((message) => String(message?.content || '') === 'persisted older content'), false)
  })
})

test('project activation starts target timeline hydration before project metadata refresh settles', async () => {
  let resolveProjects
  let timelineLoads = 0
  await withWorkspaceAndChatStores({
    workspaceApi: {
      listProjects: async () => new Promise((resolve) => { resolveProjects = resolve }),
      listThreads: async () => ([{ id: 'thread_active' }]),
      listTimeline: async () => {
        timelineLoads += 1
        return [
          {
            eventId: 1,
            createdAt: 1_000,
            kind: 'turn_started',
            turnId: 'turn_active',
            meta: {
              threadId: 'thread_active',
              turnId: 'turn_active',
              state: 'started',
              startedAt: 1_000,
            },
          },
          {
            eventId: 2,
            createdAt: 1_100,
            kind: 'execution_reasoning_chunk',
            turnId: 'turn_active',
            content: 'Still working.',
            meta: { threadId: 'thread_active', emittedAt: 1_100 },
          },
        ]
      },
    },
  }, async ({ chatStore, workspaceStore }) => {
    const activation = workspaceStore.getState().applyProjectActivation(
      { id: 'project_active', path: 'C:/repo/active', activeThreadId: 'thread_active' },
      { id: 'thread_active' },
    )

    await new Promise((resolve) => setTimeout(resolve, 0))
    const earlyTimelineLoads = timelineLoads
    const earlyTurnStatus = chatStore.getState().liveExecution?.turnsById?.turn_active?.status
    resolveProjects?.([])
    await activation
    assert.equal(earlyTimelineLoads, 1)
    assert.equal(earlyTurnStatus, 'active')
  })
})

test('external clear-active-project activation returns Chat to the project entry route', async () => {
  await withWorkspaceAndChatStores({}, async ({ chatStore, workspaceStore, appStore }) => {
    workspaceStore.setState({
      activeProjectId: 'project_a',
      activeThreadId: 'thread_a',
      preferredProjectId: 'project_a',
      restoreWorkspaceViewMode: 'workspace',
      threads: [{ id: 'thread_a' }],
    })
    appStore.setState({
      activeProjectId: 'project_a',
      activeThreadId: 'thread_a',
      projectFolder: 'C:/repo/a',
      workspaceViewMode: 'workspace',
      activePanel: 'editor',
    })
    chatStore.getState().setActiveThread('thread_a')

    const result = await workspaceStore.getState().syncExternalProjectActivation({
      action: 'clear-active-project',
      project: null,
      activeThread: null,
    })

    assert.deepEqual(result, { project: null, activeThread: null })
    assert.equal(workspaceStore.getState().activeProjectId, null)
    assert.equal(workspaceStore.getState().activeThreadId, null)
    assert.deepEqual(workspaceStore.getState().threads, [])
    assert.equal(workspaceStore.getState().restoreWorkspaceViewMode, 'project-entry')
    assert.equal(appStore.getState().activeProjectId, null)
    assert.equal(appStore.getState().activeThreadId, null)
    assert.equal(appStore.getState().projectFolder, null)
    assert.equal(appStore.getState().workspaceViewMode, 'project-entry')
    assert.equal(appStore.getState().activePanel, 'chat')
    assert.equal(chatStore.getState().activeThreadId, '')
  })
})

test('external clear-active-project invalidates an in-flight project activation', async () => {
  let releaseProjects
  const projectsLoaded = new Promise((resolve) => { releaseProjects = resolve })
  const project = {
    id: 'project_external', path: 'C:/repo/external', activeThreadId: 'thread_external',
  }
  const thread = { id: 'thread_external', projectId: project.id }
  await withWorkspaceAndChatStores({
    workspaceApi: {
      listProjects: () => projectsLoaded,
      listThreads: async () => [thread],
      listTimeline: async () => [],
    },
  }, async ({ workspaceStore, appStore, chatStore }) => {
    const activation = workspaceStore.getState().syncExternalProjectActivation({
      action: 'open-project', project, activeThread: thread,
    })
    await Promise.resolve()

    await workspaceStore.getState().syncExternalProjectActivation({
      action: 'clear-active-project', project: null, activeThread: null,
    })
    releaseProjects([project])
    await activation

    assert.equal(workspaceStore.getState().activeProjectId, null)
    assert.equal(workspaceStore.getState().activeThreadId, null)
    assert.deepEqual(workspaceStore.getState().threads, [])
    assert.equal(appStore.getState().activeProjectId, null)
    assert.equal(appStore.getState().activeThreadId, null)
    assert.equal(chatStore.getState().activeThreadId, '')
  })
})

test('loadTimeline still hydrates completed threads from persisted timeline', async () => {
  await withWorkspaceAndChatStores({
    workspaceApi: {
      listTimeline: async () => ([
        {
          eventId: 2,
          createdAt: Date.now(),
          kind: 'assistant_message',
          turnId: 'turn_done',
          content: 'persisted final content',
          meta: { threadId: 'thread_done' },
        },
      ]),
    },
  }, async ({ chatStore, workspaceStore, appStore }) => {
    const chat = chatStore.getState()
    appStore.getState().setActiveThreadId?.('thread_done')
    chat.setActiveThread('thread_done')
    const assistantId = chat.addAssistantPlaceholder({ threadId: 'thread_done' })
    chat.appendChunk(assistantId, 'transient content', { threadId: 'thread_done' })
    chat.finalizeMessage(assistantId, 'done locally', { threadId: 'thread_done' })

    await workspaceStore.getState().loadTimeline('thread_done')

    const next = chatStore.getState()
    assert.equal(next.streamingId, null)
    assert.equal(next.messages.length, 1)
    assert.equal(String(next.messages[0]?.content || ''), 'persisted final content')
  })
})

test('loadTimeline restores persisted write conflicts for completed threads', async () => {
  await withWorkspaceAndChatStores({
    workspaceApi: {
      listTimeline: async () => ([
        {
          eventId: 3,
          createdAt: 3_000,
          kind: 'write_conflict',
          turnId: 'turn_conflict',
          meta: {
            threadId: 'thread_conflict',
            turnId: 'turn_conflict',
            toolName: 'write_file',
            filePath: 'calculator.py',
            newRevId: 'rev_new',
            prevRevId: 'rev_prev',
            conflictBaseRevId: 'rev_base',
            conflictActualRevId: 'rev_actual',
            detectedAt: 3_025,
          },
        },
      ]),
    },
  }, async ({ chatStore, workspaceStore, appStore }) => {
    appStore.getState().setActiveThreadId?.('thread_conflict')
    chatStore.getState().setActiveThread('thread_conflict')

    await workspaceStore.getState().loadTimeline('thread_conflict')

    const next = chatStore.getState()
    assert.equal(next.writeConflicts.length, 1)
    assert.equal(String(next.writeConflicts[0]?.filePath || ''), 'calculator.py')
    assert.equal(String(next.writeConflicts[0]?.threadId || ''), 'thread_conflict')
    assert.equal(next.writeConflicts[0]?.resolved, false)
  })
})

test('loadTimeline does not duplicate hydrated write conflicts on repeated reloads', async () => {
  await withWorkspaceAndChatStores({
    workspaceApi: {
      listTimeline: async () => ([
        {
          eventId: 4,
          createdAt: 4_000,
          kind: 'write_conflict',
          turnId: 'turn_repeat',
          meta: {
            threadId: 'thread_repeat',
            turnId: 'turn_repeat',
            toolName: 'write_file',
            filePath: 'calculator.py',
            newRevId: 'rev_new',
            prevRevId: 'rev_prev',
            conflictBaseRevId: 'rev_base',
            conflictActualRevId: 'rev_actual',
            detectedAt: 4_025,
          },
        },
      ]),
    },
  }, async ({ chatStore, workspaceStore, appStore }) => {
    appStore.getState().setActiveThreadId?.('thread_repeat')
    chatStore.getState().setActiveThread('thread_repeat')

    await workspaceStore.getState().loadTimeline('thread_repeat')
    await workspaceStore.getState().loadTimeline('thread_repeat')

    const next = chatStore.getState()
    assert.equal(next.writeConflicts.length, 1)
    assert.equal(String(next.writeConflicts[0]?.id || ''), 'write_conflict:thread_repeat|turn_repeat|calculator.py|rev_new|rev_prev|rev_base|rev_actual')
  })
})

test('loadTimeline paginates until the full persisted timeline is loaded', async () => {
  const listTimelineCalls = []
  await withWorkspaceAndChatStores({
    workspaceApi: {
      listTimeline: async (_threadId, options = {}) => {
        listTimelineCalls.push({
          limit: Number(options?.limit || 0) || 0,
          afterEventId: Number(options?.afterEventId || 0) || 0,
        })
        const afterEventId = Number(options?.afterEventId || 0) || 0
        if (afterEventId <= 0) {
          return Array.from({ length: 1000 }, (_, index) => ({
            eventId: index + 1,
            createdAt: index + 1,
            kind: 'assistant_message',
            turnId: 'turn_page_a',
            content: `page-a-${index + 1}`,
            meta: { threadId: 'thread_paginated' },
          }))
        }
        if (afterEventId === 1000) {
          return Array.from({ length: 250 }, (_, index) => ({
            eventId: 1001 + index,
            createdAt: 1001 + index,
            kind: 'assistant_message',
            turnId: 'turn_page_b',
            content: `page-b-${index + 1}`,
            meta: { threadId: 'thread_paginated' },
          }))
        }
        return []
      },
    },
  }, async ({ chatStore, workspaceStore, appStore }) => {
    appStore.getState().setActiveThreadId?.('thread_paginated')
    chatStore.getState().setActiveThread('thread_paginated')

    const events = await workspaceStore.getState().loadTimeline('thread_paginated')

    assert.equal(events.length, 1250)
    assert.equal(listTimelineCalls.length, 2)
    assert.deepEqual(listTimelineCalls[0], { limit: 1000, afterEventId: 0 })
    assert.deepEqual(listTimelineCalls[1], { limit: 1000, afterEventId: 1000 })

    const next = chatStore.getState()
    assert.equal(next.messages.length, 1250)
    assert.equal(String(next.messages[0]?.content || ''), 'page-a-1')
    assert.equal(String(next.messages[1249]?.content || ''), 'page-b-250')
  })
})

test('workspace thread switch restores provider and model on the target thread only', async () => {
  await withWorkspaceAndChatStores({
    workspaceApi: {
      setActiveThread: async (_projectId, threadId) => ({
        thread: {
          id: threadId,
          lastProvider: 'ollama',
          lastModel: 'deepseek-r1:8b',
        },
      }),
    },
  }, async ({ chatStore, workspaceStore, appStore }) => {
    chatStore.setState((state) => ({
      ...state,
      providers: [
        { id: 'provider-a', defaultModel: 'model-a-default' },
        { id: 'provider-b', defaultModel: 'model-b-default' },
        { id: 'ollama', defaultModel: 'llama3' },
      ],
    }))

    const chat = chatStore.getState()
    appStore.getState().setActiveThreadId?.('thread_a')
    chat.setActiveThread('thread_a')
    chat.setSelectedProvider('provider-a')
    chat.setSelectedModel('model-a')

    appStore.getState().setActiveThreadId?.('thread_b')
    chat.setActiveThread('thread_b')
    chat.setSelectedProvider('provider-b')
    chat.setSelectedModel('model-b')

    appStore.getState().setActiveThreadId?.('thread_a')
    chat.setActiveThread('thread_a')

    workspaceStore.setState({ activeProjectId: 'project_1', activeThreadId: 'thread_a' })
    await workspaceStore.getState().setActiveThread('thread_b')

    const next = chatStore.getState()
    assert.equal(String(next.selectedProvider || ''), 'ollama')
    assert.equal(String(next.selectedModel || ''), 'deepseek-r1:8b')
    assert.equal(String(next.threadStateById?.thread_a?.selectedProvider || ''), 'provider-a')
    assert.equal(String(next.threadStateById?.thread_a?.selectedModel || ''), 'model-a')
  })
})

test('workspace target activation restores a cross-project thread route without cancellation', async () => {
  const cancellationCalls = []
  const projects = [
    { id: 'project_a', path: 'C:/repo/a', activeThreadId: 'thread_a' },
    { id: 'project_b', path: 'C:/repo/b', activeThreadId: 'thread_b_default' },
  ]
  const threadsByProject = {
    project_a: [{
      id: 'thread_a',
      projectId: 'project_a',
      lastProvider: 'provider-a',
      lastModel: 'model-a',
      permissionMode: 'ask',
    }],
    project_b: [
      {
        id: 'thread_b_default',
        projectId: 'project_b',
        lastProvider: 'provider-b',
        lastModel: 'model-b-default',
        permissionMode: 'full_access',
      },
      {
        id: 'thread_b_target',
        projectId: 'project_b',
        lastProvider: 'provider-b',
        lastModel: 'model-b-target',
        permissionMode: 'full_access',
      },
    ],
  }

  await withWorkspaceAndChatStores({
    workspaceApi: {
      listProjects: async () => projects,
      listThreads: async (projectId) => threadsByProject[projectId] || [],
      setActiveProject: async (projectId) => ({
        project: projects.find((project) => project.id === projectId),
        activeThread: threadsByProject[projectId]?.[0] || null,
      }),
      setActiveThread: async (projectId, threadId) => ({
        project: projects.find((project) => project.id === projectId),
        thread: threadsByProject[projectId]?.find((thread) => thread.id === threadId) || null,
      }),
      cancel: () => cancellationCalls.push('workspace.cancel'),
      stop: () => cancellationCalls.push('workspace.stop'),
      abort: () => cancellationCalls.push('workspace.abort'),
    },
    addomApi: {
      chat: { cancel: () => cancellationCalls.push('chat.cancel') },
      processes: {
        stopBackground: () => cancellationCalls.push('processes.stopBackground'),
        stopAllBackground: () => cancellationCalls.push('processes.stopAllBackground'),
      },
      pipeline: { abort: () => cancellationCalls.push('pipeline.abort') },
      council: { abort: () => cancellationCalls.push('council.abort') },
    },
  }, async ({ chatStore, workspaceStore, appStore }) => {
    chatStore.setState((state) => ({
      ...state,
      providers: [
        { id: 'provider-a', defaultModel: 'model-a-default' },
        { id: 'provider-b', defaultModel: 'model-b-default' },
      ],
    }))
    appStore.getState().setPermissionMode('ask')
    appStore.getState().setActiveThreadId('thread_a')
    chatStore.getState().setActiveThread('thread_a')
    chatStore.getState().setSelectedProvider('provider-a')
    chatStore.getState().setSelectedModel('model-a')
    chatStore.getState().setPendingContextPrefix('source-session')
    chatStore.getState().setActiveThread('thread_b_target')
    appStore.getState().setPermissionMode('full_access')
    chatStore.getState().setSelectedProvider('provider-b')
    chatStore.getState().setSelectedModel('model-b-target')
    chatStore.getState().setActiveThread('thread_a')
    appStore.getState().setPermissionMode('ask')
    workspaceStore.setState({
      projects,
      activeProjectId: 'project_a',
      activeThreadId: 'thread_a',
    })

    const result = await workspaceStore.getState().activateWorkspaceTarget({
      projectId: 'project_b',
      threadId: 'thread_b_target',
    })

    assert.deepEqual(result, {
      project: projects[1],
      thread: threadsByProject.project_b[1],
      created: false,
    })
    const workspace = workspaceStore.getState()
    const chat = chatStore.getState()
    assert.equal(workspace.activeProjectId, 'project_b')
    assert.equal(workspace.activeThreadId, 'thread_b_target')
    assert.equal(chat.activeThreadId, 'thread_b_target')
    assert.equal(chat.selectedProvider, 'provider-b')
    assert.equal(chat.selectedModel, 'model-b-target')
    assert.equal(chat.threadStateById.thread_a.selectedProvider, 'provider-a')
    assert.equal(chat.threadStateById.thread_a.selectedModel, 'model-a')
    assert.deepEqual(chat.threadStateById.thread_a.pendingContextPrefix, {
      kind: 'provider_switch_context',
      text: 'source-session',
    })
    assert.equal(appStore.getState().permissionMode, 'full_access')
    assert.deepEqual(cancellationCalls, [])
  })
})

test('rapid cross-project targets keep the latest project and thread selection', async () => {
  const projects = [
    { id: 'project_a', path: 'C:/repo/a', activeThreadId: 'thread_a' },
    { id: 'project_b', path: 'C:/repo/b', activeThreadId: 'thread_b' },
    { id: 'project_c', path: 'C:/repo/c', activeThreadId: 'thread_c' },
  ]
  const threadsByProject = {
    project_a: [{ id: 'thread_a', projectId: 'project_a' }],
    project_b: [{ id: 'thread_b', projectId: 'project_b' }],
    project_c: [{ id: 'thread_c', projectId: 'project_c' }],
  }
  const calls = []
  let releaseProjectHydration
  let markProjectHydrationStarted
  const projectHydrationStarted = new Promise((resolve) => { markProjectHydrationStarted = resolve })
  const projectHydrationGate = new Promise((resolve) => { releaseProjectHydration = resolve })
  let projectHydrationBlocked = false
  await withWorkspaceAndChatStores({
    workspaceApi: {
      listProjects: async () => {
        if (!projectHydrationBlocked) {
          projectHydrationBlocked = true
          markProjectHydrationStarted()
          await projectHydrationGate
        }
        return projects
      },
      listThreads: async (projectId) => threadsByProject[projectId] || [],
      listTimeline: async () => [],
      setActiveProject: async (projectId) => {
        calls.push(`project:${projectId}`)
        const project = projects.find((row) => row.id === projectId)
        return { project, activeThread: threadsByProject[projectId][0] }
      },
      setActiveThread: async (projectId, threadId) => {
        calls.push(`thread:${projectId}:${threadId}`)
        const thread = threadsByProject[projectId].find((row) => row.id === threadId) || null
        return { project: projects.find((row) => row.id === projectId), thread }
      },
    },
  }, async ({ workspaceStore, appStore, chatStore }) => {
    workspaceStore.setState({
      projects,
      threads: threadsByProject.project_a,
      activeProjectId: 'project_a',
      activeThreadId: 'thread_a',
    })
    appStore.setState({
      activeProjectId: 'project_a',
      activeThreadId: 'thread_a',
      projectFolder: 'C:/repo/a',
      workspaceViewMode: 'workspace',
      activePanel: 'chat',
    })
    chatStore.getState().setActiveThread('thread_a')

    const first = workspaceStore.getState().activateWorkspaceTarget({
      projectId: 'project_b', threadId: 'thread_b',
    })
    await projectHydrationStarted
    const second = workspaceStore.getState().activateWorkspaceTarget({
      projectId: 'project_c', threadId: 'thread_c',
    })
    releaseProjectHydration()
    assert.equal((await second)?.project?.id, 'project_c')
    assert.equal(await first, null)

    assert.equal(workspaceStore.getState().activeProjectId, 'project_c')
    assert.equal(workspaceStore.getState().activeThreadId, 'thread_c')
    assert.equal(appStore.getState().activeProjectId, 'project_c')
    assert.equal(appStore.getState().activeThreadId, 'thread_c')
    assert.equal(chatStore.getState().activeThreadId, 'thread_c')
    assert.equal(calls.includes('thread:project_c:thread_b'), false)
  })
})

test('thread selection restores permission mode independently for two threads', async () => {
  await withWorkspaceAndChatStores({}, async ({ chatStore, appStore }) => {
    chatStore.getState().setActiveThread('thread_a')
    appStore.getState().setPermissionMode('ask')

    chatStore.getState().setActiveThread('thread_b')
    appStore.getState().setPermissionMode('full_access')

    chatStore.getState().setActiveThread('thread_a')
    assert.equal(appStore.getState().permissionMode, 'ask')

    chatStore.getState().setActiveThread('thread_b')
    assert.equal(appStore.getState().permissionMode, 'full_access')
  })
})

function createStatefulActivationBackend({
  projects,
  threadsByProject,
  activeProjectId,
  activeThreadId,
  failedThreadId = '',
  failCreation = false,
}) {
  const calls = []
  const cancellationCalls = []
  const backendState = { activeProjectId, activeThreadId }
  const findProject = (projectId) => projects.find((project) => project.id === projectId) || null
  const findThread = (projectId, threadId) => (
    threadsByProject[projectId]?.find((thread) => thread.id === threadId) || null
  )
  return {
    calls,
    cancellationCalls,
    backendState,
    workspaceApi: {
      listProjects: async () => projects,
      listThreads: async (projectId) => threadsByProject[projectId] || [],
      setActiveProject: async (projectId) => {
        calls.push(`setActiveProject:${projectId}`)
        const project = findProject(projectId)
        const activeThread = findThread(projectId, project?.activeThreadId)
          || threadsByProject[projectId]?.[0]
          || null
        backendState.activeProjectId = projectId
        backendState.activeThreadId = activeThread?.id || null
        return { project, activeThread }
      },
      setActiveThread: async (projectId, threadId) => {
        calls.push(`setActiveThread:${projectId}:${threadId}`)
        if (threadId === failedThreadId) throw new Error('Target thread unavailable')
        const thread = findThread(projectId, threadId)
        backendState.activeProjectId = projectId
        backendState.activeThreadId = thread?.id || null
        return { project: findProject(projectId), thread }
      },
      clearActiveProject: async () => {
        calls.push('clearActiveProject')
        backendState.activeProjectId = null
        backendState.activeThreadId = null
        return { project: null, activeThread: null }
      },
      createThread: async (projectId) => {
        calls.push(`createThread:${projectId}`)
        if (failCreation) throw new Error('Thread creation failed')
        return null
      },
      cancel: () => cancellationCalls.push('workspace.cancel'),
      stop: () => cancellationCalls.push('workspace.stop'),
      abort: () => cancellationCalls.push('workspace.abort'),
    },
    addomApi: {
      chat: { cancel: () => cancellationCalls.push('chat.cancel') },
      processes: {
        stopBackground: () => cancellationCalls.push('processes.stopBackground'),
        stopAllBackground: () => cancellationCalls.push('processes.stopAllBackground'),
      },
      pipeline: { abort: () => cancellationCalls.push('pipeline.abort') },
      council: { abort: () => cancellationCalls.push('council.abort') },
    },
  }
}

test('cross-project target-thread failure restores the exact source route', async () => {
  const projects = [
    { id: 'project_a', path: 'C:/repo/a', activeThreadId: 'thread_a' },
    { id: 'project_b', path: 'C:/repo/b', activeThreadId: 'thread_b' },
  ]
  const threadsByProject = {
    project_a: [{ id: 'thread_a', lastProvider: 'provider-a', lastModel: 'model-a' }],
    project_b: [{ id: 'thread_b', lastProvider: 'provider-b', lastModel: 'model-b' }],
  }
  const backend = createStatefulActivationBackend({
    projects,
    threadsByProject,
    activeProjectId: 'project_a',
    activeThreadId: 'thread_a',
    failedThreadId: 'thread_missing',
  })
  await withWorkspaceAndChatStores({
    workspaceApi: backend.workspaceApi,
    addomApi: backend.addomApi,
  }, async ({ chatStore, workspaceStore, appStore }) => {
    chatStore.setState((state) => ({
      ...state,
      providers: [{ id: 'provider-a', defaultModel: 'model-a' }, { id: 'provider-b', defaultModel: 'model-b' }],
    }))
    appStore.getState().setActiveProjectId('project_a')
    appStore.getState().setActiveThreadId('thread_a')
    appStore.getState().setProjectFolder('C:/repo/a')
    appStore.getState().setWorkspaceViewMode('workspace')
    appStore.getState().setActivePanel('chat')
    chatStore.getState().setActiveThread('thread_a')
    chatStore.getState().setSelectedProvider('provider-a')
    chatStore.getState().setSelectedModel('model-a')
    chatStore.getState().setPendingContextPrefix('source-session')
    appStore.getState().setPermissionMode('ask')
    workspaceStore.setState({
      projects,
      threads: threadsByProject.project_a,
      activeProjectId: 'project_a',
      activeThreadId: 'thread_a',
      preferredProjectId: 'project_a',
      restoreWorkspaceViewMode: 'workspace',
    })

    const result = await workspaceStore.getState().activateWorkspaceTarget({
      projectId: 'project_b',
      threadId: 'thread_missing',
    })

    assert.equal(result, null)
    assert.equal(workspaceStore.getState().activeProjectId, 'project_a')
    assert.equal(workspaceStore.getState().activeThreadId, 'thread_a')
    assert.equal(appStore.getState().activeProjectId, 'project_a')
    assert.equal(appStore.getState().activeThreadId, 'thread_a')
    assert.equal(appStore.getState().projectFolder, 'C:/repo/a')
    assert.equal(appStore.getState().workspaceViewMode, 'workspace')
    assert.equal(appStore.getState().activePanel, 'chat')
    assert.equal(appStore.getState().permissionMode, 'ask')
    assert.equal(chatStore.getState().activeThreadId, 'thread_a')
    assert.equal(chatStore.getState().selectedProvider, 'provider-a')
    assert.equal(chatStore.getState().selectedModel, 'model-a')
    assert.equal(chatStore.getState().pendingContextPrefix.text, 'source-session')
    assert.equal(workspaceStore.getState().error, 'Target thread unavailable')
    assert.deepEqual(backend.calls, [
      'setActiveProject:project_b',
      'setActiveThread:project_b:thread_missing',
      'setActiveProject:project_a',
      'setActiveThread:project_a:thread_a',
    ])
    assert.deepEqual(backend.backendState, {
      activeProjectId: 'project_a',
      activeThreadId: 'thread_a',
    })
    assert.deepEqual(backend.cancellationCalls, [])
  })
})

test('cross-project thread-creation failure restores the exact source route', async () => {
  const projects = [
    { id: 'project_a', path: 'C:/repo/a', activeThreadId: 'thread_a' },
    { id: 'project_b', path: 'C:/repo/b', activeThreadId: 'thread_b' },
  ]
  const threadsByProject = {
    project_a: [{ id: 'thread_a', lastProvider: 'provider-a', lastModel: 'model-a' }],
    project_b: [{ id: 'thread_b', lastProvider: 'provider-b', lastModel: 'model-b' }],
  }
  const backend = createStatefulActivationBackend({
    projects,
    threadsByProject,
    activeProjectId: 'project_a',
    activeThreadId: 'thread_a',
    failCreation: true,
  })
  await withWorkspaceAndChatStores({
    workspaceApi: backend.workspaceApi,
    addomApi: backend.addomApi,
  }, async ({ chatStore, workspaceStore, appStore }) => {
    chatStore.setState((state) => ({
      ...state,
      providers: [{ id: 'provider-a', defaultModel: 'model-a' }, { id: 'provider-b', defaultModel: 'model-b' }],
    }))
    appStore.getState().setActiveProjectId('project_a')
    appStore.getState().setActiveThreadId('thread_a')
    appStore.getState().setProjectFolder('C:/repo/a')
    appStore.getState().setWorkspaceViewMode('workspace')
    appStore.getState().setActivePanel('chat')
    chatStore.getState().setActiveThread('thread_a')
    chatStore.getState().setSelectedProvider('provider-a')
    chatStore.getState().setSelectedModel('model-a')
    chatStore.getState().setPendingContextPrefix('source-session')
    appStore.getState().setPermissionMode('ask')
    workspaceStore.setState({
      projects,
      threads: threadsByProject.project_a,
      activeProjectId: 'project_a',
      activeThreadId: 'thread_a',
      preferredProjectId: 'project_a',
      restoreWorkspaceViewMode: 'workspace',
    })

    const result = await workspaceStore.getState().activateWorkspaceTarget({
      projectId: 'project_b',
      createThread: true,
    })

    assert.equal(result, null)
    assert.equal(workspaceStore.getState().activeProjectId, 'project_a')
    assert.equal(workspaceStore.getState().activeThreadId, 'thread_a')
    assert.equal(appStore.getState().activeProjectId, 'project_a')
    assert.equal(appStore.getState().activeThreadId, 'thread_a')
    assert.equal(appStore.getState().projectFolder, 'C:/repo/a')
    assert.equal(appStore.getState().workspaceViewMode, 'workspace')
    assert.equal(appStore.getState().activePanel, 'chat')
    assert.equal(appStore.getState().permissionMode, 'ask')
    assert.equal(chatStore.getState().activeThreadId, 'thread_a')
    assert.equal(chatStore.getState().selectedProvider, 'provider-a')
    assert.equal(chatStore.getState().selectedModel, 'model-a')
    assert.equal(chatStore.getState().pendingContextPrefix.text, 'source-session')
    assert.equal(workspaceStore.getState().error, 'Thread creation failed')
    assert.deepEqual(backend.calls, [
      'setActiveProject:project_b',
      'createThread:project_b',
      'setActiveProject:project_a',
      'setActiveThread:project_a:thread_a',
    ])
    assert.deepEqual(backend.backendState, {
      activeProjectId: 'project_a',
      activeThreadId: 'thread_a',
    })
    assert.deepEqual(backend.cancellationCalls, [])
  })
})

for (const source of [{
  name: 'project entry',
  projectId: null,
  projectFolder: null,
  workspaceViewMode: 'project-entry',
}]) {
  test(`cross-project failure restores a source-less ${source.name} chat route`, async () => {
    const projects = [
      { id: 'project_a', path: 'C:/repo/a', activeThreadId: null },
      { id: 'project_b', path: 'C:/repo/b', activeThreadId: 'thread_b' },
    ]
    const threadsByProject = {
      project_a: [],
      project_b: [{ id: 'thread_b', lastProvider: 'provider-b', lastModel: 'model-b' }],
    }
    const backend = createStatefulActivationBackend({
      projects,
      threadsByProject,
      activeProjectId: source.projectId,
      activeThreadId: null,
      failedThreadId: 'thread_missing',
    })
    await withWorkspaceAndChatStores({
      workspaceApi: backend.workspaceApi,
      addomApi: backend.addomApi,
    }, async ({ chatStore, workspaceStore, appStore }) => {
      chatStore.getState().setActiveThread('thread_b')
      appStore.getState().setPermissionMode('ask')
      chatStore.getState().setActiveThread('source_seed')
      chatStore.setState({
        activeThreadId: '',
        selectedProvider: 'provider-source',
        selectedModel: 'model-source',
        pendingContextPrefix: { kind: 'provider_switch_context', text: 'source-session' },
      })
      appStore.setState({
        activeProjectId: source.projectId,
        activeThreadId: null,
        projectFolder: source.projectFolder,
        workspaceViewMode: source.workspaceViewMode,
        activePanel: 'chat',
        permissionMode: 'full_access',
      })
      workspaceStore.setState({
        projects,
        threads: [],
        activeProjectId: source.projectId,
        activeThreadId: null,
        preferredProjectId: source.projectId,
        restoreWorkspaceViewMode: source.workspaceViewMode,
      })

      const result = await workspaceStore.getState().activateWorkspaceTarget({
        projectId: 'project_b',
        threadId: 'thread_missing',
      })

      assert.equal(result, null)
      assert.equal(workspaceStore.getState().activeProjectId, source.projectId)
      assert.equal(workspaceStore.getState().activeThreadId, null)
      assert.equal(appStore.getState().activeProjectId, source.projectId)
      assert.equal(appStore.getState().activeThreadId, null)
      assert.equal(appStore.getState().projectFolder, source.projectFolder)
      assert.equal(appStore.getState().workspaceViewMode, source.workspaceViewMode)
      assert.equal(appStore.getState().activePanel, 'chat')
      assert.equal(appStore.getState().permissionMode, 'full_access')
      assert.equal(chatStore.getState().activeThreadId, '')
      assert.equal(chatStore.getState().selectedProvider, 'provider-source')
      assert.equal(chatStore.getState().selectedModel, 'model-source')
      assert.equal(chatStore.getState().pendingContextPrefix.text, 'source-session')
      assert.equal(workspaceStore.getState().error, 'Target thread unavailable')
      assert.deepEqual(backend.calls, [
        'setActiveProject:project_b',
        'setActiveThread:project_b:thread_missing',
        'clearActiveProject',
      ])
      assert.deepEqual(backend.backendState, {
        activeProjectId: null,
        activeThreadId: null,
      })
      assert.deepEqual(backend.cancellationCalls, [])

      appStore.getState().setActiveThreadId('thread_b')
      assert.equal(chatStore.getState().activeThreadId, 'thread_b')
    })
  })
}

test('workspace target activation uses lightweight selection within the active project', async () => {
  const calls = []
  const project = { id: 'project_a', path: 'C:/repo/a', activeThreadId: 'thread_a' }
  const targetThread = {
    id: 'thread_a_2',
    projectId: 'project_a',
    lastProvider: 'provider-a',
    lastModel: 'model-a-2',
  }
  await withWorkspaceAndChatStores({
    workspaceApi: {
      listProjects: async () => [project],
      listThreads: async () => [targetThread],
      setActiveProject: async () => {
        calls.push('setActiveProject')
        return { project, activeThread: targetThread }
      },
      setActiveThread: async () => {
        calls.push('setActiveThread')
        return { project, thread: targetThread }
      },
    },
  }, async ({ workspaceStore }) => {
    workspaceStore.setState({
      projects: [project],
      activeProjectId: 'project_a',
      activeThreadId: 'thread_a',
    })

    const result = await workspaceStore.getState().activateWorkspaceTarget({
      projectId: 'project_a',
      threadId: 'thread_a_2',
    })

    assert.deepEqual(result, { project, thread: targetThread, created: false })
    assert.deepEqual(calls, ['setActiveThread'])
  })
})

test('workspace target activation creates a thread after activating its project', async () => {
  const calls = []
  const project = { id: 'project_b', path: 'C:/repo/b', activeThreadId: 'thread_b' }
  const activeThread = { id: 'thread_b', projectId: 'project_b' }
  const createdThread = { id: 'thread_b_new', projectId: 'project_b' }
  await withWorkspaceAndChatStores({
    workspaceApi: {
      listProjects: async () => [project],
      listThreads: async () => [activeThread, createdThread],
      setActiveProject: async () => {
        calls.push('setActiveProject')
        return { project, activeThread }
      },
      createThread: async (projectId) => {
        calls.push(`createThread:${projectId}`)
        return { project, thread: createdThread }
      },
    },
  }, async ({ workspaceStore }) => {
    workspaceStore.setState({ activeProjectId: 'project_a', activeThreadId: 'thread_a' })

    const result = await workspaceStore.getState().activateWorkspaceTarget({
      projectId: 'project_b',
      createThread: true,
    })

    assert.deepEqual(result, { project, thread: createdThread, created: true })
    assert.deepEqual(calls, ['setActiveProject', 'createThread:project_b'])
  })
})

test('explicit thread rename keeps its original project and thread across an async selection race', async () => {
  let resolveRename
  const calls = []
  await withWorkspaceAndChatStores({
    workspaceApi: {
      renameThread: (projectId, threadId, title) => new Promise((resolve) => {
        calls.push({ projectId, threadId, title })
        resolveRename = () => resolve({ thread: { id: threadId, projectId, title } })
      }),
    },
  }, async ({ workspaceStore, appStore }) => {
    workspaceStore.setState({ activeProjectId: 'p1', activeThreadId: 't1' })
    appStore.setState({ activeProjectId: 'p1', activeThreadId: 't1' })

    const rename = workspaceStore.getState().renameThread({
      projectId: 'p1',
      threadId: 't1',
      title: 'Renamed one',
    })
    workspaceStore.setState({ activeProjectId: 'p2', activeThreadId: 't2' })
    appStore.setState({ activeProjectId: 'p2', activeThreadId: 't2' })
    resolveRename()

    const result = await rename
    assert.equal(result?.id, 't1')
    assert.deepEqual(calls, [{ projectId: 'p1', threadId: 't1', title: 'Renamed one' }])
    assert.equal(workspaceStore.getState().activeProjectId, 'p2')
    assert.equal(workspaceStore.getState().activeThreadId, 't2')
    assert.equal(appStore.getState().activeProjectId, 'p2')
    assert.equal(appStore.getState().activeThreadId, 't2')
  })
})

test('renaming an active-project thread updates the canonical thread list immediately', async () => {
  await withWorkspaceAndChatStores({
    workspaceApi: {
      renameThread: async (projectId, threadId, title) => ({
        thread: { id: threadId, projectId, title, updatedAt: 42 },
      }),
    },
  }, async ({ workspaceStore }) => {
    workspaceStore.setState({
      activeProjectId: 'p1',
      activeThreadId: 't1',
      threads: [
        { id: 't1', projectId: 'p1', title: 'Old title', updatedAt: 10 },
        { id: 't2', projectId: 'p1', title: 'Other thread', updatedAt: 20 },
      ],
    })

    await workspaceStore.getState().renameThread({
      projectId: 'p1',
      threadId: 't1',
      title: 'New title',
    })

    assert.deepEqual(workspaceStore.getState().threads, [
      { id: 't1', projectId: 'p1', title: 'New title', updatedAt: 42 },
      { id: 't2', projectId: 'p1', title: 'Other thread', updatedAt: 20 },
    ])
  })
})

test('explicit thread mutations can attach failures locally without duplicating global error state', async () => {
  await withWorkspaceAndChatStores({
    workspaceApi: {
      renameThread: async () => { throw new Error('Rename unavailable') },
      deleteThread: async () => { throw new Error('Delete unavailable') },
    },
  }, async ({ workspaceStore }) => {
    workspaceStore.setState({ error: null })

    await assert.rejects(() => workspaceStore.getState().renameThread({
      projectId: 'p1', threadId: 't1', title: 'Renamed one', reportError: false, throwOnError: true,
    }), /Rename unavailable/)
    assert.equal(workspaceStore.getState().error, null)

    await assert.rejects(() => workspaceStore.getState().deleteThread({
      projectId: 'p1', threadId: 't1', reportError: false, throwOnError: true,
    }), /Delete unavailable/)
    assert.equal(workspaceStore.getState().error, null)
  })
})

test('deleting an inactive-project thread keeps the current route and explicit owner', async () => {
  let resolveDelete
  const calls = []
  const cancellationCalls = []
  await withWorkspaceAndChatStores({
    workspaceApi: {
      deleteThread: (threadId) => new Promise((resolve) => {
        calls.push(threadId)
        resolveDelete = () => resolve({
          ok: true,
          projectId: 'p1',
          threadId,
          activeThread: { id: 't1-next', projectId: 'p1' },
        })
      }),
      cancel: () => cancellationCalls.push('cancel'),
      stop: () => cancellationCalls.push('stop'),
      abort: () => cancellationCalls.push('abort'),
    },
  }, async ({ chatStore, workspaceStore, appStore }) => {
    const [{ default: terminalStore }, { default: toolStore }] = await Promise.all([
      import('../../src/renderer/store/useTerminalStore.js'),
      import('../../src/renderer/store/useToolStore.js'),
    ])
    workspaceStore.setState({ activeProjectId: 'p2', activeThreadId: 't2' })
    appStore.setState({ activeProjectId: 'p2', activeThreadId: 't2' })
    workspaceStore.getState().loadTimeline = async () => []
    chatStore.setState((state) => ({
      threadStateById: {
        ...state.threadStateById,
        t1: { messages: [{ id: 'deleted-message' }] },
      },
    }))
    toolStore.getState().setPending({ approvalId: 'approval-t1', threadId: 't1' })
    toolStore.getState().addHistory({ id: 'history-t1', threadId: 't1' })
    terminalStore.setState({
      archivedSessions: [{ sessionId: 'archive-t1', threadId: 't1' }],
      threadSuggestionArchivesByThreadId: { t1: [{ sessionId: 'archive-t1' }] },
      threadSuggestionArchivesPendingByThreadId: { t1: true },
    })

    const deletion = workspaceStore.getState().deleteThread({ projectId: 'p1', threadId: 't1' })
    workspaceStore.setState({ activeProjectId: 'p3', activeThreadId: 't3' })
    appStore.setState({ activeProjectId: 'p3', activeThreadId: 't3' })
    resolveDelete()

    const result = await deletion
    assert.equal(result?.ok, true)
    assert.deepEqual(calls, ['t1'])
    assert.equal(workspaceStore.getState().activeProjectId, 'p3')
    assert.equal(workspaceStore.getState().activeThreadId, 't3')
    assert.equal(appStore.getState().activeProjectId, 'p3')
    assert.equal(appStore.getState().activeThreadId, 't3')
    assert.equal(chatStore.getState().threadStateById.t1, undefined)
    assert.equal(toolStore.getState().pendingByThreadId.t1, undefined)
    assert.equal(toolStore.getState().history.some((entry) => entry.threadId === 't1'), false)
    assert.equal(terminalStore.getState().archivedSessions.some((entry) => entry.threadId === 't1'), false)
    assert.equal(terminalStore.getState().threadSuggestionArchivesByThreadId.t1, undefined)
    assert.deepEqual(cancellationCalls, [])
  })
})

test('thread switch preserves unresolved write conflicts only on the owning thread', async () => {
  await withWorkspaceAndChatStores({}, async ({ chatStore, appStore }) => {
    const chat = chatStore.getState()

    appStore.getState().setActiveThreadId?.('thread_a')
    chat.setActiveThread('thread_a')
    chat.hydrateFromTimeline([
      {
        eventId: 10,
        createdAt: 10_000,
        kind: 'write_conflict',
        turnId: 'turn_a',
        meta: {
          threadId: 'thread_a',
          turnId: 'turn_a',
          toolName: 'write_file',
          filePath: 'a.py',
          newRevId: 'rev_a_new',
          prevRevId: 'rev_a_prev',
          conflictBaseRevId: 'rev_a_base',
          conflictActualRevId: 'rev_a_actual',
          detectedAt: 10_005,
        },
      },
    ], { threadId: 'thread_a' })

    appStore.getState().setActiveThreadId?.('thread_b')
    chat.setActiveThread('thread_b')
    chat.hydrateFromTimeline([], { threadId: 'thread_b' })

    let next = chatStore.getState()
    assert.equal(next.writeConflicts.length, 0)
    assert.equal(next.threadStateById?.thread_a?.writeConflicts?.length, 1)

    appStore.getState().setActiveThreadId?.('thread_a')
    chat.setActiveThread('thread_a')

    next = chatStore.getState()
    assert.equal(next.writeConflicts.length, 1)
    assert.equal(String(next.writeConflicts[0]?.filePath || ''), 'a.py')
    assert.equal(next.threadStateById?.thread_b?.writeConflicts?.length || 0, 0)
  })
})

test('loadTimeline ignores stale same-thread completions', async () => {
  let resolveFirst
  let resolveSecond
  let callCount = 0
  await withWorkspaceAndChatStores({
    workspaceApi: {
      listTimeline: async () => {
        callCount += 1
        if (callCount === 1) {
          return new Promise((resolve) => { resolveFirst = resolve })
        }
        return new Promise((resolve) => { resolveSecond = resolve })
      },
    },
  }, async ({ chatStore, workspaceStore, appStore }) => {
    appStore.getState().setActiveThreadId?.('thread_race')
    chatStore.getState().setActiveThread('thread_race')

    const firstLoad = workspaceStore.getState().loadTimeline('thread_race')
    const secondLoad = workspaceStore.getState().loadTimeline('thread_race')

    resolveSecond?.([
      {
        eventId: 22,
        createdAt: Date.now(),
        kind: 'assistant_message',
        turnId: 'turn_race_new',
        content: 'newer timeline snapshot',
        meta: { threadId: 'thread_race' },
      },
    ])
    await secondLoad

    resolveFirst?.([
      {
        eventId: 21,
        createdAt: Date.now() - 1000,
        kind: 'assistant_message',
        turnId: 'turn_race_old',
        content: 'older timeline snapshot',
        meta: { threadId: 'thread_race' },
      },
    ])
    await firstLoad

    const next = chatStore.getState()
    assert.equal(next.messages.length, 1)
    assert.equal(String(next.messages[0]?.content || ''), 'newer timeline snapshot')
    assert.equal(String(workspaceStore.getState().error || ''), '')
  })
})

test('loadTimeline pages beyond the first batch and keeps the latest retained events', async () => {
  const pageCalls = []
  await withWorkspaceAndChatStores({
    workspaceApi: {
      listTimeline: async (_threadId, options = {}) => {
        const afterEventId = Number(options?.afterEventId || 0) || 0
        pageCalls.push({
          limit: Number(options?.limit || 0) || 0,
          afterEventId,
        })
        const start = afterEventId + 1
        if (start > 4500) return []
        const end = Math.min(start + 999, 4500)
        return Array.from({ length: end - start + 1 }, (_, index) => {
          const eventId = start + index
          return {
            eventId,
            createdAt: eventId,
            kind: 'assistant_message',
            turnId: `turn_${eventId}`,
            content: `event ${eventId}`,
            meta: { threadId: 'thread_paged' },
          }
        })
      },
    },
  }, async ({ chatStore, workspaceStore, appStore }) => {
    appStore.getState().setActiveThreadId?.('thread_paged')
    chatStore.getState().setActiveThread('thread_paged')

    await workspaceStore.getState().loadTimeline('thread_paged')

    const next = chatStore.getState()
    assert.ok(pageCalls.length >= 5)
    assert.equal(pageCalls[0]?.limit, 1000)
    assert.equal(pageCalls[0]?.afterEventId, 0)
    assert.equal(pageCalls[1]?.afterEventId, 1000)
    assert.equal(next.timeline.length, 4000)
    assert.equal(String(next.messages[0]?.content || ''), 'event 501')
    assert.equal(String(next.messages[next.messages.length - 1]?.content || ''), 'event 4500')
  })
})

test('setActiveThread ignores stale overlapping completions', async () => {
  let resolveThreadB
  let resolveThreadC
  await withWorkspaceAndChatStores({
    workspaceApi: {
      setActiveThread: async (_projectId, threadId) => {
        if (threadId === 'thread_b') {
          return new Promise((resolve) => {
            resolveThreadB = () => resolve({
              thread: {
                id: 'thread_b',
                lastProvider: 'provider-b',
                lastModel: 'model-b',
              },
            })
          })
        }
        if (threadId === 'thread_c') {
          return new Promise((resolve) => {
            resolveThreadC = () => resolve({
              thread: {
                id: 'thread_c',
                lastProvider: 'provider-c',
                lastModel: 'model-c',
              },
            })
          })
        }
        return { thread: { id: threadId } }
      },
      listThreads: async () => ([
        { id: 'thread_a' },
        { id: 'thread_b' },
        { id: 'thread_c' },
      ]),
    },
  }, async ({ chatStore, workspaceStore, appStore }) => {
    chatStore.setState((state) => ({
      ...state,
      providers: [
        { id: 'provider-a', defaultModel: 'model-a' },
        { id: 'provider-b', defaultModel: 'model-b' },
        { id: 'provider-c', defaultModel: 'model-c' },
      ],
    }))

    appStore.getState().setActiveThreadId?.('thread_a')
    chatStore.getState().setActiveThread('thread_a')
    workspaceStore.setState({ activeProjectId: 'project_1', activeThreadId: 'thread_a' })

    const switchToB = workspaceStore.getState().setActiveThread('thread_b')
    const switchToC = workspaceStore.getState().setActiveThread('thread_c')

    resolveThreadC?.()
    await switchToC

    resolveThreadB?.()
    await switchToB

    const workspace = workspaceStore.getState()
    const chat = chatStore.getState()
    assert.equal(workspace.activeThreadId, 'thread_c')
    assert.equal(appStore.getState().activeThreadId, 'thread_c')
    assert.equal(String(chat.activeThreadId || ''), 'thread_c')
    assert.equal(String(chat.selectedProvider || ''), 'provider-c')
    assert.equal(String(chat.selectedModel || ''), 'model-c')
  })
})

test('workspace bootstrap restores the active project and thread when the last workspace session is still valid', async () => {
  await withWorkspaceAndChatStores({
    workspaceApi: {
      listProjects: async () => ([
        {
          id: 'project_restore',
          path: 'C:/repo/restore',
          name: 'restore',
          activeThreadId: 'thread_restore',
        },
      ]),
      listThreads: async () => ([
        {
          id: 'thread_restore',
          projectId: 'project_restore',
          title: 'Main',
          lastProvider: 'openai',
          lastModel: 'gpt-5.4',
        },
      ]),
      listTimeline: async () => ([
        {
          eventId: 1,
          createdAt: Date.now(),
          kind: 'assistant_message',
          turnId: 'turn_restore',
          content: 'restored message',
          meta: { threadId: 'thread_restore' },
        },
      ]),
    },
  }, async ({ chatStore, workspaceStore, appStore }) => {
    workspaceStore.setState({
      activeProjectId: 'project_restore',
      activeThreadId: 'thread_restore',
      preferredProjectId: 'project_restore',
      restoreWorkspaceViewMode: 'workspace',
    })

    await workspaceStore.getState().bootstrap()

    const workspace = workspaceStore.getState()
    const app = appStore.getState()
    const chat = chatStore.getState()
    assert.equal(workspace.activeProjectId, 'project_restore')
    assert.equal(workspace.activeThreadId, 'thread_restore')
    assert.equal(app.activeProjectId, 'project_restore')
    assert.equal(app.activeThreadId, 'thread_restore')
    assert.equal(app.projectFolder, 'C:/repo/restore')
    assert.equal(app.workspaceViewMode, 'workspace')
    assert.equal(String(chat.activeThreadId || ''), 'thread_restore')
    assert.equal(String(chat.messages[0]?.content || ''), 'restored message')
  })
})

test('workspace bootstrap falls back to project entry when the persisted workspace session is no longer valid', async () => {
  await withWorkspaceAndChatStores({
    workspaceApi: {
      listProjects: async () => ([
        {
          id: 'project_live',
          path: 'C:/repo/live',
          name: 'live',
          activeThreadId: 'thread_live',
        },
      ]),
    },
  }, async ({ workspaceStore, appStore }) => {
    workspaceStore.setState({
      activeProjectId: 'project_missing',
      activeThreadId: 'thread_missing',
      preferredProjectId: 'project_missing',
      restoreWorkspaceViewMode: 'workspace',
    })

    await workspaceStore.getState().bootstrap()

    const workspace = workspaceStore.getState()
    const app = appStore.getState()
    assert.equal(workspace.activeProjectId, null)
    assert.equal(workspace.activeThreadId, null)
    assert.equal(app.activeProjectId, null)
    assert.equal(app.activeThreadId, null)
    assert.equal(app.projectFolder, null)
    assert.equal(app.workspaceViewMode, 'project-entry')
  })
})

test('external workspace activation events reconcile renderer state for bridge-driven project opens', async () => {
  const workspaceActivationListeners = new Set()
  await withWorkspaceAndChatStores({
    workspaceApi: {
      onActiveProjectChanged(cb) {
        workspaceActivationListeners.add(cb)
        return () => workspaceActivationListeners.delete(cb)
      },
      listProjects: async () => ([
        {
          id: 'project_external',
          path: 'C:/repo/external',
          name: 'external',
          activeThreadId: 'thread_external',
        },
      ]),
      listThreads: async () => ([
        {
          id: 'thread_external',
          projectId: 'project_external',
          title: 'Main',
          lastProvider: 'openai',
          lastModel: 'gpt-5.4',
        },
      ]),
      listTimeline: async () => ([
        {
          eventId: 1,
          createdAt: Date.now(),
          kind: 'assistant_message',
          turnId: 'turn_external',
          content: 'external activation message',
          meta: { threadId: 'thread_external' },
        },
      ]),
    },
  }, async ({ chatStore, workspaceStore, appStore }) => {
    const { initializeRendererStateSync } = await import('../../src/renderer/startup/initialize-renderer-state-sync.mjs')
    const cleanup = initializeRendererStateSync()
    try {
      for (const listener of workspaceActivationListeners) {
        listener({
          action: 'open-project',
          project: {
            id: 'project_external',
            path: 'C:/repo/external',
            name: 'external',
            activeThreadId: 'thread_external',
          },
          activeThread: {
            id: 'thread_external',
            projectId: 'project_external',
            title: 'Main',
            lastProvider: 'openai',
            lastModel: 'gpt-5.4',
          },
        })
      }

      await new Promise((resolve) => setTimeout(resolve, 0))
      await new Promise((resolve) => setTimeout(resolve, 0))

      const workspace = workspaceStore.getState()
      const app = appStore.getState()
      const chat = chatStore.getState()
      assert.equal(workspace.activeProjectId, 'project_external')
      assert.equal(workspace.activeThreadId, 'thread_external')
      assert.equal(app.activeProjectId, 'project_external')
      assert.equal(app.activeThreadId, 'thread_external')
      assert.equal(app.projectFolder, 'C:/repo/external')
      assert.equal(app.workspaceViewMode, 'workspace')
      assert.equal(String(chat.activeThreadId || ''), 'thread_external')
      assert.equal(String(chat.messages[0]?.content || ''), 'external activation message')
    } finally {
      cleanup?.()
    }
  })
})

test('workspace restore priority persists separately from project work activity', async () => {
  await withWorkspaceAndChatStores({}, async ({ workspaceStore }) => {
    workspaceStore.setState({
      projects: [{ id: 'project-old', lastWorkedAt: 10 }],
    })
    const before = Date.now()

    workspaceStore.getState().restoreProjectToRecent('project-old')

    const state = workspaceStore.getState()
    assert.equal(state.projectEntryRestoredAtById['project-old'] >= before, true)
    assert.equal(state.projects[0].lastWorkedAt, 10)
  })
})

test('opening a manually archived project does not restore it to Recent', async () => {
  await withWorkspaceAndChatStores({
    workspaceApi: {
      setActiveProject: async () => ({
        project: { id: 'project-archived', path: 'C:/repo/archived', activeThreadId: 'thread-archived' },
        activeThread: { id: 'thread-archived' },
      }),
      listProjects: async () => ([
        { id: 'project-archived', path: 'C:/repo/archived', activeThreadId: 'thread-archived' },
      ]),
      listThreads: async () => ([{ id: 'thread-archived' }]),
      listTimeline: async () => [],
    },
  }, async ({ workspaceStore }) => {
    workspaceStore.setState({
      projects: [{ id: 'project-archived', path: 'C:/repo/archived' }],
      projectEntryArchivedAtById: { 'project-archived': 120 },
    })

    await workspaceStore.getState().openProjectById('project-archived')

    assert.deepEqual(workspaceStore.getState().projectEntryArchivedAtById, { 'project-archived': 120 })
  })
})

test('workspace archive and restore priorities prune entries for missing projects', async () => {
  await withWorkspaceAndChatStores({
    workspaceApi: {
      listProjects: async () => ([
        { id: 'kept', name: 'Kept', lastWorkedAt: 100 },
      ]),
    },
  }, async ({ workspaceStore }) => {
    workspaceStore.setState({
      projectEntryArchivedAtById: { kept: 110, removed: 210 },
      projectEntryRestoredAtById: { kept: 120, removed: 200 },
    })

    await workspaceStore.getState().loadProjects()

    assert.deepEqual(workspaceStore.getState().projectEntryArchivedAtById, { kept: 110 })
    assert.deepEqual(workspaceStore.getState().projectEntryRestoredAtById, { kept: 120 })
  })
})

test('workspace rail store defaults, clamps widths, and toggles visibility', async () => {
  await withWorkspaceAndChatStores({}, async ({ workspaceStore }) => {
    const initial = workspaceStore.getState()
    assert.equal(initial.workspaceRailOpen, true)
    assert.equal(initial.workspaceRailWidth, 336)

    initial.setWorkspaceRailWidth(900)
    assert.equal(workspaceStore.getState().workspaceRailWidth, 520)

    workspaceStore.getState().toggleWorkspaceRail()
    assert.equal(workspaceStore.getState().workspaceRailOpen, false)

    workspaceStore.getState().setWorkspaceRailOpen(true)
    assert.equal(workspaceStore.getState().workspaceRailOpen, true)
  })
})

test('workspace rail persisted merge normalizes state and preserves project archive and restore priority', async () => {
  await withWorkspaceAndChatStores({}, async ({ workspaceStore }) => {
    const { merge, partialize } = workspaceStore.persist.getOptions()
    const persisted = partialize({
      ...workspaceStore.getState(),
      workspaceRailOpen: false,
      workspaceRailWidth: 280,
      projectEntryRestoredAtById: { kept: 120 },
      projectEntryArchivedAtById: { archived: 140 },
    })

    assert.equal(persisted.workspaceRailOpen, false)
    assert.equal(persisted.workspaceRailWidth, 280)
    assert.deepEqual(persisted.projectEntryRestoredAtById, { kept: 120 })
    assert.deepEqual(persisted.projectEntryArchivedAtById, { archived: 140 })

    const merged = merge({
      ...persisted,
      workspaceRailOpen: 'invalid',
      workspaceRailWidth: 900,
    }, workspaceStore.getState())

    assert.equal(merged.workspaceRailOpen, true)
    assert.equal(merged.workspaceRailWidth, 520)
    assert.deepEqual(merged.projectEntryRestoredAtById, { kept: 120 })
    assert.deepEqual(merged.projectEntryArchivedAtById, { archived: 140 })
  })
})
