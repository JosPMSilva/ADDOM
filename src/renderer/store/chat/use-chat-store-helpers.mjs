import { MAX_TIMELINE_ITEMS, now, resolveStreamingIndexes } from './activity-builders.mjs'
import { canonicalizeRegistryModelSelection } from '../../../common/api-clients/model-registry.mjs'
import { buildCanonicalFinalDocument } from '../../../common/chat/final-document-contract.mjs'
import {
  createEmptyContextUsage,
  createEmptyContinuityStatus,
  createEmptyCostEstimate,
  normalizeContextUsagePayload,
  reduceAccountContextUsageSnapshot,
} from './usage-normalizers.mjs'
import { normalizeAssistantPhase } from '../../../common/chat/assistant-phase.mjs'

function normalizePersistedReasoningText(value) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    return String(value.text ?? value.value ?? '')
  }
  return ''
}

export function sanitizePersistedMessages(messages) {
  if (!Array.isArray(messages)) return []

  return messages
    .filter((m) => m && typeof m === 'object' && (m.role === 'user' || m.role === 'assistant'))
    .filter((m) => m.status !== 'streaming')
    .map((m) => {
      const id = String(m.id || crypto.randomUUID())
      const content = String(m.content ?? '')
      const streamMeta = m.streamMeta && typeof m.streamMeta === 'object'
        ? m.streamMeta
        : {}
      const sanitized = {
        id,
        role: m.role,
        content,
        status: m.status === 'error' ? 'error' : 'done',
      }
      if (m.role !== 'assistant') return sanitized

      const canonicalFinalDocument = buildCanonicalFinalDocument({
        threadId: String(streamMeta.threadId || m.threadId || '').trim(),
        turnId: String(streamMeta.turnId || m.turnId || '').trim(),
        messageId: id,
        text: content,
        finalDocument: m.finalDocument,
        hasAuthoritativeMessageBinding: true,
      })

      return {
        ...sanitized,
        ...(normalizeAssistantPhase(m.phase)
          ? { phase: normalizeAssistantPhase(m.phase) }
          : {}),
        reasoning: normalizePersistedReasoningText(m.reasoning),
        reasoningDone: typeof m.reasoningDone === 'boolean'
          ? !!m.reasoningDone
          : (m.reasoning && typeof m.reasoning === 'object' && m.reasoning.done === true),
        reasoningMeta: m.reasoningMeta && typeof m.reasoningMeta === 'object'
          ? {
            mode: String(m.reasoningMeta.mode || '').trim() || 'none',
            chunkCount: Number(m.reasoningMeta.chunkCount || 0) || 0,
            charsStreamed: Number(m.reasoningMeta.charsStreamed || 0) || 0,
            firstChunkAt: Number(m.reasoningMeta.firstChunkAt || 0) || undefined,
            lastChunkAt: Number(m.reasoningMeta.lastChunkAt || 0) || undefined,
            reasoningTokens: Number(m.reasoningMeta.reasoningTokens || 0) || undefined,
          }
          : (m.reasoning && typeof m.reasoning === 'object')
            ? {
              mode: String(m.reasoning.mode || '').trim() || 'none',
              chunkCount: Number(m.reasoning.chunkCount || 0) || 0,
              charsStreamed: Number(m.reasoning.charsStreamed || 0) || 0,
              firstChunkAt: Number(m.reasoning.startedAt || 0) || undefined,
              lastChunkAt: Number(m.reasoning.completedAt || m.reasoning.lastChunkAt || 0) || undefined,
            }
            : undefined,
        ...(Array.isArray(m.providerHistoryParts) ? { providerHistoryParts: m.providerHistoryParts } : {}),
        ...(canonicalFinalDocument ? { finalDocument: canonicalFinalDocument } : {}),
      }
    })
}

export function appendCappedItem(list, item, max = Infinity) {
  const next = Array.isArray(list) ? list.slice() : []
  next.push(item)
  if (Number.isFinite(max) && max > 0 && next.length > max) {
    next.splice(0, next.length - max)
  }
  return next
}

