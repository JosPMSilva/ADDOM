import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatToolExecutionDetail,
  formatToolResultDetail,
} from '../../src/renderer/components/chat/chat-utils.js'

test('edit_file execution detail surfaces old/new text previews in runbook lines', () => {
  const detail = formatToolExecutionDetail('edit_file', {
    old_text_preview: 'class TodoApp:\n    pass',
    new_text_preview: 'class TodoApp:\n    def load(self):\n        ...',
  })
  assert.match(detail, /old_text_preview:/)
  assert.match(detail, /new_text_preview:/)
  assert.match(detail, /class TodoApp:/)
})

test('edit_file result detail keeps error output and preview context', () => {
  const detail = formatToolResultDetail(
    'edit_file',
    {
      old_text_preview: 'def mark_done(self, task_id: int):',
      new_text_preview: 'def mark_done(self, task_id: int):\n    self.save()',
    },
    'Tool error: edit_file: old_text not found in todo_app.py',
    true,
    'approved',
  )
  assert.match(detail, /Tool error:/)
  assert.match(detail, /old_text_preview:/)
  assert.match(detail, /new_text_preview:/)
})
