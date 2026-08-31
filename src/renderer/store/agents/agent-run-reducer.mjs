import {
  nodeKey,
  normalizeAgentRunSnapshot,
  presentationKey,
  scopeKey,
  TERMINAL_STATUSES,
} from './agent-run-normalizers.mjs'

function withoutRun(index, runId) {
  return Object.fromEntries(
    Object.entries(index).filter(([, row]) => row?.runId !== runId),
  )
}

function withoutRunKeys(index, runId) {
  const prefix = `${runId}:`
  return Object.fromEntries(
    Object.entries(index).filter(([key]) => key !== runId && !key.startsWith(prefix)),
  )
}

function mergeRunIds(current, run) {
  const key = scopeKey(run.projectId, run.threadId)
  return {
    ...current,
    [key]: [...new Set([...(current[key] || []), run.id])],
  }
}

function mergeActiveRunIds(current, run) {
  const key = scopeKey(run.projectId, run.threadId)
  const ids = new Set(current[key] || [])
  if (TERMINAL_STATUSES.has(run.status)) ids.delete(run.id)
  else ids.add(run.id)
  return { ...current, [key]: [...ids] }
}

function applyEntityPayload(state, event) {
  const payload = event.payload && typeof event.payload === 'object' ? event.payload : {}
  const next = { ...state }
  if (payload.run?.id) {
    next.runsById = { ...next.runsById, [payload.run.id]: { ...payload.run } }
    next.runIdsByScope = mergeRunIds(next.runIdsByScope, payload.run)
    next.activeRunIdsByScope = mergeActiveRunIds(next.activeRunIdsByScope, payload.run)
  }
  const nodes = [payload.rootNode, payload.node].filter((row) => row?.id)
  for (const node of nodes) {
    next.nodesById = { ...next.nodesById, [node.id]: { ...node } }
    if (node.parentNodeId) {
      const key = nodeKey(node.runId, node.parentNodeId)
      next.childIdsByParent = {
        ...next.childIdsByParent,
        [key]: [...new Set([...(next.childIdsByParent[key] || []), node.id])],
      }
    }
  }
  if (payload.attempt?.id) {
    next.attemptsById = {
      ...next.attemptsById,
      [payload.attempt.id]: { ...payload.attempt },
    }
    const key = nodeKey(payload.attempt.runId, payload.attempt.nodeId)
    next.attemptIdsByNode = {
      ...next.attemptIdsByNode,
      [key]: [...new Set([...(next.attemptIdsByNode[key] || []), payload.attempt.id])],
    }
  }
  return next
}

export function createAgentRunState() {
  return {
    runsById: {},
    nodesById: {},
    attemptsById: {},
    approvalsById: {},
    artifactsById: {},
    childIdsByParent: {},
    attemptIdsByNode: {},
    approvalIdsByRun: {},
    artifactIdsByRun: {},
    eventIdsByNode: {},
    eventsById: {},
    runIdsByScope: {},
    activeRunIdsByScope: {},
    workspacesByRun: {},
    mergeQueueByRun: {},
    transcriptByNode: {},
    lastSequenceByRun: {},
    nodeSequencesByRun: {},
    gapByRun: {},
    pendingEventsByRun: {},
    presentationByScope: {},
  }
}

export function hydrateAgentRunSnapshot(state, snapshot) {
  const normalized = normalizeAgentRunSnapshot(snapshot)
  const runId = normalized.run.id
  return {
    ...state,
    runsById: { ...state.runsById, ...normalized.runsById },
    nodesById: { ...withoutRun(state.nodesById, runId), ...normalized.nodesById },
    attemptsById: { ...withoutRun(state.attemptsById, runId), ...normalized.attemptsById },
    approvalsById: { ...withoutRun(state.approvalsById, runId), ...normalized.approvalsById },
    artifactsById: { ...withoutRun(state.artifactsById, runId), ...normalized.artifactsById },
    childIdsByParent: {
      ...withoutRunKeys(state.childIdsByParent, runId),
      ...normalized.childIdsByParent,
    },
    attemptIdsByNode: {
      ...withoutRunKeys(state.attemptIdsByNode, runId),
      ...normalized.attemptIdsByNode,
    },
    approvalIdsByRun: {
      ...state.approvalIdsByRun,
      [runId]: normalized.approvalIdsByRun[runId] || [],
    },
    artifactIdsByRun: {
      ...state.artifactIdsByRun,
      [runId]: normalized.artifactIdsByRun[runId] || [],
    },
    runIdsByScope: mergeRunIds(state.runIdsByScope, normalized.run),
    activeRunIdsByScope: mergeActiveRunIds(state.activeRunIdsByScope, normalized.run),
    workspacesByRun: { ...state.workspacesByRun, [runId]: normalized.workspaces },
    mergeQueueByRun: { ...state.mergeQueueByRun, [runId]: normalized.mergeQueue },
    lastSequenceByRun: { ...state.lastSequenceByRun, [runId]: normalized.lastRunSequence },
    nodeSequencesByRun: { ...state.nodeSequencesByRun, [runId]: normalized.nodeSequences },
    gapByRun: Object.fromEntries(
      Object.entries(state.gapByRun).filter(([candidate]) => candidate !== runId),
    ),
    pendingEventsByRun: Object.fromEntries(
      Object.entries(state.pendingEventsByRun).filter(([candidate]) => candidate !== runId),
    ),
  }
}

