import { resolveExecutionReasoningMessageId } from '../../../common/chat/reasoning-segment.mjs'
import { splitTerminalTextByExactPrefix } from '../../../common/chat/terminal-text-ownership.mjs'
import { toTimelineTool, withActivityTimestamp } from './activity-builders.mjs'
import { appendLiveExecutionReasoningEvent } from './live-execution-store.mjs'

const MAX_USER_CONTENT_PARTS = 16
const MAX_FILE_DATA_CHUNKS = 120
const MAX_IMAGE_DATA_CHUNKS = 120

export function recoverHydratedTerminalAssistant({
  kind = '', content = '', meta = {}, turnId = '', eventKey = '', createdAt = 0,
  hasToolContext = false, liveExecution = null,
} = {}) {
  const recovered = kind === 'assistant_message'
    ? splitTerminalTextByExactPrefix({ text: content, hasToolContext })
    : { finalText: content, commentaryParts: [] }
  const sourceParts = Array.isArray(meta.providerHistoryParts) ? meta.providerHistoryParts : null
  const providerHistoryParts = recovered.commentaryParts.length > 0 && sourceParts
    ? sourceParts.map((part) => {
      if (String(part?.type || '').trim().toLowerCase() !== 'text') return part
      const partOwnership = splitTerminalTextByExactPrefix({ text: part.text, hasToolContext: true })
      return partOwnership.commentaryParts.length > 0 ? { ...part, text: partOwnership.finalText } : part
    })
    : sourceParts
  const commentaryActivities = recovered.commentaryParts.map((detail, index) => withActivityTimestamp({
    id: `${eventKey}:recovered_commentary:${index + 1}`,
    type: 'reasoning', eventKind: 'assistant_commentary', turnId,
    threadId: String(meta.threadId || ''), label: 'Assistant update', detail,
    round: Number(meta.round || 0) || 0,
    createdAt: createdAt - recovered.commentaryParts.length + index,
  }))
  let nextLiveExecution = liveExecution
  for (const activity of commentaryActivities) {
    nextLiveExecution = appendLiveExecutionReasoningEvent(nextLiveExecution, {
      threadId: String(meta.threadId || ''), turnId, eventId: activity.id,
      messageId: activity.id, reasoningRole: 'commentary', chunk: activity.detail,
      forceNewBlock: true, emittedAt: activity.createdAt,
      streamMeta: { threadId: String(meta.threadId || ''), turnId },
    })
  }
  return {
    content: recovered.finalText,
    meta: recovered.commentaryParts.length > 0 ? { ...meta, finalDocument: undefined } : meta,
    providerHistoryParts,
    commentaryActivities,
    timelineRows: commentaryActivities.map(toTimelineTool),
    liveExecution: nextLiveExecution,
  }
}

export function resolveHydratedToolBackedTurns(rows = []) {
  return new Set(rows
    .filter((event) => ['tool_executing', 'tool_result'].includes(String(event?.kind || '').trim()))
    .map((event) => String(event?.turnId || '').trim())
    .filter(Boolean))
}

export function buildHydratedReasoningDoneActivity({
  eventKey = '', index = 0, turnId = '', meta = {}, detail = '',
  reasoningSegment = null, reasoningTokens = 0, createdAt = 0,
} = {}) {
  const providerId = String(meta.providerId || '').trim()
  return {
    id: `${eventKey}:reasoning_done:${index + 1}`,
    type: 'reasoning', eventKind: 'reasoning_done', turnId,
    threadId: String(meta.threadId || ''),
    messageId: resolveExecutionReasoningMessageId({
      turnId, segment: reasoningSegment, providerId,
      reasoningRole: 'reasoning', explicitMessageId: '',
    }),
    ...(reasoningSegment != null ? { reasoningSegment } : {}),
    providerId, model: String(meta.model || '').trim(),
    label: 'Reasoning summary captured', detail, reasoningTokens, createdAt,
  }
}

