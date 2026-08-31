import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPreviewRowsFromUnifiedDiff,
  collectTurnFileChanges,
  countPreviewChangedLines,
  deriveLineTotalsFromUnifiedDiff,
  readDisplayedLineTotals,
  resolvePreviewRevisionPair,
  summarizeTurnFileChanges,
} from '../../src/renderer/components/chat/turn-file-changes.mjs'

test('collectTurnFileChanges deduplicates tool_result and explicit file_change by step key', () => {
  const activities = [
    {
      id: 'tool1',
      type: 'result',
      toolName: 'write_file',
      decision: 'approved',
      sequence: 4,
      stepId: 's1',
      fileChange: {
        filePath: 'src/a.js',
        newRevId: 'rev_new',
        prevRevId: 'rev_prev',
        addedLines: 10,
        removedLines: 2,
      },
    },
    {
      id: 'file1',
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 4,
      stepId: 's1',
      fileChange: {
        filePath: 'src/a.js',
        newRevId: 'rev_new',
        prevRevId: 'rev_prev',
        rev: 8,
        addedLines: 10,
        removedLines: 2,
      },
    },
  ]

  const rows = collectTurnFileChanges(activities)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].fileChange.filePath, 'src/a.js')
  assert.equal(rows[0].fileChange.rev, 8)
})

test('collectTurnFileChanges derives change types and excludes staged-only rows by default', () => {
  const activities = [
    {
      id: 'new-file',
      type: 'result',
      toolName: 'write_file',
      decision: 'approved',
      sequence: 1,
      fileChange: {
        filePath: 'src/new.js',
        newRevId: 'new_1',
        prevRevId: '',
      },
    },
    {
      id: 'apply-file',
      type: 'result',
      toolName: 'apply_artifact_revision',
      decision: 'approved',
      sequence: 2,
      fileChange: {
        filePath: 'src/apply.js',
        newRevId: 'apply_2',
        prevRevId: 'apply_prev',
      },
    },
    {
      id: 'moa-stage',
      type: 'file_change',
      eventKind: 'moa_agent_file_staged',
      sequence: 3,
      fileChange: {
        filePath: 'src/staged.js',
        newRevId: 'stage_1',
        prevRevId: '',
        source: 'moa_stage',
      },
    },
  ]

  const rows = collectTurnFileChanges(activities)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].fileChange.changeType, 'created')
  assert.equal(rows[1].fileChange.changeType, 'applied')
})

test('collectTurnFileChanges can include staged-only rows when requested', () => {
  const activities = [
    {
      id: 'moa-stage',
      type: 'file_change',
      eventKind: 'moa_agent_file_staged',
      sequence: 1,
      fileChange: {
        filePath: 'src/staged.js',
        newRevId: 'stage_1',
        source: 'moa_stage',
      },
    },
  ]

  const rows = collectTurnFileChanges(activities, { includeStaged: true })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].fileChange.source, 'moa_stage')
})

test('collectTurnFileChanges ignores node_modules paths for turn file surfacing', () => {
  const activities = [
    {
      id: 'pkg-posix',
      type: 'result',
      toolName: 'write_file',
      decision: 'approved',
      sequence: 1,
      fileChange: {
        filePath: 'node_modules/pkg/index.js',
        newRevId: 'pkg_1',
      },
    },
    {
      id: 'pkg-win',
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 2,
      fileChange: {
        filePath: 'nested\\node_modules\\dep\\file.js',
        newRevId: 'pkg_2',
      },
    },
    {
      id: 'safe-file',
      type: 'result',
      toolName: 'write_file',
      decision: 'approved',
      sequence: 3,
      fileChange: {
        filePath: 'src/safe.js',
        newRevId: 'safe_1',
      },
    },
  ]

  const rows = collectTurnFileChanges(activities)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].fileChange.filePath, 'src/safe.js')
})

