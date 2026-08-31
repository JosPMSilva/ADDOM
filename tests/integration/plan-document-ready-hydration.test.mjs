import test from 'node:test'
import assert from 'node:assert/strict'

import { mapTimelineFromPersistedEvents } from '../../src/renderer/store/chat/timeline-hydration.mjs'

test('hydration restores the latest durable plan_document_ready projection without execution-stream noise', () => {
  const mapped = mapTimelineFromPersistedEvents([{
    eventId: 41,
    kind: 'plan_document_ready',
    turnId: 'turn_plan',
    createdAt: 100,
    content: 'Managed plan ready for review.',
    meta: {
      threadId: 'thread_plan',
      projectRoot: 'C:\\repo',
      planId: 'plan_1',
      revision: 4,
      lifecycle: 'ready_for_review',
      document: {
        kind: 'managed_plan',
        planId: 'plan_1',
        filePath: 'C:\\user-data\\plan_1.md',
        revision: 4,
      },
    },
  }])

  assert.deepEqual(mapped.planDocumentReady, {
    threadId: 'thread_plan',
    projectRoot: 'C:\\repo',
    planId: 'plan_1',
    revision: 4,
    lifecycle: 'ready_for_review',
    document: {
      kind: 'managed_plan',
      planId: 'plan_1',
      filePath: 'C:\\user-data\\plan_1.md',
      revision: 4,
    },
  })
  assert.equal(mapped.toolActivity.length, 0)
})
