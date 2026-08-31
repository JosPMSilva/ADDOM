import { nodeKey, presentationKey, scopeKey, TERMINAL_STATUSES } from './agent-run-normalizers.mjs'
import { ATTENTION_PRIORITY } from './agent-run-selectors.mjs'

export const NAVIGATOR_VIRTUALIZE_MIN_ROWS = 40
export const DEFAULT_COMPLETED_BATCH_SIZE = 5
export const MAX_NAVIGATOR_INDENT = 4

const ACTIVE = 'active'
const DONE = 'done'

/**
 * A node belongs to the section its own status describes, so a background child that outlives a
 * finished parent still reads as active work. Failed agents stay in Done because they are finished,
 * and carry attention state instead of being promoted into the live section.
 */
function sectionOf(node) {
  return TERMINAL_STATUSES.has(node?.status) ? DONE : ACTIVE
}

function attentionOf(status) {
  return ATTENTION_PRIORITY[status] ? status : null
}

function higherAttention(left, right) {
  return (ATTENTION_PRIORITY[right] || 0) > (ATTENTION_PRIORITY[left] || 0) ? right : left
}

function collectRunNodes(state, run) {
  const rows = []
  const queue = [...(state.childIdsByParent[nodeKey(run.id, run.rootNodeId)] || [])]
  while (queue.length > 0) {
    const node = state.nodesById[queue.shift()]
    if (!node || node.runId !== run.id) continue
    rows.push(node)
    queue.push(...(state.childIdsByParent[nodeKey(run.id, node.id)] || []))
  }
  return rows
}

function conversationIdentity(node) {
  const conversationId = String(node?.conversationId || '').trim()
  return conversationId
    ? `conversation:${conversationId}`
    : `node:${String(node?.runId || '')}:${String(node?.id || '')}`
}

function compareCreated(left, right) {
  return Number(left?.createdAt || 0) - Number(right?.createdAt || 0)
    || String(left?.id || '').localeCompare(String(right?.id || ''))
}

function compareLatest(left, right) {
  return Number(right?.finishedAt || right?.startedAt || right?.createdAt || 0)
    - Number(left?.finishedAt || left?.startedAt || left?.createdAt || 0)
    || String(right?.id || '').localeCompare(String(left?.id || ''))
}

/**
 * Execution nodes are attempts at work; a durable conversation may own several of them as the
 * user sends follow-up turns. Collapse those executions before building navigator hierarchy so
 * the rail continues to represent addressable child conversations.
 */
function collectConversationGroups(state, runs) {
  const nodes = runs.flatMap((run) => collectRunNodes(state, run))
  const identityByNodeId = new Map(nodes.map((node) => [node.id, conversationIdentity(node)]))
  const grouped = new Map()
  for (const node of nodes) {
    const identityKey = identityByNodeId.get(node.id)
    const group = grouped.get(identityKey) || { identityKey, members: [] }
    group.members.push(node)
    grouped.set(identityKey, group)
  }

  for (const group of grouped.values()) {
    group.members.sort(compareCreated)
    group.canonical = group.members[0]
    group.statusSource = group.members
      .filter((node) => !TERMINAL_STATUSES.has(node.status))
      .sort(compareLatest)[0]
      || group.members.slice().sort(compareLatest)[0]
    group.parentIdentityKey = null
    for (const member of group.members) {
      const parentIdentityKey = identityByNodeId.get(member.parentNodeId) || null
      if (parentIdentityKey && parentIdentityKey !== group.identityKey) {
        group.parentIdentityKey = parentIdentityKey
        break
      }
    }
  }
  return [...grouped.values()]
}

/** The nearest ancestor rendered in the same section, or null when the group is section top-level. */
function sectionParentKey(groupsByKey, group, section) {
  let current = group.parentIdentityKey
  while (current) {
    const parent = groupsByKey.get(current)
    if (!parent) return null
    if (sectionOf(parent.statusSource) === section) return parent.identityKey
    current = parent.parentIdentityKey
  }
  return null
}

