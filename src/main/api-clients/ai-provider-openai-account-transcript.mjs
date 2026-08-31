import { resolveOpenAIAccountAssistantPhase } from '../chat/assistant-phase-policy.mjs'
import { normalizeAssistantPhase } from '../../common/chat/assistant-phase.mjs'
import { OPENAI_ACCOUNT_TRANSPORT_MODE } from './ai-provider-openai-account-constants.mjs'
import {
  createOpenAIAccountRuntimeError,
  normalizeId,
} from './ai-provider-openai-account-shared.mjs'

function flattenMessageText(content = null) {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      const type = normalizeId(part.type).toLowerCase()
      if (type === 'text' || type === 'input_text' || type === 'reasoning') {
        return String(part.text ?? part.value ?? '').trim()
      }
      if (type === 'tool-result') {
        return String(
          part.output?.value
          ?? part.output?.text
          ?? part.output
          ?? '',
        ).trim()
      }
      if (type === 'tool-call') {
        return `${normalizeId(part.toolName)} ${JSON.stringify(part.input ?? {})}`.trim()
      }
      if (type === 'image' || type === 'localimage' || type === 'local_image') {
        return `[${type}]`
      }
      return String(part.value ?? '').trim()
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}

function formatTranscriptMessage(message = null) {
  const source = message && typeof message === 'object' ? message : {}
  const role = normalizeId(source.role).toLowerCase() || 'user'
  const label = role === 'assistant'
    ? 'Assistant'
    : (role === 'system'
      ? 'System'
      : (role === 'developer' ? 'Developer' : (role === 'tool' ? 'Tool' : 'User')))
  const text = flattenMessageText(source.content)
  return text ? `${label}: ${text}` : ''
}

function extractLatestUserText(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (normalizeId(message?.role).toLowerCase() !== 'user') continue
    const text = flattenMessageText(message?.content)
    if (text) return text
  }
  return ''
}

function toOpenAIAccountImageInput(part = null) {
  const source = part && typeof part === 'object' ? part : {}
  const type = normalizeId(source.type).toLowerCase()
  if (!['image', 'localimage', 'local_image'].includes(type)) return null

  const localPath = String(source.localPath ?? source.path ?? '').trim()
  if (localPath) return { type: 'localImage', path: localPath }

  const image = String(source.url ?? source.imageUrl ?? source.image ?? '').trim()
  if (!image) return null
  if (/^(?:data:image\/|https?:\/\/)/i.test(image)) {
    return { type: 'image', url: image }
  }
  const mediaType = String(source.mediaType ?? source.mimeType ?? 'image/png').trim() || 'image/png'
  return { type: 'image', url: `data:${mediaType};base64,${image}` }
}

function toOpenAIAccountUserInput(content = null) {
  if (typeof content === 'string') {
    const text = content.trim()
    return text ? [{ type: 'text', text }] : []
  }
  if (!Array.isArray(content)) return []
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return null
      const type = normalizeId(part.type).toLowerCase()
      if (type === 'text' || type === 'input_text') {
        const text = String(part.text ?? part.value ?? '').trim()
        return text ? { type: 'text', text } : null
      }
      return toOpenAIAccountImageInput(part)
    })
    .filter(Boolean)
}

function extractLatestUserInput(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (normalizeId(message?.role).toLowerCase() !== 'user') continue
    const input = toOpenAIAccountUserInput(message?.content)
    if (input.length > 0) return input
  }
  return []
}

function extractAllUserImageInputs(messages = []) {
  return messages.flatMap((message) => {
    if (normalizeId(message?.role).toLowerCase() !== 'user') return []
    const content = Array.isArray(message?.content) ? message.content : []
    return content.map((part) => toOpenAIAccountImageInput(part)).filter(Boolean)
  })
}

function buildInitialTurnText(messages = []) {
  const source = Array.isArray(messages) ? messages : []
  const systemText = source
    .filter((message) => ['system', 'developer'].includes(normalizeId(message?.role).toLowerCase()))
    .map((message) => formatTranscriptMessage(message))
    .filter(Boolean)
    .join('\n')
  const transcript = source
    .map((message) => formatTranscriptMessage(message))
    .filter(Boolean)
    .join('\n')
  const sections = [
    'You are answering a chat turn for the ADDOM desktop app. Respond directly to the user request.',
    systemText ? `Higher-priority instructions:\n${systemText}` : '',
    transcript ? `Conversation transcript:\n${transcript}` : '',
  ].filter(Boolean)
  return sections.join('\n\n').trim()
}