export function applyAgentEventBatch(state, events = []) {
  let next = state
  for (const event of events) {
    if (!event?.eventId || next.eventsById[event.eventId]) continue
    const runId = String(event.runId || '')
    const expected = Number(next.lastSequenceByRun[runId] || 0) + 1
    const received = Number(event.runSequence || 0)
    if (next.gapByRun[runId] || received > expected) {
      next = {
        ...next,
        gapByRun: {
          ...next.gapByRun,
          [runId]: next.gapByRun[runId] || {
            expectedSequence: expected,
            receivedSequence: received,
          },
        },
        pendingEventsByRun: {
          ...next.pendingEventsByRun,
          [runId]: [
            ...(next.pendingEventsByRun[runId] || []),
            event,
          ].filter((row, index, rows) => (
            rows.findIndex((candidate) => candidate.eventId === row.eventId) === index
          )),
        },
      }
      continue
    }
    if (received < expected) continue
    next = applyEntityPayload(next, event)
    const key = nodeKey(runId, event.nodeId)
    next = {
      ...next,
      eventsById: { ...next.eventsById, [event.eventId]: { ...event } },
      eventIdsByNode: {
        ...next.eventIdsByNode,
        [key]: [...(next.eventIdsByNode[key] || []), event.eventId],
      },
      lastSequenceByRun: { ...next.lastSequenceByRun, [runId]: received },
      nodeSequencesByRun: {
        ...next.nodeSequencesByRun,
        [runId]: {
          ...(next.nodeSequencesByRun[runId] || {}),
          [event.nodeId]: Number(event.nodeSequence || 0),
        },
      },
    }
  }
  return next
}

/**
 * Selection is thread-wide even though presentation is stored per run, so choosing an agent in one
 * run clears the stale selection any sibling run still holds.
 */
export function selectAgentNavigatorNode(state, { threadId, runId, nodeId } = {}) {
  const thread = String(threadId || '')
  const target = presentationKey(thread, runId)
  const prefix = `${thread}:`
  const presentationByScope = {}
  for (const [key, value] of Object.entries(state.presentationByScope)) {
    presentationByScope[key] = key !== target && key.startsWith(prefix) && value?.selectedNodeId
      ? { ...value, selectedNodeId: '' }
      : value
  }
  presentationByScope[target] = {
    ...(state.presentationByScope[target] || {}),
    selectedNodeId: String(nodeId || ''),
  }
  return { ...state, presentationByScope }
}

export function updateAgentRunPresentation(state, input = {}) {
  const key = presentationKey(input.threadId, input.runId)
  const prior = state.presentationByScope[key] || {}
  return {
    ...state,
    presentationByScope: {
      ...state.presentationByScope,
      [key]: {
        ...prior,
        ...(Array.isArray(input.expandedNodeIds)
          ? { expandedNodeIds: [...new Set(input.expandedNodeIds)] }
          : {}),
        ...(Array.isArray(input.collapsedNodeIds)
          ? { collapsedNodeIds: [...new Set(input.collapsedNodeIds)] }
          : {}),
        ...(Object.hasOwn(input, 'selectedNodeId')
          ? { selectedNodeId: String(input.selectedNodeId || '') }
          : {}),
        ...(Object.hasOwn(input, 'returnAnchor') ? { returnAnchor: input.returnAnchor } : {}),
        ...(Object.hasOwn(input, 'completedBatchSize')
          ? { completedBatchSize: Number(input.completedBatchSize || 0) }
          : {}),
        ...(input.streamGroupCollapsePreference
          && typeof input.streamGroupCollapsePreference === 'object'
          && !Array.isArray(input.streamGroupCollapsePreference)
          ? {
            streamGroupCollapsePreference: {
              ...(prior.streamGroupCollapsePreference && typeof prior.streamGroupCollapsePreference === 'object'
                ? prior.streamGroupCollapsePreference
                : {}),
              ...input.streamGroupCollapsePreference,
            },
          }
          : {}),
      },
    },
  }
}
