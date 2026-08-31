import { finalizeReasoningMeta, nextReasoningMetaOnChunk } from './reasoning-delivery-mode.mjs'
import {
  ASSISTANT_PHASE_COMMENTARY,
  normalizeAssistantPhase,
} from '../../../common/chat/assistant-phase.mjs'

const TEXT_FLUSH_INTERVAL_MS = 24
const REASONING_FLUSH_INTERVAL_MS = 32
const MAX_PENDING_CHARS_BEFORE_IMMEDIATE_FLUSH = 256
const MAX_PENDING_LATENCY_MS = 80
const MAX_RECENT_STREAM_DIAGNOSTICS = 24
const REASONING_META_SYNC_THROTTLE_MS = 500
const STREAM_BATCHING_TOGGLE_KEY = 'addom.dev.streamingBatching'

function readStreamBatchingEnabled() {
  try {
    const raw = String(window?.localStorage?.getItem?.(STREAM_BATCHING_TOGGLE_KEY) || '').trim().toLowerCase()
    if (!raw) return true
    if (raw === '0' || raw === 'off' || raw === 'false' || raw === 'disabled') return false
    if (raw === '1' || raw === 'on' || raw === 'true' || raw === 'enabled') return true
  } catch {
    // Ignore localStorage issues and default to enabled.
  }
  return true
}

export function isBubbleOwnedTextChunk(meta = {}) {
  return normalizeAssistantPhase(meta?.phase) !== ASSISTANT_PHASE_COMMENTARY
}

