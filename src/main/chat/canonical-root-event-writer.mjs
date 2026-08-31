import crypto from 'node:crypto'

import { projectCanonicalRootEvent } from '../../common/chat/canonical-root-event-projection.mjs'
import {
  appendCanonicalRootEvent,
  appendCanonicalRootEvents,
  listTimeline,
} from '../workspace/workspace-store.mjs'

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function token(value, fallback = 'system_event') {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_.:-]+/g, '_')
  return /^[a-z]/.test(normalized) ? normalized.slice(0, 120) : fallback
}

function phaseForKind(kind = '') {
  const normalized = token(kind)
  if (normalized === 'user_message') return 'input'
  if (normalized === 'assistant_message') return 'final_answer'
  if (normalized.includes('reasoning')) return 'reasoning'
  if (normalized.includes('commentary')) return 'commentary'
  if (normalized.startsWith('turn_')) return 'lifecycle'
  if (
    normalized.includes('tool')
    || normalized === 'file_change'
    || normalized === 'write_conflict'
    || normalized === 'artifact_tracking'
  ) return 'tool'
  return 'system'
}

function lifecycleForEvent(kind = '', meta = {}) {
  const normalized = token(kind)
  const state = String(meta.state || '').trim().toLowerCase()
  const status = String(meta.status || '').trim().toLowerCase()
  if (normalized === 'turn_started') return 'active'
  if (normalized === 'turn_cancelled' || state === 'cancelled') return 'cancelled'
  if (normalized === 'turn_interrupted' || state === 'interrupted') return 'interrupted'
  if (normalized === 'turn_completed' || state === 'completed') {
    if (status === 'error' || status === 'failed') return 'failed'
    if (status === 'cancelled') return 'cancelled'
    if (status === 'interrupted') return 'interrupted'
    return 'succeeded'
  }
  if (normalized === 'chat_error') return 'failed'
  if (normalized === 'tool_result') return meta.isError === true ? 'failed' : 'succeeded'
  if (normalized === 'turn_phase') return 'active'
  return 'completed'
}

function terminalState(state = '') {
  return ['completed', 'cancelled', 'interrupted'].includes(String(state || '').trim().toLowerCase())
}

function turnStateKind(state = '') {
  const normalized = String(state || '').trim().toLowerCase()
  if (normalized === 'started') return 'turn_started'
  if (normalized === 'completed') return 'turn_completed'
  if (normalized === 'cancelled') return 'turn_cancelled'
  if (normalized === 'interrupted') return 'turn_interrupted'
  return 'turn_phase'
}

function turnStateContent(state = '', data = {}) {
  const normalized = String(state || '').trim().toLowerCase()
  if (normalized === 'started') return 'Turn started.'
  if (normalized === 'cancelled') return `Stop requested: ${String(data.reason || 'Stopped by user.')}`
  if (normalized === 'interrupted') return 'Turn interrupted before completion.'
  if (normalized === 'completed') return `Turn completed (${String(data.status || 'ok')}).`
  return `Turn phase: ${String(data.label || data.status || normalized).trim()}.`
}

function timelineRecord(event = {}) {
  const canonicalProjection = projectCanonicalRootEvent(event?.canonical)
  if (canonicalProjection?.timeline) return canonicalProjection.timeline
  return {
    kind: String(event?.kind || ''),
    role: String(event?.role || ''),
    content: String(event?.content || ''),
    meta: objectValue(event?.meta),
  }
}