test('collectTurnFileChanges expands provider-native multi-file rows and deduplicates weaker native summaries', () => {
  const activities = [
    {
      id: 'provider-native-output',
      type: 'result',
      eventKind: 'provider_tool_output',
      toolName: 'file_change',
      sequence: 4,
      createdAt: 4,
      fileChanges: [
        {
          path: 'C:\\repo\\public\\index.html',
          kind: 'modify',
          addedLines: 12,
          removedLines: 3,
        },
        {
          path: 'C:\\repo\\public\\styles.css',
          kind: 'create',
          addedLines: 44,
          removedLines: 0,
        },
        {
          path: 'C:\\repo\\public\\app.js',
          kind: 'modify',
          addedLines: 9,
          removedLines: 2,
        },
      ],
    },
    {
      id: 'native-summary',
      type: 'file_change',
      eventKind: 'openai_account_native_file_change',
      toolName: 'file_change',
      sequence: 5,
      createdAt: 5,
      fileChanges: [
        { filePath: 'C:\\repo\\public\\index.html', changeType: 'modify' },
        { filePath: 'C:\\repo\\public\\styles.css', changeType: 'create' },
        { filePath: 'C:\\repo\\public\\app.js', changeType: 'modify' },
      ],
    },
    {
      id: 'shell-side-effect',
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 6,
      createdAt: 6,
      fileChange: {
        filePath: 'car-rental.db-shm',
        newRevId: 'db_shm_1',
        addedLines: 0,
        removedLines: 0,
      },
    },
  ]

  const rows = collectTurnFileChanges(activities)
  assert.equal(rows.length, 4)
  assert.deepEqual(
    rows.map((row) => row.fileChange.filePath),
    [
      'C:\\repo\\public\\app.js',
      'C:\\repo\\public\\index.html',
      'C:\\repo\\public\\styles.css',
      'car-rental.db-shm',
    ],
  )
  assert.deepEqual(
    rows.slice(0, 3).map((row) => ({
      filePath: row.fileChange.filePath,
      changeType: row.fileChange.changeType,
      addedLines: row.fileChange.addedLines,
      removedLines: row.fileChange.removedLines,
    })),
    [
      {
        filePath: 'C:\\repo\\public\\app.js',
        changeType: 'modified',
        addedLines: 9,
        removedLines: 2,
      },
      {
        filePath: 'C:\\repo\\public\\index.html',
        changeType: 'modified',
        addedLines: 12,
        removedLines: 3,
      },
      {
        filePath: 'C:\\repo\\public\\styles.css',
        changeType: 'created',
        addedLines: 44,
        removedLines: 0,
      },
    ],
  )
})

test('collectTurnFileChanges derives line totals and preview diff metadata from provider-native unified diffs', () => {
  const diff = [
    '@@ -1,3 +1,4 @@',
    ' <main>',
    '-  <h1>Old title</h1>',
    '+  <h1>New title</h1>',
    '+  <p>Fresh copy</p>',
    ' </main>',
  ].join('\n')

  const rows = collectTurnFileChanges([
    {
      id: 'provider-native-output',
      type: 'result',
      eventKind: 'provider_tool_output',
      toolName: 'file_change',
      sequence: 7,
      fileChanges: [
        {
          path: 'public/index.html',
          kind: 'modify',
          diff,
        },
      ],
    },
  ])

  assert.equal(rows.length, 1)
  assert.equal(rows[0].fileChange.filePath, 'public/index.html')
  assert.equal(rows[0].fileChange.addedLines, 2)
  assert.equal(rows[0].fileChange.removedLines, 1)
  assert.equal(rows[0].fileChange.diffText, diff)
})

test('collectTurnFileChanges prefers the latest Cursor mutation for the same file', () => {
  const rows = collectTurnFileChanges([
    {
      id: 'cursor-create',
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 2,
      createdAt: 2,
      fileChange: {
        filePath: 'C:\\repo\\temporary.txt',
        changeType: 'created',
        source: 'cursor_agent',
        addedLines: 20,
        removedLines: 0,
        diffText: 'rich creation diff',
      },
    },
    {
      id: 'cursor-delete',
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 3,
      createdAt: 3,
      fileChange: {
        filePath: 'C:\\repo\\temporary.txt',
        changeType: 'deleted',
        source: 'cursor_agent',
        addedLines: 0,
        removedLines: 1,
      },
    },
  ])

  assert.equal(rows.length, 1)
  assert.equal(rows[0].fileChange.changeType, 'deleted')
  assert.equal(rows[0].fileChange.removedLines, 1)
})

test('deriveLineTotalsFromUnifiedDiff ignores patch headers and counts only changed lines', () => {
  const diff = [
    '--- a/public/app.js',
    '+++ b/public/app.js',
    '@@ -1,2 +1,3 @@',
    ' console.log("before")',
    '-console.log("old")',
    '+console.log("new")',
    '+console.log("extra")',
  ].join('\n')

  assert.deepEqual(
    deriveLineTotalsFromUnifiedDiff(diff),
    { addedLines: 2, removedLines: 1 },
  )
})