export function appendTrimmedTimelineRow(timeline, row) {
  const next = Array.isArray(timeline) ? timeline.slice() : []
  next.push(row)
  if (next.length > MAX_TIMELINE_ITEMS) {
    next.splice(0, next.length - MAX_TIMELINE_ITEMS)
  }
  return next
}

export function primeModelCapabilities(providerId, model) {
  const provider = String(providerId || '').trim()
  const modelId = String(model || '').trim()
  if (!provider || !modelId) return
  try {
    if (typeof window !== 'undefined' && window.addom?.vault?.getModelCapabilities) {
      window.addom.vault.getModelCapabilities(provider, modelId).catch(() => { })
    }
  } catch {
    // Silent best-effort background probe.
  }
}

export function canonicalizeSelectedModel(providerId, modelId) {
  const provider = String(providerId || '').trim()
  const model = String(modelId || '').trim()
  if (!provider || !model) {
    return { providerId: provider, modelId: model, changed: false, reason: 'missing' }
  }
  const normalized = canonicalizeRegistryModelSelection(provider, model)
  return {
    providerId: String(normalized.providerId || provider).trim() || provider,
    modelId: String(normalized.modelId || model).trim() || model,
    changed: !!normalized.changed,
    reason: String(normalized.reason || 'unknown'),
  }
}

function normalizeSelectionPair(providerId, modelId) {
  return {
    provider: String(providerId || '').trim(),
    model: String(modelId || '').trim(),
  }
}

export function normalizePendingContextPrefixPayload(input) {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const text = String(input.text ?? '').trim()
    if (!text) return ''
    const kindValue = String(input.kind || '').trim().toLowerCase()
    const kind = kindValue === 'editor_selection_prelude'
      ? 'editor_selection_prelude'
      : 'provider_switch_context'
    return { kind, text }
  }

  const text = String(input ?? '').trim()
  if (!text) return ''
  return { kind: 'provider_switch_context', text }
}

export function buildProviderSwitchHint({
  existingHint,
  hasConversation,
  currentProvider,
  currentModel,
  nextProvider,
  nextModel,
}) {
  if (!hasConversation) return null

  const current = normalizeSelectionPair(currentProvider, currentModel)
  const next = normalizeSelectionPair(nextProvider, nextModel)
  const existing = existingHint && typeof existingHint === 'object'
    ? {
      fromProvider: String(existingHint.fromProvider || '').trim(),
      fromModel: String(existingHint.fromModel || '').trim(),
      createdAt: Number(existingHint.createdAt) || 0,
    }
    : null

  const baseline = {
    provider: existing?.fromProvider || current.provider,
    model: existing?.fromModel || current.model,
  }

  if (!next.provider) return existingHint || null

  const revertedToBaseline = (
    baseline.provider === next.provider
    && baseline.model === next.model
  )
  if (revertedToBaseline) return null

  const changedFromBaseline = (
    baseline.provider !== next.provider
    || baseline.model !== next.model
  )
  if (!changedFromBaseline) return existingHint || null

  return {
    fromProvider: baseline.provider,
    fromModel: baseline.model,
    toProvider: next.provider,
    toModel: next.model,
    createdAt: existing?.createdAt || now(),
  }
}

export function normalizeStreamMetaPatch(prev, patch) {
  const current = prev && typeof prev === 'object' ? prev : {}
  const next = { ...current, ...(patch && typeof patch === 'object' ? patch : {}) }
  const numericKeys = [
    'startedAt',
    'completedAt',
    'firstTextChunkAt',
    'firstReasoningChunkAt',
    'textChunkCount',
    'reasoningChunkCount',
    'textCharsStreamed',
    'reasoningCharsStreamed',
    'textFlushCount',
    'reasoningFlushCount',
    'ttftMs',
    'reasoningTtftMs',
    'durationMs',
    'lastChunkAt',
    'lastFlushAt',
  ]
  for (const key of numericKeys) {
    if (next[key] == null) continue
    const n = Number(next[key] || 0) || 0
    if (n > 0) next[key] = n
    else delete next[key]
  }
  if (next.providerId != null) {
    const v = String(next.providerId || '').trim()
    if (v) next.providerId = v
    else delete next.providerId
  }
  if (next.model != null) {
    const v = String(next.model || '').trim()
    if (v) next.model = v
    else delete next.model
  }
  if (next.threadId != null) {
    const v = String(next.threadId || '').trim()
    if (v) next.threadId = v
    else delete next.threadId
  }
  if (next.turnId != null) {
    const v = String(next.turnId || '').trim()
    if (v) next.turnId = v
    else delete next.turnId
  }
  if (next.cancelled != null) next.cancelled = !!next.cancelled
  if (next.error != null) next.error = !!next.error
  return next
}

