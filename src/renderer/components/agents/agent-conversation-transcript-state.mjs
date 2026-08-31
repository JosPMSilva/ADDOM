function sequence(item = {}) {
  const value = Number(item?.transcriptSequence || 0)
  return Number.isSafeInteger(value) && value > 0 ? value : 0
}

export function mergeConversationTranscriptItems(currentItems = [], incomingItems = []) {
  const byId = new Map()
  for (const item of [...currentItems, ...incomingItems]) {
    const id = String(item?.id || '')
    if (id) byId.set(id, item)
  }
  return [...byId.values()].sort((left, right) => (
    sequence(left) - sequence(right)
    || Number(left?.createdAt || 0) - Number(right?.createdAt || 0)
    || String(left?.id || '').localeCompare(String(right?.id || ''))
  ))
}

export function mergeLatestConversationTranscriptPage(current = {}, page = {}, selectionKey = '') {
  const sameSelection = current.selectionKey === selectionKey
  const pagingStarted = sameSelection && current.pagingStarted === true
  return {
    selectionKey,
    items: mergeConversationTranscriptItems(sameSelection ? current.items : [], page?.items),
    hasMore: pagingStarted ? current.hasMore === true : page?.hasMore === true,
    nextCursor: pagingStarted ? current.nextCursor ?? null : page?.nextCursor ?? null,
    pagingStarted,
  }
}

export function mergeOlderConversationTranscriptPage(current = {}, page = {}, selectionKey = '') {
  return {
    selectionKey,
    items: mergeConversationTranscriptItems(current.items, page?.items),
    hasMore: page?.hasMore === true,
    nextCursor: page?.nextCursor ?? null,
    pagingStarted: true,
  }
}

export async function readCompleteConversationTranscript({
  readPage,
  initialPage = null,
  selectionKey = '',
} = {}) {
  if (typeof readPage !== 'function') throw new TypeError('readPage is required')
  let state = {
    selectionKey,
    items: [],
    hasMore: false,
    nextCursor: null,
    pagingStarted: false,
  }
  let cursor = null
  const visitedCursors = new Set()

  while (true) {
    const cursorKey = cursor == null ? 'latest' : String(cursor)
    if (visitedCursors.has(cursorKey)) throw new Error('Transcript pagination cursor repeated')
    visitedCursors.add(cursorKey)
    const page = cursor == null && initialPage
      ? initialPage
      : await readPage(cursor)
    state = cursor == null
      ? mergeLatestConversationTranscriptPage(state, page, selectionKey)
      : mergeOlderConversationTranscriptPage(state, page, selectionKey)
    if (!state.hasMore || state.nextCursor == null) break
    cursor = state.nextCursor
  }

  return {
    ...state,
    hasMore: false,
    nextCursor: null,
    pagingStarted: true,
  }
}
