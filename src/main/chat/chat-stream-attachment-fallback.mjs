import { resolveRegistryModel } from '../api-clients/model-registry.mjs'
import { buildRunbookErrorReason } from './chat-error-hints.mjs'
import { trimText } from './tool-event-mapper.mjs'
import {
  normalizeAttachmentTextExtractionSettings,
  resolveModelAttachmentSupport,
} from '../../common/attachments/attachment-support-policy.mjs'
import { applyAttachmentTextExtractionFallback } from '../attachments/attachment-text-extraction.mjs'

function resolveModelFileSupport(registryModel = null) {
  return resolveModelAttachmentSupport(registryModel?.model || null)
}

function applyExtractionDiagnostics(errorDiagnostics = {}, diagnostics = {}) {
  errorDiagnostics.conversion_attempted = diagnostics.conversion_attempted === true
  errorDiagnostics.converted_count = Number(diagnostics.converted_count || 0) || 0
  errorDiagnostics.skipped_count = Number(diagnostics.skipped_count || 0) || 0
  errorDiagnostics.failed_count = Number(diagnostics.failed_count || 0) || 0
  errorDiagnostics.failure_reason_code = String(diagnostics.failure_reason_code || '').trim()
  errorDiagnostics.failure_message_sanitized = String(diagnostics.failure_message_sanitized || '').trim()
  errorDiagnostics.next_action_hint = String(diagnostics.next_action_hint || '').trim()
}

export async function applyAttachmentFallbackPhase({
  historyMessages = [],
  settings = {},
  providerId = '',
  model = '',
  projectId = '',
  threadId = '',
  errorDiagnostics = {},
  send = () => {},
  sendNotice = () => {},
  sendTurnState = () => {},
  persistTimelineEvent = () => {},
  commitFailureTurn = null,
} = {}) {
  const attachmentTextExtractionSettings = normalizeAttachmentTextExtractionSettings(
    settings?.attachmentTextExtraction,
  )
  const registryModel = resolveRegistryModel(providerId, model || '')
  const modelAttachmentSupport = resolveModelFileSupport(registryModel)

  const extractionOutcome = await applyAttachmentTextExtractionFallback({
    historyMessages,
    providerId,
    modelAttachmentSupport,
    projectId,
    threadId,
    extractionSettings: attachmentTextExtractionSettings,
  })

  if (extractionOutcome?.diagnostics && typeof extractionOutcome.diagnostics === 'object') {
    applyExtractionDiagnostics(errorDiagnostics, extractionOutcome.diagnostics)
  }
  if (extractionOutcome?.notice) {
    sendNotice(extractionOutcome.notice)
  }
  if (!extractionOutcome?.ok) {
    const genericCardMessage = 'No output generated. Check turn runbook for errors.'
    const extractionFailureMessage = String(
      extractionOutcome?.failure?.message || 'Attachment text extraction fallback failed.',
    ).trim()
    const extractionRunbookReason = trimText(
      buildRunbookErrorReason({
        err: null,
        providerId,
        model: model || '',
        summarizedMessage: extractionFailureMessage || genericCardMessage,
        providerDetail: extractionFailureMessage,
        detailMode: errorDiagnostics.runbookDetailMode,
        diagnostics: errorDiagnostics,
      }),
      4200,
    )
    const failureReason = extractionRunbookReason
      || extractionFailureMessage
      || 'attachment_extraction_failed'
    if (typeof commitFailureTurn === 'function') {
      commitFailureTurn({
        message: genericCardMessage,
        reason: failureReason,
        errorMeta: {
          failureReasonCode: 'attachment_extraction_failed',
        },
      })
    } else {
      persistTimelineEvent('chat_error', {
        role: 'system',
        content: `Error: ${genericCardMessage}`,
      })
      send('chat:error', { message: genericCardMessage })
      sendTurnState('completed', {
        status: 'error',
        reason: failureReason,
      })
    }
    return {
      ok: false,
      history: historyMessages,
    }
  }

  return {
    ok: true,
    history: Array.isArray(extractionOutcome?.history)
      ? extractionOutcome.history
      : historyMessages,
  }
}