export function buildRootMutationSummary(events = [], { turnId = '' } = {}) {
  const normalizedTurnId = String(turnId || '').trim()
  const filePaths = new Set()
  let toolEffectCount = 0
  for (const event of Array.isArray(events) ? events : []) {
    if (normalizedTurnId && String(event?.turnId || event?.canonical?.turnId || '') !== normalizedTurnId) continue
    const record = timelineRecord(event)
    const meta = objectValue(record.meta)
    if (record.kind === 'file_change') {
      const filePath = String(meta.filePath || '').trim()
      if (filePath) filePaths.add(filePath)
      continue
    }
    if (record.kind !== 'tool_result' || meta.isError === true || String(meta.decision || '').toLowerCase() !== 'approved') continue
    toolEffectCount += 1
    const changes = [meta.fileChange, ...(Array.isArray(meta.fileChanges) ? meta.fileChanges : [])]
    for (const change of changes) {
      const filePath = String(change?.filePath || '').trim()
      if (filePath) filePaths.add(filePath)
    }
  }
  return {
    hasPreservedEffects: filePaths.size > 0 || toolEffectCount > 0,
    fileChangeCount: filePaths.size,
    toolEffectCount,
    filePaths: [...filePaths].sort(),
  }
}

export function commitProjectedTimelineEvent({
  persistTimelineEvent = () => {},
  send = () => {},
  kind = '',
  options = {},
  channel = '',
  payload = {},
} = {}) {
  if (typeof persistTimelineEvent.commitAndProject === 'function') {
    return persistTimelineEvent.commitAndProject(kind, options, { channel, payload })
  }
  const result = persistTimelineEvent(kind, options)
  send(channel, payload)
  return result
}

