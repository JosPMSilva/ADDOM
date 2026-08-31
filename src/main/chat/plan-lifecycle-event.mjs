import { commitProjectedTimelineEvent } from './canonical-root-event-writer.mjs'

const PLAN_LIFECYCLE_EVENT_CHANNELS = Object.freeze({
  plan_document_ready: 'chat:plan-document-ready',
})

function structuredToolResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null
  if (result.event && typeof result.event === 'object') return result
  if (result.result && typeof result.result === 'object' && !Array.isArray(result.result)) return result.result
  return null
}

export function buildPlanLifecycleProjection(result, stepMeta = {}, fallbackThreadId = '') {
  const structured = structuredToolResult(result)
  const event = structured?.event
  const kind = String(event?.kind || '').trim().toLowerCase()
  if (!kind.startsWith('plan_')) return null
  const plan = structured?.plan && typeof structured.plan === 'object' ? structured.plan : {}
  const rawDocument = structured?.document && typeof structured.document === 'object'
    ? structured.document
    : (event?.document && typeof event.document === 'object' ? event.document : plan.document)
  const document = rawDocument && typeof rawDocument === 'object'
    ? {
        kind: String(rawDocument.kind || 'managed_plan').trim(),
        planId: String(rawDocument.planId || event.planId || plan.planId || '').trim(),
        filePath: String(rawDocument.filePath || '').trim(),
        revision: Number(rawDocument.revision || event.revision || plan.revision || 0) || 0,
      }
    : null
  const payload = {
    ...stepMeta,
    kind,
    planId: String(event.planId || plan.planId || '').trim(),
    revision: Number(event.revision || plan.revision || 0) || 0,
    lifecycle: String(plan.lifecycle || '').trim(),
    projectRoot: String(plan.project || '').trim(),
    threadId: String(plan.threadId || fallbackThreadId || '').trim(),
    ...(document ? { document } : {}),
    ...(String(plan.planId || '').trim() ? { plan: structuredClone(plan) } : {}),
  }
  if (!payload.planId || !payload.threadId) return null
  return {
    kind,
    channel: PLAN_LIFECYCLE_EVENT_CHANNELS[kind] || 'chat:plan-lifecycle-event',
    payload,
  }
}

export function commitPlanLifecycleProjection({
  result, stepMeta, threadId, isError, decision, persistTimelineEvent, send,
} = {}) {
  if (isError || String(decision || '').trim().toLowerCase() !== 'approved') return null
  const projection = buildPlanLifecycleProjection(result, stepMeta, threadId)
  if (!projection) return null
  commitProjectedTimelineEvent({
    persistTimelineEvent,
    send,
    kind: projection.kind,
    options: {
      role: 'assistant',
      content: projection.kind === 'plan_document_ready'
        ? 'Managed plan ready for review.'
        : 'Managed plan lifecycle updated.',
      meta: projection.payload,
    },
    channel: projection.channel,
    payload: projection.payload,
  })
  return projection
}
