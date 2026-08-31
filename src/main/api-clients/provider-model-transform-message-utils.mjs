import {
  flattenContentPartsToString,
  normalizePartType,
} from './provider-model-transform-content-utils.mjs'
import { normalizeStructuredContentParts } from './provider-model-transform-normalization-utils.mjs'

export {
  flattenContentPartsToString,
  flattenUserContentPartsToString,
} from './provider-model-transform-content-utils.mjs'
export {
  adaptNormalizedToolResultMessage,
  normalizeToolResultMediaMessages,
} from './provider-model-transform-tool-result-utils.mjs'
export {
  applyMistralSequenceShim,
  normalizeMessageForProviderTransform,
  normalizeStructuredContentParts,
  normalizeToolCallIdsForProvider,
} from './provider-model-transform-normalization-utils.mjs'
export {
  annotateAnthropicPromptCacheControl,
  filterAnthropicEmptyMessageParts,
  replayInterleavedReasoningMessage,
  resolveInterleavedReasoningReplayTarget,
} from './provider-model-transform-reasoning-utils.mjs'
export { downgradeUnsupportedUserAttachments } from './provider-model-transform-attachment-utils.mjs'

export function flattenStructuredTextOnlyContent(
  content,
  {
    allowAttachments = false,
    role = 'message',
  } = {},
) {
  if (typeof content === 'string') {
    return {
      ok: true,
      text: content,
      reason: '',
    }
  }
  if (!Array.isArray(content)) {
    return {
      ok: false,
      text: '',
      reason: 'unsupported_content_shape',
    }
  }

  const chunks = []
  for (const part of normalizeStructuredContentParts(content)) {
    const type = normalizePartType(part.type)
    if (type === 'text') {
      const text = String(part.text ?? '')
      if (text) chunks.push(text)
      continue
    }
    if (allowAttachments && (type === 'image' || type === 'file')) {
      const placeholder = flattenContentPartsToString([part], {
        imagePrefix: `${String(role || 'message')} image attachment omitted in WebSocket history`,
        filePrefix: `${String(role || 'message')} file attachment omitted in WebSocket history`,
      })
      if (placeholder) chunks.push(placeholder)
      continue
    }
    if (type === 'reasoning') {
      continue
    }
    if (type === 'tool-call' || type === 'tool-result') {
      return {
        ok: false,
        text: '',
        reason: 'tool_history_present',
      }
    }
    return {
      ok: false,
      text: '',
      reason: type ? 'non_text_content_present' : 'unsupported_content_shape',
    }
  }

  return {
    ok: true,
    text: chunks.join('\n').trim(),
    reason: '',
  }
}
