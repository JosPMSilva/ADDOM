import assert from 'node:assert/strict'
import test from 'node:test'

import {
  mergeLatestConversationTranscriptPage,
  mergeOlderConversationTranscriptPage,
  mergeConversationTranscriptItems,
  readCompleteConversationTranscript,
} from '../../src/renderer/components/agents/agent-conversation-transcript-state.mjs'

test('complete transcript hydration drains internal pages without exposing pagination to the view', async () => {
  const requestedCursors = []
  const pages = new Map([
    [null, { items: [{ id: 'event_5', transcriptSequence: 5 }], hasMore: true, nextCursor: 5 }],
    [5, { items: [{ id: 'event_3', transcriptSequence: 3 }, { id: 'event_4', transcriptSequence: 4 }], hasMore: true, nextCursor: 3 }],
    [3, { items: [{ id: 'event_1', transcriptSequence: 1 }, { id: 'event_2', transcriptSequence: 2 }], hasMore: false, nextCursor: null }],
  ])

  const complete = await readCompleteConversationTranscript({
    selectionKey: 'run\u0000node',
    readPage: async (cursor) => {
      requestedCursors.push(cursor)
      return pages.get(cursor)
    },
  })

  assert.deepEqual(requestedCursors, [null, 5, 3])
  assert.deepEqual(complete.items.map((item) => item.id), [
    'event_1', 'event_2', 'event_3', 'event_4', 'event_5',
  ])
  assert.equal(complete.hasMore, false)
  assert.equal(complete.nextCursor, null)
  assert.equal(complete.pagingStarted, true)
})

test('live transcript refresh retains events that roll out of the newest provider page', () => {
  const initial = Array.from({ length: 100 }, (_, index) => ({
    id: `event_${index + 1}`,
    transcriptSequence: index + 1,
  }))
  const refreshed = Array.from({ length: 100 }, (_, index) => ({
    id: `event_${index + 2}`,
    transcriptSequence: index + 2,
  }))

  const merged = mergeConversationTranscriptItems(initial, refreshed)
  assert.equal(merged.length, 101)
  assert.equal(merged[0].id, 'event_1')
  assert.equal(merged.at(-1).id, 'event_101')
})

test('transcript merging is idempotent and uses durable insertion order', () => {
  const merged = mergeConversationTranscriptItems(
    [{ id: 'event_3', transcriptSequence: 3 }, { id: 'event_1', transcriptSequence: 1 }],
    [{ id: 'event_2', transcriptSequence: 2 }, { id: 'event_3', transcriptSequence: 3 }],
  )
  assert.deepEqual(merged.map((item) => item.id), ['event_1', 'event_2', 'event_3'])
})

test('live refresh preserves the historical paging anchor and completion state', () => {
  const initial = mergeLatestConversationTranscriptPage(
    { selectionKey: '', items: [], hasMore: false, nextCursor: null, pagingStarted: false },
    { items: [{ id: 'event_2', transcriptSequence: 2 }], hasMore: true, nextCursor: 2 },
    'run\u0000node',
  )
  const complete = mergeOlderConversationTranscriptPage(initial, {
    items: [{ id: 'event_1', transcriptSequence: 1 }], hasMore: false, nextCursor: null,
  }, 'run\u0000node')
  const refreshed = mergeLatestConversationTranscriptPage(complete, {
    items: [{ id: 'event_3', transcriptSequence: 3 }], hasMore: true, nextCursor: 3,
  }, 'run\u0000node')

  assert.deepEqual(refreshed.items.map((item) => item.id), ['event_1', 'event_2', 'event_3'])
  assert.equal(refreshed.pagingStarted, true)
  assert.equal(refreshed.hasMore, false)
  assert.equal(refreshed.nextCursor, null)
})