function normalizeUserContentPart(part = {}) {
  const type = String(part?.type || '').trim().toLowerCase()
  if (type === 'text') {
    const text = String(part?.text || '').trim()
    if (!text) return null
    return { type: 'text', text }
  }
  if (type === 'image') {
    const attachmentId = String(part?.attachmentId || '').trim()
    const mediaType = String(part?.mediaType || part?.mimeType || '').trim().toLowerCase()
    const filename = String(part?.filename || part?.fileName || '').trim()
    const previewUrl = String(part?.previewUrl || '').trim()
    if (attachmentId) {
      return {
        type: 'image',
        attachmentId,
        kind: 'image',
        ...(mediaType ? { mediaType } : {}),
        ...(filename ? { filename } : {}),
        ...(previewUrl ? { previewUrl } : {}),
      }
    }

    let image = String(part?.image || '').trim()
    if (!image && Array.isArray(part?.imageChunks)) {
      const chunks = part.imageChunks
        .slice(0, MAX_IMAGE_DATA_CHUNKS)
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
      if (chunks.length > 0) image = chunks.join('')
    }
    if (!image) return null
    return {
      type: 'image',
      image,
      ...(mediaType ? { mediaType } : {}),
    }
  }
  if (type === 'file') {
    const attachmentId = String(part?.attachmentId || '').trim()
    const mediaType = String(part?.mediaType || part?.mimeType || '').trim().toLowerCase()
    const filename = String(part?.filename || part?.fileName || '').trim()
    const previewUrl = String(part?.previewUrl || '').trim()
    if (attachmentId) {
      return {
        type: 'file',
        attachmentId,
        kind: 'file',
        ...(mediaType ? { mediaType } : {}),
        ...(filename ? { filename } : {}),
        ...(previewUrl ? { previewUrl } : {}),
      }
    }

    let data = String(part?.data || '').trim()
    if (!data && Array.isArray(part?.dataChunks)) {
      const chunks = part.dataChunks
        .slice(0, MAX_FILE_DATA_CHUNKS)
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
      if (chunks.length > 0) data = chunks.join('')
    }
    if (!mediaType && !filename && !data) return null
    return {
      type: 'file',
      ...(mediaType ? { mediaType } : {}),
      ...(filename ? { filename } : {}),
      ...(data ? { data } : {}),
    }
  }
  return null
}

function normalizePersistedUserContentParts(rawParts) {
  if (!Array.isArray(rawParts)) return []
  const out = []
  for (const part of rawParts) {
    if (out.length >= MAX_USER_CONTENT_PARTS) break
    const normalized = normalizeUserContentPart(part)
    if (normalized) out.push(normalized)
  }
  return out
}

function maybeParseUserContentPartsFromJson(content = '') {
  const raw = String(content || '').trim()
  if (!raw.startsWith('[') || !raw.endsWith(']')) return []
  try {
    const parsed = JSON.parse(raw)
    return normalizePersistedUserContentParts(parsed)
  } catch {
    return []
  }
}

export function resolveHydratedUserContent(content = '', meta = {}) {
  const metaParts = normalizePersistedUserContentParts(meta?.userContentParts)
  if (metaParts.length > 0) return metaParts
  const parsedParts = maybeParseUserContentPartsFromJson(content)
  if (parsedParts.length > 0) return parsedParts
  return content
}

export function resolveHydratedReasoningDone(meta = {}, content = '') {
  const fullReasoning = String(meta.full || content || '')
  const currentReasoning = String(meta.current || content || meta.full || '')
  const hasAuthoritativeFull = Object.hasOwn(meta, 'current')
  const normalizedReasoning = fullReasoning.trim()
  const reasoningTokens = Number(meta.reasoningTokens || 0) || 0
  const reasoningParts = normalizedReasoning
    ? normalizedReasoning.split('\n\n---\n\n').map((part) => String(part || '').trim()).filter(Boolean)
    : []
  const currentParts = hasAuthoritativeFull && currentReasoning.trim()
    ? [currentReasoning.trim()]
    : reasoningParts
  return {
    fullReasoning,
    currentReasoning,
    hasAuthoritativeFull,
    normalizedReasoning,
    reasoningTokens,
    reasoningParts,
    currentParts,
  }
}

