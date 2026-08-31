import { autoLogTurn } from '../memory/auto-logger.mjs'
import { compressProjectAutoLogs } from '../memory/memory-compression.mjs'
import { commitProjectedTimelineEvent } from './canonical-root-event-writer.mjs'

export function runPostTurnTasks({
  projectFolder = '',
  userMessage = '',
  assistantText = '',
  reasoningSegments = [],
  turnToolResults = [],
  mode = 'execute',
  memoryCompressionEnabled = false,
  memoryCompressionThreshold = 50,
  memoryCompressionCooldownMs = 120_000,
  memoryCompressionMaxPerHour = 4,
  memoryCompressionMinNewLogs = 12,
  providerId = '',
  apiKey = '',
  model = '',
  loop = null,
  send = () => {},
  persistTimelineEvent = () => {},
  activeThreadId = '',
  activeTurnId = '',
  isAbortError = () => false,
} = {}) {
  const hasToolResults = Array.isArray(turnToolResults) && turnToolResults.length > 0
  if (!projectFolder || (!assistantText && !hasToolResults)) return

  ;(async () => {
    const emitCompressionState = (state, data = {}) => {
      const payload = {
        threadId: activeThreadId,
        turnId: activeTurnId,
        state,
        threshold: Number(memoryCompressionThreshold || 0),
        mode,
        ...data,
      }
      let content = 'Memory compression update.'
      if (state === 'started') content = `Memory compression started (threshold ${payload.threshold}).`
      if (state === 'skipped') content = `Memory compression skipped: ${String(payload.reason || 'not eligible')}.`
      if (state === 'completed') content = `Memory compression completed (${Number(payload.archivedCount || 0)} archived).`
      if (state === 'failed') content = `Memory compression failed: ${String(payload.error || 'unknown error')}`

      commitProjectedTimelineEvent({
        persistTimelineEvent, send, kind: 'compression_state',
        options: {
          role: 'system', content, meta: payload,
          lifecycle: state === 'started' ? 'active' : state === 'completed' ? 'succeeded' : state === 'failed' ? 'failed' : 'completed',
          progressiveKey: 'memory_compression',
        },
        channel: 'chat:compression-state', payload,
      })
    }

    try {
      const ids = await autoLogTurn({
        project: projectFolder,
        userMessage,
        assistantText,
        reasoningText: (Array.isArray(reasoningSegments) ? reasoningSegments : []).join('\n\n---\n\n'),
        toolResults: Array.isArray(turnToolResults) ? turnToolResults : [],
        captureSuggestions: mode === 'execute',
        activeThreadId,
      })

      let memoryUpdateCount = ids?.length ?? 0
      if (memoryCompressionEnabled) {
        emitCompressionState('started')
      }
      const compression = await compressProjectAutoLogs({
        project: projectFolder,
        threadId: activeThreadId,
        providerId,
        apiKey,
        model: model ?? '',
        enabled: !!memoryCompressionEnabled,
        threshold: memoryCompressionThreshold,
        cooldownMs: memoryCompressionCooldownMs,
        maxPerHour: memoryCompressionMaxPerHour,
        minNewLogs: memoryCompressionMinNewLogs,
        abortSignal: loop?.abortController?.signal,
      })

      if (compression?.status === 'completed' && compression?.summaryNodeId) {
        memoryUpdateCount += 1
        const compressionTelemetry = {
          plannedBatchCount: Number(compression.plannedBatchCount || 1),
          selectedBatchSize: Number(compression.selectedBatchSize || 0),
          estimatedPromptTokens: Number(compression.estimatedPromptTokens || 0),
          promptBudgetTokens: Number(compression.promptBudgetTokens || 0),
          outputReserveTokens: Number(compression.outputReserveTokens || 0),
          contextLimitTokens: Number(compression.contextLimitTokens || 0),
          maxOutputTokens: Number.isFinite(Number(compression.maxOutputTokens))
            ? Number(compression.maxOutputTokens)
            : null,
          modelContextSource: String(compression.modelContextSource || 'estimated'),
          batchSplitApplied: !!compression.batchSplitApplied,
          summaryWordLimit: Number(compression.summaryWordLimit || 0),
        }
        emitCompressionState('completed', {
          summaryNodeId: compression.summaryNodeId,
          archivedCount: Number(compression.archivedCount || 0),
          rangeStart: Number(compression.rangeStart || 0),
          rangeEnd: Number(compression.rangeEnd || 0),
          reason: '',
          ...compressionTelemetry,
        })
        const compressionPayload = {
          threadId: activeThreadId,
          turnId: activeTurnId,
          summaryNodeId: compression.summaryNodeId,
          archivedCount: Number(compression.archivedCount || 0),
          rangeStart: Number(compression.rangeStart || 0),
          rangeEnd: Number(compression.rangeEnd || 0),
          threshold: Number(memoryCompressionThreshold || 0),
          mode,
          ...compressionTelemetry,
        }
        commitProjectedTimelineEvent({
          persistTimelineEvent, send, kind: 'memory_compressed',
          options: {
            role: 'system',
            content: `Compressed logs #${compressionPayload.rangeStart}-#${compressionPayload.rangeEnd} into summary node (${compressionPayload.archivedCount} archived).`,
            meta: compressionPayload,
          },
          channel: 'chat:memory-compressed', payload: compressionPayload,
        })
      } else if (memoryCompressionEnabled && compression?.status === 'skipped') {
        emitCompressionState('skipped', {
          reason: String(compression.reason || 'not eligible'),
          candidateCount: Number(compression.candidateCount || 0),
          threshold: Number(compression.batchSize || memoryCompressionThreshold || 0),
          plannedBatchCount: Number(compression.plannedBatchCount || 0),
          selectedBatchSize: Number(compression.selectedBatchSize || 0),
          estimatedPromptTokens: Number(compression.estimatedPromptTokens || 0),
          promptBudgetTokens: Number(compression.promptBudgetTokens || 0),
          outputReserveTokens: Number(compression.outputReserveTokens || 0),
          contextLimitTokens: Number(compression.contextLimitTokens || 0),
          maxOutputTokens: Number.isFinite(Number(compression.maxOutputTokens))
            ? Number(compression.maxOutputTokens)
            : null,
          modelContextSource: String(compression.modelContextSource || ''),
          batchSplitApplied: !!compression.batchSplitApplied,
        })
      } else if (memoryCompressionEnabled && compression?.status === 'failed') {
        emitCompressionState('failed', {
          error: String(compression.error || 'unknown error'),
        })
      }

      if (memoryUpdateCount > 0) {
        send('memory:updated', { count: memoryUpdateCount })
      }

      if (mode === 'execute') {
        send('artifacts:updated', { filePath: null })
      }
    } catch (err) {
      if (isAbortError(err) || loop?.cancelled) {
        emitCompressionState('skipped', {
          reason: 'cancelled',
        })
      } else {
        emitCompressionState('failed', {
          error: String(err?.message || 'unknown error'),
        })
      }
    }
  })()
}
