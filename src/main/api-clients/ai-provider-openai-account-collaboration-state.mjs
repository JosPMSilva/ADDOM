import {
  normalizeId,
  normalizeObject,
} from './ai-provider-openai-account-shared.mjs'

function pushUniqueValue(target = [], value = '') {
  const normalizedValue = normalizeId(value)
  if (!normalizedValue || target.includes(normalizedValue)) return target
  target.push(normalizedValue)
  return target
}

function normalizeStatus(value = '', phase = '') {
  const status = normalizeId(value).toLowerCase().replace(/[\s_-]+/g, '')
  if (['inprogress', 'running', 'started', 'pending'].includes(status)) return 'running'
  if (['completed', 'complete', 'succeeded', 'success'].includes(status)) return 'completed'
  if (['failed', 'error', 'errored'].includes(status)) return 'failed'
  if (['cancelled', 'canceled'].includes(status)) return 'cancelled'
  if (['interrupted', 'aborted', 'stopped'].includes(status)) return 'interrupted'
  return phase === 'completed' ? 'completed' : 'running'
}

export function createAccountCollaborationState() {
  return {
    started: false,
    completed: false,
    itemIds: [],
    itemTypes: [],
    toolNames: [],
    agentStatuses: [],
    receiverThreadIds: [],
    newThreadIds: [],
    events: [],
  }
}

export function normalizeAccountCollaborationEvent(
  item = null,
  phase = '',
  { bridgeThreadId = '' } = {},
) {
  const source = normalizeObject(item)
  const providerActivityId = normalizeId(source.id)
  const normalizedPhase = phase === 'completed' ? 'completed' : 'started'
  const itemType = normalizeId(source.type)
  if (!providerActivityId || !itemType) return null
  return {
    providerEventId: `${providerActivityId}:${normalizedPhase}:${itemType}`,
    providerActivityId,
    spawnRequestId: providerActivityId,
    parentProviderThreadId: normalizeId(source.senderThreadId || bridgeThreadId),
    providerThreadId: normalizeId(source.receiverThreadId || source.newThreadId),
    toolName: normalizeId(source.tool),
    phase: normalizedPhase,
    status: normalizeStatus(source.agentStatus || source.status, normalizedPhase),
  }
}

export function trackAccountCollaborationItem(
  state = null,
  item = null,
  phase = '',
  context = {},
) {
  const target = state && typeof state === 'object' ? state : createAccountCollaborationState()
  if (phase === 'started') target.started = true
  if (phase === 'completed') {
    target.started = true
    target.completed = true
  }
  pushUniqueValue(target.itemIds, item?.id)
  pushUniqueValue(target.itemTypes, item?.type)
  pushUniqueValue(target.toolNames, item?.tool)
  pushUniqueValue(target.agentStatuses, item?.agentStatus)
  pushUniqueValue(target.receiverThreadIds, item?.receiverThreadId)
  pushUniqueValue(target.newThreadIds, item?.newThreadId)
  if (!Array.isArray(target.events)) target.events = []
  const event = normalizeAccountCollaborationEvent(item, phase, context)
  if (event && !target.events.some((entry) => entry.providerEventId === event.providerEventId)) {
    target.events.push(event)
  }
  return target
}

export function cloneAccountCollaborationState(state = null) {
  const source = state && typeof state === 'object' ? state : null
  if (!source) return null
  return {
    started: source.started === true,
    completed: source.completed === true,
    itemIds: Array.isArray(source.itemIds) ? [...source.itemIds] : [],
    itemTypes: Array.isArray(source.itemTypes) ? [...source.itemTypes] : [],
    toolNames: Array.isArray(source.toolNames) ? [...source.toolNames] : [],
    agentStatuses: Array.isArray(source.agentStatuses) ? [...source.agentStatuses] : [],
    receiverThreadIds: Array.isArray(source.receiverThreadIds) ? [...source.receiverThreadIds] : [],
    newThreadIds: Array.isArray(source.newThreadIds) ? [...source.newThreadIds] : [],
    events: Array.isArray(source.events)
      ? source.events.map((event) => ({ ...event }))
      : [],
  }
}