export function computeDerivedStreamMeta(meta) {
  const next = normalizeStreamMetaPatch({}, meta)
  const startedAt = Number(next.startedAt || 0) || 0
  const firstTextChunkAt = Number(next.firstTextChunkAt || 0) || 0
  const firstReasoningChunkAt = Number(next.firstReasoningChunkAt || 0) || 0
  const completedAt = Number(next.completedAt || 0) || 0
  if (startedAt > 0 && firstTextChunkAt >= startedAt) {
    next.ttftMs = Math.max(0, firstTextChunkAt - startedAt)
  } else {
    delete next.ttftMs
  }
  if (startedAt > 0 && firstReasoningChunkAt >= startedAt) {
    next.reasoningTtftMs = Math.max(0, firstReasoningChunkAt - startedAt)
  } else {
    delete next.reasoningTtftMs
  }
  if (startedAt > 0 && completedAt >= startedAt) {
    next.durationMs = Math.max(0, completedAt - startedAt)
  } else {
    delete next.durationMs
  }
  return next
}

export function updateMessageAndTimelineById(state, id, updater, preferStreamingIndexes = true) {
  const targetId = String(id ?? '').trim()
  if (!targetId || typeof updater !== 'function') return {}

  const messageRows = Array.isArray(state?.messages) ? state.messages : []
  const timelineRows = Array.isArray(state?.timeline) ? state.timeline : []
  let messageIndex = -1
  let timelineIndex = -1

  if (preferStreamingIndexes) {
    const resolved = resolveStreamingIndexes(state, targetId)
    messageIndex = resolved.messageIndex
    timelineIndex = resolved.timelineIndex
  }

  if (messageIndex < 0 || messageIndex >= messageRows.length || messageRows[messageIndex]?.id !== targetId) {
    messageIndex = messageRows.findIndex((m) => m?.id === targetId)
  }
  if (
    timelineIndex < 0
    || timelineIndex >= timelineRows.length
    || timelineRows[timelineIndex]?.kind !== 'message'
    || timelineRows[timelineIndex]?.message?.id !== targetId
  ) {
    timelineIndex = timelineRows.findIndex((row) => row?.kind === 'message' && row?.message?.id === targetId)
  }

  if (messageIndex < 0 && timelineIndex < 0) return {}

  const next = {}
  let nextMessages = null
  let nextTimeline = null
  if (messageIndex >= 0) {
    const currentMessage = messageRows[messageIndex]
    const updated = updater(currentMessage)
    if (updated && updated !== currentMessage) {
      nextMessages = messageRows.slice()
      nextMessages[messageIndex] = updated
      next.messages = nextMessages
      next.streamingMessageIndex = messageIndex
    }
  }
  if (timelineIndex >= 0) {
    const row = timelineRows[timelineIndex]
    const updatedMsg = updater(row?.message || {})
    if (updatedMsg && updatedMsg !== row?.message) {
      nextTimeline = timelineRows.slice()
      nextTimeline[timelineIndex] = { ...row, message: updatedMsg }
      next.timeline = nextTimeline
      next.streamingTimelineIndex = timelineIndex
    }
  }
  return next
}

