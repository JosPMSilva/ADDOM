import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { resolveWorkspaceThreadActivity } from './workspace-thread-activity-state.mjs'

const SESSION_STALE_AFTER_MS = 20_000
const SESSION_CLOCK_TICK_MS = 5_000
const HEARTBEAT_WRITE_MIN_INTERVAL_MS = 2_000

function normalizeThreadId(value) {
  return String(value || '').trim()
}

function normalizeKnownThreads(values) {
  const rows = Array.isArray(values) ? values : []
  return rows.map((value) => {
    const source = value && typeof value === 'object' ? value : { id: value }
    const id = normalizeThreadId(source.id)
    if (!id) return null
    const persistedActivity = source.persistedActivity && typeof source.persistedActivity === 'object'
      ? {
          status: String(source.persistedActivity.status || 'idle'),
          unread: source.persistedActivity.unread === true,
          updatedAt: Number(source.persistedActivity.updatedAt || 0) || 0,
        }
      : { status: 'idle', unread: false, updatedAt: 0 }
    return { id, persistedActivity }
  }).filter(Boolean)
}

function snapshotsEqual(left, right) {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) => left[key] === right[key])
}

export function createWorkspaceThreadActivitySource({
  getChatApi = () => globalThis?.window?.addom?.chat,
  getWorkspaceApi = () => globalThis?.window?.addom?.workspace,
  now = () => Date.now(),
  setInterval: startInterval = globalThis.setInterval,
  clearInterval: stopInterval = globalThis.clearInterval,
} = {}) {
  const listeners = new Set()
  const knownIdsByConsumer = new Map()
  const persistedActivitiesByConsumer = new Map()
  const sessionsByThreadId = new Map()
  const heartbeatWriteByThreadId = new Map()
  const foregroundThreadIdByConsumer = new Map()
  let snapshot = {}
  let bridgeCleanup = null
  let nextConsumerId = 0

  const knownThreadIds = () => {
    const ids = new Set()
    for (const consumerIds of knownIdsByConsumer.values()) {
      for (const threadId of consumerIds) ids.add(threadId)
    }
    return ids
  }

  const foregroundThreadIds = () => new Set(
    [...foregroundThreadIdByConsumer.values()].filter(Boolean),
  )

  const persistedActivityForThread = (threadId) => {
    for (const activities of persistedActivitiesByConsumer.values()) {
      if (activities.has(threadId)) return activities.get(threadId)
    }
    return null
  }

  const acknowledgeThread = (threadId) => {
    const tid = normalizeThreadId(threadId)
    if (!tid) return
    const acknowledge = getWorkspaceApi?.()?.acknowledgeThreadActivity
    if (typeof acknowledge !== 'function') return
    try {
      Promise.resolve(acknowledge(tid, Number(now()) || Date.now())).catch(() => {})
    } catch {
      // Non-fatal acknowledgement.
    }
  }

  const publish = () => {
    const ids = knownThreadIds()
    const nowMs = Number(now()) || Date.now()
    const next = {}
    for (const threadId of ids) {
      next[threadId] = resolveWorkspaceThreadActivity({
        live: sessionsByThreadId.get(threadId),
        persisted: persistedActivityForThread(threadId),
        foreground: foregroundThreadIds().has(threadId),
        nowMs,
        staleAfterMs: SESSION_STALE_AFTER_MS,
      })
    }
    if (snapshotsEqual(snapshot, next)) return
    snapshot = next
    for (const listener of listeners) listener()
  }

  const pruneUnknownThreads = () => {
    const ids = knownThreadIds()
    for (const threadId of sessionsByThreadId.keys()) {
      if (!ids.has(threadId)) sessionsByThreadId.delete(threadId)
    }
    for (const threadId of heartbeatWriteByThreadId.keys()) {
      if (!ids.has(threadId)) heartbeatWriteByThreadId.delete(threadId)
    }
    publish()
  }

  const commitSessionPatch = (threadId, patch = {}, { touchHeartbeat = false } = {}) => {
    const tid = normalizeThreadId(threadId)
    if (!tid) return
    const atMs = Number(now()) || Date.now()
    const current = sessionsByThreadId.get(tid) || {}
    sessionsByThreadId.set(tid, {
      ...current,
      ...(patch && typeof patch === 'object' ? patch : {}),
      lastStatusAt: atMs,
      ...(touchHeartbeat ? { lastHeartbeatAt: atMs } : {}),
    })
    publish()
  }

  const touchHeartbeat = (threadId, patch = {}) => {
    const tid = normalizeThreadId(threadId)
    if (!tid) return
    const nowMs = Number(now()) || Date.now()
    const previousWrite = Number(heartbeatWriteByThreadId.get(tid) || 0) || 0
    if ((nowMs - previousWrite) < HEARTBEAT_WRITE_MIN_INTERVAL_MS) {
      commitSessionPatch(tid, { isRunning: true, ...patch })
      return
    }
    heartbeatWriteByThreadId.set(tid, nowMs)
    commitSessionPatch(tid, { isRunning: true, ...patch }, { touchHeartbeat: true })
  }

  const startBridge = () => {
    const chatApi = getChatApi?.()
    const safeSubscribe = (subscribe, handler) => {
      if (typeof subscribe !== 'function') return () => {}
      try {
        const unsubscribe = subscribe((payload = {}) => {
          handler(payload && typeof payload === 'object' ? payload : {})
        })
        return typeof unsubscribe === 'function' ? unsubscribe : () => {}
      } catch {
        return () => {}
      }
    }
    const subscriptions = chatApi ? [
      safeSubscribe(chatApi.onTurnState, (payload) => {
        const state = String(payload.state || '').trim().toLowerCase()
        if (state === 'started') {
          commitSessionPatch(payload.threadId, {
            isRunning: true,
            hasPendingApproval: false,
            hasPendingQuestion: false,
            hasBlockedConflict: false,
            hasError: false,
            completedUnread: false,
          }, { touchHeartbeat: true })
        } else if (state === 'completed') {
          const questionPending = String(payload.stopReason || '').trim().toLowerCase() === 'question_user'
          commitSessionPatch(payload.threadId, {
            isRunning: false,
            hasPendingApproval: false,
            hasPendingQuestion: questionPending,
            hasBlockedConflict: false,
            hasError: String(payload.status || '').trim().toLowerCase() === 'error',
            completedUnread: !questionPending,
          })
          if (foregroundThreadIds().has(normalizeThreadId(payload.threadId))) {
            acknowledgeThread(payload.threadId)
          }
        } else if (state === 'cancelled') {
          commitSessionPatch(payload.threadId, {
            isRunning: false,
            hasPendingApproval: false,
            hasPendingQuestion: false,
            hasBlockedConflict: false,
            hasError: false,
            completedUnread: false,
          })
        } else {
          touchHeartbeat(payload.threadId)
        }
      }),
      safeSubscribe(chatApi.onChunk, (payload) => touchHeartbeat(payload.threadId)),
      safeSubscribe(chatApi.onReasoningChunk, (payload) => touchHeartbeat(payload.threadId)),
      safeSubscribe(chatApi.onToolsPending, (payload) => touchHeartbeat(payload.threadId)),
      safeSubscribe(chatApi.onToolExecuting, (payload) => touchHeartbeat(payload.threadId)),
      safeSubscribe(chatApi.onToolOutput, (payload) => touchHeartbeat(payload.threadId)),
      safeSubscribe(chatApi.onToolResult, (payload) => {
        const denyReason = String(payload.denyReason || '').trim().toLowerCase()
        const blocked = denyReason === 'policy_denied' || denyReason === 'conflict'
        touchHeartbeat(payload.threadId, {
          hasPendingApproval: false,
          hasBlockedConflict: blocked,
          hasError: false,
        })
      }),
      safeSubscribe(chatApi.onApprovalCountdown, (payload) => {
        const phase = String(payload.phase || '').trim().toLowerCase()
        if (phase === 'start' || phase === 'warning') {
          commitSessionPatch(payload.threadId, {
            isRunning: true,
            hasPendingApproval: true,
          }, { touchHeartbeat: true })
        }
      }),
      safeSubscribe(chatApi.onApprovalTimeout, (payload) => {
        commitSessionPatch(payload.threadId, {
          isRunning: true,
          hasPendingApproval: false,
          hasError: false,
        }, { touchHeartbeat: true })
      }),
      safeSubscribe(chatApi.onQuestionUserRequested, (payload) => {
        commitSessionPatch(payload.threadId, {
          isRunning: true,
          hasPendingQuestion: true,
        }, { touchHeartbeat: true })
      }),
      safeSubscribe(chatApi.onQuestionUserCleared, (payload) => {
        commitSessionPatch(payload.threadId, {
          isRunning: true,
          hasPendingQuestion: false,
        }, { touchHeartbeat: true })
      }),
      safeSubscribe(chatApi.onDone, (payload) => {
        const questionPending = Boolean(payload.questionUser)
        commitSessionPatch(payload.threadId, {
          isRunning: false,
          hasPendingApproval: false,
          hasPendingQuestion: questionPending,
          hasBlockedConflict: false,
          hasError: false,
          completedUnread: !questionPending,
        })
        if (foregroundThreadIds().has(normalizeThreadId(payload.threadId))) {
          acknowledgeThread(payload.threadId)
        }
      }),
      safeSubscribe(chatApi.onCancelled, (payload) => {
        commitSessionPatch(payload.threadId, {
          isRunning: false,
          hasPendingApproval: false,
          hasPendingQuestion: false,
          hasBlockedConflict: false,
          hasError: false,
          completedUnread: false,
        })
      }),
      safeSubscribe(chatApi.onWriteConflict, (payload) => {
        commitSessionPatch(payload.threadId, {
          isRunning: true,
          hasBlockedConflict: true,
        }, { touchHeartbeat: true })
      }),
    ] : []
    const timer = startInterval(() => publish(), SESSION_CLOCK_TICK_MS)
    return () => {
      for (const unsubscribe of subscriptions) {
        try { unsubscribe() } catch { /* best-effort bridge cleanup */ }
      }
      stopInterval(timer)
    }
  }

  return {
    createConsumer(initialKnownThreadIds = []) {
      const consumerId = ++nextConsumerId
      const initialThreads = normalizeKnownThreads(initialKnownThreadIds)
      knownIdsByConsumer.set(consumerId, new Set(initialThreads.map((thread) => thread.id)))
      persistedActivitiesByConsumer.set(consumerId, new Map(
        initialThreads.map((thread) => [thread.id, thread.persistedActivity]),
      ))
      foregroundThreadIdByConsumer.set(consumerId, '')
      pruneUnknownThreads()
      let disposed = false
      return {
        setKnownThreadIds(threadIds) {
          if (disposed) return
          const threads = normalizeKnownThreads(threadIds)
          knownIdsByConsumer.set(consumerId, new Set(threads.map((thread) => thread.id)))
          persistedActivitiesByConsumer.set(consumerId, new Map(
            threads.map((thread) => [thread.id, thread.persistedActivity]),
          ))
          pruneUnknownThreads()
        },
        setForegroundThreadId(threadId) {
          if (disposed) return
          const normalized = normalizeThreadId(threadId)
          foregroundThreadIdByConsumer.set(consumerId, normalized)
          if (normalized) {
            const session = sessionsByThreadId.get(normalized)
            if (session) sessionsByThreadId.set(normalized, { ...session, acknowledged: true })
            acknowledgeThread(normalized)
          }
          publish()
        },
        dispose() {
          if (disposed) return
          disposed = true
          knownIdsByConsumer.delete(consumerId)
          persistedActivitiesByConsumer.delete(consumerId)
          foregroundThreadIdByConsumer.delete(consumerId)
          pruneUnknownThreads()
        },
      }
    },
    getSnapshot() {
      return snapshot
    },
    subscribe(listener) {
      listeners.add(listener)
      if (listeners.size === 1) bridgeCleanup = startBridge()
      let subscribed = true
      return () => {
        if (!subscribed) return
        subscribed = false
        listeners.delete(listener)
        if (listeners.size === 0) {
          bridgeCleanup?.()
          bridgeCleanup = null
        }
      }
    },
  }
}

