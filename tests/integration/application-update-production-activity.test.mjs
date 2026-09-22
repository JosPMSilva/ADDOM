import test from 'node:test'
import assert from 'node:assert/strict'

import { createProductionApplicationUpdateActivityMonitor } from '../../src/main/updater/application-update-production-activity.mjs'

test('production activity monitor combines live registries and durable managed projections', async () => {
  const queried = []
  const monitor = createProductionApplicationUpdateActivityMonitor({
    chatRunRegistry: { list: () => [{ id: 'chat-private' }] },
    terminalSessionManager: { listSessions: () => [{ id: 'term-private', status: 'running' }] },
    getManagedRuntimeIfActive: () => ({ ready: async () => {} }),
    getDatabase: () => ({
      prepare(sql) {
        queried.push(sql)
        return {
          all: () => sql.includes('agent_runs')
            ? [{ projection_json: JSON.stringify({ id: 'run-private', status: 'waiting' }) }]
            : [{ projection_json: JSON.stringify({ id: 'approval-private', status: 'pending' }) }],
        }
      },
    }),
    listOpenAIJobs: () => [],
    listCommands: () => [],
    listCursorPids: () => [],
    now: () => 1_000,
  })

  const blockers = await monitor.collectBlockers({
    rendererPreflight: { dirtyTabCount: 0, capturedAt: 1_000 },
  })

  assert.deepEqual(blockers.map(({ kind }) => kind), [
    'running-task',
    'pending-approval',
    'active-terminal',
  ])
  assert.equal(queried.length, 2)
  assert.doesNotMatch(JSON.stringify(blockers), /private/i)
})

test('production activity monitor does not initialize managed runtime just to check idle', async () => {
  const monitor = createProductionApplicationUpdateActivityMonitor({
    chatRunRegistry: { list: () => [] },
    terminalSessionManager: { listSessions: () => [] },
    getManagedRuntimeIfActive: () => null,
    getDatabase: () => { throw new Error('database should not be opened') },
    listOpenAIJobs: () => [],
    listCommands: () => [],
    listCursorPids: () => [],
    now: () => 1_000,
  })

  assert.deepEqual(await monitor.collectBlockers({
    rendererPreflight: { dirtyTabCount: 0, capturedAt: 1_000 },
  }), [])
})

