import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildExecutionStreamActivityRow,
  coalesceExecutionStreamEvents,
  isExecutionStreamEventVisible,
} from '../../src/renderer/components/chat/live-execution-stream-view-model.mjs'

test('successful delegate_to_agents envelope is hidden from execution stream', () => {
  const event = {
    id: 'evt_1',
    kind: 'tool_result',
    status: 'done',
    activity: {
      toolName: 'delegate_to_agents',
      label: 'Delegate to agents done',
      moa: {
        status: 'completed',
      },
    },
  }

  assert.equal(isExecutionStreamEventVisible(event), false)
  assert.equal(buildExecutionStreamActivityRow(event), null)
})

test('preflight-failed delegate_to_agents envelope stays visible', () => {
  const event = {
    id: 'evt_2',
    kind: 'tool_result',
    status: 'failed',
    activity: {
      toolName: 'delegate_to_agents',
      label: 'Delegate to agents failed',
      moa: {
        status: 'preflight_failed',
      },
    },
  }

  assert.equal(isExecutionStreamEventVisible(event), true)
})

test('legacy live moa_agent_done progress row still renders rich report content', () => {
  const event = {
    id: 'evt_3',
    kind: 'tool_progress',
    activity: {
      eventKind: 'moa_agent_done',
      label: 'MoA agent done: Debugger',
      moa: {
        agentRole: 'Debugger',
        taskInstruction: 'Inspect the SQL schema and report issues.',
        reportMarkdown: [
          '# PostgreSQL Shop Schema',
          '',
          '```sql',
          'CREATE TABLE users (id uuid primary key);',
          '```',
        ].join('\n'),
      },
    },
  }

  const row = buildExecutionStreamActivityRow(event)

  assert.ok(row)
  assert.equal(row.label, 'Debugger')
  assert.equal(row.isChild, true)
  assert.equal(row.iconKind, 'success')
  assert.equal(row.taskInstructionText, 'Inspect the SQL schema and report issues.')
  assert.match(String(row.richContentText || ''), /```sql/)
  assert.match(String(row.richContentText || ''), /CREATE TABLE users/)
})

test('consecutive successful plan updates render as one transparent batch', () => {
  const events = Array.from({ length: 5 }, (_, index) => ({
    id: `plan_${index + 1}`,
    kind: 'tool_result',
    status: 'done',
    activity: {
      toolName: 'plan_update',
      label: 'Plan update done',
    },
  }))

  const coalesced = coalesceExecutionStreamEvents(events)

  assert.equal(coalesced.length, 1)
  assert.equal(coalesced[0].id, 'plan_5')
  assert.equal(coalesced[0].activity.coalescedCount, 5)
  assert.equal(buildExecutionStreamActivityRow(coalesced[0]).label, 'Plan updated (5 changes)')
})

test('plan update batching preserves failures and non-consecutive updates', () => {
  const events = [
    { id: 'plan_1', kind: 'tool_result', status: 'done', activity: { toolName: 'plan_update' } },
    { id: 'read_1', kind: 'tool_result', status: 'done', activity: { toolName: 'read_file' } },
    { id: 'plan_2', kind: 'tool_result', status: 'failed', activity: { toolName: 'plan_update', isError: true } },
    { id: 'plan_3', kind: 'tool_result', status: 'done', activity: { toolName: 'plan_update' } },
  ]

  assert.deepEqual(
    coalesceExecutionStreamEvents(events).map((event) => event.id),
    ['plan_1', 'read_1', 'plan_2', 'plan_3'],
  )
})
