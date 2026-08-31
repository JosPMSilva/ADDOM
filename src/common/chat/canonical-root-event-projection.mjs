function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function projectCanonicalRootEvent(canonical = null) {
  if (!canonical || Number(canonical.schemaVersion || 0) < 1) return null
  const payload = objectValue(canonical.payload)
  const timeline = objectValue(payload.timeline)
  const delivery = objectValue(payload.delivery)
  const kind = String(timeline.kind || canonical.semanticKind || '').trim()
  if (!kind) return null
  const channel = String(delivery.channel || '').trim()
  const timelineMeta = { ...objectValue(timeline.meta) }
  if (
    ['turn_completed', 'turn_cancelled', 'turn_interrupted'].includes(kind)
    && !Number(timelineMeta.finishedAt || 0)
  ) {
    timelineMeta.finishedAt = Number(canonical.updatedAt || canonical.occurredAt || 0)
  }
  const deliveryPayload = { ...objectValue(delivery.payload) }
  const projectionTimestamp = Number(canonical.occurredAt || canonical.updatedAt || 0)
  if (channel === 'chat:done' && !Number(deliveryPayload.emittedAt || 0)) {
    deliveryPayload.emittedAt = projectionTimestamp
  } else if (channel === 'chat:background-response-completed' && !Number(deliveryPayload.completedAt || 0)) {
    deliveryPayload.completedAt = projectionTimestamp
  } else if (channel === 'chat:background-response-failed' && !Number(deliveryPayload.failedAt || 0)) {
    deliveryPayload.failedAt = projectionTimestamp
  }
  if (
    channel === 'chat:turn-state'
    && ['completed', 'cancelled', 'interrupted'].includes(String(deliveryPayload.state || '').toLowerCase())
    && !Number(deliveryPayload.finishedAt || 0)
  ) {
    deliveryPayload.finishedAt = Number(canonical.updatedAt || canonical.occurredAt || 0)
  }
  return {
    timeline: {
      kind,
      role: String(timeline.role || ''),
      content: String(timeline.content ?? timeline.text ?? ''),
      meta: timelineMeta,
    },
    delivery: channel
      ? {
          channel,
          payload: deliveryPayload,
        }
      : null,
  }
}
