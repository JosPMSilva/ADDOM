export const MAX_TIMELINE_ITEMS = 4000

export function now() {
  return Date.now()
}

export function withActivityTimestamp(entry) {
  return {
    ...entry,
    createdAt: Number(entry?.createdAt || 0) || now(),
  }
}

export function trimText(text, max = 2200) {
  const value = String(text ?? '')
  if (value.length <= max) return value
  return `${value.slice(0, max)}... [truncated]`
}

export function toTimelineMessage(message, createdAt = now()) {
  return {
    id: `msg:${message.id}`,
    kind: 'message',
    createdAt: Number(createdAt) || now(),
    message,
  }
}

export function toTimelineTool(activity) {
  return {
    id: `tool:${activity.id || crypto.randomUUID()}`,
    kind: 'tool',
    createdAt: Number(activity.createdAt || 0) || now(),
    activity,
  }
}

export function trimTimeline(items, maxItems = MAX_TIMELINE_ITEMS) {
  if (!Array.isArray(items)) return []
  return items.length > maxItems
    ? items.slice(items.length - maxItems)
    : items
}

export function upsertTimelineMessage(timeline, messageId, messageBuilder) {
  const id = String(messageId ?? '').trim()
  if (!id || typeof messageBuilder !== 'function') {
    return trimTimeline(Array.isArray(timeline) ? timeline : [])
  }

  const rows = Array.isArray(timeline) ? timeline : []
  const existingIndex = rows.findIndex((item) => (
    item?.kind === 'message' && item?.message?.id === id
  ))
  const existingEntry = existingIndex >= 0 ? rows[existingIndex] : null

  const nextMessage = messageBuilder(existingEntry?.message ?? null)
  if (!nextMessage || typeof nextMessage !== 'object') {
    return trimTimeline(rows.filter((item) => !(
      item?.kind === 'message' && item?.message?.id === id
    )))
  }

  const nextEntry = {
    id: String(existingEntry?.id ?? `msg:${id}`),
    kind: 'message',
    createdAt: Number(existingEntry?.createdAt || 0) || now(),
    message: nextMessage,
  }

  if (existingIndex < 0) return trimTimeline([...rows, nextEntry])

  const nextRows = []
  for (let index = 0; index < rows.length; index += 1) {
    const item = rows[index]
    if (item?.kind === 'message' && item?.message?.id === id) {
      if (index === existingIndex) nextRows.push(nextEntry)
      continue
    }
    nextRows.push(item)
  }
  return trimTimeline(nextRows)
}

export function resolveStreamingIndexes(state, id) {
  const targetId = String(id ?? '').trim()
  const messages = Array.isArray(state?.messages) ? state.messages : []
  const timeline = Array.isArray(state?.timeline) ? state.timeline : []

  let messageIndex = Number.isInteger(state?.streamingMessageIndex)
    ? Number(state.streamingMessageIndex)
    : -1
  if (
    messageIndex < 0
    || messageIndex >= messages.length
    || messages[messageIndex]?.id !== targetId
  ) {
    messageIndex = messages.findIndex((m) => m?.id === targetId)
  }

  let timelineIndex = Number.isInteger(state?.streamingTimelineIndex)
    ? Number(state.streamingTimelineIndex)
    : -1
  if (
    timelineIndex < 0
    || timelineIndex >= timeline.length
    || timeline[timelineIndex]?.kind !== 'message'
    || timeline[timelineIndex]?.message?.id !== targetId
  ) {
    timelineIndex = timeline.findIndex((row) => row?.kind === 'message' && row?.message?.id === targetId)
  }

  return { messageIndex, timelineIndex }
}
