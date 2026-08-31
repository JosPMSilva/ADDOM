import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeToolPathForEditGuard,
  recordInspectedPathForTurn,
  shouldBlockEditFileWithoutInspection,
} from '../../src/main/chat/edit-file-context-guard.mjs'

test('edit-file context guard blocks edit_file until file was inspected in the same turn', () => {
  const inspectedPaths = new Set()
  const blocked = shouldBlockEditFileWithoutInspection({
    toolName: 'edit_file',
    toolInput: { path: 'todo_app.py' },
    inspectedPaths,
  })
  assert.equal(blocked.blocked, true)
  assert.match(String(blocked.message || ''), /requires a prior read_file or view_file_range/i)

  recordInspectedPathForTurn({
    toolName: 'read_file',
    toolInput: { path: 'todo_app.py' },
    decision: 'approved',
    isError: false,
    inspectedPaths,
  })

  const allowed = shouldBlockEditFileWithoutInspection({
    toolName: 'edit_file',
    toolInput: { path: 'todo_app.py' },
    inspectedPaths,
  })
  assert.equal(allowed.blocked, false)
})

test('edit-file context guard only records successful read_file/view_file_range calls', () => {
  const inspectedPaths = new Set()

  recordInspectedPathForTurn({
    toolName: 'read_file',
    toolInput: { path: 'a.py' },
    decision: 'denied',
    isError: false,
    inspectedPaths,
  })
  recordInspectedPathForTurn({
    toolName: 'view_file_range',
    toolInput: { path: 'a.py' },
    decision: 'approved',
    isError: true,
    inspectedPaths,
  })
  assert.equal(inspectedPaths.size, 0)

  recordInspectedPathForTurn({
    toolName: 'view_file_range',
    toolInput: { path: 'a.py' },
    decision: 'approved',
    isError: false,
    inspectedPaths,
  })
  assert.equal(inspectedPaths.has(normalizeToolPathForEditGuard('a.py')), true)
})

test('edit-file context guard normalizes Windows-style paths consistently', () => {
  const normalized = normalizeToolPathForEditGuard('.\\Src\\Todo_App.py', 'win32')
  assert.equal(normalized, 'src/todo_app.py')
})
