import test from 'node:test'
import assert from 'node:assert/strict'
import { sortAndFilterMemoryNodes } from '../../src/main/memory/list-visibility.mjs'

const sampleNodes = [
  { id: 'a', sortId: 11, pinned: false, compressed: false },
  { id: 'b', sortId: 13, pinned: false, compressed: true },
  { id: 'c', sortId: 9, pinned: true, compressed: false },
  { id: 'd', sortId: 12, pinned: false, compressed: false },
  { id: 'e', sortId: 14, pinned: false, compressed: false, scope: 'thread', originThreadState: 'deleted' },
  { id: 'f', sortId: 15, pinned: false, compressed: false, scope: 'project', originThreadState: 'deleted' },
]

test('default memory listing hides compressed nodes and keeps pinned first', () => {
  const visible = sortAndFilterMemoryNodes(sampleNodes, { includeCompressed: false })

  assert.deepEqual(
    visible.map((n) => n.id),
    ['c', 'f', 'd', 'a'],
  )
})

test('includeCompressed=true reveals archived nodes while preserving ordering', () => {
  const visible = sortAndFilterMemoryNodes(sampleNodes, { includeCompressed: true })

  assert.deepEqual(
    visible.map((n) => n.id),
    ['c', 'f', 'b', 'd', 'a'],
  )
})

test('deleted Thread Memory is a distinct archived state', () => {
  const visible = sortAndFilterMemoryNodes(sampleNodes, {
    includeCompressed: false,
    includeDeletedThreads: true,
  })

  assert.deepEqual(
    visible.map((n) => n.id),
    ['c', 'f', 'e', 'd', 'a'],
  )
})