const workspaceThreadActivitySource = createWorkspaceThreadActivitySource()
const emptySnapshot = {}
const noopSubscribe = () => () => {}

export function createUseWorkspaceThreadActivity(source) {
  return function useWorkspaceThreadActivity({ enabled = true, threads = [], foregroundThreadId = '' } = {}) {
    const consumerRef = useRef(null)
    const knownThreadKey = useMemo(
      () => JSON.stringify(normalizeKnownThreads(threads).sort((left, right) => left.id.localeCompare(right.id))),
      [threads],
    )

    useEffect(() => {
      if (!enabled) return undefined
      const consumer = source.createConsumer()
      consumerRef.current = consumer
      return () => {
        if (consumerRef.current === consumer) consumerRef.current = null
        consumer.dispose()
      }
    }, [enabled])
    useEffect(() => {
      consumerRef.current?.setKnownThreadIds(
        enabled ? JSON.parse(knownThreadKey) : [],
      )
    }, [enabled, knownThreadKey])
    useEffect(() => {
      consumerRef.current?.setForegroundThreadId(enabled ? foregroundThreadId : '')
    }, [enabled, foregroundThreadId])

    return useSyncExternalStore(
      enabled ? source.subscribe : noopSubscribe,
      enabled ? source.getSnapshot : () => emptySnapshot,
      () => emptySnapshot,
    )
  }
}

const useWorkspaceThreadActivity = createUseWorkspaceThreadActivity(workspaceThreadActivitySource)

export function useWorkspaceThreadActivitySnapshot(enabled = true) {
  return useSyncExternalStore(
    enabled ? workspaceThreadActivitySource.subscribe : noopSubscribe,
    enabled ? workspaceThreadActivitySource.getSnapshot : () => emptySnapshot,
    () => emptySnapshot,
  )
}

export default useWorkspaceThreadActivity
