import {
  buildRunbookErrorReason,
  extractProviderErrorDetail,
  formatProviderErrorForUser,
  withAttachmentSupportHint,
  withModelSelectionHint,
} from './chat-error-hints.mjs'
import { trimText } from './tool-event-mapper.mjs'

export function emitStreamFailure({
  outerErr = null,
  providerId = '',
  model = '',
  errorDiagnostics = {},
  send = () => {},
  sendTurnState = () => {},
  persistTimelineEvent = () => {},
  commitFailureTurn = null,
} = {}) {
  const isStaleNoProgress = (
    outerErr?.streamStale === true
    || String(outerErr?.code || '').trim().toLowerCase() === 'provider_stream_stale'
  )
  const normalizedProviderError = formatProviderErrorForUser(
    outerErr,
    providerId,
    model,
  )
  const hinted = withAttachmentSupportHint(
    withModelSelectionHint(normalizedProviderError, providerId, model),
    providerId,
    model,
  )
  const providerDetail = extractProviderErrorDetail(outerErr)
  const runbookReason = trimText(
    buildRunbookErrorReason({
      err: outerErr,
      providerId,
      model,
      summarizedMessage: hinted,
      providerDetail,
      detailMode: errorDiagnostics.runbookDetailMode,
      diagnostics: errorDiagnostics,
    }),
    4200,
  )
  const cardMessage = trimText(
    String(hinted || normalizedProviderError || 'No output generated. Check turn runbook for errors.'),
    320,
  ) || 'No output generated. Check turn runbook for errors.'
  if (isStaleNoProgress) {
    sendTurnState('stale', {
      status: 'stale',
      label: 'stale/no progress',
      reason: runbookReason || String(normalizedProviderError || 'provider_stream_stale'),
    })
  }
  const terminalReason = runbookReason || String(normalizedProviderError || 'unknown_error')
  if (typeof commitFailureTurn === 'function') {
    commitFailureTurn({
      message: cardMessage,
      reason: terminalReason,
    })
    return
  }
  persistTimelineEvent('chat_error', {
    role: 'system',
    content: `Error: ${cardMessage}`,
  })
  send('chat:error', { message: cardMessage })
  sendTurnState('completed', {
    status: 'error',
    reason: terminalReason,
  })
}
