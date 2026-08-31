/**
 * memory-compression.mjs - automatic compression of old auto-log memory nodes.
 *
 * Core logic (prompt building, batch planning, fallback summary, archive execution)
 * lives in memory-compression-core.mjs. This file handles orchestration, rate-limiting,
 * and project-level state tracking.
 */

import { createStreamWithTools } from '../api-clients/ai-provider.mjs'
import {
  addNode,
  getCompressionCandidateStats,
  listCompressionCandidates,
  markNodesCompressed,
} from './memory-store.mjs'
import {
  executeCompressionArchiveBatch,
  buildCompressionMessages,
  DEFAULT_SUMMARY_WORD_LIMIT,
} from './memory-compression-core.mjs'
import { createAbortError, isAbortError } from '../utils/abort-error.mjs'

const COMPRESSION_WINDOW_MS = 60 * 60 * 1000

const compressionState = new Map()

function clampThreshold(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 50
  return Math.max(5, Math.min(500, Math.round(n)))
}

function clampCooldownMs(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 120_000
  return Math.max(10_000, Math.min(86_400_000, Math.round(n)))
}

function clampMaxPerHour(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 4
  return Math.max(1, Math.min(50, Math.round(n)))
}

function clampMinNewLogs(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 12
  return Math.max(1, Math.min(500, Math.round(n)))
}

function normalizeCompressionTarget({ project = '', threadId = '', scope = '' } = {}) {
  const normalizedProject = String(project || '').trim()
  const normalizedThreadId = String(threadId || '').trim()
  let normalizedScope = String(scope || '').trim().toLowerCase()
  if (normalizedScope !== 'thread' && normalizedScope !== 'project') {
    normalizedScope = normalizedThreadId ? 'thread' : 'project'
  }
  return {
    project: normalizedProject,
    threadId: normalizedThreadId,
    scope: normalizedScope,
    stateKey: `${normalizedProject}::${normalizedScope}::${normalizedThreadId}`,
  }
}

function readCompressionState(target) {
  const key = String(target?.stateKey || '')
  const raw = compressionState.get(key)
  if (!raw) {
    return {
      lastRunAt: 0,
      lastCompressedSortId: 0,
      recentRunTimestamps: [],
    }
  }
  return {
    lastRunAt: Number(raw.lastRunAt || 0),
    lastCompressedSortId: Number(raw.lastCompressedSortId || 0),
    recentRunTimestamps: Array.isArray(raw.recentRunTimestamps)
      ? raw.recentRunTimestamps.map((v) => Number(v || 0)).filter((v) => Number.isFinite(v) && v > 0)
      : [],
  }
}

function writeCompressionState(target, next) {
  const key = String(target?.stateKey || '')
  compressionState.set(key, {
    lastRunAt: Number(next.lastRunAt || 0),
    lastCompressedSortId: Number(next.lastCompressedSortId || 0),
    recentRunTimestamps: Array.isArray(next.recentRunTimestamps)
      ? next.recentRunTimestamps.map((v) => Number(v || 0)).filter((v) => Number.isFinite(v) && v > 0)
      : [],
  })
}

async function summarizeWithModel({
  providerId,
  apiKey,
  model,
  nodes,
  abortSignal,
  summaryWordLimit = DEFAULT_SUMMARY_WORD_LIMIT,
}) {
  if (!providerId || !model) return ''
  if (abortSignal?.aborted) throw createAbortError()

  const messages = buildCompressionMessages(nodes, { summaryWordLimit })

  const result = await createStreamWithTools(
    providerId,
    apiKey,
    messages,
    { model, tools: {}, abortSignal },
    () => { },
    () => { },
  )
  if (abortSignal?.aborted) throw createAbortError()

  return String(result?.text ?? '').trim()
}

/**
 * Compresses oldest auto_log nodes once count reaches threshold.
 * Returns null when no compression run happened.
 */
