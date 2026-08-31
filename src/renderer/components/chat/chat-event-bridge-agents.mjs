import { createAgentEventBatcher } from '../../store/agents/agent-run-event-batcher.mjs'

function id(value) {
  return String(value || '').trim()
}

function scopeKey(scope = {}) {
  return `${id(scope.projectId)}\u0000${id(scope.threadId)}`
}

async function listAllRuns(api, scope) {
  const runs = []
  let cursor = null
  do {
    const page = await api.list({ ...scope, cursor, limit: 100 })
    runs.push(...(Array.isArray(page?.runs) ? page.runs : []))
    cursor = page?.hasMore ? page.nextCursor : null
  } while (cursor != null)
  return runs
}

export function registerAgentRunEventBridge({
  agentRunsApi,
  useAppStore,
  useAgentRunStore,
} = {}) {
  if (
    !agentRunsApi
    || typeof agentRunsApi.list !== 'function'
    || typeof agentRunsApi.get !== 'function'
    || typeof agentRunsApi.subscribe !== 'function'
  ) {
    return () => {}
  }
  let disposed = false
  let generation = 0
  let unsubscribeLive = null
  const reconciling = new Set()
  let activeScope = { projectId: '', threadId: '' }

  async function reconcile(runId) {
    const scope = {
      projectId: activeScope.projectId,
      threadId: activeScope.threadId,
    }
    if (!runId || !scope.projectId || !scope.threadId || reconciling.has(runId) || disposed) return
    reconciling.add(runId)
    try {
      const snapshot = await agentRunsApi.get({
        ...scope,
        runId,
        reconciliationReason: 'sequence_gap',
      })
      if (
        !disposed
        && scopeKey(scope) === scopeKey(activeScope)
        && snapshot?.run?.id === runId
      ) {
        useAgentRunStore.getState().hydrateRun(snapshot)
      }
    } catch {
      // Stale or incomplete scope / transient IPC — next activate or event reconciles.
    } finally {
      reconciling.delete(runId)
    }
  }

  const batcher = createAgentEventBatcher({
    applyBatch(events) {
      if (disposed || events.length === 0) return
      useAgentRunStore.getState().applyEvents(events)
      const state = useAgentRunStore.getState()
      for (const runId of new Set(events.map((event) => id(event?.runId)).filter(Boolean))) {
        if (state.gapByRun[runId]) void reconcile(runId)
      }
    },
  })

  async function activate(projectId, threadId) {
    const token = ++generation
    try {
      await unsubscribeLive?.()
      unsubscribeLive = null
      if (disposed || token !== generation) return

      const scope = { projectId: id(projectId), threadId: id(threadId) }
      activeScope = scope
      if (!scope.projectId || !scope.threadId) return

      const runs = await listAllRuns(agentRunsApi, scope)
      if (disposed || token !== generation) return

      const snapshots = await Promise.all(
        runs.map((run) => agentRunsApi.get({ ...scope, runId: run.id })),
      )
      if (disposed || token !== generation) return

      for (const runSnapshot of snapshots) {
        useAgentRunStore.getState().hydrateRun(runSnapshot)
      }

      const cleanup = await agentRunsApi.subscribe(scope, (event) => batcher.push(event))
      if (disposed || token !== generation) {
        await cleanup?.()
        return
      }
      unsubscribeLive = cleanup
    } catch (error) {
      if (disposed || token !== generation) return
      const message = String(error?.message || error || '')
      if (/\b(projectId|threadId) is required\b/i.test(message)) return
      console.error('[agent-run-bridge] activate failed', error)
    }
  }

  const initial = useAppStore.getState()
  void activate(initial.activeProjectId, initial.activeThreadId)
  const unsubscribeApp = useAppStore.subscribe((state, previous) => {
    if (
      id(state.activeProjectId) === id(previous.activeProjectId)
      && id(state.activeThreadId) === id(previous.activeThreadId)
    ) return
    void activate(state.activeProjectId, state.activeThreadId)
  })

  return () => {
    disposed = true
    generation += 1
    unsubscribeApp?.()
    void unsubscribeLive?.()
    unsubscribeLive = null
  }
}

export async function hydrateAgentNodeTranscript({
  agentRunsApi,
  scope,
  useAgentRunStore,
  onSummary = null,
  limit = 100,
} = {}) {
  const snapshot = await agentRunsApi.get(scope)
  useAgentRunStore.getState().hydrateRun(snapshot)
  const node = snapshot.nodes?.find((candidate) => candidate.id === scope.nodeId) || null
  if (node && typeof onSummary === 'function') onSummary(node)
  const page = await agentRunsApi.getTranscriptPage({ ...scope, limit })
  useAgentRunStore.getState().applyTranscriptPage({
    runId: scope.runId,
    nodeId: scope.nodeId,
    items: page.items,
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
  })
  return { node, page }
}
