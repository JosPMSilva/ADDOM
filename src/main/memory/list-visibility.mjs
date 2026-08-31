export function isDeletedThreadMemoryNode(node) {
  return String(node?.scope || '').trim().toLowerCase() === 'thread'
    && String(node?.originThreadState || '').trim().toLowerCase() === 'deleted'
}

export function buildDeletedThreadVisibilityClause({
  alias = '',
  includeDeletedThreads = false,
} = {}) {
  if (includeDeletedThreads) return '1 = 1'
  const prefix = alias ? `${alias}.` : ''
  return `NOT (${prefix}scope = 'thread' AND ${prefix}origin_thread_state = 'deleted')`
}

export function sortAndFilterMemoryNodes(nodes, {
  includeCompressed = false,
  includeDeletedThreads = false,
} = {}) {
  const rows = Array.isArray(nodes) ? nodes : []

  const filtered = rows.filter((node) => {
    if (!node || typeof node !== 'object') return false
    if (!includeDeletedThreads && isDeletedThreadMemoryNode(node)) return false
    return includeCompressed || !node.compressed
  })

  filtered.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1

    const aSortId = Number(a.sortId || 0)
    const bSortId = Number(b.sortId || 0)
    return bSortId - aSortId
  })

  return filtered
}
