import { ATTENTION_PRIORITY, selectAgentDescendantSummary } from './agent-run-selectors.mjs'
import { nodeKey, TERMINAL_STATUSES } from './agent-run-normalizers.mjs'

const PREVIEW_LIMIT = 96

/** Tool kinds that hand work to agents, and therefore mark where children belong in the stream. */
const DELEGATION_TOOL_KINDS = Object.freeze(new Set([
  'delegate_to_agents',
  'delegate_tasks',
  'spawn_agent',
]))

export function isAgentDelegationToolKind(toolKind = '') {
  const normalized = String(toolKind || '').trim().toLowerCase()
  if (!normalized) return false
  return DELEGATION_TOOL_KINDS.has(normalized) || normalized.startsWith('delegate_')
}

function firstLine(value = '') {
  const line = String(value || '')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(Boolean) || ''
  return line.length > PREVIEW_LIMIT ? `${line.slice(0, PREVIEW_LIMIT - 1)}…` : line
}

/**
 * A reference carries the child's identity, truthful status, and one short line of result — never
 * its prose. Reading the child's own words stays a deliberate step into its conversation.
 */
function toReference(state, run, node) {
  const descendants = selectAgentDescendantSummary(state, run.id, node.id)
  const ownPriority = ATTENTION_PRIORITY[node.status] || 0
  const descendantPriority = ATTENTION_PRIORITY[descendants.attentionStatus] || 0
  return {
    key: nodeKey(run.id, node.id),
    runId: run.id,
    nodeId: node.id,
    label: node.roleLabel || node.taskSummary || node.id,
    task: firstLine(node.taskSummary),
    status: node.status,
    attentionStatus: ownPriority >= descendantPriority
      ? (ownPriority > 0 ? node.status : null)
      : descendants.attentionStatus,
    descendantCount: descendants.total,
    preview: firstLine(node.errorSummary || node.resultSummary || ''),
    spawnedAt: Number(node.createdAt || 0),
  }
}

/**
 * Direct children of every run root belonging to this turn. Grandchildren stay inside the child's
 * own conversation so the parent stream never grows a second tree.
 */
export function selectTurnAgentReferences(state, turnId) {
  const turn = String(turnId || '')
  if (!turn) return []
  const references = []
  for (const run of Object.values(state?.runsById || {})) {
    if (String(run?.turnId || '') !== turn) continue
    const childIds = state.childIdsByParent?.[nodeKey(run.id, run.rootNodeId)] || []
    for (const childId of childIds) {
      const node = state.nodesById?.[childId]
      if (node) references.push(toReference(state, run, node))
    }
  }
  return references.sort((left, right) => left.spawnedAt - right.spawnedAt)
}

/**
 * Cheap value that changes only when a reference would render differently, so turn blocks can
 * subscribe to agent state without re-rendering on every unrelated event.
 */
export function agentReferenceFingerprint(state, turnId) {
  const parts = []
  for (const reference of selectTurnAgentReferences(state, turnId)) {
    parts.push([
      reference.key,
      reference.status,
      reference.attentionStatus || '',
      reference.descendantCount,
      reference.preview.length,
    ].join('|'))
  }
  return parts.join('\n')
}

export function allReferencesTerminal(references = []) {
  return references.length > 0 && references.every((reference) => (
    TERMINAL_STATUSES.has(reference.status)
  ))
}

export function highestAttentionStatus(references = []) {
  let status = null
  let highest = 0
  for (const reference of references) {
    const priority = ATTENTION_PRIORITY[reference.attentionStatus] || 0
    if (priority > highest) {
      highest = priority
      status = reference.attentionStatus
    }
  }
  return status
}

function anchorIndexFor(anchors, spawnedAt) {
  let match = -1
  for (const anchor of anchors) {
    if (anchor.startedAt > 0 && anchor.startedAt > spawnedAt) break
    match = anchor.index
  }
  return match
}

/**
 * Places each child reference where its delegation happened rather than at the end of the turn, so
 * the stream reads in the order the work actually occurred. Children with no matching delegation
 * row fall to the end instead of being attached to an unrelated tool.
 */
export function insertAgentReferenceGroups(items = [], references = []) {
  if (references.length === 0) return items
  const anchors = []
  items.forEach((item, index) => {
    if (item?.kind !== 'tool' || !isAgentDelegationToolKind(item.toolKind)) return
    anchors.push({ index, startedAt: Number(item?.expandedEvidence?.startedAt || 0) })
  })

  const byAnchor = new Map()
  const trailing = []
  for (const reference of references) {
    const index = anchors.length === 0 ? -1 : anchorIndexFor(anchors, reference.spawnedAt)
    if (index < 0) {
      trailing.push(reference)
      continue
    }
    if (!byAnchor.has(index)) byAnchor.set(index, [])
    byAnchor.get(index).push(reference)
  }

  const next = []
  items.forEach((item, index) => {
    next.push(item)
    const grouped = byAnchor.get(index)
    if (grouped) {
      next.push({
        id: `agents:${item.id}`,
        kind: 'agents',
        references: grouped,
      })
    }
  })
  if (trailing.length > 0) {
    next.push({ id: 'agents:trailing', kind: 'agents', references: trailing })
  }
  return next
}
