import { ipcMain } from 'electron'
import { appendEvent } from '../workspace/workspace-store.mjs'
import {
  getOpenAIAccountPendingQuestionUserRequest,
  respondToOpenAIAccountQuestionUserRequest,
} from '../api-clients/ai-provider-openai-account.mjs'
import {
  getOpenAIAccountPendingMcpElicitation,
  respondToOpenAIAccountPendingMcpElicitation,
} from '../api-clients/ai-provider-openai-account-elicitation-pending.mjs'
import { registerChatCancelHandler } from '../chat/chat-cancel-handler.mjs'
import { createChatRunRegistry } from '../chat/chat-run-registry.mjs'
import { trimText } from '../chat/tool-event-mapper.mjs'
import { handleVersioned, onVersioned } from '../ipc/ipc-versioning.mjs'
import { handleChatStream } from './chat-stream-handler.mjs'

const COMPLIANCE_NOTICE_ACTION_TO_KIND = {
  shown: 'compliance_notice_shown',
  acknowledged: 'compliance_notice_acknowledged',
  skipped: 'compliance_notice_skipped',
}

function normalizeComplianceNoticePayload(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const action = String(source.noticeAction || source.action || '').trim().toLowerCase()
  const kind = COMPLIANCE_NOTICE_ACTION_TO_KIND[action]
  if (!kind) return null

  const threadId = String(source.threadId || '').trim()
  if (!threadId) return null

  const turnId = String(source.turnId || '').trim()
  const noticeType = String(source.noticeType || '').trim().toLowerCase().slice(0, 120)
  const providerId = String(source.providerId || source.toProviderId || '').trim().toLowerCase().slice(0, 80)
  const model = String(source.model || source.toModelId || '').trim().slice(0, 180)
  const termsVersion = String(source.termsVersion || '').trim().slice(0, 120)
  const eventSource = String(source.source || '').trim().toLowerCase().slice(0, 80)
  const sessionSuppressKey = String(source.sessionSuppressKey || '').trim().toLowerCase().slice(0, 120)
  const repeatedCount = Number(source.repeatedCount || 0)
  const preserveCitations = source.preserveCitations
  const summary = trimText(String(source.summary || source.message || source.content || '').trim(), 1200)

  const fallbackContent = `Compliance notice ${action}${noticeType ? ` (${noticeType})` : ''}.`
  const meta = {
    noticeAction: action,
    ...(noticeType ? { noticeType } : {}),
    ...(providerId ? { providerId } : {}),
    ...(model ? { model } : {}),
    ...(termsVersion ? { termsVersion } : {}),
    ...(eventSource ? { source: eventSource } : {}),
    ...(sessionSuppressKey ? { sessionSuppressKey } : {}),
  }
  if (Number.isFinite(repeatedCount) && repeatedCount > 0) {
    meta.repeatedCount = Math.max(1, Math.round(repeatedCount))
  }
  if (typeof preserveCitations === 'boolean') {
    meta.preserveCitations = preserveCitations
  }

  return {
    threadId,
    turnId,
    kind,
    content: summary || fallbackContent,
    meta,
    noticeAction: action,
  }
}

export { handleChatStream }

export function registerChatHandlers({ runRegistry = null } = {}) {
  const registry = runRegistry || createChatRunRegistry({ appendEvent })
  onVersioned(ipcMain, 'chat:stream', async (event, payload = {}) => {
    await handleChatStream(event, payload, registry)
  })
  handleVersioned(ipcMain, 'chat:getPendingQuestionUser', async (_event, payload = {}) => (
    getOpenAIAccountPendingQuestionUserRequest({
      threadId: String(payload?.threadId || ''),
      requestId: String(payload?.requestId || ''),
    })
  ))
  handleVersioned(ipcMain, 'chat:respondQuestionUser', async (_event, payload = {}) => (
    respondToOpenAIAccountQuestionUserRequest({
      threadId: String(payload?.threadId || ''),
      requestId: String(payload?.requestId || ''),
      answer: String(payload?.answer || ''),
      selectedOptionId: String(payload?.selectedOptionId || ''),
      cancel: payload?.cancel === true,
    })
  ))
  handleVersioned(ipcMain, 'chat:getPendingMcpElicitation', async (event, payload = {}) => (
    getOpenAIAccountPendingMcpElicitation({
      threadId: String(payload?.threadId || ''),
      senderId: Number(event?.sender?.id || 0),
    })
  ))
  handleVersioned(ipcMain, 'chat:respondMcpElicitation', async (event, payload = {}) => (
    respondToOpenAIAccountPendingMcpElicitation({
      threadId: String(payload?.threadId || ''),
      senderId: Number(event?.sender?.id || 0),
      action: String(payload?.action || ''),
      content: payload?.content && typeof payload.content === 'object' ? payload.content : null,
    })
  ))
  onVersioned(ipcMain, 'chat:compliance-event', (_event, payload = {}) => {
    const normalized = normalizeComplianceNoticePayload(payload)
    if (!normalized) return
    try {
      appendEvent(normalized.threadId, normalized)
    } catch {
      // Non-fatal compliance telemetry event.
    }
  })
  registerChatCancelHandler({ ipcMain, runRegistry: registry, appendEvent })
  return registry
}
