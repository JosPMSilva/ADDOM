import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildMoaPreflightErrorView,
  buildMoaPreflightHints,
} from '../../src/renderer/components/moa/moa-preflight-errors-view.mjs'

test('preflight error view groups codes, tasks, and emits actionable hints', () => {
  const errors = [
    { code: 'missing_instruction', taskId: 'task_1', message: 'Task "task_1" is missing "instruction".' },
    { code: 'missing_output_format', taskId: 'task_1', message: 'Task "task_1" is missing "expected_output_format".' },
    { code: 'role_not_found', taskId: 'task_1', message: 'Role "" is not configured in Settings > Subagents.' },
    { code: 'missing_instruction', taskId: 'task_2', message: 'Task "task_2" is missing "instruction".' },
  ]

  const view = buildMoaPreflightErrorView(errors, { maxVisible: 2, maxCodeSummary: 4, maxTaskSummary: 4 })
  assert.equal(view.totalCount, 4)
  assert.equal(view.visibleErrors.length, 2)
  assert.equal(view.hiddenCount, 2)
  assert.deepEqual(view.codeCounts.map((row) => [row.code, row.count]), [
    ['missing_instruction', 2],
    ['missing_output_format', 1],
    ['role_not_found', 1],
  ])
  assert.deepEqual(view.taskIds, ['task_1', 'task_2'])
  assert.ok(view.summaryLines.some((line) => line.includes('missing_instruction x2')))
  assert.ok(view.summaryLines.some((line) => line.includes('preflight_error_tasks: task_1, task_2')))
  assert.ok(view.hints.some((line) => /agent_role_id/i.test(line)))
  assert.ok(view.hints.some((line) => /configured MoA agent role/i.test(line)))
})

test('preflight hints include missing key and max-tasks guidance', () => {
  const hints = buildMoaPreflightHints([
    { code: 'missing_api_key', message: 'Missing API key.' },
    { code: 'max_tasks_exceeded', message: 'Too many tasks.' },
  ])
  assert.ok(hints.some((line) => /API keys/i.test(line)))
  assert.ok(hints.some((line) => /Max tasks\/delegation/i.test(line)))
})