/** Ancestors of the selected conversation expand by default so a deep selection is reachable. */
function defaultExpandedIds(groupsByKey, selectedIdentityKey) {
  const ids = new Set()
  let current = groupsByKey.get(selectedIdentityKey)?.parentIdentityKey
  while (current) {
    const parent = groupsByKey.get(current)
    if (!parent) break
    ids.add(parent.canonical.id)
    current = parent.parentIdentityKey
  }
  return ids
}

function resolveExpansion(presentation, defaults) {
  const explicitExpanded = new Set(presentation.expandedNodeIds || [])
  const explicitCollapsed = new Set(presentation.collapsedNodeIds || [])
  return (nodeId) => {
    if (explicitExpanded.has(nodeId)) return true
    if (explicitCollapsed.has(nodeId)) return false
    return defaults.has(nodeId)
  }
}

function buildRow(group, { section, depth, expanded, selected, hasChildren, hidden, now }) {
  const node = group.canonical
  const statusSource = group.statusSource
  const terminal = TERMINAL_STATUSES.has(statusSource.status)
  const capability = node.capabilitySnapshot || {}
  const timestamp = Number(
    statusSource.finishedAt || statusSource.startedAt || statusSource.createdAt || node.createdAt || 0,
  )
  return {
    key: group.identityKey,
    runId: node.runId,
    nodeId: node.id,
    conversationId: String(node.conversationId || ''),
    memberNodeIds: group.members.map((member) => member.id),
    section,
    depth,
    indent: Math.min(depth, MAX_NAVIGATOR_INDENT),
    label: node.roleLabel || node.taskSummary || node.id,
    preview: terminal
      ? statusSource.errorSummary || statusSource.resultSummary || statusSource.taskSummary || ''
      : statusSource.taskSummary || '',
    status: statusSource.status,
    attentionStatus: attentionOf(statusSource.status),
    selected,
    expanded,
    hasChildren,
    hiddenDescendantCount: hidden.count,
    hiddenAttentionStatus: hidden.attentionStatus,
    opaque: capability.mode === 'provider_opaque',
    visibilityReason: capability.visibilityReason || null,
    ageMs: timestamp > 0 ? Math.max(0, Number(now) - timestamp) : null,
  }
}

function forestFor(groups, groupsByKey, section) {
  const members = groups.filter((group) => sectionOf(group.statusSource) === section)
  const memberIds = new Set(members.map((group) => group.identityKey))
  const childrenByParent = new Map()
  const roots = []
  for (const group of members) {
    const parentId = sectionParentKey(groupsByKey, group, section)
    if (parentId && memberIds.has(parentId)) {
      childrenByParent.set(parentId, [...(childrenByParent.get(parentId) || []), group])
      continue
    }
    roots.push(group)
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort((left, right) => (
      compareCreated(left.canonical, right.canonical)
    ))
  }
  return { roots, childrenByParent }
}

function hiddenSummary(forest, group) {
  let count = 0
  let attentionStatus = null
  const stack = [...(forest.childrenByParent.get(group.identityKey) || [])]
  while (stack.length > 0) {
    const descendant = stack.pop()
    count += 1
    attentionStatus = higherAttention(
      attentionStatus,
      attentionOf(descendant.statusSource.status),
    )
    stack.push(...(forest.childrenByParent.get(descendant.identityKey) || []))
  }
  return { count, attentionStatus }
}

function emitBranch(forest, group, context, rows) {
  const { depth, isExpanded, selectedNodeId, section, now } = context
  const children = forest.childrenByParent.get(group.identityKey) || []
  const expanded = children.length > 0 && isExpanded(group.canonical.id)
  rows.push(buildRow(group, {
    section,
    depth,
    expanded,
    selected: group.members.some((member) => selectedNodeId === member.id),
    hasChildren: children.length > 0,
    hidden: expanded ? { count: 0, attentionStatus: null } : hiddenSummary(forest, group),
    now,
  }))
  if (!expanded) return
  for (const child of children) {
    emitBranch(forest, child, { ...context, depth: depth + 1 }, rows)
  }
}

