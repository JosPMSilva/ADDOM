import { normalizeAssistantPhase } from '../../../common/chat/assistant-phase.mjs'
import { buildCanonicalFinalDocument } from '../../../common/chat/final-document-contract.mjs'

export function buildHydratedAssistantMessage({
  eventKey = '',
  meta = {},
  turnId = '',
  content = '',
  providerHistoryParts = null,
} = {}) {
  const assistantMessageId = String(meta.assistantMessageId || '').trim()
  const messageId = assistantMessageId || eventKey
  const phase = normalizeAssistantPhase(meta.phase)
  const finalDocument = buildCanonicalFinalDocument({
    threadId: String(meta.threadId || '').trim(),
    turnId,
    messageId,
    text: content,
    finalDocument: meta.finalDocument,
    hasAuthoritativeMessageBinding: Boolean(assistantMessageId),
  })
  return {
    id: messageId,
    role: 'assistant',
    content,
    status: 'done',
    ...(phase ? { phase } : {}),
    reasoning: '',
    reasoningDone: true,
    streamMeta: {
      ...(turnId ? { turnId } : {}),
      ...(meta.threadId ? { threadId: String(meta.threadId || '') } : {}),
      ...(meta.providerId ? { providerId: String(meta.providerId || '') } : {}),
      ...(meta.model ? { model: String(meta.model || '') } : {}),
      ...(meta.authMethod ? { authMethod: String(meta.authMethod || '').trim().toLowerCase() } : {}),
      ...(meta.transportMode ? { transportMode: String(meta.transportMode || '').trim().toLowerCase() } : {}),
    },
    ...(providerHistoryParts ? { providerHistoryParts } : {}),
    ...(Array.isArray(meta.generatedArtifacts) ? { generatedArtifacts: meta.generatedArtifacts } : {}),
    ...(finalDocument ? { finalDocument } : {}),
  }
}
