import { AGENT_POLICY_HARD_CEILINGS } from '../../common/agents/agent-policy-profile.mjs'

function positiveLimit(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function scopedLimit(map, key, fallback) {
  if (typeof map === 'number') return positiveLimit(map, fallback)
  return positiveLimit(map?.[key], fallback)
}

export function createAgentResourceGovernor({
  maxGlobalLiveAgents = AGENT_POLICY_HARD_CEILINGS.maxLiveAgents,
  maxProviderLiveAgents = {},
  maxProjectLiveAgents = AGENT_POLICY_HARD_CEILINGS.maxLiveAgents,
  maxThreadLiveAgents = AGENT_POLICY_HARD_CEILINGS.maxLiveAgents,
  maxParentLiveAgents = AGENT_POLICY_HARD_CEILINGS.maxFanOut,
} = {}) {
  const globalLimit = positiveLimit(maxGlobalLiveAgents, AGENT_POLICY_HARD_CEILINGS.maxLiveAgents)

  function evaluateAdmission({ entry, limits, snapshot, now }) {
    const maxAttemptsPerNode = Number.isFinite(limits.maxAttemptsPerNode)
      ? limits.maxAttemptsPerNode
      : 1
    if (entry.depth > limits.maxDepth) return { admitted: false, reason: 'max_depth' }
    if (snapshot.descendantCount >= limits.maxDescendants) {
      return { admitted: false, reason: 'max_descendants' }
    }
    if (snapshot.parentIsRoot !== true && snapshot.parentChildCount >= limits.maxFanOut) {
      return { admitted: false, reason: 'max_fan_out' }
    }
    if (snapshot.queuedCount >= limits.maxQueuedNodes) {
      return { admitted: false, reason: 'max_queued_nodes' }
    }
    if (snapshot.recentSpawnCount >= limits.maxSpawnsPerMinute) {
      return { admitted: false, reason: 'spawn_rate' }
    }
    if (snapshot.nodeAttemptCount >= maxAttemptsPerNode) {
      return { admitted: false, reason: 'max_attempts' }
    }
    if (snapshot.reservedTokens + entry.tokenReservation > limits.maxTotalTokens) {
      return { admitted: false, reason: 'token_budget' }
    }
    if (snapshot.reservedCostUsd + entry.costReservationUsd > limits.maxCostUsd) {
      return { admitted: false, reason: 'cost_budget' }
    }
    if (snapshot.reservedToolCalls + entry.toolCallReservation > limits.maxToolCalls) {
      return { admitted: false, reason: 'tool_budget' }
    }
    if (now - snapshot.runCreatedAt > limits.maxDurationMs) {
      return { admitted: false, reason: 'duration_budget' }
    }
    return { admitted: true, reason: null }
  }

  function evaluateExecution({ entry, limits, snapshot }) {
    if (snapshot.globalLiveCount >= globalLimit) {
      return { granted: false, reason: 'global_concurrency' }
    }
    const configuredProviderLimit = scopedLimit(
      maxProviderLiveAgents,
      entry.providerId,
      globalLimit,
    )
    const runProviderLimit = scopedLimit(
      limits.providerConcurrencyCaps,
      entry.providerId,
      limits.maxLiveAgents,
    )
    if (snapshot.providerLiveCount >= Math.min(configuredProviderLimit, runProviderLimit)) {
      return { granted: false, reason: 'provider_concurrency' }
    }
    if (snapshot.projectLiveCount >= scopedLimit(maxProjectLiveAgents, entry.projectId, globalLimit)) {
      return { granted: false, reason: 'project_concurrency' }
    }
    if (snapshot.threadLiveCount >= scopedLimit(maxThreadLiveAgents, entry.threadId, globalLimit)) {
      return { granted: false, reason: 'thread_concurrency' }
    }
    if (snapshot.runLiveCount >= limits.maxLiveAgents) {
      return { granted: false, reason: 'run_concurrency' }
    }
    if (snapshot.parentLiveCount >= scopedLimit(maxParentLiveAgents, entry.parentNodeId || entry.nodeId, limits.maxFanOut)) {
      return { granted: false, reason: 'parent_concurrency' }
    }
    return { granted: true, reason: null }
  }

  return Object.freeze({ evaluateAdmission, evaluateExecution })
}