function threadRuns(state, projectId, threadId) {
  return (state.runIdsByScope[scopeKey(projectId, threadId)] || [])
    .map((runId) => state.runsById[runId])
    .filter((run) => run && run.threadId === threadId)
    .sort((left, right) => (
      Number(left.createdAt || 0) - Number(right.createdAt || 0)
      || String(left.id).localeCompare(String(right.id))
    ))
}

/**
 * Projects every agent in a thread into the two-section navigator model. Roots are omitted because
 * the root conversation is the thread itself, not a delegated agent.
 */
export function selectAgentNavigatorModel(state, { projectId, threadId, now = Date.now() } = {}) {
  const runs = threadRuns(state, projectId, threadId)
  const groups = collectConversationGroups(state, runs)
  const groupsByKey = new Map(groups.map((group) => [group.identityKey, group]))
  const active = []
  const doneBranches = []
  let batchSize = 0
  const presentations = []
  for (const run of runs) {
    const presentation = state.presentationByScope[presentationKey(threadId, run.id)] || {}
    presentations.push(presentation)
    batchSize = Math.max(batchSize, Number(presentation.completedBatchSize || 0))
  }

  const selectedNodeId = presentations
    .map((presentation) => String(presentation.selectedNodeId || ''))
    .find(Boolean) || ''
  const selectedIdentityKey = groups.find((group) => (
    group.members.some((member) => member.id === selectedNodeId)
  ))?.identityKey || ''
  const mergedPresentation = {
    expandedNodeIds: presentations.flatMap((entry) => entry.expandedNodeIds || []),
    collapsedNodeIds: presentations.flatMap((entry) => entry.collapsedNodeIds || []),
  }
  const isExpanded = resolveExpansion(
    mergedPresentation,
    defaultExpandedIds(groupsByKey, selectedIdentityKey),
  )

  const activeForest = forestFor(groups, groupsByKey, ACTIVE)
  activeForest.roots.sort((left, right) => compareCreated(left.canonical, right.canonical))
  for (const group of activeForest.roots) {
    emitBranch(activeForest, group, {
      depth: 0, isExpanded, selectedNodeId, section: ACTIVE, now,
    }, active)
  }

  const doneForest = forestFor(groups, groupsByKey, DONE)
  doneForest.roots.sort((left, right) => compareLatest(left.statusSource, right.statusSource))
  for (const group of doneForest.roots) {
    const rows = []
    emitBranch(doneForest, group, {
      depth: 0, isExpanded, selectedNodeId, section: DONE, now,
    }, rows)
    doneBranches.push({
      finishedAt: Number(group.statusSource.finishedAt || 0),
      rows,
    })
  }

  doneBranches.sort((left, right) => right.finishedAt - left.finishedAt)
  const visibleBatch = Math.max(batchSize, DEFAULT_COMPLETED_BATCH_SIZE)
  const done = doneBranches.slice(0, visibleBatch).flatMap((branch) => branch.rows)
  const visibleRowCount = active.length + done.length

  return {
    active,
    done,
    runIds: runs.map((run) => run.id),
    doneTotal: doneBranches.length,
    doneHidden: Math.max(0, doneBranches.length - visibleBatch),
    visibleRowCount,
    virtualize: visibleRowCount > NAVIGATOR_VIRTUALIZE_MIN_ROWS,
    isEmpty: groups.length === 0,
  }
}

/** Records explicit disclosure intent so a manual choice survives live updates and remounts. */
export function nextNavigatorExpansion(presentation = {}, nodeId, expanded) {
  const id = String(nodeId || '')
  const expandedNodeIds = new Set(presentation.expandedNodeIds || [])
  const collapsedNodeIds = new Set(presentation.collapsedNodeIds || [])
  expandedNodeIds.delete(id)
  collapsedNodeIds.delete(id)
  if (expanded) expandedNodeIds.add(id)
  else collapsedNodeIds.add(id)
  return {
    expandedNodeIds: [...expandedNodeIds],
    collapsedNodeIds: [...collapsedNodeIds],
  }
}
