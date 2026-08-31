import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { executeTool } from '../../src/main/tools/fs-tools.mjs'
import { buildPreviewableUnifiedDiff } from '../../src/main/tools/apply-patch-core.mjs'
import { toAISDKTools } from '../../src/main/tools/tool-definitions.mjs'

test('toAISDKTools exposes native apply_patch, plan, question, and terminal memory suggestion tools', () => {
  const tools = toAISDKTools('ask', true)
  assert.equal(Boolean(tools.apply_patch), true)
  assert.equal(Boolean(tools.plan_read), true)
  assert.equal(Boolean(tools.plan_update), true)
  assert.equal(Boolean(tools.todo_read), false)
  assert.equal(Boolean(tools.todo_write), false)
  assert.equal(Boolean(tools.question_user), true)
  assert.equal(Boolean(tools.terminal_memory_suggest), true)
})

test('native apply_patch accepts canonical patch text for create, update, move, and delete', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-native-apply-patch-'))
  try {
    let result = await executeTool(projectRoot, 'apply_patch', {
      patch: [
        '*** Begin Patch',
        '*** Add File: created.txt',
        '+hello',
        '+world',
        '*** End Patch',
      ].join('\n'),
    })
    assert.match(String(result.result || ''), /Patched new file successfully/i)
    assert.equal(fs.readFileSync(path.join(projectRoot, 'created.txt'), 'utf8'), 'hello\nworld\n')

    result = await executeTool(projectRoot, 'apply_patch', {
      patch: [
        '*** Begin Patch',
        '*** Update File: created.txt',
        '@@ -1,2 +1,2 @@',
        ' hello',
        '-world',
        '+addom',
        '*** End Patch',
      ].join('\n'),
    })
    assert.match(String(result.result || ''), /Patched file successfully/i)
    assert.equal(fs.readFileSync(path.join(projectRoot, 'created.txt'), 'utf8'), 'hello\naddom\n')

    result = await executeTool(projectRoot, 'apply_patch', {
      patch: [
        '*** Begin Patch',
        '*** Update File: created.txt',
        '*** Move to: moved.txt',
        '@@ -1,2 +1,2 @@',
        ' hello',
        '-addom',
        '+codex',
        '*** End Patch',
      ].join('\n'),
    })
    assert.match(String(result.result || ''), /Patched and moved file/i)
    assert.equal(fs.existsSync(path.join(projectRoot, 'created.txt')), false)
    assert.equal(fs.readFileSync(path.join(projectRoot, 'moved.txt'), 'utf8'), 'hello\ncodex\n')

    result = await executeTool(projectRoot, 'apply_patch', {
      patch: [
        '*** Begin Patch',
        '*** Delete File: moved.txt',
        '*** End Patch',
      ].join('\n'),
    })
    assert.match(String(result.result || ''), /deleted successfully/i)
    assert.equal(fs.existsSync(path.join(projectRoot, 'moved.txt')), false)
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('native apply_patch rejects legacy operation input now that the contract is canonical patch text only', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-native-apply-patch-legacy-'))
  try {
    await assert.rejects(
      () => executeTool(projectRoot, 'apply_patch', {
        operation: {
          type: 'create_file',
          path: 'legacy.txt',
          diff: '@@ -0,0 +1,1 @@\n+legacy\n',
        },
      }),
      /non-empty patch string/i,
    )
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('native apply_patch supports multi-file canonical patch payloads', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-native-apply-patch-multi-'))
  try {
    fs.writeFileSync(path.join(projectRoot, 'left.txt'), 'old left\n', 'utf8')

    const result = await executeTool(projectRoot, 'apply_patch', {
      patch: [
        '  *** Begin Patch  ',
        '*** Update File: left.txt',
        '@@ -1,1 +1,1 @@',
        '-old left',
        '+new left',
        '*** Add File: right.txt',
        '+new right',
        '  *** End Patch  ',
      ].join('\n'),
    })

    assert.match(String(result.result || ''), /Applied patch successfully: 2 changes/i)
    assert.equal(fs.readFileSync(path.join(projectRoot, 'left.txt'), 'utf8'), 'new left\n')
    assert.equal(fs.readFileSync(path.join(projectRoot, 'right.txt'), 'utf8'), 'new right\n')
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('native apply_patch create-file metadata includes exact preview diff for add-line patches', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-native-apply-patch-create-meta-'))
  try {
    const result = await executeTool(projectRoot, 'apply_patch', {
      patch: [
        '*** Begin Patch',
        '*** Add File: created.txt',
        '+hello',
        '+world',
        '*** End Patch',
      ].join('\n'),
    })

    assert.equal(result.applyPatchChanges.length, 1)
    assert.deepEqual(result.applyPatchChanges[0], {
      type: 'create_file',
      path: 'created.txt',
      newPath: '',
      diffText: buildPreviewableUnifiedDiff({
        previousContent: '',
        nextContent: 'hello\nworld\n',
      }),
      newContent: 'hello\nworld\n',
      prevContent: '',
    })
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('native apply_patch move-file metadata stays path-only when content does not change', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-native-apply-patch-move-meta-'))
  try {
    fs.writeFileSync(path.join(projectRoot, 'before.txt'), 'alpha\nbeta\n', 'utf8')

    const result = await executeTool(projectRoot, 'apply_patch', {
      patch: [
        '*** Begin Patch',
        '*** Update File: before.txt',
        '*** Move to: after.txt',
        '@@ -1,2 +1,2 @@',
        ' alpha',
        ' beta',
        '*** End Patch',
      ].join('\n'),
    })

    assert.equal(result.applyPatchChanges.length, 1)
    assert.deepEqual(result.applyPatchChanges[0], {
      type: 'move_file',
      path: 'before.txt',
      newPath: 'after.txt',
      diffText: '',
      newContent: 'alpha\nbeta\n',
      prevContent: 'alpha\nbeta\n',
    })
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('native apply_patch move-file metadata includes exact preview diff when content changes', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-native-apply-patch-move-edit-meta-'))
  try {
    fs.writeFileSync(path.join(projectRoot, 'before.txt'), 'alpha\nbeta\n', 'utf8')

    const result = await executeTool(projectRoot, 'apply_patch', {
      patch: [
        '*** Begin Patch',
        '*** Update File: before.txt',
        '*** Move to: after.txt',
        '@@ -1,2 +1,2 @@',
        ' alpha',
        '-beta',
        '+gamma',
        '*** End Patch',
      ].join('\n'),
    })

    assert.equal(result.applyPatchChanges.length, 1)
    assert.deepEqual(result.applyPatchChanges[0], {
      type: 'move_file',
      path: 'before.txt',
      newPath: 'after.txt',
      diffText: buildPreviewableUnifiedDiff({
        previousContent: 'alpha\nbeta\n',
        nextContent: 'alpha\ngamma\n',
      }),
      newContent: 'alpha\ngamma\n',
      prevContent: 'alpha\nbeta\n',
    })
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('native apply_patch matches exact hunk context even when the declared line number drifts nearby', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-native-apply-patch-drift-'))
  try {
    fs.writeFileSync(path.join(projectRoot, 'layout.html'), [
      '<header>',
      '  <nav>',
      '    <a href="/">Home</a>',
      '  </nav>',
      '  <button id="themeToggle">Toggle</button>',
      '</header>',
      '',
    ].join('\n'), 'utf8')

    const result = await executeTool(projectRoot, 'apply_patch', {
      patch: [
        '*** Begin Patch',
        '*** Update File: layout.html',
        '@@ -1,4 +1,4 @@',
        '   <nav>',
        '     <a href="/">Home</a>',
        '   </nav>',
        '-  <button id="themeToggle">Toggle</button>',
        '+  <button id="themeToggle" aria-label="Toggle theme">Theme</button>',
        '*** End Patch',
      ].join('\n'),
    })

    assert.match(String(result.result || ''), /Patched file successfully/i)
    assert.equal(fs.readFileSync(path.join(projectRoot, 'layout.html'), 'utf8'), [
      '<header>',
      '  <nav>',
      '    <a href="/">Home</a>',
      '  </nav>',
      '  <button id="themeToggle" aria-label="Toggle theme">Theme</button>',
      '</header>',
      '',
    ].join('\n'))
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('native apply_patch applies repeated exact context at the closest matching location', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-native-apply-patch-repeated-'))
  try {
    fs.writeFileSync(path.join(projectRoot, 'repeated.txt'), [
      'alpha',
      'remove me',
      'omega',
      'middle',
      'alpha',
      'remove me',
      'omega',
      '',
    ].join('\n'), 'utf8')

    const result = await executeTool(projectRoot, 'apply_patch', {
      patch: [
        '*** Begin Patch',
        '*** Update File: repeated.txt',
        '@@ -5,3 +5,3 @@',
        ' alpha',
        '-remove me',
        '+replace me',
        ' omega',
        '*** End Patch',
      ].join('\n'),
    })

    assert.match(String(result.result || ''), /Patched file successfully/i)
    assert.equal(fs.readFileSync(path.join(projectRoot, 'repeated.txt'), 'utf8'), [
      'alpha',
      'remove me',
      'omega',
      'middle',
      'alpha',
      'replace me',
      'omega',
      '',
    ].join('\n'))
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('todo_write and todo_read persist the execution task ledger by thread', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-native-todo-'))
  try {
    const writeResult = await executeTool(projectRoot, 'todo_write', {
      expected_revision: 0,
      todos: [
        { id: 't1', content: 'Inspect runtime surface', status: 'completed' },
        { id: 't2', content: 'Implement native patch tool', status: 'in_progress' },
      ],
    }, {
      threadId: 'thread-native-tools-1',
    })
    assert.equal(writeResult.result.summary, '2 tasks (0 pending, 1 in progress, 1 completed)')

    const readResult = await executeTool(projectRoot, 'todo_read', {}, {
      threadId: 'thread-native-tools-1',
    })
    assert.deepEqual(readResult.result.todos, [
      { id: 't1', content: 'Inspect runtime surface', status: 'completed' },
      { id: 't2', content: 'Implement native patch tool', status: 'in_progress' },
    ])
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('todo ledger can be isolated by explicit scope key for parallel agent execution', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-native-todo-scope-'))
  try {
    await executeTool(projectRoot, 'todo_write', {
      expected_revision: 0,
      todos: [
        { id: 't1', content: 'Architecture review', status: 'in_progress' },
      ],
    }, {
      threadId: 'thread-shared',
      todoScopeKey: 'moa:delegation-1:role-a:task-1',
    })

    await executeTool(projectRoot, 'todo_write', {
      expected_revision: 0,
      todos: [
        { id: 't1', content: 'Performance review', status: 'pending' },
      ],
    }, {
      threadId: 'thread-shared',
      todoScopeKey: 'moa:delegation-1:role-b:task-1',
    })

    const scopedA = await executeTool(projectRoot, 'todo_read', {}, {
      threadId: 'thread-shared',
      todoScopeKey: 'moa:delegation-1:role-a:task-1',
    })
    const scopedB = await executeTool(projectRoot, 'todo_read', {}, {
      threadId: 'thread-shared',
      todoScopeKey: 'moa:delegation-1:role-b:task-1',
    })

    assert.deepEqual(scopedA.result.todos, [
      { id: 't1', content: 'Architecture review', status: 'in_progress' },
    ])
    assert.deepEqual(scopedB.result.todos, [
      { id: 't1', content: 'Performance review', status: 'pending' },
    ])
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('plan_update and plan_read use the runtime-managed plan state directly', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-native-plan-'))
  try {
    const created = await executeTool(projectRoot, 'plan_update', {
      task_id: 't1',
      content: 'Lock plan contract',
      status: 'in_progress',
      expected_revision: 0,
    }, {
      threadId: 'thread-native-plan-1',
    })
    assert.equal(created.result.summary, '1 task (0 pending, 1 in progress, 0 completed)')

    const updated = await executeTool(projectRoot, 'plan_update', {
      task_id: 't1',
      status: 'completed',
      notes: 'Contract locked.',
      expected_revision: 1,
    }, {
      threadId: 'thread-native-plan-1',
    })
    assert.equal(updated.result.plan.revision, 2)
    assert.equal(updated.result.task?.status, 'completed')

    const read = await executeTool(projectRoot, 'plan_read', {}, {
      threadId: 'thread-native-plan-1',
    })
    assert.deepEqual(read.result.plan.tasks, [
      { id: 't1', content: 'Lock plan contract', status: 'completed', notes: 'Contract locked.' },
    ])
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('question_user returns a structured clarification payload', async () => {
  const result = await executeTool(process.cwd(), 'question_user', {
    header: 'Schema Choice',
    question: 'Should I keep the legacy schema shape or switch to patch-first only?',
    options: [
      { label: 'Patch-first only', description: 'Simpler Codex-local contract' },
      { label: 'Keep both', description: 'Broader compatibility but more surface area' },
    ],
  })

  assert.equal(result.result.status, 'awaiting_user_response')
  assert.equal(result.result.header, 'Schema Choice')
  assert.equal(result.result.options.length, 2)
  assert.match(String(result.result.guidance || ''), /wait for their next response/i)
})