export function createStreamRuntime({
  useChatStore,
  setReasoningMetaForMessage = () => {},
  dev = false,
} = {}) {
  const textBufferByMessageId = new Map()
  const executionBufferByMessageId = new Map()
  const reasoningBufferByMessageId = new Map()
  const streamStatsByMessageId = new Map()
  const reasoningStatsByMessageId = new Map()
  const recentStreamDiagnostics = []
  const streamBatchingEnabledRef = { current: readStreamBatchingEnabled() }

  const getOrCreateStreamStats = (id) => {
    if (!id) return null
    const key = String(id || '').trim()
    if (!key) return null
    const existing = streamStatsByMessageId.get(key)
    if (existing) return existing
    const next = {
      messageId: key,
      startedAt: 0,
      completedAt: 0,
      threadId: '',
      turnId: '',
      providerId: '',
      model: '',
      round: null,
      reasoningSegment: null,
      firstTextChunkAt: 0,
      firstReasoningChunkAt: 0,
      lastChunkAt: 0,
      lastFlushAt: 0,
      textChunkCount: 0,
      reasoningChunkCount: 0,
      textCharsStreamed: 0,
      reasoningCharsStreamed: 0,
      textFlushCount: 0,
      reasoningFlushCount: 0,
      cancelled: false,
      error: false,
    }
    streamStatsByMessageId.set(key, next)
    return next
  }

  const ensureStreamStarted = (id, data = {}) => {
    const stats = getOrCreateStreamStats(id)
    if (!stats) return null
    const payload = data && typeof data === 'object' ? data : {}
    const prevStartedAt = stats.startedAt
    const prevThreadId = stats.threadId
    const prevTurnId = stats.turnId
    const prevProviderId = stats.providerId
    const prevModel = stats.model
    const startedAt = Number(payload.startedAt || 0) || stats.startedAt || Date.now()
    stats.startedAt = startedAt
    if (!stats.threadId && payload.threadId) stats.threadId = String(payload.threadId || '')
    if (!stats.turnId && payload.turnId) stats.turnId = String(payload.turnId || '')
    if (!stats.providerId && payload.providerId) stats.providerId = String(payload.providerId || '')
    if (!stats.model && payload.model) stats.model = String(payload.model || '')
    if (payload.round != null) stats.round = Math.max(0, Number(payload.round) || 0)
    if (
      stats.startedAt !== prevStartedAt
      || stats.threadId !== prevThreadId
      || stats.turnId !== prevTurnId
      || stats.providerId !== prevProviderId
      || stats.model !== prevModel
    ) {
      useChatStore.getState().markStreamStarted(id, {
        startedAt: stats.startedAt,
        threadId: stats.threadId,
        turnId: stats.turnId,
        providerId: stats.providerId,
        model: stats.model,
      })
    }
    return stats
  }

  const setStreamMetaPatchForMessage = (id, patch = {}) => {
    if (!id) return
    useChatStore.getState().setStreamMeta(id, patch)
  }

  const getOrCreateChannelBuffer = (map, id) => {
    const key = String(id || '').trim()
    if (!key) return null
    const existing = map.get(key)
    if (existing) return existing
    const next = {
      pendingText: '',
      timer: null,
      firstPendingAt: 0,
      lastPendingAt: 0,
      firstEmittedAt: 0,
      lastEmittedAt: 0,
    }
    map.set(key, next)
    return next
  }

  const clearChannelTimer = (buffer) => {
    if (!buffer?.timer) return
    clearTimeout(buffer.timer)
    buffer.timer = null
  }

  const syncReasoningStatsToStore = (id, force = false) => {
    if (!id) return
    const meta = reasoningStatsByMessageId.get(id)
    if (!meta) return
    const streamStats = streamStatsByMessageId.get(id)
    const threadId = String(streamStats?.threadId || '').trim()
    const now = Date.now()
    if (!force && meta._lastMetaSyncAt && (now - meta._lastMetaSyncAt) < REASONING_META_SYNC_THROTTLE_MS) {
      if (!meta._deferredMetaSync) {
        meta._deferredMetaSync = setTimeout(() => {
          meta._deferredMetaSync = null
          syncReasoningStatsToStore(id, false)
        }, REASONING_META_SYNC_THROTTLE_MS)
      }
      return
    }
    meta._lastMetaSyncAt = now
    if (meta._deferredMetaSync) {
      clearTimeout(meta._deferredMetaSync)
      meta._deferredMetaSync = null
    }
    setReasoningMetaForMessage(
      id,
      threadId ? { ...meta, threadId } : meta,
      threadId,
    )
  }

  const flushBufferedChannel = (id, channel, reason = 'timer') => {
    const targetId = String(id || '').trim()
    if (!targetId) return false
    const isReasoning = channel === 'reasoning'
    const isExecutionText = channel === 'execution'
    const map = isReasoning
      ? reasoningBufferByMessageId
      : (isExecutionText ? executionBufferByMessageId : textBufferByMessageId)
    const buffer = map.get(targetId)
    if (!buffer || !buffer.pendingText) {
      if (buffer) clearChannelTimer(buffer)
      return false
    }
    const delta = buffer.pendingText
    const sourceEmittedAt = Number(buffer.firstEmittedAt || buffer.lastEmittedAt || 0) || Date.now()
    const sourceLastChunkAt = Number(buffer.lastEmittedAt || sourceEmittedAt) || sourceEmittedAt
    buffer.pendingText = ''
    buffer.firstPendingAt = 0
    buffer.lastPendingAt = 0
    buffer.firstEmittedAt = 0
    buffer.lastEmittedAt = 0
    clearChannelTimer(buffer)

    const flushAt = Date.now()
    const stats = getOrCreateStreamStats(targetId)
    if (stats) {
      stats.lastFlushAt = flushAt
      if (isReasoning) stats.reasoningFlushCount += 1
      else stats.textFlushCount += 1
    }

    if (isReasoning) {
      useChatStore.getState().appendReasoning(targetId, delta, {
        threadId: String(stats?.threadId || '').trim(),
        emittedAt: sourceEmittedAt,
        ...(stats?.reasoningSegment != null ? { reasoningSegment: stats.reasoningSegment } : {}),
      })
      syncReasoningStatsToStore(targetId)
    } else if (isExecutionText) {
      useChatStore.getState().appendExecutionCommentary?.({
        threadId: String(stats?.threadId || '').trim(),
        turnId: String(stats?.turnId || '').trim(),
        chunk: delta,
        emittedAt: sourceEmittedAt,
        streamMeta: stats
          ? {
              threadId: String(stats.threadId || '').trim(),
              turnId: String(stats.turnId || '').trim(),
              providerId: String(stats.providerId || '').trim(),
              model: String(stats.model || '').trim(),
              ...(stats.round != null ? { round: Math.max(0, Number(stats.round) || 0) } : {}),
              ...(stats.reasoningSegment != null ? { reasoningSegment: stats.reasoningSegment } : {}),
              startedAt: stats.startedAt || 0,
              lastChunkAt: sourceLastChunkAt,
              lastFlushAt: flushAt,
            }
          : null,
      })
    } else {
      useChatStore.getState().appendChunk(targetId, delta, {
        threadId: String(stats?.threadId || '').trim(),
      })
    }

    setStreamMetaPatchForMessage(targetId, {
      ...(stats
        ? {
          startedAt: stats.startedAt || undefined,
          threadId: stats.threadId || undefined,
          turnId: stats.turnId || undefined,
          providerId: stats.providerId || undefined,
          model: stats.model || undefined,
          firstTextChunkAt: stats.firstTextChunkAt || undefined,
          firstReasoningChunkAt: stats.firstReasoningChunkAt || undefined,
          lastChunkAt: stats.lastChunkAt || undefined,
          lastFlushAt: stats.lastFlushAt || undefined,
          textChunkCount: stats.textChunkCount,
          reasoningChunkCount: stats.reasoningChunkCount,
          textCharsStreamed: stats.textCharsStreamed,
          reasoningCharsStreamed: stats.reasoningCharsStreamed,
          textFlushCount: stats.textFlushCount,
          reasoningFlushCount: stats.reasoningFlushCount,
          ...(stats.reasoningSegment != null ? { reasoningSegment: stats.reasoningSegment } : {}),
        }
        : {}),
    })
    if (dev && reason === 'immediate') {
      console.debug('[ChatEventBridge] stream_flush_immediate', {
        messageId: targetId,
        channel,
        chars: delta.length,
      })
    }
    return true
  }

  const flushBufferedAllForMessage = (id, reason = 'finalize') => {
    const targetId = String(id || '').trim()
    if (!targetId) return
    flushBufferedChannel(targetId, 'text', reason)
    flushBufferedChannel(targetId, 'execution', reason)
    flushBufferedChannel(targetId, 'reasoning', reason)
  }

  const scheduleBufferedChannelFlush = (id, channel) => {
    const targetId = String(id || '').trim()
    if (!targetId) return
    if (!streamBatchingEnabledRef.current) {
      flushBufferedChannel(targetId, channel, 'batching_disabled')
      return
    }
    const isReasoning = channel === 'reasoning'
    const isExecutionText = channel === 'execution'
    const map = isReasoning
      ? reasoningBufferByMessageId
      : (isExecutionText ? executionBufferByMessageId : textBufferByMessageId)
    const intervalMs = isReasoning ? REASONING_FLUSH_INTERVAL_MS : TEXT_FLUSH_INTERVAL_MS
    const buffer = map.get(targetId)
    if (!buffer) return
    const nowTs = Date.now()
    if (buffer.pendingText.length >= MAX_PENDING_CHARS_BEFORE_IMMEDIATE_FLUSH) {
      flushBufferedChannel(targetId, channel, 'immediate')
      return
    }
    if (buffer.firstPendingAt > 0 && (nowTs - buffer.firstPendingAt) >= MAX_PENDING_LATENCY_MS) {
      flushBufferedChannel(targetId, channel, 'latency_cap')
      return
    }
    if (buffer.timer) return
    buffer.timer = setTimeout(() => {
      buffer.timer = null
      flushBufferedChannel(targetId, channel, 'timer')
    }, intervalMs)
  }

  const queueBufferedChannelChunk = (id, channel, chunk, meta = {}) => {
    const targetId = String(id || '').trim()
    const delta = String(chunk ?? '')
    if (!targetId || !delta) return
    const isReasoning = channel === 'reasoning'
    const isExecutionText = channel === 'execution'
    if (!isReasoning && !isExecutionText && !isBubbleOwnedTextChunk(meta)) return
    const incomingReasoningSegment = (isReasoning || isExecutionText) && meta?.reasoningSegment != null
      ? Math.max(0, Number(meta.reasoningSegment) || 0)
      : null
    const existingStats = getOrCreateStreamStats(targetId)
    if (
      (isReasoning || isExecutionText)
      && incomingReasoningSegment != null
      && existingStats?.reasoningSegment != null
      && existingStats.reasoningSegment !== incomingReasoningSegment
    ) {
      flushBufferedChannel(
        targetId,
        isReasoning ? 'reasoning' : 'execution',
        isReasoning ? 'reasoning_segment_boundary' : 'commentary_segment_boundary',
      )
    }
    const stats = ensureStreamStarted(targetId, meta) || getOrCreateStreamStats(targetId)
    const eventTs = Number(meta?.emittedAt || 0) || Date.now()
    if (stats) {
      if (meta?.threadId) stats.threadId = String(meta.threadId || stats.threadId || '')
      if (meta?.turnId) stats.turnId = String(meta.turnId || stats.turnId || '')
      if (meta?.providerId) stats.providerId = String(meta.providerId || stats.providerId || '')
      if (meta?.model) stats.model = String(meta.model || stats.model || '')
      if (meta?.round != null) stats.round = Math.max(0, Number(meta.round) || 0)
      if (incomingReasoningSegment != null) stats.reasoningSegment = incomingReasoningSegment
      stats.lastChunkAt = Math.max(Number(stats.lastChunkAt || 0), eventTs)
      if (isReasoning) {
        stats.reasoningChunkCount += 1
        stats.reasoningCharsStreamed += delta.length
        if (!stats.firstReasoningChunkAt) stats.firstReasoningChunkAt = eventTs
      } else {
        stats.textChunkCount += 1
        stats.textCharsStreamed += delta.length
        if (!stats.firstTextChunkAt) stats.firstTextChunkAt = eventTs
      }
    }
    const buffer = getOrCreateChannelBuffer(
      isReasoning
        ? reasoningBufferByMessageId
        : (isExecutionText ? executionBufferByMessageId : textBufferByMessageId),
      targetId,
    )
    if (!buffer) return
    if (!buffer.pendingText) {
      buffer.firstPendingAt = Date.now()
      buffer.firstEmittedAt = eventTs
    }
    buffer.pendingText += delta
    buffer.lastPendingAt = Date.now()
    buffer.lastEmittedAt = eventTs
    if (!streamBatchingEnabledRef.current) {
      flushBufferedChannel(targetId, channel, 'batching_disabled')
      return
    }
    scheduleBufferedChannelFlush(targetId, channel)
  }

  const finalizeStreamStatsForMessage = (id, patch = {}) => {
    const targetId = String(id || '').trim()
    if (!targetId) return null
    const textBuffer = textBufferByMessageId.get(targetId)
    const executionBuffer = executionBufferByMessageId.get(targetId)
    const reasoningBuffer = reasoningBufferByMessageId.get(targetId)
    if (textBuffer) clearChannelTimer(textBuffer)
    if (executionBuffer) clearChannelTimer(executionBuffer)
    if (reasoningBuffer) clearChannelTimer(reasoningBuffer)
    textBufferByMessageId.delete(targetId)
    executionBufferByMessageId.delete(targetId)
    reasoningBufferByMessageId.delete(targetId)
    const stats = streamStatsByMessageId.get(targetId)
    if (!stats) return null
    if (patch && typeof patch === 'object') {
      if (patch.threadId) stats.threadId = String(patch.threadId || stats.threadId || '')
      if (patch.turnId) stats.turnId = String(patch.turnId || stats.turnId || '')
      if (patch.providerId) stats.providerId = String(patch.providerId || stats.providerId || '')
      if (patch.model) stats.model = String(patch.model || stats.model || '')
      if (patch.cancelled != null) stats.cancelled = !!patch.cancelled
      if (patch.error != null) stats.error = !!patch.error
    }
    stats.completedAt = Number(patch?.completedAt || 0) || Date.now()
    useChatStore.getState().finalizeStreamMeta(targetId, {
      startedAt: stats.startedAt || undefined,
      completedAt: stats.completedAt,
      threadId: stats.threadId || undefined,
      turnId: stats.turnId || undefined,
      providerId: stats.providerId || undefined,
      model: stats.model || undefined,
      firstTextChunkAt: stats.firstTextChunkAt || undefined,
      firstReasoningChunkAt: stats.firstReasoningChunkAt || undefined,
      lastChunkAt: stats.lastChunkAt || undefined,
      lastFlushAt: stats.lastFlushAt || undefined,
      textChunkCount: stats.textChunkCount,
      reasoningChunkCount: stats.reasoningChunkCount,
      textCharsStreamed: stats.textCharsStreamed,
      reasoningCharsStreamed: stats.reasoningCharsStreamed,
      textFlushCount: stats.textFlushCount,
      reasoningFlushCount: stats.reasoningFlushCount,
      cancelled: stats.cancelled || undefined,
      error: stats.error || undefined,
    })
    const snapshot = {
      messageId: targetId,
      threadId: stats.threadId || '',
      turnId: stats.turnId || '',
      providerId: stats.providerId || '',
      model: stats.model || '',
      startedAt: stats.startedAt || 0,
      completedAt: stats.completedAt || 0,
      firstTextChunkAt: stats.firstTextChunkAt || 0,
      firstReasoningChunkAt: stats.firstReasoningChunkAt || 0,
      lastChunkAt: stats.lastChunkAt || 0,
      lastFlushAt: stats.lastFlushAt || 0,
      textChunkCount: stats.textChunkCount || 0,
      reasoningChunkCount: stats.reasoningChunkCount || 0,
      textCharsStreamed: stats.textCharsStreamed || 0,
      reasoningCharsStreamed: stats.reasoningCharsStreamed || 0,
      textFlushCount: stats.textFlushCount || 0,
      reasoningFlushCount: stats.reasoningFlushCount || 0,
      cancelled: !!stats.cancelled,
      error: !!stats.error,
      ttftMs: (stats.startedAt > 0 && stats.firstTextChunkAt >= stats.startedAt)
        ? (stats.firstTextChunkAt - stats.startedAt)
        : null,
      reasoningTtftMs: (stats.startedAt > 0 && stats.firstReasoningChunkAt >= stats.startedAt)
        ? (stats.firstReasoningChunkAt - stats.startedAt)
        : null,
      durationMs: (stats.startedAt > 0 && stats.completedAt >= stats.startedAt)
        ? (stats.completedAt - stats.startedAt)
        : null,
    }
    recentStreamDiagnostics.unshift(snapshot)
    if (recentStreamDiagnostics.length > MAX_RECENT_STREAM_DIAGNOSTICS) {
      recentStreamDiagnostics.length = MAX_RECENT_STREAM_DIAGNOSTICS
    }
    if (dev) {
      console.info('[ChatEventBridge] stream_metrics', snapshot)
    }
    streamStatsByMessageId.delete(targetId)
    return snapshot
  }

  const recordReasoningChunkStats = (id, chunk) => {
    if (!id) return null
    const prev = reasoningStatsByMessageId.get(id) || {
      mode: 'none',
      chunkCount: 0,
      charsStreamed: 0,
    }
    const next = nextReasoningMetaOnChunk(prev, chunk, Date.now())
    reasoningStatsByMessageId.set(id, next)
    return next
  }

  const finalizeReasoningStats = (id, payload = {}) => {
    if (!id) return null
    const prev = reasoningStatsByMessageId.get(id) || {
      mode: 'none',
      chunkCount: 0,
      charsStreamed: 0,
    }
    const next = finalizeReasoningMeta(prev, payload)
    reasoningStatsByMessageId.set(id, next)
    const streamStats = streamStatsByMessageId.get(id)
    const threadId = String(streamStats?.threadId || '').trim()
    setReasoningMetaForMessage(
      id,
      threadId ? { ...next, threadId } : next,
      threadId,
    )
    return next
  }

  const setBatchingEnabled = (enabled) => {
    const next = !!enabled
    streamBatchingEnabledRef.current = next
    try {
      if (window?.localStorage) {
        window.localStorage.setItem(STREAM_BATCHING_TOGGLE_KEY, next ? 'on' : 'off')
      }
    } catch {
      // Best effort only.
    }
    return next
  }

  const reloadBatchingSetting = () => {
    const next = readStreamBatchingEnabled()
    streamBatchingEnabledRef.current = next
    return next
  }

  const clearBuffers = () => {
    for (const buffer of textBufferByMessageId.values()) clearChannelTimer(buffer)
    for (const buffer of executionBufferByMessageId.values()) clearChannelTimer(buffer)
    for (const buffer of reasoningBufferByMessageId.values()) clearChannelTimer(buffer)
    for (const meta of reasoningStatsByMessageId.values()) {
      if (meta?._deferredMetaSync) {
        clearTimeout(meta._deferredMetaSync)
      }
    }
  }

  return {
    streamBatchingEnabledRef,
    reasoningStatsByMessageId,
    recentStreamDiagnostics,
    ensureStreamStarted,
    flushBufferedChannel,
    flushBufferedAllForMessage,
    queueBufferedChannelChunk,
    finalizeStreamStatsForMessage,
    recordReasoningChunkStats,
    finalizeReasoningStats,
    setBatchingEnabled,
    reloadBatchingSetting,
    clearBuffers,
  }
}