export function createCanonicalRootEventWriter({
  projectId = '',
  threadId = '',
  turnId = '',
  assistantMessageId = '',
  providerId = '',
  transport = '',
  runtime = '',
  send = () => {},
  now = Date.now,
  idFactory = () => crypto.randomUUID(),
  appendOne = appendCanonicalRootEvent,
  appendMany = appendCanonicalRootEvents,
  listRecords = listTimeline,
} = {}) {
  const scope = {
    projectId: String(projectId || '').trim(),
    threadId: String(threadId || '').trim(),
    turnId: String(turnId || '').trim(),
  }

  function stableId(kind, meta = {}, explicitId = '') {
    const requested = String(explicitId || meta.canonicalEventId || '').trim()
    if (requested) return requested.slice(0, 512)
    const normalizedKind = token(kind)
    if (normalizedKind === 'assistant_message') {
      const messageId = String(meta.assistantMessageId || assistantMessageId || 'final').trim()
      return `root:${scope.turnId}:assistant:${messageId}`.slice(0, 512)
    }
    if (normalizedKind === 'turn_completed' || normalizedKind === 'turn_cancelled' || normalizedKind === 'turn_interrupted') {
      return `root:${scope.turnId}:terminal`.slice(0, 512)
    }
    if (normalizedKind === 'turn_started') return `root:${scope.turnId}:started`.slice(0, 512)
    return `root:${scope.turnId}:${normalizedKind}:${idFactory()}`.slice(0, 512)
  }

  function buildDraft(kind, {
    role = '',
    content = '',
    meta = {},
    turn = scope.turnId,
    delivery = null,
    canonicalEventId = '',
    semanticKind = '',
    phase = '',
    lifecycle = '',
    progressiveKey = '',
  } = {}) {
    const eventMeta = objectValue(meta)
    const effectiveTurnId = String(turn || scope.turnId).trim()
    const occurredAt = Number(eventMeta.emittedAt || eventMeta.finishedAt || eventMeta.startedAt || now()) || now()
    const normalizedRole = String(role || '')
    const actorKind = normalizedRole === 'assistant' ? 'root' : 'system'
    const actorId = normalizedRole === 'user' ? 'user' : actorKind
    const normalizedKind = token(kind)
    const deliveryValue = objectValue(delivery)
    const storedMeta = { ...eventMeta }
    if (['turn_completed', 'turn_cancelled', 'turn_interrupted'].includes(normalizedKind)) {
      delete storedMeta.finishedAt
    }
    const storedDeliveryPayload = { ...objectValue(deliveryValue.payload) }
    delete storedDeliveryPayload.emittedAt
    delete storedDeliveryPayload.completedAt
    delete storedDeliveryPayload.failedAt
    delete storedDeliveryPayload.queuedAt
    return {
      canonicalEventId: stableId(normalizedKind, eventMeta, canonicalEventId),
      projectId: scope.projectId,
      conversationId: scope.threadId,
      threadId: scope.threadId,
      turnId: effectiveTurnId,
      occurredAt,
      source: {
        providerId: String(eventMeta.providerId || providerId || '').trim(),
        transport: String(eventMeta.transportMode || eventMeta.transport || transport || '').trim(),
        runtime: String(eventMeta.runtime || eventMeta.executionOwner || runtime || '').trim(),
        providerEventId: String(eventMeta.providerEventId || '').trim(),
        providerCorrelationKey: String(eventMeta.providerCorrelationKey || eventMeta.responseId || '').trim(),
      },
      actor: {
        kind: actorKind,
        id: actorId,
        conversationId: actorKind === 'root' ? scope.threadId : '',
        runId: '',
      },
      semanticKind: token(semanticKind || normalizedKind),
      phase: phase || phaseForKind(normalizedKind),
      lifecycle: lifecycle || lifecycleForEvent(normalizedKind, eventMeta),
      payload: {
        timeline: {
          kind: normalizedKind,
          role: normalizedRole,
          content: String(content ?? ''),
          meta: storedMeta,
        },
        ...(deliveryValue.channel
          ? {
              delivery: {
                channel: String(deliveryValue.channel),
                payload: storedDeliveryPayload,
              },
            }
          : {}),
      },
      supportDecision: 'supported',
      progressiveKey: String(progressiveKey || '').trim(),
    }
  }

  function projectCommitted(result, fallbackDraft) {
    if (!result || (result.inserted !== true && result.advanced !== true)) return false
    const projection = projectCanonicalRootEvent(result.event?.canonical || fallbackDraft)
    if (!projection?.delivery) return true
    send(projection.delivery.channel, projection.delivery.payload)
    return true
  }

  function persistTimelineEvent(kind, options = {}) {
    const draft = buildDraft(kind, options)
    return appendOne(scope.threadId, draft)
  }

  function commitAndProject(kind, options = {}, delivery = null) {
    const draft = buildDraft(kind, { ...options, delivery })
    const result = appendOne(scope.threadId, draft)
    projectCommitted(result, draft)
    return result
  }

  function commitBatch(specs = []) {
    const drafts = specs.map((spec) => buildDraft(spec.kind, spec.options))
    const results = appendMany(scope.threadId, drafts)
    for (let index = 0; index < drafts.length; index += 1) {
      projectCommitted(results[index], drafts[index])
    }
    return results
  }

  function commitTurnState(state = '', data = {}) {
    const normalizedState = String(state || '').trim().toLowerCase()
    if (!normalizedState) return null
    const kind = turnStateKind(normalizedState)
    const payload = {
      threadId: scope.threadId,
      turnId: scope.turnId,
      state: normalizedState,
      ...objectValue(data),
    }
    return commitAndProject(kind, {
      role: 'system',
      content: turnStateContent(normalizedState, payload),
      meta: payload,
      semanticKind: 'turn_state',
      lifecycle: lifecycleForEvent(kind, payload),
      canonicalEventId: terminalState(normalizedState) ? `root:${scope.turnId}:terminal` : '',
    }, { channel: 'chat:turn-state', payload })
  }

  function commitFinalTurn({
    donePayload = {},
    assistantMeta = {},
    terminalPayload = {},
    doneChannel = 'chat:done',
  } = {}) {
    const normalizedDone = objectValue(donePayload)
    const normalizedTerminal = {
      threadId: scope.threadId,
      turnId: scope.turnId,
      state: 'completed',
      status: 'ok',
      ...objectValue(terminalPayload),
    }
    return commitBatch([
      {
        kind: 'assistant_message',
        options: {
          role: 'assistant',
          content: String(normalizedDone.full || ''),
          meta: objectValue(assistantMeta),
          semanticKind: 'assistant_final',
          phase: 'final_answer',
          lifecycle: 'completed',
          delivery: { channel: String(doneChannel || 'chat:done'), payload: normalizedDone },
        },
      },
      {
        kind: 'turn_completed',
        options: {
          role: 'system',
          content: turnStateContent('completed', normalizedTerminal),
          meta: normalizedTerminal,
          semanticKind: 'turn_state',
          phase: 'lifecycle',
          lifecycle: lifecycleForEvent('turn_completed', normalizedTerminal),
          canonicalEventId: `root:${scope.turnId}:terminal`,
          delivery: { channel: 'chat:turn-state', payload: normalizedTerminal },
        },
      },
    ])
  }

  function commitCancellationTurn({ reason = '', turnStatePayload = {} } = {}) {
    const normalizedReason = String(reason || 'Stopped by user.')
    const terminal = {
      threadId: scope.threadId,
      turnId: scope.turnId,
      state: 'cancelled',
      status: 'cancelled',
      reason: normalizedReason,
      ...objectValue(turnStatePayload),
    }
    return commitBatch([
      {
        kind: 'chat_cancelled',
        options: {
          role: 'system',
          content: normalizedReason,
          meta: { reason: normalizedReason },
          delivery: {
            channel: 'chat:cancelled',
            payload: { reason: normalizedReason, threadId: scope.threadId, turnId: scope.turnId },
          },
        },
      },
      {
        kind: 'turn_cancelled',
        options: {
          role: 'system',
          content: turnStateContent('cancelled', terminal),
          meta: terminal,
          semanticKind: 'turn_state',
          phase: 'lifecycle',
          lifecycle: 'cancelled',
          canonicalEventId: `root:${scope.turnId}:terminal`,
          delivery: { channel: 'chat:turn-state', payload: terminal },
        },
      },
    ])
  }

  function commitFailureTurn({
    message = '',
    reason = '',
    errorMeta = {},
    terminalPayload = {},
    errorChannel = 'chat:error',
    errorPayload = null,
  } = {}) {
    const mutationSummary = buildRootMutationSummary(listRecords(scope.threadId, { limit: 5000 }), {
      turnId: scope.turnId,
    })
    const baseMessage = String(message || 'The turn could not be completed.').trim()
    const visibleMessage = mutationSummary.fileChangeCount > 0
      ? `${baseMessage} File changes from this turn were preserved; review Changes before retrying.`
      : (mutationSummary.toolEffectCount > 0
          ? `${baseMessage} Completed tool effects were preserved; review the turn runbook before retrying.`
          : baseMessage)
    const persistedErrorMeta = {
      threadId: scope.threadId,
      turnId: scope.turnId,
      reason: String(reason || '').trim(),
      mutationSummary,
      ...objectValue(errorMeta),
    }
    const terminal = {
      threadId: scope.threadId,
      turnId: scope.turnId,
      state: 'completed',
      status: 'error',
      reason: String(reason || visibleMessage).trim(),
      mutationSummary,
      ...objectValue(terminalPayload),
    }
    const results = commitBatch([
      {
        kind: 'chat_error',
        options: {
          role: 'system',
          content: visibleMessage,
          meta: persistedErrorMeta,
          semanticKind: 'turn_failure',
          phase: 'lifecycle',
          lifecycle: 'failed',
          delivery: {
            channel: String(errorChannel || 'chat:error'),
            payload: errorPayload && typeof errorPayload === 'object'
              ? { ...errorPayload, message: visibleMessage }
              : { message: visibleMessage },
          },
        },
      },
      {
        kind: 'turn_completed',
        options: {
          role: 'system',
          content: turnStateContent('completed', terminal),
          meta: terminal,
          semanticKind: 'turn_state',
          phase: 'lifecycle',
          lifecycle: 'failed',
          canonicalEventId: `root:${scope.turnId}:terminal`,
          delivery: { channel: 'chat:turn-state', payload: terminal },
        },
      },
    ])
    return { results, mutationSummary, message: visibleMessage }
  }

  return {
    buildDraft,
    persistTimelineEvent,
    commitAndProject,
    commitTurnState,
    commitFinalTurn,
    commitCancellationTurn,
    commitFailureTurn,
  }
}
