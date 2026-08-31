import assert from 'node:assert/strict'
import test from 'node:test'

import { createAgentRunQueryService } from '../../src/main/agents/agent-run-query-service.mjs'

function stubDb({ threadRow = null } = {}) {
  return {
    prepare(sql) {
      const text = String(sql || '')
      return {
        get(...args) {
          if (text.includes('FROM chat_threads')) {
            const [threadId, projectId] = args
            if (!threadRow) return undefined
            if (threadRow.id === threadId && threadRow.projectId === projectId) {
              return { id: threadId }
            }
            return undefined
          }
          throw new Error(`unexpected get SQL: ${text}`)
        },
        all() {
          throw new Error('db all() should not run for blank or foreign list scope')
        },
      }
    },
  }
}

test('listRuns returns an empty page for blank projectId or threadId without throwing', () => {
  const query = createAgentRunQueryService({
    db: stubDb(),
    repository: {},
  })
  const empty = {
    schemaVersion: 1,
    runs: [],
    hasMore: false,
    nextCursor: null,
  }
  assert.deepEqual(query.listRuns({}), empty)
  assert.deepEqual(query.listRuns({ projectId: '', threadId: '' }), empty)
  assert.deepEqual(query.listRuns({ projectId: 'project_01', threadId: '' }), empty)
  assert.deepEqual(query.listRuns({ projectId: '', threadId: 'thread_01' }), empty)
  assert.deepEqual(query.listRuns({ projectId: '  ', threadId: 'thread_01' }), empty)
  assert.deepEqual(query.listRuns({ projectId: 'project_01', threadId: '  ' }), empty)
})

test('listRuns still hard-fails for present but foreign project/thread scope', () => {
  const query = createAgentRunQueryService({
    db: stubDb({ threadRow: { id: 'thread_01', projectId: 'project_01' } }),
    repository: {},
  })
  assert.throws(
    () => query.listRuns({ projectId: 'project_other', threadId: 'thread_01' }),
    /outside the owning project\/thread scope/,
  )
  assert.throws(
    () => query.listRuns({ projectId: 'project_01', threadId: 'thread_missing' }),
    /outside the owning project\/thread scope/,
  )
})
