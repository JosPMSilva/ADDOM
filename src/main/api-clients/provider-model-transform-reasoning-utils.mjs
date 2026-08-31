import {
  normalizePartType,
  normalizeProviderOptionsNamespace,
  toStringSafe,
  trimString,
} from './provider-model-transform-content-utils.mjs'
import { normalizeStructuredContentParts } from './provider-model-transform-normalization-utils.mjs'

const ANTHROPIC_EXECUTION_BRIEF_START_MARKER = '[ADDOM EXECUTION BRIEF]'
const ANTHROPIC_MOA_ROLE_CATALOG_START_MARKER = '[MoA ROLE CATALOG]'
const ANTHROPIC_MEMORY_CONTEXT_START_MARKERS = Object.freeze([
  'The following is relevant durable context from this project and global memory.',
  'The following is relevant durable context from this project.',
])

function hasAnthropicReasoningReplayMetadata(part = {}) {
  const anthropicProviderOptions = part?.providerOptions?.anthropic
    && typeof part.providerOptions.anthropic === 'object'
    ? part.providerOptions.anthropic
    : null
  const anthropicProviderMetadata = part?.providerMetadata?.anthropic
    && typeof part.providerMetadata.anthropic === 'object'
    ? part.providerMetadata.anthropic
    : null
  const signature = toStringSafe(anthropicProviderOptions?.signature || anthropicProviderMetadata?.signature)
  const redactedData = toStringSafe(anthropicProviderOptions?.redactedData || anthropicProviderMetadata?.redactedData)
  return !!(signature || redactedData)
}

function addAnthropicEphemeralCacheControl(providerOptions = undefined) {
  const base = providerOptions && typeof providerOptions === 'object'
    ? providerOptions
    : {}
  const anthropic = base.anthropic && typeof base.anthropic === 'object'
    ? base.anthropic
    : {}
  if (anthropic.cacheControl || anthropic.cache_control) {
    return base
  }
  return {
    ...base,
    anthropic: {
      ...anthropic,
      cacheControl: { type: 'ephemeral' },
    },
  }
}

function resolveAnthropicStableSystemSplitIndex(content = '') {
  const text = String(content ?? '')
  if (!text) return -1

  const candidates = [
    text.indexOf(ANTHROPIC_EXECUTION_BRIEF_START_MARKER),
    text.indexOf(ANTHROPIC_MOA_ROLE_CATALOG_START_MARKER),
    ...ANTHROPIC_MEMORY_CONTEXT_START_MARKERS.map((marker) => text.indexOf(marker)),
  ].filter((index) => Number.isInteger(index) && index >= 0)

  if (candidates.length === 0) return -1
  return Math.min(...candidates)
}

function splitAnthropicStableSystemMessage(message = {}) {
  if (String(message?.role || '').trim().toLowerCase() !== 'system') {
    return [message]
  }

  const content = String(message?.content ?? '')
  const splitIndex = resolveAnthropicStableSystemSplitIndex(content)
  const stableContent = (splitIndex >= 0 ? content.slice(0, splitIndex) : content).trim()
  if (!stableContent) return [message]

  const volatileContent = splitIndex >= 0 ? content.slice(splitIndex).trim() : ''
  const stableMessage = {
    ...message,
    content: stableContent,
    providerOptions: addAnthropicEphemeralCacheControl(message?.providerOptions),
  }
  if (!volatileContent) return [stableMessage]

  return [
    stableMessage,
    {
      ...message,
      content: volatileContent,
    },
  ]
}

export function annotateAnthropicPromptCacheControl(messages = []) {
  const rows = Array.isArray(messages) ? messages : []
  if (rows.length === 0) return rows

  const systemMessages = []
  const nonSystemMessages = []

  for (const message of rows) {
    if (String(message?.role || '').trim().toLowerCase() === 'system') {
      systemMessages.push(message)
    } else {
      nonSystemMessages.push(message)
    }
  }

  if (systemMessages.length === 0) return rows

  const [firstSystemMessage, ...restSystemMessages] = systemMessages
  const splitMessages = splitAnthropicStableSystemMessage(firstSystemMessage)
  return [...splitMessages, ...restSystemMessages, ...nonSystemMessages]
}

export function resolveInterleavedReasoningReplayTarget(capability = null) {
  const source = capability && typeof capability === 'object' && !Array.isArray(capability)
    ? capability
    : null
  if (source?.supported !== true) return null

  const controls = Array.isArray(source.providerControls)
    ? source.providerControls.map((entry) => trimString(entry))
    : []
  for (const control of controls) {
    const match = control.match(/^([^:]+):([^:]+)$/)
    if (!match) continue
    const providerNamespace = normalizeProviderOptionsNamespace(match[1])
    const field = trimString(match[2])
    if (!providerNamespace || !field) continue
    return {
      providerNamespace,
      field,
    }
  }

  const mode = trimString(source.mode).toLowerCase()
  if (mode === 'openai_compatible_reasoning_content') {
    return {
      providerNamespace: 'openaiCompatible',
      field: 'reasoning_content',
    }
  }

  return null
}

export function replayInterleavedReasoningMessage(message = {}, replayTarget = null) {
  if (!replayTarget?.providerNamespace || !replayTarget?.field) return message
  if (String(message?.role || '').trim().toLowerCase() !== 'assistant') return message
  if (!Array.isArray(message?.content)) return message

  const reasoningParts = []
  const filteredContent = []
  for (const part of normalizeStructuredContentParts(message.content)) {
    if (normalizePartType(part.type) === 'reasoning') {
      const text = String(part.text ?? '')
      if (text) reasoningParts.push(text)
      continue
    }
    filteredContent.push(part)
  }

  if (reasoningParts.length === 0) {
    return filteredContent.length === message.content.length
      ? message
      : { ...message, content: filteredContent }
  }

  const reasoningText = reasoningParts.join('')
  return {
    ...message,
    content: filteredContent,
    providerOptions: {
      ...(message?.providerOptions && typeof message.providerOptions === 'object' ? message.providerOptions : {}),
      [replayTarget.providerNamespace]: {
        ...(message?.providerOptions?.[replayTarget.providerNamespace] && typeof message.providerOptions[replayTarget.providerNamespace] === 'object'
          ? message.providerOptions[replayTarget.providerNamespace]
          : {}),
        [replayTarget.field]: reasoningText,
      },
    },
  }
}

export function filterAnthropicEmptyMessageParts(message = {}) {
  if (typeof message?.content === 'string') {
    return toStringSafe(message.content) ? message : null
  }
  if (!Array.isArray(message?.content)) return message

  const filtered = message.content.filter((part) => {
    const type = normalizePartType(part?.type)
    if (type === 'text' || type === 'reasoning') {
      if (type === 'reasoning' && hasAnthropicReasoningReplayMetadata(part)) return true
      return toStringSafe(part?.text).length > 0
    }
    return true
  })

  if (filtered.length === 0) return null
  return {
    ...message,
    content: filtered,
  }
}
