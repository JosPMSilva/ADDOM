import { createChatStreamDelivery } from './chat-stream-handler-helpers.mjs'

const SETUP_FAILURE_MESSAGE = 'ADDOM could not start this turn. Please try again.'

function settleOrphanedRuns(runRegistry, { threadId = '', turnId = '' } = {}) {
  if (typeof runRegistry?.select !== 'function' || typeof runRegistry?.settle !== 'function') return
  const runs = runRegistry.select({ threadId, turnId })
  for (const run of Array.isArray(runs) ? runs : []) {
    runRegistry.settle(String(run?.loopKey || ''), run)
  }
}

export async function runChatStreamWithFailureBoundary({
  event,
  payload = {},
  runRegistry,
  handleStream,
  createDelivery = createChatStreamDelivery,
} = {}) {
  const activePayload = {
    ...(payload || {}),
    turnId: String(payload?.turnId || '').trim() || `turn_setup_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
  }
  try {
    await handleStream(event, activePayload, runRegistry)
  } catch (error) {
    const threadId = String(activePayload.threadId || '').trim()
    const turnId = activePayload.turnId
    const reason = String(error?.message || error || 'unknown setup failure').trim()
    try {
      const delivery = createDelivery({
        event,
        activeProjectId: String(activePayload.projectId || '').trim(),
        activeThreadId: threadId,
        activeTurnId: turnId,
        activeAssistantMessageId: String(activePayload.assistantMessageId || '').trim(),
        providerId: String(activePayload.providerId || '').trim(),
        runtime: String(activePayload.providerId || '').trim(),
      })
      delivery.commitFailureTurn({
        message: SETUP_FAILURE_MESSAGE,
        reason: `chat_stream_setup_failure: ${reason}`,
        errorMeta: {
          failureStage: 'stream_setup',
          errorName: String(error?.name || 'Error'),
        },
      })
    } catch (reportError) {
      console.error('[chat] failed to report stream setup failure:', String(reportError?.message || reportError || 'unknown error'))
    } finally {
      settleOrphanedRuns(runRegistry, { threadId, turnId })
    }
  }
}
