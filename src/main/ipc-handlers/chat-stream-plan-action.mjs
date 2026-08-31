import {
  failPlanDirectionSynthesis,
  failPlanReviewRevision,
  readPlanState,
} from '../chat/plan-runtime-state.mjs'
import { commitPlanLifecycleProjection } from '../chat/plan-lifecycle-event.mjs'

export function failPendingPlanDirectionAction({
  planAction,
  projectFolder,
  threadId,
  turnId,
  error,
  persistTimelineEvent,
  send,
} = {}) {
  if (planAction?.kind !== 'synthesize_direction' && planAction?.kind !== 'revise_plan') return false
  try {
    const current = readPlanState(projectFolder, {
      threadId,
      planId: planAction.planId,
    }).plan
    const failed = planAction.kind === 'revise_plan'
      ? (() => {
          if (
            current.lifecycle !== 'revising'
            || current.review?.submission?.status !== 'pending'
            || current.review.submission.requestId !== planAction.requestId
          ) return null
          return failPlanReviewRevision(projectFolder, {
            request_id: planAction.requestId,
            error: String(error || '').replace(/plan direction/gi, 'managed plan revision'),
          }, {
            threadId,
            planId: planAction.planId,
          })
        })()
      : (() => {
          if (
            current.direction?.stage !== 'synthesizing'
            || current.direction?.synthesis?.status !== 'pending'
            || current.direction.synthesis.requestId !== planAction.requestId
          ) return null
          return failPlanDirectionSynthesis(projectFolder, {
            request_id: planAction.requestId,
            error,
          }, {
            threadId,
            planId: planAction.planId,
          })
        })()
    if (!failed) return false
    commitPlanLifecycleProjection({
      result: failed,
      stepMeta: { threadId, turnId },
      threadId,
      isError: false,
      decision: 'approved',
      persistTimelineEvent,
      send,
    })
    return true
  } catch {
    return false
  }
}
