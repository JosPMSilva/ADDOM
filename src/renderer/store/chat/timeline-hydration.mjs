import { now, trimText, trimTimeline, toTimelineTool, withActivityTimestamp } from './activity-builders.mjs'
import { createEmptyContextUsage, createEmptyCostEstimate, createEmptyContinuityStatus, normalizeContextUsagePayload, reduceAccountContextUsageSnapshot } from './usage-normalizers.mjs'
import { normalizeQuestionUserRequest } from '../../../common/chat/question-user-request.mjs'
import { hydrateProviderTimelineActivity } from './timeline-hydration-provider-events.mjs'
import { hydratePersistedTurnStateActivity } from './timeline-hydration-turn-state.mjs'
import { buildHydratedReasoningDoneActivity, buildMoaHydratedActivity, recoverHydratedTerminalAssistant, resolveHydratedReasoningDone, resolveHydratedToolBackedTurns, resolveHydratedUserContent } from './timeline-hydration-utils.mjs'
import { dedupeWriteConflicts, normalizeWriteConflict } from './write-conflict-utils.mjs'
import { resolveExecutionReasoningMessageId } from '../../../common/chat/reasoning-segment.mjs'
import { buildHydratedAssistantMessage } from './timeline-hydration-assistant-message.mjs'
import {
  appendLiveExecutionReasoningEvent,
  appendLiveExecutionToolOutput,
  createEmptyLiveExecutionState,
  markLiveExecutionReasoningDone,
  pruneDuplicatedFinalReasoningFromLiveExecution,
  replaceLatestLiveExecutionReasoningSnapshot,
  upsertLiveExecutionActivity,
} from './live-execution-store.mjs'
import { applyHydratedToolResultActivity, resolveHydratedToolResultQuestionUser } from './timeline-hydration-tool-result.mjs'
import {
  buildOpenAIAccountNativeActivityRows,
  buildOpenAIProviderToolOutputActivity,
  buildOpenAIProviderToolStatusActivity,
} from '../../components/chat/chat-event-bridge-openai.mjs'
import {
  mapPersistedTimelineRecordToExecutionEvents,
  resolvePersistedExecutionReasoningSegment,
} from './timeline-execution-event-adapter.mjs'
import { reduceHydratedPlanProjection } from './timeline-hydration-plan.mjs'
const MAX_TOOL_ACTIVITY_ITEMS = 500
export function mapTimelineFromPersistedEvents(events) {
  const rows = Array.isArray(events) ? events : []
  const messages = []
  const toolActivity = []
  const timeline = []
  let liveExecution = createEmptyLiveExecutionState()
  const writeConflicts = []
  const assistantMessageByTurn = new Map()
  const pendingReasoningByTurn = new Map()
  const hydratedReasoningTurns = new Set()
  const hydratedExecutionReasoningKeys = new Map()
  const hydratedExecutionCommentaryTurns = new Set()
  const toolBackedTurns = resolveHydratedToolBackedTurns(rows)
  const messageById = new Map()
  let pendingQuestionUser = null
  let planProjection = { pendingPlanDirection: null, planDocumentReady: null }
  let latestContextUsage = createEmptyContextUsage()
  let latestCostEstimate = createEmptyCostEstimate()
  let latestContinuityStatus = createEmptyContinuityStatus()

  const rememberHydratedExecutionReasoning = ({
    threadId = '',
    turnId = '',
    messageId = '',
    providerId = '',
    model = '',
    authMethod = '',
    transportMode = '',
    lastChunkAt = 0,
  } = {}) => {
    const normalizedTurnId = String(turnId || '').trim()
    const normalizedMessageId = String(messageId || '').trim()
    if (!normalizedTurnId || !normalizedMessageId) return
    hydratedExecutionReasoningKeys.set(`${normalizedTurnId}::${normalizedMessageId}`, {
      threadId: String(threadId || '').trim(),
      turnId: normalizedTurnId,
      messageId: normalizedMessageId,
      providerId: String(providerId || '').trim(),
      model: String(model || '').trim(),
      authMethod: String(authMethod || '').trim().toLowerCase(),
      transportMode: String(transportMode || '').trim().toLowerCase(),
      lastChunkAt: Number(lastChunkAt || 0) || 0,
    })
  }
  const isLocalStreamedOpenAICommentaryHydration = (eventMeta = {}) => {
    const normalizedProviderId = String(eventMeta?.providerId || '').trim().toLowerCase()
    if (normalizedProviderId !== 'openai') return false
    const authMethod = String(eventMeta?.authMethod || '').trim().toLowerCase()
    if (authMethod === 'account') return false
    const transportMode = String(eventMeta?.transportMode || '').trim().toLowerCase()
    return transportMode === 'responses_stream'
  }

  const pushHydratedActivity = (activity, fallbackCreatedAt = 0) => {
    const normalized = withActivityTimestamp(activity)
    toolActivity.push(normalized)
    timeline.push(toTimelineTool(normalized))
    liveExecution = upsertLiveExecutionActivity(liveExecution, normalized)
    const stdoutPreview = String(normalized?.stdoutPreview || '').trim()
    const stderrPreview = String(normalized?.stderrPreview || '').trim()
    const stepId = String(normalized?.stepId || '').trim()
    const emittedAt = Number(normalized?.finishedAt || normalized?.updatedAt || normalized?.createdAt || 0) || fallbackCreatedAt || now()
    if (stdoutPreview && stepId) {
      liveExecution = appendLiveExecutionToolOutput(liveExecution, {
        threadId: String(normalized?.threadId || '').trim(),
        turnId: String(normalized?.turnId || '').trim(),
        stepId,
        sequence: Number(normalized?.sequence || 0) || 0,
        toolName: String(normalized?.toolName || '').trim(),
        stream: 'stdout',
        chunk: stdoutPreview,
        emittedAt,
        status: 'done',
      })
    }
    if (stderrPreview && stepId) {
      liveExecution = appendLiveExecutionToolOutput(liveExecution, {
        threadId: String(normalized?.threadId || '').trim(),
        turnId: String(normalized?.turnId || '').trim(),
        stepId,
        sequence: Number(normalized?.sequence || 0) || 0,
        toolName: String(normalized?.toolName || '').trim(),
        stream: 'stderr',
        chunk: stderrPreview,
        emittedAt,
        status: String(normalized?.isError ? 'error' : 'done'),
      })
    }
  }

  for (const event of rows) {
    if (!event || typeof event !== 'object') continue
    const eventId = Number(event.eventId || 0)
    const eventKey = eventId > 0 ? `event:${eventId}` : `event:${crypto.randomUUID()}`
    const createdAt = Number(event.createdAt || 0) || now()
    const kind = String(event.kind || '').trim()
    const content = String(event.content ?? '')
    const turnId = String(event.turnId || '').trim()
    const meta = event.meta && typeof event.meta === 'object' ? event.meta : {}

    const planHydration = reduceHydratedPlanProjection(planProjection, kind, meta)
    if (planHydration.handled) {
      planProjection = planHydration.state
      continue
    }

    if (kind === 'execution_reasoning_chunk') {
      const detail = String(content ?? '')
      if (!turnId || !detail) continue
      const threadId = String(meta.threadId || '').trim()
      const [persistedExecutionEvent] = mapPersistedTimelineRecordToExecutionEvents(event)
      const { hasPersistedSegment, segment } = resolvePersistedExecutionReasoningSegment(meta)
      const messageId = String(persistedExecutionEvent?.messageId || '').trim()
      liveExecution = appendLiveExecutionReasoningEvent(liveExecution, {
        threadId,
        turnId,
        eventId: String(persistedExecutionEvent?.eventId || '').trim(),
        messageId,
        reasoningRole: 'reasoning',
        chunk: detail,
        forceNewBlock: meta.forceNewBlock === true,
        emittedAt: Number(meta.emittedAt || createdAt) || createdAt,
        reasoningMeta: {
          mode: 'live',
          chunkCount: 1,
          charsStreamed: detail.length,
          firstChunkAt: Number(meta.emittedAt || createdAt) || createdAt,
          lastChunkAt: Number(meta.emittedAt || createdAt) || createdAt,
          providerId: String(meta.providerId || '').trim(),
          model: String(meta.model || '').trim(),
          authMethod: String(meta.authMethod || '').trim().toLowerCase(),
          transportMode: String(meta.transportMode || '').trim().toLowerCase(),
          ...(hasPersistedSegment ? { reasoningSegment: segment } : {}),
        },
        streamMeta: {
          threadId,
          turnId,
          providerId: String(meta.providerId || '').trim(),
          model: String(meta.model || '').trim(),
          authMethod: String(meta.authMethod || '').trim().toLowerCase(),
          transportMode: String(meta.transportMode || '').trim().toLowerCase(),
          lastChunkAt: Number(meta.emittedAt || createdAt) || createdAt,
          ...(hasPersistedSegment ? { reasoningSegment: segment } : {}),
        },
      })
      rememberHydratedExecutionReasoning({
        threadId, turnId, messageId,
        providerId: String(meta.providerId || '').trim(),
        model: String(meta.model || '').trim(),
        authMethod: String(meta.authMethod || '').trim().toLowerCase(),
        transportMode: String(meta.transportMode || '').trim().toLowerCase(),
        lastChunkAt: Number(meta.emittedAt || createdAt) || createdAt,
      })
      continue
    }
    if (kind === 'execution_commentary_chunk') {
      const detail = String(content ?? '')
      if (!turnId || !detail) continue
      const threadId = String(meta.threadId || '').trim()
      const [persistedExecutionEvent] = mapPersistedTimelineRecordToExecutionEvents(event)
      const messageId = persistedExecutionEvent?.messageId
      hydratedExecutionCommentaryTurns.add(turnId)
      liveExecution = appendLiveExecutionReasoningEvent(liveExecution, {
        threadId,
        turnId,
        eventId: String(persistedExecutionEvent?.eventId || '').trim(),
        messageId,
        reasoningRole: 'commentary',
        chunk: detail,
        forceNewBlock: meta.forceNewBlock === true,
        emittedAt: Number(meta.emittedAt || createdAt) || createdAt,
        streamMeta: {
          threadId,
          turnId,
          providerId: String(meta.providerId || '').trim(),
          model: String(meta.model || '').trim(),
          lastChunkAt: Number(meta.emittedAt || createdAt) || createdAt,
          ...(meta.reasoningSegment != null
            ? { reasoningSegment: Math.max(0, Number(meta.reasoningSegment) || 0) }
            : {}),
        },
      })
      rememberHydratedExecutionReasoning({
        threadId, turnId, messageId,
        providerId: String(meta.providerId || '').trim(),
        model: String(meta.model || '').trim(),
        authMethod: String(meta.authMethod || '').trim().toLowerCase(),
        transportMode: String(meta.transportMode || '').trim().toLowerCase(),
        lastChunkAt: Number(meta.emittedAt || createdAt) || createdAt,
      })
      continue
    }
    if (kind === 'user_message' || kind === 'assistant_message') {
      const recovered = recoverHydratedTerminalAssistant({
        kind, content, meta, turnId, eventKey, createdAt,
        hasToolContext: toolBackedTurns.has(turnId), liveExecution,
      })
      toolActivity.push(...recovered.commentaryActivities)
      timeline.push(...recovered.timelineRows)
      liveExecution = recovered.liveExecution
      const message = kind === 'user_message'
        ? { id: eventKey, role: 'user', content: resolveHydratedUserContent(content, meta), status: 'done' }
        : buildHydratedAssistantMessage({
          eventKey, meta: recovered.meta, turnId, content: recovered.content,
          providerHistoryParts: recovered.providerHistoryParts,
        })
      messages.push(message)
      messageById.set(message.id, message)
      if (kind === 'user_message') {
        pendingQuestionUser = null
      } else {
        const normalizedQuestionUser = (
          String(meta.stopReason || '').trim().toLowerCase() === 'question_user'
            ? normalizeQuestionUserRequest(meta.questionUser)
            : null
        )
        if (normalizedQuestionUser) pendingQuestionUser = normalizedQuestionUser
      }
      if (kind === 'assistant_message' && turnId) {
        assistantMessageByTurn.set(turnId, message.id)
        liveExecution = pruneDuplicatedFinalReasoningFromLiveExecution(liveExecution, { turnId, messageId: message.id, assistantText: recovered.content })
        const pendingReasoning = String(pendingReasoningByTurn.get(turnId) || '').trim()
        if (pendingReasoning) {
          message.reasoning = pendingReasoning
          message.reasoningDone = true
          pendingReasoningByTurn.delete(turnId)
        }
      }
      timeline.push({
        id: eventKey,
        kind: 'message',
        createdAt,
        message,
      })
      continue
    }
    if (kind === 'reasoning_done') {
      const {
        fullReasoning, currentReasoning, hasAuthoritativeFull, normalizedReasoning,
        currentParts,
      } = resolveHydratedReasoningDone(meta, content)
      const assistantId = assistantMessageByTurn.get(turnId)
      if (assistantId && messageById.has(assistantId)) {
        const target = messageById.get(assistantId)
        const existing = String(target.reasoning || '').trimEnd()
        target.reasoning = hasAuthoritativeFull
          ? fullReasoning
          : (fullReasoning ? (existing ? `${existing}\n\n---\n\n${fullReasoning}` : fullReasoning) : existing)
        target.reasoningDone = true
      } else if (turnId && normalizedReasoning) {
        const existingPending = String(pendingReasoningByTurn.get(turnId) || '').trimEnd()
        pendingReasoningByTurn.set(
          turnId,
          hasAuthoritativeFull
            ? normalizedReasoning
            : (existingPending ? `${existingPending}\n\n---\n\n${normalizedReasoning}` : normalizedReasoning),
        )
      }
      if (turnId && currentParts.length > 0) {
        hydratedReasoningTurns.add(turnId)
        const reasoningActivityDetails = currentParts
        const { hasPersistedSegment, segment } = resolvePersistedExecutionReasoningSegment(meta)
        if (hasAuthoritativeFull && currentReasoning.trim()) {
          const messageId = hasPersistedSegment
            ? resolveExecutionReasoningMessageId({ turnId, segment, providerId: String(meta.providerId || '').trim(), explicitMessageId: '' })
            : String(meta.assistantMessageId || assistantMessageByTurn.get(turnId) || '')
          liveExecution = replaceLatestLiveExecutionReasoningSnapshot(liveExecution, {
            threadId: String(meta.threadId || ''),
            turnId,
            messageId,
            reasoningRole: 'reasoning',
            detail: currentReasoning.trim(),
            emittedAt: createdAt,
            reasoningMeta: { providerId: String(meta.providerId || '').trim(), ...(hasPersistedSegment ? { reasoningSegment: segment } : {}) },
          })
        }
        for (const [index, detail] of reasoningActivityDetails.entries()) {
          const reasoningActivity = withActivityTimestamp(buildHydratedReasoningDoneActivity({
            eventKey, index, turnId, meta, detail,
            reasoningSegment: hasPersistedSegment ? segment : null,
            reasoningTokens: 0,
            createdAt,
          }))
          toolActivity.push(reasoningActivity)
          timeline.push({
            id: `${eventKey}:tool:${index + 1}`,
            kind: 'tool',
            createdAt,
            activity: reasoningActivity,
          })
        }
      }

      continue
    }
    if (kind === 'assistant_commentary') {
      const detail = String(content || '').trim()
      if (!turnId || !detail) continue
      if (
        hydratedExecutionCommentaryTurns.has(turnId)
        && isLocalStreamedOpenAICommentaryHydration(meta)
      ) {
        continue
      }
      const commentaryActivity = withActivityTimestamp({
        id: `${eventKey}:assistant_commentary`,
        type: 'reasoning',
        eventKind: 'assistant_commentary',
        turnId,
        threadId: String(meta.threadId || ''),
        label: 'Assistant update',
        detail,
        round: Number(meta.round || 0) || 0,
        createdAt,
      })
      toolActivity.push(commentaryActivity)
      timeline.push({
        id: `${eventKey}:assistant_commentary_tool`,
        kind: 'tool',
        createdAt,
        activity: commentaryActivity,
      })
      continue
    }
    if (kind === 'chat_error') {
      const reasoningSnapshot = String(meta.reasoningSnapshot || '').trim()
      if (turnId && reasoningSnapshot && !hydratedReasoningTurns.has(turnId)) {
        pendingReasoningByTurn.set(turnId, reasoningSnapshot)
        hydratedReasoningTurns.add(turnId)
        const reasoningParts = reasoningSnapshot
          .split('\n\n---\n\n')
          .map((part) => String(part || '').trim())
          .filter(Boolean)
        const recoveredReasoningDetails = reasoningParts.length > 0
          ? reasoningParts
          : [reasoningSnapshot]
        for (const [index, detail] of recoveredReasoningDetails.entries()) {
          const reasoningActivity = withActivityTimestamp({
            id: `${eventKey}:reasoning_recovered:${index + 1}`,
            type: 'reasoning',
            eventKind: 'reasoning_done',
            turnId,
            threadId: String(meta.threadId || ''),
            label: 'Reasoning recovered from interrupted turn',
            detail,
            createdAt,
          })
          toolActivity.push(reasoningActivity)
          timeline.push({
            id: `${eventKey}:reasoning_tool:${index + 1}`,
            kind: 'tool',
            createdAt,
            activity: reasoningActivity,
          })
        }
      }
      const message = {
        id: eventKey,
        role: 'assistant',
        content: content || 'Error',
        status: 'error',
        ...(turnId ? {
          reasoning: String(pendingReasoningByTurn.get(turnId) || ''),
          reasoningDone: true,
          streamMeta: {
            turnId,
            ...(meta?.threadId ? { threadId: String(meta.threadId || '') } : {}),
          },
        } : {}),
      }
      messages.push(message)
      messageById.set(message.id, message)
      timeline.push({
        id: eventKey,
        kind: 'message',
        createdAt,
        message,
      })
      continue
    }
    if (kind === 'write_conflict') {
      const conflict = normalizeWriteConflict({
        ...meta,
        eventId,
        threadId: String(meta.threadId || ''),
        turnId: turnId || String(meta.turnId || ''),
        detectedAt: Number(meta.detectedAt || createdAt) || createdAt,
      })
      if (conflict) writeConflicts.push(conflict)
      continue
    }

    const activity = {
      id: eventKey,
      createdAt,
      turnId: turnId || String(meta.turnId || ''),
      threadId: String(meta.threadId || ''),
      eventKind: kind,
      stepId: String(meta.stepId || meta.toolCallId || ''),
      sequence: Number(meta.sequence || 0) || 0,
      startedAt: Number(meta.startedAt || 0) || 0,
      finishedAt: Number(meta.finishedAt || 0) || 0,
      durationMs: Number(meta.durationMs || 0) || 0,
    }
    const providerActivity = hydrateProviderTimelineActivity({ kind, activity, meta, content })

    const hydratedTurnStateActivity = (
      kind === 'turn_started'
      || kind === 'turn_completed'
      || kind === 'turn_cancelled'
      || kind === 'turn_phase'
    )
      ? hydratePersistedTurnStateActivity({ eventKey, kind, meta, createdAt })
      : null

    if (hydratedTurnStateActivity) {
      Object.assign(activity, hydratedTurnStateActivity)
    } else if (kind === 'tool_pending') {
      activity.type = 'pending'
      const count = Number(meta.count || 0)
      activity.label = `Preparing ${count} action${count === 1 ? '' : 's'}...`
    } else if (kind === 'approval_countdown') {
      activity.type = 'pending'
      const phase = String(meta.phase || '').trim().toLowerCase()
      const toolName = String(meta.toolName || 'tool')
      activity.toolName = toolName
      const remainingSec = Math.max(0, Math.ceil(Number(meta.remainingMs || 0) / 1000))
      if (phase === 'warning') {
        activity.label = `Approval for ${toolName} is about to expire (${remainingSec}s left).`
      } else {
        const timeoutSec = Math.max(0, Math.ceil(Number(meta.timeoutMs || 0) / 1000))
        activity.label = `Approval requested for ${toolName} (${timeoutSec}s timeout).`
      }
    } else if (kind === 'approval_timeout') {
      activity.type = 'result'
      const toolName = String(meta.toolName || 'tool')
      activity.toolName = toolName
      activity.label = `Approval expired for ${toolName} (timeout).`
      activity.isError = true
      activity.decision = 'denied'
      activity.denyReason = 'timeout'
    } else if (kind === 'tool_executing') {
      activity.type = 'executing'
      activity.toolName = String(meta.toolName || '')
      activity.toolInput = meta.toolInput || {}
      activity.runCommandPolicy = meta?.runCommandPolicy && typeof meta.runCommandPolicy === 'object'
        ? meta.runCommandPolicy
        : null
      activity.browserActionPolicy = meta?.browserActionPolicy && typeof meta.browserActionPolicy === 'object'
        ? meta.browserActionPolicy
        : null
    } else if (kind === 'provider_tool_status') {
      Object.assign(activity, buildOpenAIProviderToolStatusActivity(meta))
    } else if (kind === 'provider_tool_output') {
      const providerActivity = buildOpenAIProviderToolOutputActivity({ ...meta, turnId })
      activity.type = 'result'
      activity.toolName = providerActivity.toolName
      activity.toolInput = providerActivity.toolInput || null
      activity.label = providerActivity.label
      activity.result = trimText(providerActivity.detail || content, 2400)
      activity.isError = providerActivity.isError === true
      activity.output = providerActivity.output
      if (Number.isFinite(providerActivity.exitCode)) activity.exitCode = providerActivity.exitCode
      if (Number.isFinite(providerActivity.durationMs)) activity.durationMs = providerActivity.durationMs
      activity.decision = 'approved'
      activity.providerExecuted = true
      if (Array.isArray(providerActivity.fileChanges) && providerActivity.fileChanges.length > 0) {
        activity.fileChanges = providerActivity.fileChanges
        activity.fileChange = providerActivity.fileChanges[0]
      }
    } else if (kind === 'tool_result') {
      if (!applyHydratedToolResultActivity(activity, meta, content)) continue
      pendingQuestionUser = resolveHydratedToolResultQuestionUser(meta) || pendingQuestionUser
    } else if (kind === 'file_change') {
      activity.type = 'file_change'
      const filePath = String(meta.filePath || '')
      const addedLines = Number(meta.addedLines || 0) || 0
      const removedLines = Number(meta.removedLines || 0) || 0
      activity.fileChange = {
        filePath,
        newRevId: String(meta.newRevId || ''),
        prevRevId: String(meta.prevRevId || ''),
        rev: Number(meta.rev || 0) || 0,
        contentBytes: Number(meta.contentBytes || 0) || 0,
        addedLines,
        removedLines,
        changeType: String(meta.changeType || '').trim().toLowerCase(),
        source: String(meta.source || '').trim().toLowerCase(),
        diffText: String(meta.diffText || meta.diff || '').trim(),
      }
      activity.label = filePath
        ? `File changed: ${filePath} (+${addedLines} / -${removedLines})`
        : 'File changed'
    } else if (kind === 'runtime_diagnostics') {
      activity.type = String(meta.type || '').trim().toLowerCase() === 'warning' ? 'warning' : 'info'
      activity.label = String(meta.label || content || 'Runtime diagnostics captured').trim() || 'Runtime diagnostics captured'
      activity.detail = String(meta.detail || '').trim()
    } else if (kind === 'compression_state') {
      activity.type = 'info'
      const state = String(meta.state || '').trim().toLowerCase()
      if (state === 'started') {
        activity.label = `Memory compression started (threshold ${Number(meta.threshold || 0)}).`
      } else if (state === 'skipped') {
        activity.label = `Memory compression skipped: ${String(meta.reason || 'not eligible')}.`
      } else if (state === 'completed') {
        activity.label = `Memory compression completed (${Number(meta.archivedCount || 0)} archived).`
      } else if (state === 'failed') {
        activity.type = 'result'
        activity.isError = true
        activity.decision = 'approved'
        activity.label = `Memory compression failed: ${String(meta.error || 'unknown error')}`
      } else {
        continue
      }
    } else if (kind === 'chat_cancelled') {
      activity.type = 'result'
      activity.label = `Stop requested: ${content || 'Stopping after current action.'}`
      activity.isError = false
      activity.decision = 'approved'
    } else if (kind === 'memory_compressed') {
      const rangeStart = Number(meta.rangeStart || 0)
      const rangeEnd = Number(meta.rangeEnd || 0)
      const archivedCount = Number(meta.archivedCount || 0)
      const summaryNodeId = String(meta.summaryNodeId || '').trim()
      activity.type = 'info'
      activity.label = rangeStart > 0 && rangeEnd > 0
        ? `Compressed logs #${rangeStart}-#${rangeEnd} into summary (${archivedCount} archived)`
        : 'Memory logs compressed into summary node'
      activity.detail = [
        summaryNodeId ? `summaryNodeId: ${summaryNodeId}` : '',
        Number.isFinite(meta.threshold) ? `threshold: ${meta.threshold}` : '',
      ].filter(Boolean).join('\n')
    } else if (kind === 'context_compacted') {
      activity.type = 'info'
      const removed = Number(meta.removedMessages || 0)
      activity.label = `Context compacted (${removed} older message${removed === 1 ? '' : 's'} summarized)`
      activity.detail = [
        Number.isFinite(meta.estimatedBeforeTokens) ? `beforeTokens: ${meta.estimatedBeforeTokens}` : '',
        Number.isFinite(meta.estimatedAfterTokens) ? `afterTokens: ${meta.estimatedAfterTokens}` : '',
        Number.isFinite(meta.modelLimit) ? `modelLimit: ${meta.modelLimit}` : '',
      ].filter(Boolean).join('\n')
      activity.compactionMilestone = true
      activity.compactionMilestoneTitle = 'Context automatically compacted'
      activity.compactionMilestoneDetail = [
        'Local continuity summary',
        removed > 0 ? `${removed} message${removed === 1 ? '' : 's'} summarized` : '',
      ].filter(Boolean).join(' | ')
      activity.compactionMilestoneTone = 'local'
    } else if (kind === 'source_url') {
      activity.type = 'info'
      const url = String(meta.url || content || '').trim()
      const title = String(meta.title || '').trim()
      activity.label = title ? `Source: ${title}` : 'Source URL attached'
      activity.detail = url
    } else if (kind === 'source_document') {
      activity.type = 'info'
      const title = String(meta.title || meta.filename || content || '').trim()
      activity.label = title ? `Source document: ${title}` : 'Source document attached'
      activity.detail = [
        meta.filename ? `filename: ${String(meta.filename)}` : '',
        meta.mediaType ? `media_type: ${String(meta.mediaType)}` : '',
      ].filter(Boolean).join('\n')
    } else if (providerActivity) {
      Object.assign(activity, providerActivity)
    } else if (
      kind === 'compliance_notice_shown'
      || kind === 'compliance_notice_acknowledged'
      || kind === 'compliance_notice_skipped'
    ) {
      const noticeAction = kind === 'compliance_notice_acknowledged'
        ? 'acknowledged'
        : kind === 'compliance_notice_skipped'
          ? 'skipped'
          : 'shown'
      const noticeType = String(meta.noticeType || '').trim()
      activity.type = 'info'
      activity.label = noticeType
        ? `Compliance notice ${noticeAction}: ${noticeType}`
        : `Compliance notice ${noticeAction}`
      activity.detail = [
        meta.providerId ? `provider: ${String(meta.providerId)}` : '',
        meta.model ? `model: ${String(meta.model)}` : '',
        meta.termsVersion ? `terms_version: ${String(meta.termsVersion)}` : '',
        meta.source ? `source: ${String(meta.source)}` : '',
        Number(meta.repeatedCount || 0) > 0 ? `repeated_count: ${Number(meta.repeatedCount)}` : '',
        typeof meta.preserveCitations === 'boolean'
          ? `preserve_citations: ${meta.preserveCitations ? 'true' : 'false'}`
          : '',
      ].filter(Boolean).join('\n')
    } else if (kind === 'chat_cost_estimate') {
      const estimatedInputTokens = Number(meta.estimatedInputTokens || 0) || 0
      const estimatedOutputTokens = Number(meta.estimatedOutputTokens || 0) || 0
      const estimatedTotalTokens = Number(meta.estimatedTotalTokens || estimatedInputTokens + estimatedOutputTokens || 0) || 0
      const estimatedUsd = Number.isFinite(Number(meta.estimatedUsd))
        ? Number(meta.estimatedUsd)
        : null
      latestCostEstimate = {
        threadId: String(meta.threadId || ''),
        turnId: String(meta.turnId || ''),
        providerId: String(meta.providerId || ''),
        model: String(meta.model || ''),
        mode: String(meta.mode || 'execute'),
        estimatedInputTokens,
        estimatedOutputTokens,
        estimatedTotalTokens,
        estimatedUsd,
        usdAvailable: !!meta.usdAvailable,
        estimateConfidence: String(meta.estimateConfidence || 'token_only'),
        pricingWarning: String(meta.pricingWarning || ''),
        source: String(meta.source || 'pre_turn'),
        contextLimitTokens: Number(meta.contextLimitTokens || 0) || 0,
        maxOutputTokens: Number(meta.maxOutputTokens || 0) || 0,
        emittedAt: Number(meta.emittedAt || createdAt) || createdAt,
      }
      activity.type = 'info'
      activity.authMethod = String(meta.authMethod || '').trim().toLowerCase()
      activity.label = estimatedUsd != null
        ? `Turn cost estimate: ${estimatedUsd.toFixed(4)} USD`
        : `Turn token estimate: ${estimatedTotalTokens} tokens`
      activity.detail = [
        estimatedInputTokens > 0 ? `input_estimate: ${estimatedInputTokens}` : '',
        estimatedOutputTokens > 0 ? `output_estimate: ${estimatedOutputTokens}` : '',
        estimatedUsd != null ? `usd_estimate: ${estimatedUsd.toFixed(4)}` : '',
        latestCostEstimate.estimateConfidence ? `confidence: ${latestCostEstimate.estimateConfidence}` : '',
        latestCostEstimate.pricingWarning ? `pricing_warning: ${latestCostEstimate.pricingWarning}` : '',
      ].filter(Boolean).join('\n')
    } else if (kind === 'chat_usage') {
      const normalizedContextUsage = normalizeContextUsagePayload(meta, {
        currentTotals: { inputTokens: Number(latestContextUsage?.rollingInputTokens || 0) || 0, outputTokens: Number(latestContextUsage?.rollingOutputTokens || 0) || 0, reasoningTokens: Number(latestContextUsage?.rollingReasoningTokens || 0) || 0, totalTokens: Number(latestContextUsage?.rollingTotalTokens || 0) || 0 },
        fallbackUpdatedAt: createdAt,
      })
      latestContextUsage = reduceAccountContextUsageSnapshot(latestContextUsage, normalizedContextUsage)
      activity.type = 'usage'
      activity.authMethod = String(meta.authMethod || '').trim().toLowerCase()
      activity.providerUsageAvailable = latestContextUsage.providerUsageAvailable
      activity.totalTokens = latestContextUsage.totalTokens
      activity.label = `Context usage: ${latestContextUsage.totalTokens} tokens this step`
      activity.detail = [
        `input: ${latestContextUsage.inputTokens}`,
        `output: ${latestContextUsage.outputTokens}`,
        latestContextUsage.reasoningTokens > 0 ? `reasoning: ${latestContextUsage.reasoningTokens}` : '',
        `rolling spend: ${latestContextUsage.rollingTotalTokens}`,
        `occupancy: ${latestContextUsage.contextOccupancyTokens}`,
        latestContextUsage.modelLimit > 0 ? `limit: ${latestContextUsage.modelLimit}` : '',
        latestContextUsage.modelLimit > 0 ? `remaining: ${latestContextUsage.contextRemainingTokens}` : '',
      ].filter(Boolean).join('\n')
    } else if (kind === 'continuity_retrieval_used') {
      activity.type = 'info'
      activity.label = /^Continuity retrieval used/i.test(String(content || '').trim())
        ? String(content || '').trim()
        : 'Continuity retrieval used'
      activity.detail = [
        meta.scope ? `scope: ${String(meta.scope)}` : '',
        Number(meta.selectedFacts || 0) > 0 ? `facts: ${Number(meta.selectedFacts)}` : '',
        Number(meta.selectedInvariants || 0) > 0 ? `invariants: ${Number(meta.selectedInvariants)}` : '',
        Number(meta.selectedSnapshots || 0) > 0 ? `snapshots: ${Number(meta.selectedSnapshots)}` : '',
      ].filter(Boolean).join('\n')
    } else if (kind === 'continuity_packet_built') {
      const profile = String(meta.profile || latestContinuityStatus.profile || 'balanced')
      const driftRisk = String(meta.driftRisk || latestContinuityStatus.driftRisk || 'low')
      latestContinuityStatus = {
        ...latestContinuityStatus,
        threadId: String(meta.threadId || latestContinuityStatus.threadId || ''),
        turnId: String(meta.turnId || turnId || latestContinuityStatus.turnId || ''),
        enabled: true,
        profile,
        phase: 'packet_built',
        tokenBudget: Number(meta.tokenBudget || latestContinuityStatus.tokenBudget || 0) || 0,
        packetTokens: Number(meta.packetTokens || latestContinuityStatus.packetTokens || 0) || 0,
        sourceRefCount: Number(meta.sourceRefCount || latestContinuityStatus.sourceRefCount || 0) || 0,
        driftRisk,
        packetId: String(meta.packetId || latestContinuityStatus.packetId || ''),
        updatedAt: createdAt,
      }
      activity.type = 'info'
      activity.authMethod = String(meta.authMethod || meta?.providerNativeMeta?.authMethod || '').trim().toLowerCase()
      activity.label = `Continuity packet built (${profile})`
      activity.detail = [
        Number(meta.packetTokens || 0) > 0 ? `packet_tokens: ${Number(meta.packetTokens)}` : '',
        Number(meta.tokenBudget || 0) > 0 ? `budget: ${Number(meta.tokenBudget)}` : '',
        Number(meta.sourceRefCount || 0) > 0 ? `source_refs: ${Number(meta.sourceRefCount)}` : '',
        `drift_risk: ${driftRisk}`,
      ].filter(Boolean).join('\n')
    } else if (kind === 'continuity_compaction_applied') {
      latestContinuityStatus = {
        ...latestContinuityStatus,
        enabled: true,
        phase: 'compacted',
        removedMessages: Number(meta.removedMessages || latestContinuityStatus.removedMessages || 0) || 0,
        estimatedBeforeTokens: Number(meta.estimatedBeforeTokens || latestContinuityStatus.estimatedBeforeTokens || 0) || 0,
        estimatedAfterTokens: Number(meta.estimatedAfterTokens || latestContinuityStatus.estimatedAfterTokens || 0) || 0,
        updatedAt: createdAt,
      }
      activity.type = 'info'
      activity.label = `Continuity compaction applied (${Number(meta.removedMessages || 0)} removed)`
      activity.detail = [
        Number(meta.estimatedBeforeTokens || 0) > 0 ? `before: ${Number(meta.estimatedBeforeTokens)}` : '',
        Number(meta.estimatedAfterTokens || 0) > 0 ? `after: ${Number(meta.estimatedAfterTokens)}` : '',
      ].filter(Boolean).join('\n')
      activity.compactionMilestone = true
      activity.compactionMilestoneTitle = 'Context automatically compacted'
      activity.compactionMilestoneDetail = [
        'Continuity engine compaction',
        Number(meta.removedMessages || 0) > 0 ? `${Number(meta.removedMessages)} removed` : '',
      ].filter(Boolean).join(' | ')
      activity.compactionMilestoneTone = 'local'
    } else if (kind === 'continuity_drift_detected') {
      latestContinuityStatus = {
        ...latestContinuityStatus,
        enabled: true,
        driftRisk: String(meta.driftRisk || 'medium'),
        updatedAt: createdAt,
      }
      activity.type = 'warning'
      activity.isError = false
      activity.label = `Continuity warning: drift detected (${String(meta.driftRisk || 'medium')})`
      activity.detail = Number(meta.violationCount || 0) > 0 ? `violations: ${Number(meta.violationCount)}` : ''
    } else if (kind === 'continuity_invariant_violated') {
      activity.type = 'warning'
      activity.isError = false
      activity.label = 'Continuity warning: invariant violated'
      activity.detail = Number(meta.violationCount || 0) > 0 ? `violations: ${Number(meta.violationCount)}` : ''
    } else {
      const moaActivity = buildMoaHydratedActivity(kind, meta)
      if (!moaActivity) continue
      Object.assign(activity, moaActivity)
    }

    pushHydratedActivity(activity, createdAt)
    if (kind === 'openai_continuity_status') {
      for (const nativeActivity of buildOpenAIAccountNativeActivityRows(meta)) {
        pushHydratedActivity(nativeActivity, createdAt)
      }
    }
  }

  for (const { threadId, turnId, messageId, providerId, model, authMethod, transportMode, lastChunkAt } of hydratedExecutionReasoningKeys.values()) {
    liveExecution = markLiveExecutionReasoningDone(liveExecution, {
      threadId,
      turnId,
      messageId,
      streamMeta: {
        threadId,
        turnId,
        providerId,
        model,
        authMethod,
        transportMode,
        completedAt: lastChunkAt,
      },
    })
  }

  return {
    messages,
    toolActivity: toolActivity.length > MAX_TOOL_ACTIVITY_ITEMS
      ? toolActivity.slice(toolActivity.length - MAX_TOOL_ACTIVITY_ITEMS)
      : toolActivity,
    liveExecution,
    timeline: trimTimeline(timeline),
    writeConflicts: dedupeWriteConflicts(writeConflicts),
    pendingQuestionUser,
    pendingPlanDirection: planProjection.pendingPlanDirection,
    planDocumentReady: planProjection.planDocumentReady,
    contextUsage: latestContextUsage,
    costEstimate: latestCostEstimate,
    continuityStatus: latestContinuityStatus,
  }
}
