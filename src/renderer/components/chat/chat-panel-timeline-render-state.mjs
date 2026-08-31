import {
  resolveStreamingLiveTurn,
  resolveStreamingTurnId,
} from './chat-panel-timeline-live-turn.mjs'

export function buildTimelineRenderState({
  timelineBlocks = [],
  timelineBlockMeta = null,
  resolvedLiveExecutionTurns = {},
  streamingMessage = null,
} = {}) {
  const assistantMessageTurnIdsWithLiveExecution = new Set()
  const assistantMessageTurnIds = Array.isArray(timelineBlockMeta?.assistantMessageTurnIds)
    ? timelineBlockMeta.assistantMessageTurnIds
    : []
  let derivedLastRunbookIndex = -1
  for (let index = 0; index < timelineBlocks.length; index += 1) {
    if (timelineBlocks[index]?.kind === 'runbook') derivedLastRunbookIndex = index
  }
  const lastRunbookIndex = Number.isInteger(timelineBlockMeta?.lastRunbookIndex)
    ? timelineBlockMeta.lastRunbookIndex
    : derivedLastRunbookIndex
  const streamingTurnId = String(streamingMessage?.streamMeta?.turnId || '').trim()
  const streamingLiveTurn = resolveStreamingLiveTurn({
    resolvedLiveExecutionTurns,
    streamingMessage,
    streamingTurnId,
  })
  const candidateTurnIds = assistantMessageTurnIds.length > 0
    ? assistantMessageTurnIds
    : timelineBlocks
      .filter((block) => block?.kind === 'entry' && block?.entry?.kind === 'message')
      .filter((block) => String(block?.entry?.message?.role || '').trim() === 'assistant')
      .map((block) => String(block?.entry?.message?.streamMeta?.turnId || '').trim())
      .filter(Boolean)
  for (const turnId of candidateTurnIds) {
    if (resolvedLiveExecutionTurns[turnId]) assistantMessageTurnIdsWithLiveExecution.add(turnId)
  }
  const hasActiveLiveExecutionTurn = Object.values(resolvedLiveExecutionTurns).some(
    (turn) => String(turn?.status || '').trim().toLowerCase() === 'active',
  )
  return {
    assistantMessageTurnIdsWithLiveExecution,
    lastRunbookIndex,
    hasActiveLiveExecutionTurn,
    streamingLiveTurn,
    streamingTurnId: resolveStreamingTurnId(streamingLiveTurn, streamingTurnId),
  }
}