test('buildPreviewRowsFromUnifiedDiff parses hunk rows for native provider fallback previews', () => {
  const diff = [
    '@@ -10,3 +10,4 @@',
    ' function greet() {',
    '-  return "old"',
    '+  return "new"',
    '+  // note',
    ' }',
  ].join('\n')

  assert.deepEqual(
    buildPreviewRowsFromUnifiedDiff(diff),
    [
      { kind: 'context', oldLine: 10, newLine: 10, text: 'function greet() {' },
      { kind: 'delete', oldLine: 11, newLine: null, text: '  return "old"' },
      { kind: 'add', oldLine: null, newLine: 11, text: '  return "new"' },
      { kind: 'add', oldLine: null, newLine: 12, text: '  // note' },
      { kind: 'context', oldLine: 12, newLine: 13, text: '}' },
    ],
  )
})

test('summarizeTurnFileChanges reports counts and totals', () => {
  const rows = [
    { fileChange: { addedLines: 3, removedLines: 1 } },
    { fileChange: { addedLines: 5, removedLines: 2 } },
  ]
  const summary = summarizeTurnFileChanges(rows)
  assert.deepEqual(summary, {
    fileCount: 2,
    totalAdded: 8,
    totalRemoved: 3,
  })
})

test('collectTurnFileChanges accumulates turn net line totals across multiple Cursor edits to the same file', () => {
  const rows = collectTurnFileChanges([
    {
      id: 'cursor-edit-1',
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 1,
      createdAt: 1,
      fileChange: {
        filePath: 'C:\\repo\\src\\app.js',
        changeType: 'modified',
        source: 'cursor_agent',
        prevRevId: 'rev0',
        newRevId: 'rev1',
        addedLines: 50,
        removedLines: 10,
      },
    },
    {
      id: 'cursor-edit-2',
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 2,
      createdAt: 2,
      fileChange: {
        filePath: 'C:\\repo\\src\\app.js',
        changeType: 'modified',
        source: 'cursor_agent',
        prevRevId: 'rev1',
        newRevId: 'rev2',
        addedLines: 2,
        removedLines: 2,
      },
    },
  ])

  assert.equal(rows.length, 1)
  assert.equal(rows[0].fileChange.addedLines, 2)
  assert.equal(rows[0].fileChange.removedLines, 2)
  assert.deepEqual(summarizeTurnFileChanges(rows), {
    fileCount: 1,
    totalAdded: 52,
    totalRemoved: 12,
  })
})

test('collectTurnFileChanges computes turn net from baseline content when available', () => {
  const baseline = 'alpha\nbeta\n'
  const latest = 'alpha\ngamma\ndelta\n'
  const rows = collectTurnFileChanges([
    {
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 1,
      createdAt: 1,
      fileChange: {
        filePath: 'src/net.js',
        source: 'cursor_agent',
        changeType: 'modified',
        prevContent: baseline,
        newContent: 'alpha\nbeta\nextra\n',
        addedLines: 1,
        removedLines: 0,
      },
    },
    {
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 2,
      createdAt: 2,
      fileChange: {
        filePath: 'src/net.js',
        source: 'cursor_agent',
        changeType: 'modified',
        prevContent: 'alpha\nbeta\nextra\n',
        newContent: latest,
        addedLines: 2,
        removedLines: 1,
      },
    },
  ])

  assert.equal(rows.length, 1)
  assert.deepEqual(summarizeTurnFileChanges(rows), {
    fileCount: 1,
    totalAdded: 2,
    totalRemoved: 1,
  })
})

test('collectTurnFileChanges turn net totals do not jump backward on small follow-up edits', () => {
  const largeEdit = {
    id: 'cursor-large',
    type: 'file_change',
    eventKind: 'file_change',
    sequence: 10,
    createdAt: 10,
    fileChange: {
      filePath: 'src/live.js',
      source: 'cursor_agent',
      changeType: 'modified',
      addedLines: 66,
      removedLines: 12,
    },
  }
  const smallEdit = {
    id: 'cursor-small',
    type: 'file_change',
    eventKind: 'file_change',
    sequence: 11,
    createdAt: 11,
    fileChange: {
      filePath: 'src/live.js',
      source: 'cursor_agent',
      changeType: 'modified',
      addedLines: 2,
      removedLines: 2,
    },
  }

  const afterLarge = summarizeTurnFileChanges(collectTurnFileChanges([largeEdit]))
  const afterBoth = summarizeTurnFileChanges(collectTurnFileChanges([largeEdit, smallEdit]))

  assert.deepEqual(afterLarge, { fileCount: 1, totalAdded: 66, totalRemoved: 12 })
  assert.deepEqual(afterBoth, { fileCount: 1, totalAdded: 68, totalRemoved: 14 })
  assert.ok(afterBoth.totalAdded >= afterLarge.totalAdded)
})

