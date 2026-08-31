import test from 'node:test'
import assert from 'node:assert/strict'

import { mapTimelineFromPersistedEvents } from '../../src/renderer/store/chat/timeline-hydration.mjs'

test('timeline hydration preserves persisted non-terminal turn phases as active', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 1,
      createdAt: 100,
      kind: 'turn_phase',
      role: 'system',
      turnId: 'turn_phase_1',
      content: 'Turn phase: waiting for approval.',
      meta: {
        threadId: 'thread_phase_1',
        turnId: 'turn_phase_1',
        state: 'waiting_for_approval',
        status: 'waiting_for_approval',
        toolName: 'run_command',
        startedAt: 100,
      },
    },
  ])

  assert.equal(mapped.toolActivity.length, 1)
  assert.equal(mapped.toolActivity[0].eventKind, 'turn_phase')
  assert.equal(mapped.toolActivity[0].turnState, 'waiting_for_approval')
  assert.equal(mapped.toolActivity[0].label, 'Waiting for approval: run_command')
  const hydratedTurn = mapped.liveExecution.turnsById.turn_phase_1
  assert.ok(hydratedTurn)
  assert.equal(hydratedTurn.status, 'active')
  assert.deepEqual(hydratedTurn.eventOrder, ['activity:event:1'])
})

test('timeline hydration preserves phase chronology when a persisted turn later completes', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 1,
      createdAt: 100,
      kind: 'turn_started',
      role: 'system',
      turnId: 'turn_phase_2',
      content: 'Turn started.',
      meta: {
        threadId: 'thread_phase_2',
        turnId: 'turn_phase_2',
        state: 'started',
        startedAt: 100,
      },
    },
    {
      eventId: 2,
      createdAt: 110,
      kind: 'turn_phase',
      role: 'system',
      turnId: 'turn_phase_2',
      content: 'Turn phase: model_streaming.',
      meta: {
        threadId: 'thread_phase_2',
        turnId: 'turn_phase_2',
        state: 'model_streaming',
        status: 'model_streaming',
        startedAt: 100,
      },
    },
    {
      eventId: 3,
      createdAt: 120,
      kind: 'turn_phase',
      role: 'system',
      turnId: 'turn_phase_2',
      content: 'Turn phase: running_tool.',
      meta: {
        threadId: 'thread_phase_2',
        turnId: 'turn_phase_2',
        state: 'running_tool',
        status: 'running_tool',
        toolName: 'read_file',
        startedAt: 100,
      },
    },
    {
      eventId: 4,
      createdAt: 130,
      kind: 'turn_completed',
      role: 'system',
      turnId: 'turn_phase_2',
      content: 'Turn completed (ok).',
      meta: {
        threadId: 'thread_phase_2',
        turnId: 'turn_phase_2',
        state: 'completed',
        status: 'ok',
        startedAt: 100,
        finishedAt: 130,
      },
    },
  ])

  const hydratedTurn = mapped.liveExecution.turnsById.turn_phase_2
  assert.ok(hydratedTurn)
  assert.equal(hydratedTurn.status, 'done')
  assert.deepEqual(hydratedTurn.eventOrder, [
    'activity:event:1',
    'activity:event:2',
    'activity:event:3',
    'activity:event:4',
  ])

  const phaseLabels = hydratedTurn.eventOrder
    .map((eventId) => hydratedTurn.eventsById[eventId]?.summary)
    .filter(Boolean)
  assert.deepEqual(phaseLabels, [
    'Turn started',
    'Model streaming',
    'Running tool: read_file',
    'Turn completed (ok)',
  ])
})
