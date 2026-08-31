const COMPLIANCE_EVENT_KIND_TO_ACTION = {
  compliance_notice_shown: 'shown',
  compliance_notice_acknowledged: 'acknowledged',
  compliance_notice_skipped: 'skipped',
}

export function normalizeThreadExportOptions(options = {}) {
  const source = options && typeof options === 'object' ? options : {}
  return {
    preserveCitations: source.preserveCitations !== false,
  }
}

export function collectExportProvenance(events = []) {
  const rows = Array.isArray(events) ? events : []
  const byEntry = new Map()

  for (const event of rows) {
    const meta = event?.meta && typeof event.meta === 'object' ? event.meta : {}
    const providerId = String(meta.providerId || '').trim().toLowerCase()
    const model = String(meta.model || '').trim()
    if (!providerId && !model) continue

    const key = `${providerId}::${model}`
    const existing = byEntry.get(key) || {
      providerId,
      model,
      eventKinds: new Set(),
      eventCount: 0,
      firstSeenAt: 0,
      lastSeenAt: 0,
    }
    const createdAt = Number(event?.createdAt || 0) || 0
    existing.eventCount += 1
    if (createdAt > 0 && (!existing.firstSeenAt || createdAt < existing.firstSeenAt)) existing.firstSeenAt = createdAt
    if (createdAt > existing.lastSeenAt) existing.lastSeenAt = createdAt
    const eventKind = String(event?.kind || '').trim()
    if (eventKind) existing.eventKinds.add(eventKind)
    byEntry.set(key, existing)
  }

  const entries = [...byEntry.values()]
    .map((row) => ({
      providerId: row.providerId,
      model: row.model,
      eventCount: row.eventCount,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      eventKinds: [...row.eventKinds],
    }))
    .sort((a, b) => b.eventCount - a.eventCount || a.providerId.localeCompare(b.providerId))

  const uniqueProviders = new Set(entries.map((entry) => String(entry.providerId || '').trim()).filter(Boolean))
  const uniqueProviderModels = new Set(entries.map((entry) => `${entry.providerId}::${entry.model}`))

  return {
    entries,
    providerCount: uniqueProviders.size,
    providerModelCount: uniqueProviderModels.size,
  }
}

export function collectComplianceEventSummary(events = []) {
  const rows = Array.isArray(events) ? events : []
  const counts = {
    shown: 0,
    acknowledged: 0,
    skipped: 0,
    total: 0,
  }
  const byNoticeType = {}

  for (const event of rows) {
    const kind = String(event?.kind || '').trim().toLowerCase()
    const action = COMPLIANCE_EVENT_KIND_TO_ACTION[kind]
    if (!action) continue
    counts[action] += 1
    counts.total += 1
    const meta = event?.meta && typeof event.meta === 'object' ? event.meta : {}
    const noticeType = String(meta.noticeType || 'unspecified').trim().toLowerCase() || 'unspecified'
    if (!byNoticeType[noticeType]) {
      byNoticeType[noticeType] = { shown: 0, acknowledged: 0, skipped: 0, total: 0 }
    }
    byNoticeType[noticeType][action] += 1
    byNoticeType[noticeType].total += 1
  }

  return {
    ...counts,
    byNoticeType,
  }
}

export function buildThreadExportComplianceDisclaimer({
  preserveCitations = true,
} = {}) {
  return {
    text: 'This export may include model outputs and provider metadata. Respect provider terms, including attribution, benchmark, and distillation restrictions.',
    preserveCitations: !!preserveCitations,
    citationGuidance: preserveCitations
      ? 'Citations and attribution-related metadata were preserved where available.'
      : 'Citations preservation was disabled for this export. Verify attribution obligations before reuse.',
  }
}
