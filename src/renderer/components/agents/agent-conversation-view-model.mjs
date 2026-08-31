import { buildCanonicalFinalDocument } from '../../../common/chat/final-document-contract.mjs'
import {
  getRegistryProvider,
  resolveRegistryModel,
} from '../../../common/api-clients/model-registry.mjs'

const TERMINAL_TURN_STATUSES = new Set(['completed', 'failed', 'cancelled'])
const ROUTE_PROVIDER_ALIASES = Object.freeze({
  'openai-account': 'openai',
})

function routeProviderCandidates(providerId = '') {
  const normalized = String(providerId || '').trim().toLowerCase()
  return [...new Set([normalized, ROUTE_PROVIDER_ALIASES[normalized]].filter(Boolean))]
}

export function resolveAgentConversationRoutePresentation({ node = null, providers = [] } = {}) {
  const providerId = String(node?.providerId || '').trim()
  const modelId = String(node?.modelId || '').trim()
  if (!providerId || !modelId) return null

  const providerCandidates = routeProviderCandidates(providerId)
  const configuredProvider = (Array.isArray(providers) ? providers : []).find((provider) => (
    providerCandidates.includes(String(provider?.id || '').trim().toLowerCase())
  )) || null
  const registryProvider = providerCandidates
    .map((candidate) => getRegistryProvider(candidate))
    .find(Boolean) || null
  const configuredModel = (Array.isArray(configuredProvider?.models) ? configuredProvider.models : []).find((model) => (
    String(model?.id || '').trim().toLowerCase() === modelId.toLowerCase()
  )) || null
  const registryModel = providerCandidates
    .map((candidate) => resolveRegistryModel(candidate, modelId))
    .find(Boolean)?.model || null
  const providerLabel = String(configuredProvider?.name || registryProvider?.name || providerId).trim()
  const modelLabel = String(configuredModel?.label || configuredModel?.name || registryModel?.label || modelId).trim()

  return {
    providerId,
    modelId,
    providerLabel,
    modelLabel,
    label: `${providerLabel} · ${modelLabel}`,
  }
}

function partText(part) {
  if (!part || typeof part !== 'object') return ''
  if (part.kind === 'markdown' || part.kind === 'text' || part.kind === 'citation') {
    return String(part.text || '')
  }
  if (part.kind === 'link') return `[${String(part.label || '')}](${String(part.href || '')})`
  if (part.kind === 'file') return `File: \`${String(part.label || part.id || 'attachment')}\``
  if (part.kind === 'image') return `Image: ${String(part.label || part.id || 'generated image')}`
  return ''
}

function canonicalParts(message) {
  return (Array.isArray(message?.contentParts) ? message.contentParts : [])
    .map((part, index) => {
      const value = partText(part)
      if (!value) return null
      return {
        partId: String(part?.partId || `${message.id}:part:${index + 1}`),
        appendOrder: Number(part?.appendOrder || index + 1),
        kind: part?.kind === 'text' ? 'text' : 'markdown',
        status: String(part?.status || 'completed'),
        text: index > 0 ? `\n${value}` : value,
      }
    })
    .filter(Boolean)
}

/** Convert only registered durable message parts into the root chat message contract. */
export function buildAgentConversationTimeline(messages = [], { threadId = '' } = {}) {
  return messages.map((message) => {
    const parts = canonicalParts(message)
    const text = parts.map((part) => part.text).join('')
    const final = message?.kind === 'final'
    const finalDocument = final ? buildCanonicalFinalDocument({
      threadId,
      turnId: String(message?.turnId || ''),
      messageId: String(message?.id || ''),
      text,
      finalDocument: { parts },
      hasAuthoritativeMessageBinding: true,
    }) : undefined
    return {
      id: String(message?.id || ''),
      role: final ? 'assistant' : 'user',
      kind: String(message?.kind || ''),
      status: 'complete',
      content: text,
      finalDocument,
      authorKind: String(message?.authorKind || ''),
      authorId: String(message?.authorId || ''),
      streamMeta: { threadId, turnId: String(message?.turnId || '') },
    }
  }).filter((message) => message.id && message.content)
}

export function buildAgentConversationTurnGroups({
  turns = [],
  messages = [],
  executionItems = [],
  threadId = '',
} = {}) {
  const timeline = buildAgentConversationTimeline(messages, { threadId })
  const messagesByTurn = new Map()
  const executionByTurn = new Map()
  const assistantDeltasByTurn = new Map()
  for (const message of timeline) {
    const turnId = String(message?.streamMeta?.turnId || '')
    if (!messagesByTurn.has(turnId)) messagesByTurn.set(turnId, [])
    messagesByTurn.get(turnId).push(message)
  }
  for (const item of executionItems) {
    const turnId = String(item?.turnId || '')
    if (String(item?.kind || '') === 'agent_assistant_delta') {
      if (String(item?.presentation || '') !== 'user' || !turnId) continue
      if (!assistantDeltasByTurn.has(turnId)) assistantDeltasByTurn.set(turnId, [])
      assistantDeltasByTurn.get(turnId).push(item)
      continue
    }
    if (!executionByTurn.has(turnId)) executionByTurn.set(turnId, [])
    executionByTurn.get(turnId).push(item)
  }
  const groups = turns
    .slice()
    .sort((left, right) => Number(left?.sequence || 0) - Number(right?.sequence || 0))
    .map((turn) => {
      const turnId = String(turn?.id || '')
      const turnMessages = messagesByTurn.get(turnId) || []
      const hasFinal = turnMessages.some((message) => message.kind === 'final')
      const draftContent = (assistantDeltasByTurn.get(turnId) || [])
        .slice()
        .sort((left, right) => Number(left?.transcriptSequence || 0) - Number(right?.transcriptSequence || 0))
        .map((item) => String(item?.content || ''))
        .join('')
      const draft = !hasFinal && draftContent
        ? [{
            id: `agent-draft:${turnId}`,
            role: 'assistant',
            kind: 'draft',
            status: TERMINAL_TURN_STATUSES.has(String(turn?.status || '')) ? 'complete' : 'streaming',
            content: draftContent,
            streamMeta: { threadId, turnId },
          }]
        : []
      return {
        turn,
        messages: [...turnMessages, ...draft],
        executionItems: executionByTurn.get(turnId) || [],
      }
    })
  const unboundMessages = messagesByTurn.get('') || []
  const unboundExecution = executionByTurn.get('') || []
  if (unboundMessages.length || unboundExecution.length) {
    groups.unshift({
      turn: { id: 'legacy-unbound', sequence: 0, status: 'completed' },
      messages: unboundMessages,
      executionItems: unboundExecution,
    })
  }
  return groups
}

export function agentConversationHasActiveTurn(turns = []) {
  return turns.some((turn) => ['pending', 'queued', 'running', 'waiting'].includes(String(turn?.status || '')))
}

export function shouldCollapseAgentConversationReasoning(status = '') {
  return TERMINAL_TURN_STATUSES.has(String(status || ''))
}

export function agentConversationCanFollowup(node, { missing = false, submitting = false } = {}) {
  return !missing && !submitting && node?.capabilitySnapshot?.childMessaging === true
}
