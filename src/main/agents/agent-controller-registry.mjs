import {
  AGENT_BACKGROUND_KINDS,
  AGENT_CANCELLATION_SCOPES,
} from '../../common/agents/agent-cancellation.mjs'

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${field} is required`)
  }
  return value.trim()
}

function isDescendant(entriesByNode, candidate, targetNodeId) {
  let current = candidate
  const visited = new Set()
  while (current?.parentNodeId) {
    if (visited.has(current.nodeId)) return false
    visited.add(current.nodeId)
    if (current.parentNodeId === targetNodeId) return true
    current = entriesByNode.get(current.parentNodeId)
  }
  return false
}

function hasForegroundLineage(entriesByNode, candidate, targetNodeId) {
  let current = candidate
  const visited = new Set()
  while (current && current.nodeId !== targetNodeId) {
    if (visited.has(current.nodeId) || current.backgroundKind !== 'foreground') return false
    visited.add(current.nodeId)
    current = entriesByNode.get(current.parentNodeId)
  }
  return current?.nodeId === targetNodeId
}

export function createAgentControllerRegistry() {
  const entries = new Map()

  function register(input) {
    const attemptId = requireText(input?.attemptId, 'attemptId')
    if (entries.has(attemptId)) throw new TypeError(`Attempt ${attemptId} already has a controller`)
    const backgroundKind = requireText(input.backgroundKind, 'backgroundKind')
    if (!AGENT_BACKGROUND_KINDS.includes(backgroundKind)) {
      throw new TypeError(`Unsupported backgroundKind: ${backgroundKind}`)
    }
    const controller = input.controller || new AbortController()
    const entry = Object.freeze({
      attemptId,
      runId: requireText(input.runId, 'runId'),
      nodeId: requireText(input.nodeId, 'nodeId'),
      parentNodeId: input.parentNodeId === null ? null : requireText(input.parentNodeId, 'parentNodeId'),
      backgroundKind,
      supportsCancellation: input.supportsCancellation !== false,
      onCancel: typeof input.onCancel === 'function' ? input.onCancel : null,
      controller,
      signal: controller.signal,
    })
    entries.set(attemptId, entry)
    return entry
  }

  function get(attemptId) {
    return entries.get(attemptId) || null
  }

  function unregister(attemptId) {
    const entry = entries.get(attemptId) || null
    entries.delete(attemptId)
    return entry
  }

  function list({ runId } = {}) {
    return [...entries.values()].filter((entry) => !runId || entry.runId === runId)
  }

  function select({ scope, runId, targetNodeId }) {
    if (!AGENT_CANCELLATION_SCOPES.includes(scope)) {
      throw new TypeError(`Unsupported cancellation scope: ${scope}`)
    }
    const candidates = list({ runId })
    if (scope === 'run') return candidates
    requireText(targetNodeId, 'targetNodeId')
    const entriesByNode = new Map(candidates.map((entry) => [entry.nodeId, entry]))
    return candidates.filter((entry) => {
      if (entry.nodeId === targetNodeId) return true
      if (scope === 'node') return false
      if (!isDescendant(entriesByNode, entry, targetNodeId)) return false
      if (scope === 'subtree') return true
      return hasForegroundLineage(entriesByNode, entry, targetNodeId)
    })
  }

  function cancel({ scope, runId, targetNodeId = null, reason = 'cancelled' }) {
    const cancelledAttemptIds = []
    const unsupportedAttemptIds = []
    for (const entry of select({ scope, runId, targetNodeId })) {
      if (!entry.supportsCancellation) {
        unsupportedAttemptIds.push(entry.attemptId)
        continue
      }
      entry.controller.abort(reason)
      entry.onCancel?.(reason)
      entries.delete(entry.attemptId)
      cancelledAttemptIds.push(entry.attemptId)
    }
    return { cancelledAttemptIds, unsupportedAttemptIds }
  }

  return Object.freeze({ cancel, get, list, register, select, unregister })
}
