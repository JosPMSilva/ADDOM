const MAX_WRITE_CONFLICTS = 50

function asTrimmedString(value = '') {
  return String(value || '').trim()
}

function asTimestamp(value = 0, fallback = Date.now()) {
  const numeric = Number(value || 0)
  return numeric > 0 ? numeric : fallback
}

function normalizeMergeProposal(proposal = null) {
  if (!proposal || typeof proposal !== 'object') return null
  return {
    content: typeof proposal.content === 'string' ? proposal.content : '',
    explanation: asTrimmedString(proposal.explanation),
    error: asTrimmedString(proposal.error),
    status: asTrimmedString(proposal.status || 'ready') || 'ready',
    generatedAt: asTimestamp(proposal.generatedAt, Date.now()),
  }
}

export function buildWriteConflictId(conflict = {}) {
  const explicitId = asTrimmedString(conflict.id)
  if (explicitId) return explicitId

  const tuple = [
    asTrimmedString(conflict.threadId),
    asTrimmedString(conflict.turnId),
    asTrimmedString(conflict.filePath),
    asTrimmedString(conflict.newRevId),
    asTrimmedString(conflict.prevRevId),
    asTrimmedString(conflict.conflictBaseRevId),
    asTrimmedString(conflict.conflictActualRevId),
  ]
  if (tuple.some(Boolean)) return `write_conflict:${tuple.join('|')}`

  const eventId = Number(conflict.eventId || 0)
  if (eventId > 0) return `write_conflict:${eventId}`

  return `write_conflict:${asTimestamp(conflict.detectedAt, Date.now())}`
}

export function normalizeWriteConflict(conflict = {}, options = {}) {
  if (!conflict || typeof conflict !== 'object') return null

  const filePath = asTrimmedString(conflict.filePath)
  if (!filePath) return null

  const threadId = asTrimmedString(options.threadId || conflict.threadId)
  return {
    id: buildWriteConflictId({
      ...conflict,
      threadId,
      filePath,
    }),
    threadId,
    turnId: asTrimmedString(conflict.turnId),
    toolName: asTrimmedString(conflict.toolName),
    filePath,
    newRevId: asTrimmedString(conflict.newRevId),
    prevRevId: asTrimmedString(conflict.prevRevId),
    conflictBaseRevId: asTrimmedString(conflict.conflictBaseRevId),
    conflictActualRevId: asTrimmedString(conflict.conflictActualRevId),
    detectedAt: asTimestamp(conflict.detectedAt || conflict.createdAt, Date.now()),
    resolved: conflict.resolved === true,
    mergeProposal: normalizeMergeProposal(conflict.mergeProposal),
  }
}

export function dedupeWriteConflicts(conflicts = [], options = {}) {
  const limit = Number(options.limit || MAX_WRITE_CONFLICTS) || MAX_WRITE_CONFLICTS
  const byId = new Map()

  for (const rawConflict of Array.isArray(conflicts) ? conflicts : []) {
    const normalized = normalizeWriteConflict(rawConflict)
    if (!normalized) continue

    const existing = byId.get(normalized.id)
    if (!existing) {
      byId.set(normalized.id, normalized)
      continue
    }

    byId.set(normalized.id, {
      ...existing,
      ...normalized,
      resolved: existing.resolved === true || normalized.resolved === true,
      mergeProposal: normalized.mergeProposal || existing.mergeProposal || null,
      detectedAt: Math.min(existing.detectedAt || normalized.detectedAt, normalized.detectedAt || existing.detectedAt),
    })
  }

  const ordered = [...byId.values()].sort((a, b) => (
    Number(a.detectedAt || 0) - Number(b.detectedAt || 0)
  ))
  return ordered.length > limit
    ? ordered.slice(ordered.length - limit)
    : ordered
}
