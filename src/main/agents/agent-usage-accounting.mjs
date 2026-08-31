import { validateAgentUsage } from '../../common/agents/agent-usage.mjs'

function emptyUsage(scope) {
  return {
    scope,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    rawProviderUsage: null,
  }
}

function round(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1e12) / 1e12
}

function addUsage(left, right, scope) {
  return {
    scope,
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    reasoningTokens: left.reasoningTokens + right.reasoningTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    costUsd: round(left.costUsd + right.costUsd),
    rawProviderUsage: null,
  }
}

export function calculateAgentUsageRollups({
  nodes = [],
  attempts = [],
  rootNodeId,
} = {}) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  if (!nodeById.has(rootNodeId)) throw new TypeError(`Usage root node ${rootNodeId} was not found`)
  const children = new Map(nodes.map((node) => [node.id, []]))
  for (const node of nodes) {
    if (node.id === rootNodeId) continue
    if (!nodeById.has(node.parentNodeId)) {
      throw new TypeError(`Usage node ${node.id} has an unknown parent`)
    }
    children.get(node.parentNodeId).push(node.id)
  }
  const local = new Map(nodes.map((node) => [node.id, {
    exclusive: emptyUsage('exclusive'),
    inclusive: emptyUsage('inclusive'),
    unknown: emptyUsage('unknown_scope'),
    hasInclusiveProviderUsage: false,
  }]))
  const rawProviderUsage = []
  for (const attempt of attempts) {
    if (attempt.usage == null) continue
    if (!local.has(attempt.nodeId)) {
      throw new TypeError(`Usage attempt ${attempt.id} has an unknown node`)
    }
    const usage = validateAgentUsage(attempt.usage)
    const bucket = local.get(attempt.nodeId)
    if (usage.scope === 'exclusive') {
      bucket.exclusive = addUsage(bucket.exclusive, usage, 'exclusive')
    } else if (usage.scope === 'inclusive') {
      bucket.inclusive = addUsage(bucket.inclusive, usage, 'inclusive')
      bucket.hasInclusiveProviderUsage = true
    } else {
      bucket.unknown = addUsage(bucket.unknown, usage, 'unknown_scope')
    }
    rawProviderUsage.push({
      attemptId: attempt.id,
      nodeId: attempt.nodeId,
      scope: usage.scope,
      rawProviderUsage: usage.rawProviderUsage,
    })
  }

  const byNode = {}
  function visit(nodeId) {
    const bucket = local.get(nodeId)
    const childRollups = children.get(nodeId).map(visit)
    const childrenInclusive = childRollups.reduce(
      (sum, value) => addUsage(sum, value.inclusive, 'inclusive'),
      emptyUsage('inclusive'),
    )
    const childrenUnknown = childRollups.reduce(
      (sum, value) => addUsage(sum, value.unknown, 'unknown_scope'),
      emptyUsage('unknown_scope'),
    )
    const localAuthoritative = addUsage(bucket.exclusive, bucket.inclusive, 'inclusive')
    const inclusive = bucket.hasInclusiveProviderUsage
      ? localAuthoritative
      : addUsage(localAuthoritative, childrenInclusive, 'inclusive')
    const unknown = addUsage(bucket.unknown, childrenUnknown, 'unknown_scope')
    byNode[nodeId] = {
      exclusive: bucket.exclusive,
      inclusive,
      unknown,
      providerInclusive: bucket.hasInclusiveProviderUsage,
    }
    return byNode[nodeId]
  }

  const run = visit(rootNodeId)
  return Object.freeze({
    byNode: Object.freeze(byNode),
    run: Object.freeze({
      exclusive: run.exclusive,
      inclusive: run.inclusive,
      unknown: run.unknown,
      authoritativeCostUsd: run.inclusive.costUsd,
    }),
    rawProviderUsage: Object.freeze(rawProviderUsage),
  })
}