test('summarizeTurnFileChanges sums turn net totals across files', () => {
  const rows = collectTurnFileChanges([
    {
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 1,
      createdAt: 1,
      fileChange: {
        filePath: 'src/a.js',
        source: 'cursor_agent',
        changeType: 'modified',
        addedLines: 3,
        removedLines: 1,
      },
    },
    {
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 2,
      createdAt: 2,
      fileChange: {
        filePath: 'src/b.js',
        source: 'cursor_agent',
        changeType: 'modified',
        addedLines: 5,
        removedLines: 2,
      },
    },
    {
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 3,
      createdAt: 3,
      fileChange: {
        filePath: 'src/a.js',
        source: 'cursor_agent',
        changeType: 'modified',
        addedLines: 1,
        removedLines: 0,
      },
    },
  ])

  assert.deepEqual(summarizeTurnFileChanges(rows), {
    fileCount: 2,
    totalAdded: 9,
    totalRemoved: 3,
  })
})

test('collectTurnFileChanges reports zero turn net when a created file is deleted in the same turn', () => {
  const rows = collectTurnFileChanges([
    {
      id: 'cursor-create',
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 2,
      createdAt: 2,
      fileChange: {
        filePath: 'C:\\repo\\temporary.txt',
        changeType: 'created',
        source: 'cursor_agent',
        addedLines: 20,
        removedLines: 0,
      },
    },
    {
      id: 'cursor-delete',
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 3,
      createdAt: 3,
      fileChange: {
        filePath: 'C:\\repo\\temporary.txt',
        changeType: 'deleted',
        source: 'cursor_agent',
        addedLines: 0,
        removedLines: 1,
      },
    },
  ])

  assert.equal(rows.length, 1)
  assert.equal(rows[0].fileChange.changeType, 'deleted')
  assert.equal(rows[0].fileChange.removedLines, 1)
  assert.deepEqual(summarizeTurnFileChanges(rows), {
    fileCount: 1,
    totalAdded: 0,
    totalRemoved: 0,
  })
})

test('readDisplayedLineTotals prefers turn-net over last-write deltas', () => {
  assert.deepEqual(readDisplayedLineTotals({
    addedLines: 3,
    removedLines: 0,
    turnNetAddedLines: 19,
    turnNetRemovedLines: 4,
  }), {
    addedLines: 19,
    removedLines: 4,
  })
  assert.deepEqual(readDisplayedLineTotals({
    addedLines: 3,
    removedLines: 1,
  }), {
    addedLines: 3,
    removedLines: 1,
  })
})

test('header and displayed row totals stay aligned for multi-edit Cursor turn without baseline content', () => {
  const rows = collectTurnFileChanges([
    {
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 1,
      createdAt: 1,
      fileChange: {
        filePath: 'test_calculator.py',
        source: 'cursor_agent',
        changeType: 'modified',
        prevRevId: 't0',
        newRevId: 't1',
        addedLines: 10,
        removedLines: 2,
      },
    },
    {
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 2,
      createdAt: 2,
      fileChange: {
        filePath: 'calculator.py',
        source: 'cursor_agent',
        changeType: 'modified',
        prevRevId: 'c0',
        newRevId: 'c1',
        addedLines: 5,
        removedLines: 1,
      },
    },
    {
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 3,
      createdAt: 3,
      fileChange: {
        filePath: 'test_calculator.py',
        source: 'cursor_agent',
        changeType: 'modified',
        prevRevId: 't1',
        newRevId: 't2',
        addedLines: 3,
        removedLines: 0,
      },
    },
    {
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 4,
      createdAt: 4,
      fileChange: {
        filePath: 'calculator.py',
        source: 'cursor_agent',
        changeType: 'modified',
        prevRevId: 'c1',
        newRevId: 'c2',
        addedLines: 1,
        removedLines: 1,
      },
    },
  ])

  assert.equal(rows.length, 2)
  const summary = summarizeTurnFileChanges(rows)
  const lastWriteSum = rows.reduce((acc, row) => ({
    added: acc.added + (Number(row?.fileChange?.addedLines || 0) || 0),
    removed: acc.removed + (Number(row?.fileChange?.removedLines || 0) || 0),
  }), { added: 0, removed: 0 })
  const displayedSum = rows.reduce((acc, row) => {
    const totals = readDisplayedLineTotals(row?.fileChange || {})
    return {
      added: acc.added + totals.addedLines,
      removed: acc.removed + totals.removedLines,
    }
  }, { added: 0, removed: 0 })

  assert.deepEqual(summary, { fileCount: 2, totalAdded: 19, totalRemoved: 4 })
  assert.deepEqual(lastWriteSum, { added: 4, removed: 1 })
  assert.deepEqual(displayedSum, {
    added: summary.totalAdded,
    removed: summary.totalRemoved,
  })
  assert.notDeepEqual(displayedSum, lastWriteSum)
})