export function createUsageContinuityActions({
  set,
  get,
  resolveThreadSessionId,
  updateThreadSessionState,
}) {
  const hasThreadRouting = (
    typeof resolveThreadSessionId === 'function'
    && typeof updateThreadSessionState === 'function'
  )
  const resolveTargetThreadId = (state, payloadThreadId = '') => {
    if (hasThreadRouting) return resolveThreadSessionId(state, payloadThreadId)
    return String(payloadThreadId || '').trim()
  }
  const readThreadField = (state, threadId, field, fallbackFactory) => {
    const fallback = typeof fallbackFactory === 'function' ? fallbackFactory() : fallbackFactory
    if (!hasThreadRouting) return state?.[field] ?? fallback
    const activeThreadId = resolveThreadSessionId(state, state?.activeThreadId)
    if (threadId === activeThreadId) return state?.[field] ?? fallback
    const map = state?.threadStateById && typeof state.threadStateById === 'object'
      ? state.threadStateById
      : {}
    return map?.[threadId]?.[field] ?? fallback
  }

  return {
    recordContinuityStatus: (payload = {}) => {
      if (hasThreadRouting) {
        set((s) => {
          const threadId = resolveTargetThreadId(s, payload.threadId)
          const current = readThreadField(s, threadId, 'continuityStatus', createEmptyContinuityStatus)
          return updateThreadSessionState(s, threadId, () => ({
            continuityStatus: {
              ...current,
              threadId: String(payload.threadId || threadId || current.threadId || ''),
              turnId: String(payload.turnId || current.turnId || ''),
              enabled: payload.enabled !== false,
              architecture: String(payload.architecture || current.architecture || 'hybrid_tiered'),
              profile: String(payload.profile || current.profile || 'balanced'),
              scope: String(payload.scope || current.scope || 'thread_project'),
              phase: String(payload.phase || current.phase || ''),
              tokenBudget: Number(payload.tokenBudget || current.tokenBudget || 0) || 0,
              packetTokens: Number(payload.packetTokens || current.packetTokens || 0) || 0,
              driftRisk: String(payload.driftRisk || current.driftRisk || 'low'),
              sourceRefCount: Number(payload.sourceRefCount || current.sourceRefCount || 0) || 0,
              removedMessages: Number(payload.removedMessages || current.removedMessages || 0) || 0,
              estimatedBeforeTokens: Number(payload.estimatedBeforeTokens || current.estimatedBeforeTokens || 0) || 0,
              estimatedAfterTokens: Number(payload.estimatedAfterTokens || current.estimatedAfterTokens || 0) || 0,
              packetId: String(payload.packetId || current.packetId || ''),
              updatedAt: now(),
            },
          }))
        })
        return
      }
      const current = get().continuityStatus || createEmptyContinuityStatus()
      set({
        continuityStatus: {
          ...current,
          threadId: String(payload.threadId || current.threadId || ''),
          turnId: String(payload.turnId || current.turnId || ''),
          enabled: payload.enabled !== false,
          architecture: String(payload.architecture || current.architecture || 'hybrid_tiered'),
          profile: String(payload.profile || current.profile || 'balanced'),
          scope: String(payload.scope || current.scope || 'thread_project'),
          phase: String(payload.phase || current.phase || ''),
          tokenBudget: Number(payload.tokenBudget || current.tokenBudget || 0) || 0,
          packetTokens: Number(payload.packetTokens || current.packetTokens || 0) || 0,
          driftRisk: String(payload.driftRisk || current.driftRisk || 'low'),
          sourceRefCount: Number(payload.sourceRefCount || current.sourceRefCount || 0) || 0,
          removedMessages: Number(payload.removedMessages || current.removedMessages || 0) || 0,
          estimatedBeforeTokens: Number(payload.estimatedBeforeTokens || current.estimatedBeforeTokens || 0) || 0,
          estimatedAfterTokens: Number(payload.estimatedAfterTokens || current.estimatedAfterTokens || 0) || 0,
          packetId: String(payload.packetId || current.packetId || ''),
          updatedAt: now(),
        },
      })
    },

    recordContinuityPacket: (payload = {}) => {
      if (hasThreadRouting) {
        set((s) => {
          const threadId = resolveTargetThreadId(s, payload.threadId)
          const current = readThreadField(s, threadId, 'continuityStatus', createEmptyContinuityStatus)
          return updateThreadSessionState(s, threadId, () => ({
            continuityStatus: {
              ...current,
              threadId: String(payload.threadId || threadId || current.threadId || ''),
              turnId: String(payload.turnId || current.turnId || ''),
              profile: String(payload.profile || current.profile || 'balanced'),
              tokenBudget: Number(payload.tokenBudget || current.tokenBudget || 0) || 0,
              packetTokens: Number(payload.packetTokens || current.packetTokens || 0) || 0,
              sourceRefCount: Number(payload.sourceRefCount || current.sourceRefCount || 0) || 0,
              driftRisk: String(payload.driftRisk || current.driftRisk || 'low'),
              packetId: String(payload.packetId || current.packetId || ''),
              estimatedBeforeTokens: Number(payload.estimatedBeforeTokens || current.estimatedBeforeTokens || 0) || 0,
              estimatedAfterTokens: Number(payload.estimatedAfterTokens || current.estimatedAfterTokens || 0) || 0,
              phase: 'packet_built',
              updatedAt: now(),
            },
          }))
        })
        return
      }
      const current = get().continuityStatus || createEmptyContinuityStatus()
      set({
        continuityStatus: {
          ...current,
          threadId: String(payload.threadId || current.threadId || ''),
          turnId: String(payload.turnId || current.turnId || ''),
          profile: String(payload.profile || current.profile || 'balanced'),
          tokenBudget: Number(payload.tokenBudget || current.tokenBudget || 0) || 0,
          packetTokens: Number(payload.packetTokens || current.packetTokens || 0) || 0,
          sourceRefCount: Number(payload.sourceRefCount || current.sourceRefCount || 0) || 0,
          driftRisk: String(payload.driftRisk || current.driftRisk || 'low'),
          packetId: String(payload.packetId || current.packetId || ''),
          estimatedBeforeTokens: Number(payload.estimatedBeforeTokens || current.estimatedBeforeTokens || 0) || 0,
          estimatedAfterTokens: Number(payload.estimatedAfterTokens || current.estimatedAfterTokens || 0) || 0,
          phase: 'packet_built',
          updatedAt: now(),
        },
      })
    },

    recordUsage: (payload = {}) => {
      const usage = payload?.usage && typeof payload.usage === 'object' ? payload.usage : {}
      const inputTokens = Number(usage.inputTokens || 0)
      const outputTokens = Number(usage.outputTokens || 0)
      const reasoningTokens = Number(usage.reasoningTokens || 0)
      const totalTokens = Number(usage.totalTokens || inputTokens + outputTokens + reasoningTokens || 0)
      const hasProviderUsage = inputTokens > 0 || outputTokens > 0 || totalTokens > 0 || reasoningTokens > 0
      const hasExplicitOccupancy = (
        Number(payload.contextOccupancyTokens || 0) > 0
        || Number(payload.effectiveOccupancyTokens || 0) > 0
        || Number(payload.estimatedOccupancyTokens || 0) > 0
        || Number(payload.providerOccupancyTokens || 0) > 0
        || typeof payload.occupancyConfidence === 'string'
      )
      const hasRollingUsage = (
        Number(payload.rollingInputTokens || 0) > 0
        || Number(payload.rollingOutputTokens || 0) > 0
        || Number(payload.rollingReasoningTokens || 0) > 0
        || Number(payload.rollingTotalTokens || 0) > 0
      )
      const hasContextMetadata = (
        Number(payload.modelLimit || 0) > 0
        || Number(payload.contextRemainingTokens || payload.remainingTokens || 0) > 0
      )
      if (!hasProviderUsage && !hasExplicitOccupancy && !hasRollingUsage && !hasContextMetadata) return

      set((s) => {
        const threadId = resolveTargetThreadId(s, payload.threadId)
        const currentTotals = (threadId && s.threadUsageTotals?.[threadId])
          ? s.threadUsageTotals[threadId]
          : createEmptyContextUsage()
        const normalizedUsage = normalizeContextUsagePayload(payload, {
          currentTotals,
          fallbackThreadId: threadId,
          fallbackUpdatedAt: now(),
        })
        const currentUsage = readThreadField(s, threadId, 'contextUsage', createEmptyContextUsage)
        const nextUsage = reduceAccountContextUsageSnapshot(currentUsage, normalizedUsage)
        const nextTotals = {
          inputTokens: nextUsage.rollingInputTokens,
          outputTokens: nextUsage.rollingOutputTokens,
          reasoningTokens: nextUsage.rollingReasoningTokens,
          totalTokens: nextUsage.rollingTotalTokens,
        }

        const scoped = hasThreadRouting
          ? updateThreadSessionState(s, threadId, () => ({ contextUsage: nextUsage }))
          : { contextUsage: nextUsage }

        return {
          ...scoped,
          threadUsageTotals: threadId
            ? { ...s.threadUsageTotals, [threadId]: nextTotals }
            : s.threadUsageTotals,
        }
      })
    },

    recordCostEstimate: (payload = {}) => {
      const estimatedInputTokens = Number(payload.estimatedInputTokens || 0) || 0
      const estimatedOutputTokens = Number(payload.estimatedOutputTokens || 0) || 0
      const estimatedTotalTokens = Number(
        payload.estimatedTotalTokens
        || (estimatedInputTokens + estimatedOutputTokens)
        || 0,
      ) || 0
      if (hasThreadRouting) {
        set((s) => {
          const threadId = resolveTargetThreadId(s, payload.threadId)
          return updateThreadSessionState(s, threadId, () => ({
            costEstimate: {
              threadId: String(payload.threadId || threadId || '').trim(),
              turnId: String(payload.turnId || '').trim(),
              providerId: String(payload.providerId || '').trim(),
              model: String(payload.model || '').trim(),
              mode: String(payload.mode || 'execute').trim() || 'execute',
              estimatedInputTokens,
              estimatedOutputTokens,
              estimatedTotalTokens,
              estimatedUsd: Number.isFinite(Number(payload.estimatedUsd))
                ? Number(payload.estimatedUsd)
                : null,
              usdAvailable: !!payload.usdAvailable,
              estimateConfidence: String(payload.estimateConfidence || 'token_only'),
              pricingWarning: String(payload.pricingWarning || ''),
              source: String(payload.source || 'pre_turn'),
              contextLimitTokens: Number(payload.contextLimitTokens || 0) || 0,
              maxOutputTokens: Number(payload.maxOutputTokens || 0) || 0,
              emittedAt: Number(payload.emittedAt || 0) || now(),
            },
          }))
        })
        return
      }
      set({
        costEstimate: {
          threadId: String(payload.threadId || '').trim(),
          turnId: String(payload.turnId || '').trim(),
          providerId: String(payload.providerId || '').trim(),
          model: String(payload.model || '').trim(),
          mode: String(payload.mode || 'execute').trim() || 'execute',
          estimatedInputTokens,
          estimatedOutputTokens,
          estimatedTotalTokens,
          estimatedUsd: Number.isFinite(Number(payload.estimatedUsd))
            ? Number(payload.estimatedUsd)
            : null,
          usdAvailable: !!payload.usdAvailable,
          estimateConfidence: String(payload.estimateConfidence || 'token_only'),
          pricingWarning: String(payload.pricingWarning || ''),
          source: String(payload.source || 'pre_turn'),
          contextLimitTokens: Number(payload.contextLimitTokens || 0) || 0,
          maxOutputTokens: Number(payload.maxOutputTokens || 0) || 0,
          emittedAt: Number(payload.emittedAt || 0) || now(),
        },
      })
    },

    clearCostEstimate: (threadId = '') => {
      if (hasThreadRouting) {
        set((s) => updateThreadSessionState(s, threadId, () => ({
          costEstimate: createEmptyCostEstimate(),
        })))
        return
      }
      set({ costEstimate: createEmptyCostEstimate() })
    },
  }
}
