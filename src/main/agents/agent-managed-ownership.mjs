import { isManagedDescendant } from './agent-managed-runtime-values.mjs'

export function createManagedOwnership({ repository } = {}) {
  function requireOwner(owner) {
    const graph = repository.getRunGraph(owner?.runId)
    if (!graph) throw new TypeError(`Agent run ${owner?.runId} was not found`)
    const node = graph.nodes.find((candidate) => candidate.id === owner.nodeId)
    const attempt = graph.attempts.find((candidate) => candidate.id === owner.attemptId)
    if (!node || !attempt || attempt.nodeId !== node.id) {
      throw new TypeError('Agent collaboration owner is not an active node attempt')
    }
    return { graph, node, attempt }
  }

  function requireOwnedTarget(owner, targetNodeId) {
    const { graph, node: ownerNode } = requireOwner(owner)
    const target = graph.nodes.find((candidate) => candidate.id === targetNodeId)
    if (!target) throw new TypeError(`Agent node ${targetNodeId} was not found`)
    if (!isManagedDescendant(target, ownerNode.id)) {
      throw new TypeError(`Agent node ${targetNodeId} is not owned by ${ownerNode.id}`)
    }
    return { graph, ownerNode, target }
  }

  return Object.freeze({ requireOwnedTarget, requireOwner })
}
