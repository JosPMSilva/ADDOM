import test from 'node:test'
import assert from 'node:assert/strict'

import {
  flattenVisibleTree,
  resolveFileTreeKeyboardNavigation,
} from '../../src/renderer/components/editor/editor-file-tree-helpers.mjs'

const treeFixture = [
  {
    name: 'src',
    path: 'src',
    type: 'dir',
    children: [
      {
        name: 'components',
        path: 'src/components',
        type: 'dir',
        children: [
          {
            name: 'EditorFileTree.jsx',
            path: 'src/components/EditorFileTree.jsx',
            type: 'file',
            isText: true,
            ext: '.jsx',
          },
        ],
      },
      {
        name: 'index.js',
        path: 'src/index.js',
        type: 'file',
        isText: true,
        ext: '.js',
      },
      {
        name: 'logo.png',
        path: 'src/logo.png',
        type: 'file',
        isText: false,
        ext: '.png',
      },
    ],
  },
  {
    name: 'package.json',
    path: 'package.json',
    type: 'file',
    isText: true,
    ext: '.json',
  },
]

test('flattenVisibleTree only includes expanded descendants', () => {
  const collapsedRows = flattenVisibleTree(treeFixture, new Set())
  assert.deepEqual(collapsedRows.map((row) => row.path), ['src', 'package.json'])

  const expandedRows = flattenVisibleTree(treeFixture, new Set(['src', 'src/components']))
  assert.deepEqual(expandedRows.map((row) => row.path), [
    'src',
    'src/components',
    'src/components/EditorFileTree.jsx',
    'src/index.js',
    'src/logo.png',
    'package.json',
  ])
})

test('file tree arrows move focus through visible rows', () => {
  const expandedDirs = new Set(['src', 'src/components'])

  assert.deepEqual(
    resolveFileTreeKeyboardNavigation({
      tree: treeFixture,
      expandedDirs,
      focusedPath: 'src/components',
      key: 'ArrowDown',
    }),
    { focusPath: 'src/components/EditorFileTree.jsx' },
  )

  assert.deepEqual(
    resolveFileTreeKeyboardNavigation({
      tree: treeFixture,
      expandedDirs,
      focusedPath: 'src/index.js',
      key: 'ArrowUp',
    }),
    { focusPath: 'src/components/EditorFileTree.jsx' },
  )
})

test('ArrowRight expands folders and ArrowLeft collapses or returns to parent', () => {
  assert.deepEqual(
    resolveFileTreeKeyboardNavigation({
      tree: treeFixture,
      expandedDirs: new Set(),
      focusedPath: 'src',
      key: 'ArrowRight',
    }),
    {
      focusPath: 'src',
      action: { type: 'toggleDir', path: 'src' },
    },
  )

  assert.deepEqual(
    resolveFileTreeKeyboardNavigation({
      tree: treeFixture,
      expandedDirs: new Set(['src']),
      focusedPath: 'src',
      key: 'ArrowRight',
    }),
    { focusPath: 'src/components' },
  )

  assert.deepEqual(
    resolveFileTreeKeyboardNavigation({
      tree: treeFixture,
      expandedDirs: new Set(['src', 'src/components']),
      focusedPath: 'src/components/EditorFileTree.jsx',
      key: 'ArrowLeft',
    }),
    { focusPath: 'src/components' },
  )

  assert.deepEqual(
    resolveFileTreeKeyboardNavigation({
      tree: treeFixture,
      expandedDirs: new Set(['src', 'src/components']),
      focusedPath: 'src/components',
      key: 'ArrowLeft',
    }),
    {
      focusPath: 'src/components',
      action: { type: 'toggleDir', path: 'src/components' },
    },
  )
})

test('Enter toggles folders and opens text files only', () => {
  assert.deepEqual(
    resolveFileTreeKeyboardNavigation({
      tree: treeFixture,
      expandedDirs: new Set(['src']),
      focusedPath: 'src/components',
      key: 'Enter',
    }),
    {
      focusPath: 'src/components',
      action: { type: 'toggleDir', path: 'src/components' },
    },
  )

  assert.deepEqual(
    resolveFileTreeKeyboardNavigation({
      tree: treeFixture,
      expandedDirs: new Set(['src', 'src/components']),
      focusedPath: 'src/index.js',
      key: 'Enter',
    }),
    {
      focusPath: 'src/index.js',
      action: { type: 'openFile', path: 'src/index.js' },
    },
  )

  assert.equal(
    resolveFileTreeKeyboardNavigation({
      tree: treeFixture,
      expandedDirs: new Set(['src']),
      focusedPath: 'src/logo.png',
      key: 'Enter',
    }),
    null,
  )
})
