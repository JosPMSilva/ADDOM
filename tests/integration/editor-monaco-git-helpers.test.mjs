import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildMonacoGitDecorations,
  getGitHunkAnchor,
} from '../../src/renderer/components/editor/editor-monaco-git-helpers.mjs'

test('getGitHunkAnchor keeps deleted-only hunks anchored to the next surviving line when available', () => {
  const anchor = getGitHunkAnchor({
    newStart: 4,
    newCount: 0,
  }, 10)

  assert.deepEqual(anchor, {
    lineNumber: 4,
    isDeletedAnchor: true,
  })
})

test('getGitHunkAnchor falls back to the end-of-file line for deleted-only EOF hunks', () => {
  const anchor = getGitHunkAnchor({
    newStart: 10,
    newCount: 0,
  }, 9)

  assert.deepEqual(anchor, {
    lineNumber: 9,
    isDeletedAnchor: true,
  })
})

test('buildMonacoGitDecorations maps deleted-only hunks onto deterministic Monaco anchors', () => {
  const monaco = {
    Range: class Range {
      constructor(startLineNumber, startColumn, endLineNumber, endColumn) {
        this.startLineNumber = startLineNumber
        this.startColumn = startColumn
        this.endLineNumber = endLineNumber
        this.endColumn = endColumn
      }
    },
    editor: {
      MinimapPosition: {
        Gutter: 2,
      },
      OverviewRulerLane: {
        Left: 4,
      },
      TrackedRangeStickiness: {
        NeverGrowsWhenTypingAtEdges: 1,
      },
    },
  }
  const model = {
    getLineCount() {
      return 9
    },
  }

  const mapped = buildMonacoGitDecorations(monaco, model, {
    status: 'ok',
    dirtyBufferBlocked: false,
    hunks: [{
      id: 'hunk:1',
      header: '@@ -10,1 +10,0 @@',
      kind: 'deleted',
      newStart: 10,
      newCount: 0,
      lines: [{ type: 'delete', text: 'line 10' }],
    }],
  })

  assert.equal(mapped.decorations.length, 1)
  assert.equal(mapped.decorations[0].range.startLineNumber, 9)
  assert.equal(mapped.decorations[0].range.endLineNumber, 9)
  assert.equal(mapped.decorations[0].options.className, 'addom-git-line-hitbox addom-git-line-deleted')
  assert.equal(mapped.decorations[0].options.glyphMarginClassName, undefined)
  assert.equal(mapped.decorations[0].options.lineNumberClassName, 'addom-git-line-number addom-git-line-number-deleted')
  assert.deepEqual(mapped.decorations[0].options.minimap, {
    color: '#e08a7d',
    position: 2,
  })
  assert.deepEqual(mapped.decorations[0].options.overviewRuler, {
    color: '#e08a7d',
    position: 4,
  })
  assert.equal(mapped.lineToHunkId.get(9), 'hunk:1')
  assert.deepEqual(mapped.anchorsByHunkId.get('hunk:1'), {
    lineNumber: 9,
    isDeletedAnchor: true,
  })
})

test('buildMonacoGitDecorations keeps minimap fallback in the gutter lane', () => {
  const monaco = {
    Range: class Range {
      constructor(startLineNumber, startColumn, endLineNumber, endColumn) {
        this.startLineNumber = startLineNumber
        this.startColumn = startColumn
        this.endLineNumber = endLineNumber
        this.endColumn = endColumn
      }
    },
    editor: {
      OverviewRulerLane: {
        Left: 4,
      },
      TrackedRangeStickiness: {
        NeverGrowsWhenTypingAtEdges: 1,
      },
    },
  }
  const model = {
    getLineCount() {
      return 4
    },
  }

  const mapped = buildMonacoGitDecorations(monaco, model, {
    status: 'ok',
    dirtyBufferBlocked: false,
    hunks: [{
      id: 'hunk:1',
      header: '@@ -1,1 +1,1 @@',
      kind: 'modified',
      newStart: 1,
      newCount: 1,
      lines: [{ type: 'add', text: 'line 1' }],
    }],
  })

  assert.deepEqual(mapped.decorations[0].options.minimap, {
    color: '#b8b3a4',
    position: 2,
  })
})