export function buildTurnInput(messages = [], {
  hasExistingThread = false,
  currentTurnInput = null,
} = {}) {
  const source = Array.isArray(messages) ? messages : []
  const explicitCurrentTurnInput = toOpenAIAccountUserInput(currentTurnInput)
  if (explicitCurrentTurnInput.length > 0) {
    if (hasExistingThread) return explicitCurrentTurnInput
    const explicitText = explicitCurrentTurnInput
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .filter(Boolean)
      .join('\n')
    const initialText = buildInitialTurnText(source)
    const text = [
      initialText,
      explicitText ? `Current turn input:\n${explicitText}` : '',
    ].filter(Boolean).join('\n\n')
    return [
      ...(text ? [{ type: 'text', text }] : []),
      ...explicitCurrentTurnInput.filter((part) => part.type !== 'text'),
    ]
  }
  if (hasExistingThread) {
    const latestUserInput = extractLatestUserInput(source)
    if (latestUserInput.length > 0) return latestUserInput
  }
  const latestUserText = extractLatestUserText(messages)
  const text = hasExistingThread && latestUserText
    ? latestUserText
    : (buildInitialTurnText(messages) || latestUserText)
  const imageInputs = hasExistingThread ? [] : extractAllUserImageInputs(source)
  if (!text && imageInputs.length === 0) {
    throw createOpenAIAccountRuntimeError(
      'account_runtime_missing_input',
      'OpenAI account runtime could not derive a turn input from the current chat history.',
    )
  }
  return [
    ...(text ? [{ type: 'text', text }] : []),
    ...imageInputs,
  ]
}

export function extractThreadId(params = null) {
  return normalizeId(params?.threadId || params?.thread?.id)
}

export function extractTurnId(params = null) {
  return normalizeId(params?.turnId || params?.turn?.id)
}

export function extractAssistantPhase(payload = null) {
  if (!payload || typeof payload !== 'object') return ''
  return normalizeAssistantPhase(
    payload.phase
    || payload.textPhase
    || payload.assistantPhase,
  )
}

export function extractDeltaText(payload = null) {
  if (!payload || typeof payload !== 'object') return ''
  if (typeof payload.delta === 'string') return payload.delta
  if (typeof payload.text === 'string') return payload.text
  if (typeof payload.textDelta === 'string') return payload.textDelta
  if (payload.delta && typeof payload.delta === 'object') {
    return String(payload.delta.text ?? payload.delta.value ?? '').trim()
  }
  return ''
}

export function extractReasoningText(payload = null) {
  if (!payload || typeof payload !== 'object') return ''
  if (typeof payload.summary === 'string') return payload.summary
  if (Array.isArray(payload.summary)) {
    return payload.summary
      .map((entry) => String(entry?.text ?? entry?.value ?? '').trim())
      .filter(Boolean)
      .join('\n')
      .trim()
  }
  if (Array.isArray(payload.content)) {
    return payload.content
      .map((entry) => String(entry?.text ?? entry?.value ?? '').trim())
      .filter(Boolean)
      .join('\n')
      .trim()
  }
  return extractDeltaText(payload)
}

export function extractItemId(payload = null) {
  return normalizeId(
    payload?.itemId
    || payload?.item?.id
    || payload?.id,
  )
}

export function extractPlanText(payload = null) {
  if (!payload || typeof payload !== 'object') return ''
  if (typeof payload.text === 'string') return payload.text
  if (typeof payload.delta === 'string') return payload.delta
  return extractDeltaText(payload)
}

export function createOpenAIAccountMessageBoundaryTracker() {
  let activeItemId = ''
  return (value = '') => {
    const itemId = normalizeId(value)
    const boundaryBefore = Boolean(itemId && activeItemId && itemId !== activeItemId)
    if (itemId) activeItemId = itemId
    return boundaryBefore
  }
}

export function buildOpenAIAccountChunkPayload(delta = '', {
  modelId = '',
  phase = '',
  activityKind = '',
  boundaryBefore = false,
} = {}) {
  const chunk = String(delta ?? '')
  if (!chunk) return ''
  const normalizedPhase = resolveOpenAIAccountAssistantPhase({
    modelId,
    phase,
    transportMode: OPENAI_ACCOUNT_TRANSPORT_MODE,
    authMethod: 'account',
    activityKind,
  })
  if (!normalizedPhase && boundaryBefore !== true) return chunk
  return {
    chunk,
    ...(normalizedPhase ? { phase: normalizedPhase } : {}),
    ...(boundaryBefore === true ? { boundaryBefore: true } : {}),
  }
}
