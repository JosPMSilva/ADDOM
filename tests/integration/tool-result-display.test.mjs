import test from 'node:test'
import assert from 'node:assert/strict'

import { formatToolResultForDisplay } from '../../src/common/chat/tool-result-display.mjs'

test('tool result display summarizes plan results without object coercion', () => {
  const display = formatToolResultForDisplay('plan_update', {
    todos: [
      { id: 'task_1', content: 'Review runtime', status: 'completed' },
    ],
    summary: '1 task (0 pending, 0 in progress, 1 completed)',
  })

  assert.equal(display, '1 task (0 pending, 0 in progress, 1 completed)')
})

test('tool result display renders structured question payloads as readable clarification text', () => {
  const display = formatToolResultForDisplay('question_user', {
    header: 'Schema Choice',
    question: 'Patch-first only?',
    options: [
      { label: 'Yes', description: 'Use patch-first only' },
      { label: 'No', description: 'Keep direct write tools too' },
    ],
  })

  assert.match(display, /Schema Choice:/)
  assert.match(display, /Patch-first only\?/)
  assert.match(display, /- Yes: Use patch-first only/)
  assert.match(display, /- No: Keep direct write tools too/)
})

test('tool result display renders terminal memory suggestion payloads as readable save-copy text', () => {
  const display = formatToolResultForDisplay('terminal_memory_suggest', {
    suggestion: {
      summary: 'This workspace uses pnpm through Corepack for package installs.',
      reason: 'Future package fixes should use the same command path.',
    },
  })

  assert.match(display, /Terminal memory suggestion prepared:/)
  assert.match(display, /Summary: This workspace uses pnpm through Corepack/)
  assert.match(display, /Why it matters: Future package fixes should use the same command path\./)
})
