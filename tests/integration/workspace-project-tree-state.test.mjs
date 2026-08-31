import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_VISIBLE_PROJECT_THREAD_COUNT,
  MAX_PROJECT_THREAD_SEARCH_CONCURRENCY,
  filterWorkspaceProjectTree,
  resolveArchiveDisclosure,
  resolveArchiveDisclosureToggle,
  resolveProjectThreadLoadState,
  resolveVisibleProjectThreads,
  runBoundedProjectThreadLoads,
} from '../../src/renderer/components/workspace/workspace-project-tree-state.mjs'

test('project thread visibility reveals cached rows without truncating the cache', () => {
  const threads = Array.from({ length: 6 }, (_, index) => ({ id: `t${index + 1}` }))

  assert.equal(DEFAULT_VISIBLE_PROJECT_THREAD_COUNT, 3)
  assert.deepEqual(resolveVisibleProjectThreads(threads, 3), {
    visible: threads.slice(0, 3),
    total: 6,
    remaining: 3,
  })
  assert.deepEqual(resolveVisibleProjectThreads(threads, 6), {
    visible: threads,
    total: 6,
    remaining: 0,
  })
  assert.equal(threads.length, 6)
})

test('thread load settlement keeps complete arrays and never leaves loading state', () => {
  const threads = Array.from({ length: 6 }, (_, index) => ({ id: `t${index + 1}` }))

  assert.deepEqual(resolveProjectThreadLoadState(threads), {
    status: 'loaded',
    threads,
    error: '',
  })
  assert.deepEqual(resolveProjectThreadLoadState([]), {
    status: 'empty',
    threads: [],
    error: '',
  })
  assert.deepEqual(resolveProjectThreadLoadState(undefined, new Error('offline'), threads), {
    status: 'failed',
    threads,
    error: 'offline',
  })
})

test('search exposes Archive temporarily without changing its saved disclosure', () => {
  let savedExpanded = false
  assert.equal(resolveArchiveDisclosure(savedExpanded, ''), false)
  assert.equal(resolveArchiveDisclosure(savedExpanded, 'thread title'), true)

  savedExpanded = resolveArchiveDisclosureToggle(savedExpanded, 'thread title')
  assert.equal(savedExpanded, false)
  assert.equal(resolveArchiveDisclosure(savedExpanded, ''), false)

  savedExpanded = resolveArchiveDisclosureToggle(savedExpanded, '')
  assert.equal(savedExpanded, true)
  assert.equal(resolveArchiveDisclosure(savedExpanded, ''), true)
})

test('combined tree search matches project names and loaded thread titles', () => {
  const projects = [
    { id: 'alpha', name: 'Alpha workspace' },
    { id: 'beta', name: 'Beta workspace' },
  ]
  const threadStateByProject = {
    alpha: { status: 'loaded', threads: [{ id: 'a1', title: 'Fix parser' }] },
    beta: { status: 'loaded', threads: [{ id: 'b1', title: 'Ship renderer' }] },
  }

  assert.deepEqual(
    filterWorkspaceProjectTree(projects, threadStateByProject, 'renderer'),
    [{ project: projects[1], matchingThreads: threadStateByProject.beta.threads }],
  )
  assert.deepEqual(
    filterWorkspaceProjectTree(projects, threadStateByProject, 'alpha'),
    [{ project: projects[0], matchingThreads: [] }],
  )
})

test('combined search thread loads never exceed concurrency four and all settle', async () => {
  let active = 0
  let maximumActive = 0
  const settled = []
  const ids = Array.from({ length: 9 }, (_, index) => `project-${index + 1}`)

  const results = await runBoundedProjectThreadLoads(ids, async (projectId) => {
    active += 1
    maximumActive = Math.max(maximumActive, active)
    await new Promise((resolve) => setTimeout(resolve, 2))
    active -= 1
    settled.push(projectId)
    if (projectId === 'project-5') throw new Error('unavailable')
    return projectId
  })

  assert.equal(MAX_PROJECT_THREAD_SEARCH_CONCURRENCY, 4)
  assert.equal(maximumActive, 4)
  assert.equal(settled.length, ids.length)
  assert.equal(results.length, ids.length)
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1)
})
