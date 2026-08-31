import { randomUUID } from 'node:crypto'

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'interrupted'])

function text(value) {
  return String(value ?? '').trim()
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function identityOf(input = {}) {
  const providerThreadId = text(input.providerThreadId)
  if (providerThreadId) return { key: `thread:${providerThreadId}`, providerThreadId }
  const providerAgentId = text(input.providerAgentId)
  if (providerAgentId) return { key: `agent:${providerAgentId}`, providerAgentId }
  const providerActivityId = text(input.providerActivityId)
  if (providerActivityId) return { key: `activity:${providerActivityId}`, providerActivityId }
  throw new TypeError('Native agent evidence requires a stable provider identity')
}

function intentKey(input = {}) {
  const spawnRequestId = text(input.spawnRequestId)
  if (spawnRequestId) return `spawn:${spawnRequestId}`
  const parentAttemptId = text(input.parentAttemptId)
  if (parentAttemptId) return `attempt:${parentAttemptId}`
  return ''
}

function cloneRecord(record, additions = {}) {
  return Object.freeze({
    ...record,
    ...additions,
  })
}

export function classifyNativeProviderCheckpoint({ persisted = null, current = null } = {}) {
  if (!persisted || !current) return 'provider_ahead'
  const persistedHistoryId = text(persisted.historyId)
  const currentHistoryId = text(current.historyId)
  if (
    persistedHistoryId
    && currentHistoryId
    && persistedHistoryId !== currentHistoryId
  ) {
    return 'forked_history'
  }
  const persistedSequence = number(persisted.sequence)
  const currentSequence = number(current.sequence)
  if (currentSequence < persistedSequence) return 'forked_history'
  if (
    current.terminal === true
    && persisted.terminal !== true
    && currentSequence > persistedSequence
  ) {
    return 'provider_unverified_terminal'
  }
  if (currentSequence > persistedSequence) return 'provider_ahead'
  return 'matched'
}

export function createNativeAgentIdentityReconciler({
  namespace,
  nodeIdFactory = () => `agent_native_${randomUUID()}`,
} = {}) {
  const normalizedNamespace = text(namespace)
  if (!normalizedNamespace) throw new TypeError('Native agent namespace is required')
  const intents = new Map()
  const nodesByIdentity = new Map()
  const eventRecords = new Map()

  function matchingIntent(input) {
    const spawnRequestId = text(input.spawnRequestId)
    if (spawnRequestId) return intents.get(`spawn:${spawnRequestId}`) || null
    const parentAttemptId = text(input.parentAttemptId)
    if (!parentAttemptId) return null
    const matches = [...intents.values()]
      .filter((intent) => intent.parentAttemptId === parentAttemptId)
    return matches.length === 1 ? matches[0] : null
  }

  function registerSpawnIntent(input = {}) {
    const key = intentKey(input)
    if (!key) throw new TypeError('Native spawn intent requires spawnRequestId or parentAttemptId')
    const intent = Object.freeze({
      spawnRequestId: text(input.spawnRequestId) || null,
      parentAttemptId: text(input.parentAttemptId) || null,
      parentProviderThreadId: text(input.parentProviderThreadId) || null,
      expectedProviderThreadId: text(input.expectedProviderThreadId) || null,
    })
    intents.set(key, intent)
    const reconciledNodes = []
    for (const [identity, node] of nodesByIdentity) {
      const exactSpawn = intent.spawnRequestId && node.spawnRequestId === intent.spawnRequestId
      const exactThread = (
        intent.expectedProviderThreadId
        && node.providerThreadId === intent.expectedProviderThreadId
      )
      if (!exactSpawn && !exactThread) continue
      if (node.reconciliationState === 'matched') continue
      const reconciled = cloneRecord(node, {
        parentAttemptId: node.parentAttemptId || intent.parentAttemptId,
        parentProviderThreadId: node.parentProviderThreadId || intent.parentProviderThreadId,
        reconciliationState: 'matched',
      })
      nodesByIdentity.set(identity, reconciled)
      reconciledNodes.push(reconciled)
    }
    return Object.freeze({ intent, reconciledNodes: Object.freeze(reconciledNodes) })
  }

  function observeNode(input = {}) {
    const providerEventId = text(input.providerEventId)
    if (!providerEventId) throw new TypeError('Native node evidence requires providerEventId')
    if (eventRecords.has(providerEventId)) {
      return cloneRecord(eventRecords.get(providerEventId), { duplicateEvent: true })
    }
    const identity = identityOf(input)
    const existing = nodesByIdentity.get(identity.key)
    const intent = matchingIntent(input)
    const observedStatus = text(input.status).toLowerCase() || 'running'
    const requestedReconciliationState = text(input.reconciliationState)
    const reconciliationState = requestedReconciliationState
      || (intent ? 'matched' : existing?.reconciliationState || 'provider_ahead')
    const blockedTerminal = (
      TERMINAL_STATUSES.has(observedStatus)
      && ['provider_ahead', 'provider_unverified_terminal', 'forked_history']
        .includes(reconciliationState)
    )
    const record = Object.freeze({
      nodeId: existing?.nodeId || nodeIdFactory(),
      providerEventId,
      providerAgentId: identity.providerAgentId || existing?.providerAgentId || null,
      providerThreadId: identity.providerThreadId || existing?.providerThreadId || null,
      providerActivityId: identity.providerActivityId || existing?.providerActivityId || null,
      parentProviderThreadId: text(input.parentProviderThreadId)
        || existing?.parentProviderThreadId
        || intent?.parentProviderThreadId
        || null,
      spawnRequestId: text(input.spawnRequestId)
        || existing?.spawnRequestId
        || intent?.spawnRequestId
        || null,
      parentAttemptId: text(input.parentAttemptId)
        || existing?.parentAttemptId
        || intent?.parentAttemptId
        || null,
      providerCorrelationKey: `${normalizedNamespace}:${identity.key}`,
      reconciliationState,
      status: blockedTerminal ? 'waiting' : observedStatus,
      observedStatus,
      duplicateIdentity: !!existing,
      duplicateEvent: false,
    })
    nodesByIdentity.set(identity.key, record)
    eventRecords.set(providerEventId, record)
    return record
  }

  return Object.freeze({
    registerSpawnIntent,
    observeNode,
    listNodes: () => Object.freeze([...nodesByIdentity.values()]),
  })
}
