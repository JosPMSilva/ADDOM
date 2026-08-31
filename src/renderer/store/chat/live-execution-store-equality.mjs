function arrayEqual(left = [], right = []) {
  if (left === right) return true
  if (!Array.isArray(left) || !Array.isArray(right)) return false
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

function shallowRecordEqual(left = {}, right = {}) {
  if (left === right) return true
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false
    if (left[key] !== right[key]) return false
  }
  return true
}

function liveExecutionEventEqual(left = null, right = null) {
  if (left === right) return true
  if (!left || !right) return false
  return (
    left.id === right.id
    && left.turnId === right.turnId
    && left.threadId === right.threadId
    && left.stepId === right.stepId
    && left.sessionId === right.sessionId
    && left.kind === right.kind
    && left.status === right.status
    && left.createdAt === right.createdAt
    && left.updatedAt === right.updatedAt
    && left.summary === right.summary
    && left.detail === right.detail
    && left.stream === right.stream
    && left.sequence === right.sequence
    && left.truncated === right.truncated
    && left.toolName === right.toolName
    && left.archived === right.archived
    && left.stableDetail === right.stableDetail
    && left.pendingTail === right.pendingTail
    && left.hasPendingTail === right.hasPendingTail
    && arrayEqual(left.reasoningChunks || [], right.reasoningChunks || [])
    && shallowRecordEqual(left.activity || {}, right.activity || {})
  )
}

function liveExecutionSessionEqual(left = null, right = null) {
  if (left === right) return true
  if (!left || !right) return false
  return (
    left.id === right.id
    && left.turnId === right.turnId
    && left.stepId === right.stepId
    && left.toolName === right.toolName
    && left.createdAt === right.createdAt
    && left.updatedAt === right.updatedAt
    && left.startedAt === right.startedAt
    && left.finishedAt === right.finishedAt
    && left.status === right.status
    && shallowRecordEqual(left.output?.stdout || {}, right.output?.stdout || {})
    && shallowRecordEqual(left.output?.stderr || {}, right.output?.stderr || {})
  )
}

export function liveExecutionTurnEqual(left = null, right = null) {
  if (left === right) return true
  if (!left || !right) return false
  if (
    left.turnId !== right.turnId
    || left.threadId !== right.threadId
    || left.status !== right.status
    || left.createdAt !== right.createdAt
    || left.updatedAt !== right.updatedAt
    || left.nextReasoningSeq !== right.nextReasoningSeq
    || left.collapsedReasoningText !== right.collapsedReasoningText
    || left.collapsedReasoningCount !== right.collapsedReasoningCount
    || !arrayEqual(left.eventOrder || [], right.eventOrder || [])
    || !arrayEqual(left.sessionOrder || [], right.sessionOrder || [])
  ) {
    return false
  }

  const leftEventIds = Object.keys(left.eventsById || {})
  const rightEventIds = Object.keys(right.eventsById || {})
  if (!arrayEqual(leftEventIds, rightEventIds)) return false
  for (const eventId of leftEventIds) {
    if (!liveExecutionEventEqual(left.eventsById[eventId], right.eventsById[eventId])) return false
  }

  const leftSessionIds = Object.keys(left.sessionsById || {})
  const rightSessionIds = Object.keys(right.sessionsById || {})
  if (!arrayEqual(leftSessionIds, rightSessionIds)) return false
  for (const sessionId of leftSessionIds) {
    if (!liveExecutionSessionEqual(left.sessionsById[sessionId], right.sessionsById[sessionId])) return false
  }

  return true
}
