import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_EXPANDED_PROJECT_LIMIT,
  RECENT_PROJECT_LIMIT,
  normalizeProjectArchiveOverrides,
  normalizeProjectRestorePriorities,
  partitionWorkspaceProjects,
  pruneProjectArchiveOverrides,
  pruneProjectRestorePriorities,
  resolveProjectMenuPosition,
  resolveInitialExpandedProjectIds,
} from '../../src/renderer/components/workspace-project-entry-state.mjs'

function buildProjects(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `project-${index + 1}`,
    lastWorkedAt: count - index,
  }))
}

test('project entry limits the recent list and retains every remaining project in Archive', () => {
  const projects = buildProjects(38)
  const result = partitionWorkspaceProjects(projects, {})

  assert.equal(RECENT_PROJECT_LIMIT, 20)
  assert.equal(result.recentProjects.length, 20)
  assert.equal(result.archivedProjects.length, 18)
  assert.deepEqual(result.recentProjects.map((row) => row.id), projects.slice(0, 20).map((row) => row.id))
  assert.deepEqual(result.archivedProjects.map((row) => row.id), projects.slice(20).map((row) => row.id))
})

test('restoration displaces the lowest-ranked recent project without changing work activity', () => {
  const projects = buildProjects(21)
  const result = partitionWorkspaceProjects(projects, { 'project-21': 100 })

  assert.equal(result.recentProjects.some((row) => row.id === 'project-21'), true)
  assert.equal(result.archivedProjects.some((row) => row.id === 'project-20'), true)
  assert.equal(projects[20].lastWorkedAt, 1)
})

test('ranking is deterministic when projects share the same effective activity', () => {
  const projects = [
    { id: 'first', lastWorkedAt: 100 },
    { id: 'second', lastWorkedAt: 100 },
    { id: 'third', lastWorkedAt: 90 },
  ]

  const result = partitionWorkspaceProjects(projects, {})
  assert.deepEqual(result.recentProjects.map((row) => row.id), ['first', 'second', 'third'])
})

test('restore priorities normalize positive timestamps and prune missing projects', () => {
  assert.deepEqual(normalizeProjectRestorePriorities({
    kept: '120',
    empty: 0,
    invalid: 'later',
    '': 50,
  }), { kept: 120 })

  assert.deepEqual(pruneProjectRestorePriorities([
    { id: 'kept' },
  ], {
    kept: 120,
    removed: 200,
  }), { kept: 120 })
})

test('manual archive overrides Recent ranking without mutating project activity', () => {
  const projects = buildProjects(21)
  const originalActivity = projects[0].lastWorkedAt
  const result = partitionWorkspaceProjects(projects, {}, { 'project-1': 500 })

  assert.equal(result.recentProjects.some((row) => row.id === 'project-1'), false)
  assert.equal(result.archivedProjects.some((row) => row.id === 'project-1'), true)
  assert.equal(result.recentProjects.some((row) => row.id === 'project-21'), true)
  assert.equal(projects[0].lastWorkedAt, originalActivity)
})

test('manual and overflow archives share one activity-ordered Archive result', () => {
  const projects = buildProjects(23)
  const result = partitionWorkspaceProjects(projects, {}, { 'project-2': 900 })

  assert.deepEqual(
    result.archivedProjects.map((row) => row.id),
    ['project-2', 'project-22', 'project-23'],
  )
})

test('archive overrides normalize positive timestamps and prune missing projects', () => {
  assert.deepEqual(normalizeProjectArchiveOverrides({
    kept: '120',
    empty: 0,
    invalid: 'later',
    '': 50,
  }), { kept: 120 })

  assert.deepEqual(pruneProjectArchiveOverrides([
    { id: 'kept' },
  ], {
    kept: 120,
    removed: 200,
  }), { kept: 120 })
})

test('initial expansion includes only the first ten recent projects', () => {
  const projects = buildProjects(20)

  assert.equal(DEFAULT_EXPANDED_PROJECT_LIMIT, 10)
  assert.deepEqual(
    resolveInitialExpandedProjectIds(projects),
    projects.slice(0, 10).map((row) => row.id),
  )
})

test('project action menu stays within the viewport and flips above its anchor when needed', () => {
  assert.deepEqual(resolveProjectMenuPosition({
    left: 290,
    right: 314,
    top: 460,
    bottom: 484,
  }, {
    width: 176,
    height: 132,
  }, {
    width: 320,
    height: 500,
    margin: 8,
    gap: 4,
  }), {
    left: 136,
    top: 324,
  })
})