export function buildMoaHydratedActivity(kind, meta = {}) {
  const activity = {}
  const leanDetail = [
    Number(meta.leanTaskCount || 0) > 0 ? `lean_tasks: ${Number(meta.leanTaskCount)}` : '',
    Number(meta.leanEstimatedTokens || 0) > 0 ? `lean_estimated_tokens: ${Number(meta.leanEstimatedTokens)}` : '',
    Number(meta.plannedVsLeanTokenDelta || 0) > 0 ? `lean_token_delta: ${Number(meta.plannedVsLeanTokenDelta)}` : '',
    Number.isFinite(Number(meta.plannedVsLeanUsdDelta)) && Number(meta.plannedVsLeanUsdDelta) > 0
      ? `lean_usd_delta: ${Number(meta.plannedVsLeanUsdDelta).toFixed(4)}`
      : '',
  ].filter(Boolean)

  if (kind === 'moa_delegation_planned') {
    const requestedTaskCount = Number(meta.requestedTaskCount || 0) || 0
    const plannedTaskCount = Number(meta.plannedTaskCount || 0) || 0
    activity.type = 'info'
    activity.label = `MoA plan: ${String(meta.riskTier || 'n/a')} / ${String(meta.strategy || 'n/a')}${meta.pattern ? ` / ${String(meta.pattern)}` : ''}`
    activity.detail = [
      requestedTaskCount > 0 ? `requested_tasks: ${requestedTaskCount}` : '',
      plannedTaskCount > 0 ? `planned_tasks: ${plannedTaskCount}` : '',
      Number(meta.estimatedTokens || 0) > 0 ? `estimated_tokens: ${Number(meta.estimatedTokens)}` : '',
      meta.usdAvailable && Number(meta.estimatedUsd || 0) > 0 ? `estimated_usd: ${Number(meta.estimatedUsd).toFixed(4)}` : '',
      meta.pattern ? `pattern: ${String(meta.pattern)}` : '',
      ...leanDetail,
    ].filter(Boolean).join('\n')
  } else if (kind === 'moa_delegation_cost_warning') {
    activity.type = 'info'
    activity.label = 'MoA cost warning'
    activity.detail = [
      Number(meta.estimatedTokens || 0) > 0 ? `estimated_tokens: ${Number(meta.estimatedTokens)}` : '',
      meta.usdAvailable && Number(meta.estimatedUsd || 0) > 0 ? `estimated_usd: ${Number(meta.estimatedUsd).toFixed(4)}` : '',
      meta.pattern ? `pattern: ${String(meta.pattern)}` : '',
      ...leanDetail,
    ].filter(Boolean).join('\n')
  } else if (kind === 'moa_delegation_cost_confirmed') {
    activity.type = 'info'
    activity.label = `MoA cost decision: ${String(meta.decision || 'proceed_planned')}`
    activity.detail = [
      Number(meta.estimatedTokens || 0) > 0 ? `estimated_tokens: ${Number(meta.estimatedTokens)}` : '',
      meta.usdAvailable && Number(meta.estimatedUsd || 0) > 0 ? `estimated_usd: ${Number(meta.estimatedUsd).toFixed(4)}` : '',
      meta.pattern ? `pattern: ${String(meta.pattern)}` : '',
      ...leanDetail,
    ].filter(Boolean).join('\n')
  } else if (kind === 'moa_delegation_start') {
    activity.type = 'info'
    activity.label = `Delegation started (${Number(meta.taskCount || 0)} task${Number(meta.taskCount || 0) === 1 ? '' : 's'})`
    activity.detail = ''
  } else if (kind === 'moa_delegation_retry') {
    activity.type = 'info'
    activity.label = `MoA retrying agent: ${formatMoaRoleLabel({ role: meta.agentRole, roleId: meta.agentRoleId })}`
    activity.detail = [
      meta.taskId ? `task: ${String(meta.taskId)}` : '',
      meta.providerId ? `provider: ${String(meta.providerId)}` : '',
      meta.model ? `model: ${String(meta.model)}` : '',
      Number(meta.attempt || 0) > 0 ? `attempt: ${Number(meta.attempt)}` : '',
      meta.status ? `status: ${String(meta.status)}` : '',
      meta.error ? `error: ${String(meta.error)}` : '',
    ].filter(Boolean).join('\n')
  } else if (kind === 'moa_delegation_skip') {
    activity.type = 'result'
    activity.isError = true
    activity.decision = 'approved'
    activity.label = `MoA skipped agent: ${formatMoaRoleLabel({ role: meta.agentRole, roleId: meta.agentRoleId })}`
    activity.detail = [
      meta.taskId ? `task: ${String(meta.taskId)}` : '',
      meta.providerId ? `provider: ${String(meta.providerId)}` : '',
      meta.model ? `model: ${String(meta.model)}` : '',
      Number(meta.attempts || 0) > 0 ? `attempts: ${Number(meta.attempts)}` : '',
      meta.status ? `status: ${String(meta.status)}` : '',
      meta.error ? `error: ${String(meta.error)}` : '',
    ].filter(Boolean).join('\n')
  } else if (kind === 'moa_agent_start') {
    activity.type = 'info'
    activity.label = formatMoaRoleLabel({ role: meta.agentRole, roleId: meta.agentRoleId })
    activity.detail = ''
  } else if (kind === 'moa_agent_done') {
    activity.type = 'result'
    activity.label = formatMoaRoleLabel({ role: meta.agentRole, roleId: meta.agentRoleId })
    activity.detail = ''
  } else if (kind === 'moa_agent_error') {
    activity.type = 'result'
    activity.isError = true
    activity.decision = 'approved'
    activity.label = formatMoaRoleLabel({ role: meta.agentRole, roleId: meta.agentRoleId })
    activity.detail = ''
  } else if (kind === 'moa_agent_recovery') {
    activity.type = 'warning'
    activity.label = `MoA recovery: ${formatMoaRoleLabel({ role: meta.agentRole, roleId: meta.agentRoleId })}`
    activity.detail = [
      meta.triggerKind ? `trigger: ${String(meta.triggerKind)}` : '',
      Number(meta.recoveryAttempt || 0) > 0 ? `attempt: ${Number(meta.recoveryAttempt)}/${Math.max(1, Number(meta.maxRecoveryAttempts || 0))}` : '',
      Array.isArray(meta.blockedToolNames) && meta.blockedToolNames.length > 0
        ? `blocked_tools: ${meta.blockedToolNames.join(', ')}`
        : '',
      meta.targetPath ? `target_path: ${String(meta.targetPath)}` : '',
      meta.message ? `message: ${String(meta.message)}` : '',
    ].filter(Boolean).join('\n')
  } else if (kind === 'moa_agent_file_staged') {
    const filePath = String(meta.filePath || '')
    const addedLines = Number(meta.addedLines || 0) || 0
    const removedLines = Number(meta.removedLines || 0) || 0
    activity.type = 'file_change'
    activity.label = filePath
      ? `MoA staged file: ${filePath} (+${addedLines} / -${removedLines})`
      : 'MoA staged file change'
    activity.fileChange = {
      filePath,
      newRevId: String(meta.revisionId || ''),
      prevRevId: String(meta.prevRevisionId || ''),
      rev: Number(meta.rev || 0) || 0,
      contentBytes: Number(meta.contentBytes || 0) || 0,
      addedLines,
      removedLines,
      changeType: 'created',
      source: 'moa_stage',
    }
    activity.detail = [
      meta.taskId ? `task: ${String(meta.taskId)}` : '',
      meta.agentRole ? `role: ${String(meta.agentRole)}` : '',
      meta.revisionId ? `revision: ${String(meta.revisionId)}` : '',
    ].filter(Boolean).join('\n')
  } else if (kind === 'moa_delegation_done') {
    const requestedTaskCount = Number(meta.requestedTaskCount || 0) || 0
    const plannedTaskCount = Number(meta.plannedTaskCount || meta.taskCount || 0) || 0
    const executedTaskCount = Number(meta.executedTaskCount || 0) || 0
    const skippedTaskCount = Number(meta.skippedTaskCount || 0) || 0
    const summaryMeta = meta?.summary && typeof meta.summary === 'object' ? meta.summary : {}
    const usageMeta = meta?.usage && typeof meta.usage === 'object' ? meta.usage : {}
    const stagedSummary = meta?.stagedSummary && typeof meta.stagedSummary === 'object' ? meta.stagedSummary : {}
    activity.type = 'info'
    activity.label = `Delegation finished (${String(meta.status || 'completed')})`
    activity.detail = [
      meta.riskTier ? `risk: ${String(meta.riskTier)}` : '',
      meta.strategy ? `strategy: ${String(meta.strategy)}` : '',
      meta.pattern ? `pattern: ${String(meta.pattern)}` : '',
      meta.delegationId ? `delegationId: ${String(meta.delegationId)}` : '',
      requestedTaskCount > 0 ? `requested_tasks: ${requestedTaskCount}` : '',
      plannedTaskCount > 0 ? `planned_tasks: ${plannedTaskCount}` : '',
      executedTaskCount > 0 ? `executed_tasks: ${executedTaskCount}` : '',
      skippedTaskCount > 0 ? `skipped_tasks: ${skippedTaskCount}` : '',
      Number(summaryMeta.completed || 0) >= 0 ? `completed: ${Number(summaryMeta.completed || 0)}` : '',
      Number(summaryMeta.failed || 0) >= 0 ? `failed: ${Number(summaryMeta.failed || 0)}` : '',
      Number(summaryMeta.timeout || 0) > 0 ? `timeout: ${Number(summaryMeta.timeout)}` : '',
      Number(summaryMeta.stale || 0) > 0 ? `stale: ${Number(summaryMeta.stale)}` : '',
      Number(summaryMeta.aborted || 0) > 0 ? `aborted: ${Number(summaryMeta.aborted)}` : '',
      Number(summaryMeta.budgetExceeded || 0) > 0 ? `budget_exceeded: ${Number(summaryMeta.budgetExceeded)}` : '',
      Number(summaryMeta.rateLimited || 0) > 0 ? `rate_limited: ${Number(summaryMeta.rateLimited)}` : '',
      Number(summaryMeta.notFound || 0) > 0 ? `not_found: ${Number(summaryMeta.notFound)}` : '',
      Number(summaryMeta.missingApiKey || 0) > 0 ? `missing_api_key: ${Number(summaryMeta.missingApiKey)}` : '',
      Number(summaryMeta.stagedWrites || stagedSummary.count || 0) > 0 ? `staged: ${Number(summaryMeta.stagedWrites || stagedSummary.count || 0)}` : '',
      Number(usageMeta.totalTokens || 0) > 0 ? `tokens: ${Number(usageMeta.totalTokens)}` : '',
      Number(meta.estimatedTokens || 0) > 0 ? `estimated_tokens: ${Number(meta.estimatedTokens)}` : '',
      Number(meta.actualTokens || usageMeta.totalTokens || 0) > 0 ? `actual_tokens: ${Number(meta.actualTokens || usageMeta.totalTokens || 0)}` : '',
      Number(meta.dedupeCount || 0) > 0 ? `dedupe: ${Number(meta.dedupeCount)}` : '',
      Number(meta.droppedFindings || 0) > 0 ? `dropped_findings: ${Number(meta.droppedFindings)}` : '',
      Number(meta.durationMs || 0) > 0 ? `duration_ms: ${Number(meta.durationMs)}` : '',
      ...leanDetail,
    ].filter(Boolean).join('\n')
  } else {
    return null
  }

  activity.moa = meta
  return activity
}

import { formatMoaRoleLabel } from '../../../common/moa/moa-display-formatters.mjs'
