function createAgentRunsApi(deps) {
  const {
    invokeVersioned,
    subVersioned,
    asTrimmedString,
    asPlainObject,
    asString,
    asBoolean,
    asOptionalRoundedNumber,
  } = deps
  const subscribers = new Map()
  let bridgeCleanup = null

  function scope(input = {}, fields = []) {
    const source = asPlainObject(input)
    const result = {
      projectId: asTrimmedString(source.projectId),
      threadId: asTrimmedString(source.threadId),
    }
    for (const field of fields) result[field] = asTrimmedString(source[field])
    return result
  }

  function page(input = {}, fields = []) {
    const source = asPlainObject(input)
    return {
      ...scope(source, fields),
      cursor: asOptionalRoundedNumber(source.cursor),
      limit: asOptionalRoundedNumber(source.limit),
    }
  }

  function ensureBridge() {
    if (typeof bridgeCleanup === 'function') return
    bridgeCleanup = subVersioned('agent-runs:event', (payload = {}) => {
      const subscriptionId = asTrimmedString(payload.subscriptionId)
      const subscriber = subscribers.get(subscriptionId)
      if (typeof subscriber === 'function') subscriber(payload.event)
    })
  }

  function releaseBridge() {
    if (subscribers.size > 0) return
    bridgeCleanup?.()
    bridgeCleanup = null
  }

  async function subscribe(input = {}, callback) {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function')
    const response = await invokeVersioned('agent-runs:subscribe', scope(input, ['runId']))
    const subscriptionId = asTrimmedString(response?.subscriptionId)
    if (!subscriptionId) {
      throw new Error(asTrimmedString(response?.error) || 'agent_run_subscribe_failed')
    }
    ensureBridge()
    subscribers.set(subscriptionId, callback)
    let unsubscribed = false
    return async () => {
      if (unsubscribed) return
      unsubscribed = true
      subscribers.delete(subscriptionId)
      releaseBridge()
      await invokeVersioned('agent-runs:unsubscribe', { subscriptionId })
    }
  }

  return {
    list: (input = {}) => invokeVersioned('agent-runs:list', page(input)),
    get: (input = {}) => invokeVersioned(
      'agent-runs:get',
      scope(input, ['runId', 'reconciliationReason']),
    ),
    getTranscriptPage: (input = {}) => invokeVersioned(
      'agent-runs:transcript-page',
      page(input, ['runId', 'nodeId']),
    ),
    getEventsPage: (input = {}) => invokeVersioned(
      'agent-runs:events-page',
      page(input, ['runId', 'nodeId']),
    ),
    getConversation: (input = {}) => invokeVersioned(
      'agent-runs:conversation',
      scope(input, ['runId', 'nodeId']),
    ),
    getConversationTranscriptPage: (input = {}) => invokeVersioned(
      'agent-runs:conversation-transcript-page',
      page(input, ['runId', 'nodeId']),
    ),
    subscribe,
    control: (input = {}) => {
      const source = asPlainObject(input)
      return invokeVersioned('agent-runs:control', {
        ...scope(source, ['runId', 'nodeId']),
        action: asTrimmedString(source.action),
        reason: asString(source.reason).trim().slice(0, 1_000),
      })
    },
    followup: (input = {}) => {
      const source = asPlainObject(input)
      return invokeVersioned('agent-runs:followup', {
        ...scope(source, ['runId', 'nodeId']),
        text: asString(source.text).trim().slice(0, 200_000),
      })
    },
    promoteConversation: (input = {}) => invokeVersioned(
      'agent-runs:promote-conversation',
      scope(input, ['runId', 'nodeId']),
    ),
    retry: (input = {}) => invokeVersioned(
      'agent-runs:retry',
      scope(input, ['runId', 'nodeId']),
    ),
    setQueuePaused: (input = {}) => {
      const source = asPlainObject(input)
      return invokeVersioned('agent-runs:queue', {
        ...scope(source),
        paused: asBoolean(source.paused),
      })
    },
    resolveApproval: (input = {}) => {
      const source = asPlainObject(input)
      return invokeVersioned('agent-runs:approval', {
        ...scope(source, ['runId', 'approvalId']),
        outcome: asTrimmedString(source.outcome),
        resolutionScope: asTrimmedString(source.resolutionScope),
        expiresAt: asOptionalRoundedNumber(source.expiresAt),
        reason: asString(source.reason).trim().slice(0, 1_000),
      })
    },
    decideArtifact: (input = {}) => {
      const source = asPlainObject(input)
      return invokeVersioned('agent-runs:artifact-action', {
        ...scope(source, ['runId', 'artifactId']),
        operation: asTrimmedString(source.operation),
      })
    },
  }
}

module.exports = { createAgentRunsApi }