export async function compressProjectAutoLogs({
  project,
  threadId = '',
  scope = '',
  providerId,
  apiKey,
  model,
  enabled = true,
  threshold = 50,
  cooldownMs = 120_000,
  maxPerHour = 4,
  minNewLogs = 12,
  abortSignal = null,
} = {}) {
  try {
    const batchSize = clampThreshold(threshold)
    const target = normalizeCompressionTarget({ project, threadId, scope })
    if (!enabled) {
      return { status: 'skipped', reason: 'disabled', batchSize, candidateCount: 0, scope: target.scope, threadId: target.threadId }
    }
    if (!target.project) {
      return { status: 'skipped', reason: 'missing_project', batchSize, candidateCount: 0, scope: target.scope, threadId: target.threadId }
    }
    if (target.scope === 'thread' && !target.threadId) {
      return { status: 'skipped', reason: 'missing_thread_id', batchSize, candidateCount: 0, scope: target.scope, threadId: '' }
    }
    if (abortSignal?.aborted) {
      return { status: 'skipped', reason: 'cancelled', batchSize, candidateCount: 0, scope: target.scope, threadId: target.threadId }
    }

    const safeCooldownMs = clampCooldownMs(cooldownMs)
    const safeMaxPerHour = clampMaxPerHour(maxPerHour)
    const safeMinNewLogs = clampMinNewLogs(minNewLogs)
    const now = Date.now()

    const stats = getCompressionCandidateStats(target.project, target)
    if (stats.totalCount < batchSize) {
      return {
        status: 'skipped',
        reason: 'threshold_not_reached',
        batchSize,
        candidateCount: stats.totalCount,
        scope: target.scope,
        threadId: target.threadId,
      }
    }

    const state = readCompressionState(target)
    if (state.lastRunAt > 0 && (now - state.lastRunAt) < safeCooldownMs) {
      return {
        status: 'skipped',
        reason: 'cooldown_active',
        batchSize,
        candidateCount: stats.totalCount,
        cooldownRemainingMs: Math.max(0, safeCooldownMs - (now - state.lastRunAt)),
        scope: target.scope,
        threadId: target.threadId,
      }
    }

    const recent = state.recentRunTimestamps.filter((ts) => (now - ts) <= COMPRESSION_WINDOW_MS)
    if (recent.length >= safeMaxPerHour) {
      return {
        status: 'skipped',
        reason: 'rate_limited',
        batchSize,
        candidateCount: stats.totalCount,
        scope: target.scope,
        threadId: target.threadId,
      }
    }

    if (state.lastCompressedSortId > 0) {
      const newSinceLastCompression = Math.max(0, Number(stats.newestSortId || 0) - state.lastCompressedSortId)
      if (newSinceLastCompression < safeMinNewLogs) {
        return {
          status: 'skipped',
          reason: 'insufficient_new_logs',
          batchSize,
          candidateCount: stats.totalCount,
          newSinceLastCompression,
          scope: target.scope,
          threadId: target.threadId,
        }
      }
    }

    let remainingCandidates = listCompressionCandidates(target.project, batchSize, target)
    if (remainingCandidates.length < batchSize) {
      return {
        status: 'skipped',
        reason: 'threshold_not_reached',
        batchSize,
        candidateCount: remainingCandidates.length,
        scope: target.scope,
        threadId: target.threadId,
      }
    }
    if (abortSignal?.aborted) throw createAbortError()

    // Process all available batches (not just the first one)
    let lastExecution = null
    let batchesProcessed = 0
    const MAX_BATCHES_PER_RUN = 5 // Safety cap to avoid runaway compression

    while (remainingCandidates.length >= batchSize && batchesProcessed < MAX_BATCHES_PER_RUN) {
      if (abortSignal?.aborted) throw createAbortError()

      const execution = await executeCompressionArchiveBatch({
        project: target.project,
        scope: target.scope,
        threadId: target.threadId,
        providerId,
        apiKey,
        model,
        candidates: remainingCandidates,
        candidateCount: stats.totalCount,
        batchSize,
        abortSignal,
        summarize: summarizeWithModel,
        addNode,
        markNodesCompressed,
        isAbortError,
      })

      if (execution?.status !== 'completed') {
        // If this was the first attempt, return the failure directly.
        // Otherwise return the last successful execution.
        return lastExecution || execution
      }

      lastExecution = execution
      batchesProcessed += 1

      // Re-list remaining candidates for the next batch
      remainingCandidates = listCompressionCandidates(target.project, batchSize, target)
    }

    if (lastExecution) {
      writeCompressionState(target, {
        lastRunAt: now,
        lastCompressedSortId: Number(lastExecution?.rangeEnd || state.lastCompressedSortId || 0),
        recentRunTimestamps: [...recent, now],
      })
      lastExecution.batchesProcessed = batchesProcessed
      lastExecution.scope = target.scope
      lastExecution.threadId = target.threadId
    }
    return lastExecution
  } catch (err) {
    if (isAbortError(err)) {
      return {
        status: 'skipped',
        reason: 'cancelled',
        batchSize: clampThreshold(threshold),
        candidateCount: 0,
      }
    }
    return {
      status: 'failed',
      error: String(err?.message || 'Unknown compression error'),
      batchSize: clampThreshold(threshold),
      candidateCount: 0,
    }
  }
}
