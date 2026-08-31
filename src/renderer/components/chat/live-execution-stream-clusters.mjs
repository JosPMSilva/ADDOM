import { resolveExecutionToolLabelParts, resolveShortToolIdentity } from './live-execution-stream-labels.mjs'

const SETTLED_STATES = new Set(['succeeded', 'done', 'completed', 'success', 'failed', 'error', 'cancelled', 'canceled', 'interrupted'])
const DEFAULT_CLUSTER_THRESHOLD = 3
/** Enrich L1 with short identities when the non-ghost cluster is this size or smaller. */
const SMALL_CLUSTER_IDENTITY_LIMIT = 3

const KIND_PART_ORDER = [
  'file_edit',
  'file_write',
  'file_read',
  'file_delete',
  'search',
  'command',
  'web',
  'browser',
  'agent',
  'plan',
  'tool',
]

function normalizeState(value = '') {
  return String(value || '').trim().toLowerCase()
}

function isSettledToolItem(item = {}) {
  return item?.kind === 'tool' && SETTLED_STATES.has(normalizeState(item?.state))
}

function groupItemsByToolKind(items = []) {
  const groups = new Map()
  for (const item of items) {
    const kind = String(item?.toolKind || 'tool').trim().toLowerCase()
    const key = KIND_PART_ORDER.includes(kind) ? kind : 'tool'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return groups
}

function resolveClusterItemIdentity(item = {}) {
  const existing = String(item?.identity || '').trim()
  if (existing) return existing
  const inputDetail = String(
    item?.inputDetail
    || item?.expandedEvidence?.input
    || '',
  ).trim()
  return resolveShortToolIdentity(item?.toolKind, inputDetail)
}

function formatCountPart(kind = 'tool', count = 0) {
  if (count <= 0) return ''
  if (kind === 'file_edit') return `Edited ${count} file${count === 1 ? '' : 's'}`
  if (kind === 'file_write') return `Wrote ${count} file${count === 1 ? '' : 's'}`
  if (kind === 'file_read') return `Read ${count} file${count === 1 ? '' : 's'}`
  if (kind === 'file_delete') return `Deleted ${count} file${count === 1 ? '' : 's'}`
  if (kind === 'search') return `${count} search${count === 1 ? '' : 'es'}`
  if (kind === 'command') return `Ran ${count} command${count === 1 ? '' : 's'}`
  if (kind === 'web') return `${count} fetch${count === 1 ? '' : 'es'}`
  if (kind === 'browser') return `${count} browser action${count === 1 ? '' : 's'}`
  if (kind === 'agent') return `Ran ${count} agent${count === 1 ? '' : 's'}`
  if (kind === 'plan') return 'Updated plan'
  return `Ran ${count} tool${count === 1 ? '' : 's'}`
}

function formatKindClusterPart(kind = 'tool', items = [], { enrichIdentities = false } = {}) {
  const count = items.length
  if (count <= 0) return ''
  if (enrichIdentities && count === 1) {
    const item = items[0] || {}
    const identity = resolveClusterItemIdentity(item)
    if (identity) {
      const inputDetail = String(
        item?.inputDetail
        || item?.expandedEvidence?.input
        || identity,
      ).trim()
      const parts = resolveExecutionToolLabelParts({
        toolKind: kind,
        state: String(item?.state || 'succeeded'),
        inputDetail,
      })
      if (parts?.label) return parts.label
    }
  }
  return formatCountPart(kind, count)
}

/** Empty interrupted/cancelled ghosts must not inflate L1 "N failed". */
function isEmptyIdentityFailure(item = {}) {
  const state = normalizeState(item?.state)
  if (state !== 'interrupted' && state !== 'cancelled' && state !== 'canceled') return false
  const identity = String(item?.identity || '').trim()
  const input = String(
    item?.inputDetail
    || item?.expandedEvidence?.input
    || '',
  ).trim()
  return !identity && !input
}

export function formatToolClusterSummary(items = []) {
  const source = (Array.isArray(items) ? items : []).filter((item) => !isEmptyIdentityFailure(item))
  if (source.length === 0) return 'Ran 0 tools'

  const failedItems = source.filter((item) => {
    const state = normalizeState(item?.state)
    return state === 'failed'
      || state === 'error'
      || state === 'cancelled'
      || state === 'canceled'
      || state === 'interrupted'
  })
  const failedCount = failedItems.length
  if (failedCount === source.length) {
    return `${failedCount} tool${failedCount === 1 ? '' : 's'} failed`
  }

  const succeededItems = source.filter((item) => !failedItems.includes(item))
  const enrichIdentities = succeededItems.length > 0
    && succeededItems.length <= SMALL_CLUSTER_IDENTITY_LIMIT
  const groups = groupItemsByToolKind(succeededItems)
  const parts = []
  for (const kind of KIND_PART_ORDER) {
    const group = groups.get(kind)
    if (!group?.length) continue
    const part = formatKindClusterPart(kind, group, { enrichIdentities })
    if (part) parts.push(part)
  }
  if (failedCount > 0) parts.push(`${failedCount} failed`)
  return parts.join(', ') || `Ran ${source.length} tool${source.length === 1 ? '' : 's'}`
}

/**
 * Project L2 items into L1 clusters for settled contiguous tool runs.
 * Breaks on commentary/reasoning/stage/active tools.
 */
export function projectExecutionStreamClusters(items = [], {
  threshold = DEFAULT_CLUSTER_THRESHOLD,
  collapseSettled = true,
} = {}) {
  const source = Array.isArray(items) ? items : []
  if (!collapseSettled || source.length === 0) return source.map((item) => ({ ...item }))

  const projected = []
  let index = 0
  while (index < source.length) {
    const item = source[index]
    if (!isSettledToolItem(item)) {
      projected.push({ ...item })
      index += 1
      continue
    }

    let end = index
    while (end < source.length && isSettledToolItem(source[end])) end += 1
    const clusterItems = source.slice(index, end)
    if (clusterItems.length < threshold) {
      for (const entry of clusterItems) projected.push({ ...entry })
    } else {
      const firstId = String(clusterItems[0]?.id || 'tool')
      const lastId = String(clusterItems[clusterItems.length - 1]?.id || firstId)
      projected.push({
        id: `cluster:${firstId}:${lastId}:${clusterItems.length}`,
        kind: 'cluster',
        label: formatToolClusterSummary(clusterItems),
        statusMark: '',
        accessibleStatus: '',
        expandable: true,
        items: clusterItems.map((entry) => ({ ...entry })),
      })
    }
    index = end
  }
  return projected
}
