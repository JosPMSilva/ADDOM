import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import useAgentRunStore from '../../store/useAgentRunStore.js'
import useAppStore from '../../store/useAppStore.js'
import {
  selectAgentAncestry,
  selectThreadSelectedAgentRoute,
} from '../../store/agents/agent-run-selectors.mjs'
import {
  mergeConversationTranscriptItems,
  mergeLatestConversationTranscriptPage,
  readCompleteConversationTranscript,
} from './agent-conversation-transcript-state.mjs'

const PAGE_LIMIT = 200
const EMPTY_ITEMS = []

function selectionKeyOf(state, threadId) {
  const route = selectThreadSelectedAgentRoute(state, threadId)
  return route ? `${route.runId}\u0000${route.nodeId}` : ''
}

function agentRunsApi() {
  return typeof window === 'undefined' ? null : window?.addom?.agentRuns || null
}

/**
 * Owns the opened agent for the active thread: which node is selected, whether its canonical
 * transcript is loaded, and how its internal pages are hydrated. Selection survives reload through persisted
 * presentation state, so a node that no longer exists is reported as missing rather than replaced.
 */
export default function useSelectedAgentConversation() {
  const projectId = useAppStore((state) => state.activeProjectId)
  const threadId = useAppStore((state) => state.activeThreadId)
  const selectionKey = useAgentRunStore((state) => selectionKeyOf(state, threadId))
  const [runId, nodeId] = selectionKey ? selectionKey.split('\u0000') : ['', '']

  const node = useAgentRunStore((state) => (nodeId ? state.nodesById[nodeId] || null : null))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [durableConversation, setDurableConversation] = useState(null)
  const [executionPage, setExecutionPage] = useState({
    selectionKey: '', items: EMPTY_ITEMS, hasMore: false, nextCursor: null, pagingStarted: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const refreshGenerationRef = useRef(0)
  const historyHydrationRef = useRef({ selectionKey: '', promise: null })

  const missing = Boolean(selectionKey) && !node

  const refreshConversation = useCallback(async ({ silent = false } = {}) => {
    const api = agentRunsApi()
    if (!api || !projectId || !threadId || !runId || !nodeId) return
    const generation = ++refreshGenerationRef.current
    if (!silent) setPending(true)
    try {
      const [projection, page] = await Promise.all([
        api.getConversation({ projectId, threadId, runId, nodeId }),
        api.getConversationTranscriptPage({ projectId, threadId, runId, nodeId, limit: PAGE_LIMIT }),
      ])
      if (generation !== refreshGenerationRef.current) return
      setDurableConversation(projection || null)
      setExecutionPage((current) => mergeLatestConversationTranscriptPage(current, page, selectionKey))
      if (historyHydrationRef.current.selectionKey !== selectionKey) {
        const promise = readCompleteConversationTranscript({
          initialPage: page,
          selectionKey,
          readPage: (cursor) => api.getConversationTranscriptPage({
            projectId, threadId, runId, nodeId, cursor, limit: PAGE_LIMIT,
          }),
        })
        historyHydrationRef.current = { selectionKey, promise }
        void promise.then((complete) => {
          if (historyHydrationRef.current.selectionKey !== selectionKey) return
          setExecutionPage((current) => (
            current.selectionKey !== selectionKey
              ? current
              : {
                  ...complete,
                  items: mergeConversationTranscriptItems(complete.items, current.items),
                }
          ))
        }).catch((cause) => {
          if (historyHydrationRef.current.selectionKey === selectionKey) {
            historyHydrationRef.current = { selectionKey: '', promise: null }
            setError(String(cause?.message || cause || 'Transcript unavailable'))
          }
        })
      }
      setError('')
    } catch (cause) {
      if (generation === refreshGenerationRef.current) {
        setError(String(cause?.message || cause || 'Conversation unavailable'))
      }
    } finally {
      if (generation === refreshGenerationRef.current) setPending(false)
    }
  }, [projectId, threadId, runId, nodeId, selectionKey])

  useEffect(() => {
    historyHydrationRef.current = { selectionKey: '', promise: null }
    setDurableConversation(null)
    setExecutionPage({
      selectionKey: '', items: EMPTY_ITEMS, hasMore: false, nextCursor: null, pagingStarted: false,
    })
    setSubmitting(false)
    setStopping(false)
  }, [selectionKey])

  useEffect(() => {
    if (!selectionKey || missing) return undefined
    const api = agentRunsApi()
    if (!api || !projectId || !threadId) return undefined
    let disposed = false
    let refreshTimer = null
    let unsubscribe = null
    void refreshConversation()
    void api.subscribe({ projectId, threadId }, () => {
      if (disposed || refreshTimer) return
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null
        if (!disposed) void refreshConversation({ silent: true })
      }, 60)
    }).then((cleanup) => {
      if (disposed) void cleanup?.()
      else unsubscribe = cleanup
    }).catch(() => {})
    return () => {
      disposed = true
      refreshGenerationRef.current += 1
      if (refreshTimer) window.clearTimeout(refreshTimer)
      void unsubscribe?.()
    }
  }, [selectionKey, missing, projectId, threadId, refreshConversation])

  const close = useCallback(() => {
    if (!runId) return
    const store = useAgentRunStore.getState()
    store.setPresentation({
      threadId,
      runId,
      returnAnchor: { focusNodeId: nodeId, focusSurface: 'stream' },
    })
    store.selectNavigatorNode({ threadId, runId, nodeId: '' })
  }, [threadId, runId, nodeId])

  const submitFollowup = useCallback(async (text) => {
    const api = agentRunsApi()
    if (!api || !projectId || !threadId || !runId || !nodeId || submitting) return false
    setSubmitting(true)
    setError('')
    try {
      const result = await api.followup({ projectId, threadId, runId, nodeId, text })
      if (result?.supported === false) {
        throw new Error(result.message || result.reason || 'Conversation follow-up is unavailable')
      }
      await refreshConversation({ silent: true })
      return true
    } catch (cause) {
      setError(String(cause?.message || cause || 'Conversation unavailable'))
      return false
    } finally {
      setSubmitting(false)
    }
  }, [projectId, threadId, runId, nodeId, submitting, refreshConversation])

  const stopActiveTurn = useCallback(async () => {
    const activeTurn = durableConversation?.turns?.find((turn) => (
      ['queued', 'running', 'waiting'].includes(String(turn?.status || ''))
      && turn.executionRunId
      && turn.executionNodeId
    ))
    const api = agentRunsApi()
    if (!api || !activeTurn || stopping) return false
    setStopping(true)
    setError('')
    try {
      await api.control({
        projectId,
        threadId,
        runId: activeTurn.executionRunId,
        nodeId: activeTurn.executionNodeId,
        action: 'interrupt',
        reason: 'user',
      })
      await refreshConversation({ silent: true })
      return true
    } catch (cause) {
      setError(String(cause?.message || cause || 'Conversation unavailable'))
      return false
    } finally {
      setStopping(false)
    }
  }, [durableConversation?.turns, projectId, threadId, refreshConversation, stopping])

  const ancestry = useMemo(() => (
    node ? selectAgentAncestry(useAgentRunStore.getState(), runId, nodeId) : EMPTY_ITEMS
  ), [node, runId, nodeId])

  return {
    active: Boolean(selectionKey),
    missing,
    projectId,
    threadId,
    runId,
    nodeId,
    node,
    ancestry,
    durableConversation: durableConversation?.nodeId === nodeId ? durableConversation : null,
    items: executionPage.selectionKey === selectionKey ? executionPage.items : EMPTY_ITEMS,
    pending,
    error,
    submitting,
    stopping,
    submitFollowup,
    stopActiveTurn,
    close,
  }
}
