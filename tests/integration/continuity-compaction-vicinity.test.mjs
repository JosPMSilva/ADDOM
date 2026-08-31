import test from 'node:test'
import assert from 'node:assert/strict'

import { createContinuityRuntime } from '../../src/main/chat/continuity/continuity-runtime.mjs'
import { COMPACTION_VICINITY_MARKER_HEADER } from '../../src/main/chat/continuity/compaction-handoff-prompt.mjs'

test('continuity runtime injects one pre-compaction vicinity marker without repeating it on later rounds', async () => {
  const statusEvents = []
  const timelineEvents = []
  const runtime = createContinuityRuntime({
    providerId: 'openai',
    policy: { enabled: true },
    threadId: 'thread_vicinity_1',
    turnId: 'turn_vicinity_1',
    project: 'project_vicinity_1',
    modelLimit: 16000,
    send: (channel, payload) => {
      if (channel === 'chat:continuity-status') statusEvents.push(payload)
    },
    persistTimelineEvent: (kind, payload) => {
      timelineEvents.push({ kind, payload })
    },
  })

  const historyRound1 = [
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'user', content: 'Keep implementing the same task without resetting intent.' },
    { role: 'assistant', content: 'Next step: continue editing src/main/chat/continuity/continuity-runtime.mjs.' },
  ]

  const first = await runtime.applyBeforeModelCall({
    history: historyRound1,
    round: 1,
    rollingTotalTokens: 0,
    contextOccupancyTokens: 13000,
    userMessage: 'Continue.',
  })

  const firstMarkerCount = first.history.filter((row) => String(row?.content || '').includes(COMPACTION_VICINITY_MARKER_HEADER)).length
  assert.equal(first.compacted, false)
  assert.equal(firstMarkerCount, 1)

  const second = await runtime.applyBeforeModelCall({
    history: first.history,
    round: 2,
    rollingTotalTokens: 0,
    contextOccupancyTokens: 13200,
    userMessage: 'Continue.',
  })

  const secondMarkerCount = second.history.filter((row) => String(row?.content || '').includes(COMPACTION_VICINITY_MARKER_HEADER)).length
  assert.equal(secondMarkerCount, 1)
  assert.ok(
    statusEvents.some((payload) => String(payload?.phase || '').trim() === 'compaction_vicinity'),
  )
  assert.ok(
    timelineEvents.some((event) => String(event?.kind || '').trim() === 'continuity_compaction_vicinity'),
  )
})