test('displayed row totals match baseline-to-final turn net when content is available', () => {
  const baseline = 'a\nb\nc\n'
  const latest = 'a\nx\ny\n'
  const rows = collectTurnFileChanges([
    {
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 1,
      createdAt: 1,
      fileChange: {
        filePath: 'src/calc.py',
        source: 'cursor_agent',
        changeType: 'modified',
        prevContent: baseline,
        newContent: 'a\nb\nc\nextra\n',
        addedLines: 8,
        removedLines: 0,
      },
    },
    {
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 2,
      createdAt: 2,
      fileChange: {
        filePath: 'src/calc.py',
        source: 'cursor_agent',
        changeType: 'modified',
        prevContent: 'a\nb\nc\nextra\n',
        newContent: latest,
        addedLines: 1,
        removedLines: 1,
      },
    },
  ])

  const summary = summarizeTurnFileChanges(rows)
  const displayed = readDisplayedLineTotals(rows[0].fileChange)
  assert.deepEqual(displayed, { addedLines: 2, removedLines: 2 })
  assert.deepEqual(summary, {
    fileCount: 1,
    totalAdded: displayed.addedLines,
    totalRemoved: displayed.removedLines,
  })
  assert.notEqual(rows[0].fileChange.addedLines, displayed.addedLines)
})

test('multi-write Cursor edits preserve turnBaselinePrevRevId from the first write', () => {
  const rows = collectTurnFileChanges([
    {
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 1,
      createdAt: 1,
      fileChange: {
        filePath: 'calculator.py',
        source: 'cursor_agent',
        changeType: 'modified',
        prevRevId: 'rev0',
        newRevId: 'rev1',
        addedLines: 150,
        removedLines: 20,
      },
    },
    {
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 2,
      createdAt: 2,
      fileChange: {
        filePath: 'calculator.py',
        source: 'cursor_agent',
        changeType: 'modified',
        prevRevId: 'rev1',
        newRevId: 'rev2',
        addedLines: 6,
        removedLines: 6,
      },
    },
  ])

  assert.equal(rows.length, 1)
  assert.equal(rows[0].fileChange.prevRevId, 'rev1')
  assert.equal(rows[0].fileChange.newRevId, 'rev2')
  assert.equal(rows[0].fileChange.turnBaselinePrevRevId, 'rev0')
  assert.deepEqual(readDisplayedLineTotals(rows[0].fileChange), {
    addedLines: 156,
    removedLines: 26,
  })

  const pair = resolvePreviewRevisionPair(rows[0].fileChange)
  assert.equal(pair.beforeRevId, 'rev0')
  assert.equal(pair.afterRevId, 'rev2')
  assert.equal(pair.usesTurnBaseline, true)
})

test('created-then-modified turns keep an empty preview baseline', () => {
  const rows = collectTurnFileChanges([
    {
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 1,
      createdAt: 1,
      fileChange: {
        filePath: 'new_file.py',
        source: 'cursor_agent',
        changeType: 'created',
        newRevId: 'c1',
        addedLines: 40,
        removedLines: 0,
      },
    },
    {
      type: 'file_change',
      eventKind: 'file_change',
      sequence: 2,
      createdAt: 2,
      fileChange: {
        filePath: 'new_file.py',
        source: 'cursor_agent',
        changeType: 'modified',
        prevRevId: 'c1',
        newRevId: 'c2',
        addedLines: 10,
        removedLines: 2,
      },
    },
  ])

  assert.equal(rows.length, 1)
  assert.equal(rows[0].fileChange.turnBaselinePrevRevId, '')
  assert.equal(rows[0].fileChange.turnBaselineChangeType, 'created')
  const pair = resolvePreviewRevisionPair(rows[0].fileChange)
  assert.equal(pair.beforeRevId, '')
  assert.equal(pair.afterRevId, 'c2')
  assert.equal(pair.usesTurnBaseline, true)
})

test('countPreviewChangedLines tallies add/delete/ellipsis rows', () => {
  assert.deepEqual(countPreviewChangedLines([
    { kind: 'context' },
    { kind: 'add' },
    { kind: 'add' },
    { kind: 'delete' },
    { kind: 'ellipsis' },
    { kind: 'add' },
  ]), {
    addedLines: 3,
    removedLines: 1,
    collapsedRegions: 1,
  })
})
