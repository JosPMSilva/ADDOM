import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createAgentRunState,
  hydrateAgentRunSnapshot,
  updateAgentRunPresentation,
} from '../../src/renderer/store/agents/agent-run-reducer.mjs'
import {
  DEFAULT_COMPLETED_BATCH_SIZE,
  NAVIGATOR_VIRTUALIZE_MIN_ROWS,
  nextNavigatorExpansion,
  selectAgentNavigatorModel,
} from '../../src/renderer/store/agents/agent-navigator-view-model.mjs'

const NOW = 1_752_600_500_000
const SCOPE = Object.freeze({ projectId: 'project_01', threadId: 'thread_01' })

function makeNode(id, overrides = {}) {
  const status = overrides.status || 'completed'
  const terminal = ['completed', 'failed', 'cancelled'].includes(status)
  return {
    id,
    runId: 'run_01',
    parentNodeId: 'root',
    rootNodeId: 'root',
    depth: 1,
    branchPath: ['root', id],
    providerId: 'openrouter',
    modelId: 'anthropic/claude-sonnet-5',
    roleId: 'reviewer',
    roleLabel: `Agent ${id}`,
    taskSummary: `Task ${id}`,
    status,
    capabilitySnapshot: { mode: 'managed_hierarchy', visibilityReason: null },
    workspaceMode: 'local_worktree',
    createdAt: NOW - 10_000,
    startedAt: NOW - 9_000,
    finishedAt: terminal ? NOW - 1_000 : null,
    childCount: 0,
    resultSummary: status === 'completed' ? `Result ${id}` : null,
    errorSummary: status === 'failed' ? `Failure ${id}` : null,
    ...overrides,
  }
}

function makeSnapshot({
  runId = 'run_01',
  threadId = 'thread_01',
  status = 'running',
  nodes = [],
} = {}) {
  const rootId = `${runId}_root`
  const scoped = nodes.map((entry) => ({
    ...entry,
    runId,
    rootNodeId: rootId,
    parentNodeId: entry.parentNodeId === 'root' ? rootId : entry.parentNodeId,
    id: entry.id,
  }))
  return {
    schemaVersion: 1,
    run: {
      id: runId,
      projectId: 'project_01',
      threadId,
      rootNodeId: rootId,
      status,
      createdAt: NOW - 20_000,
      lastRunSequence: 10,
    },
    nodes: [
      makeNode(rootId, {
        runId,
        parentNodeId: null,
        rootNodeId: rootId,
        depth: 0,
        roleLabel: 'Primary agent',
        status,
      }),
      ...scoped,
    ],
    attempts: [],
    approvals: [],
    artifacts: [],
    workspaces: [],
    mergeQueue: [],
    lastRunSequence: 10,
    nodeSequences: {},
  }
}

function stateWith(snapshots, presentation = null) {
  let state = createAgentRunState()
  for (const snapshot of snapshots) state = hydrateAgentRunSnapshot(state, snapshot)
  if (presentation) state = updateAgentRunPresentation(state, presentation)
  return state
}

function keysOf(rows) {
  return rows.map((row) => row.nodeId)
}

test('the navigator omits the synthetic root row and groups agents by their own status', () => {
  const state = stateWith([makeSnapshot({
    nodes: [
      makeNode('alpha', { status: 'running' }),
      makeNode('beta', { status: 'completed' }),
      makeNode('gamma', { status: 'failed' }),
    ],
  })])

  const model = selectAgentNavigatorModel(state, { ...SCOPE, now: NOW })

  assert.equal(model.isEmpty, false)
  assert.deepEqual(keysOf(model.active), ['alpha'])
  assert.deepEqual(keysOf(model.done).sort(), ['beta', 'gamma'])
  assert.equal(
    model.active.concat(model.done).some((row) => row.nodeId === 'run_01_root'),
    false,
    'the run root must never appear as a navigator row',
  )
})

test('completed branches stay collapsed and only the selected ancestry auto-expands', () => {
  const state = stateWith([makeSnapshot({
    nodes: [
      makeNode('parent', { status: 'completed' }),
      makeNode('child', { status: 'completed', parentNodeId: 'parent', depth: 2 }),
      makeNode('grandchild', { status: 'completed', parentNodeId: 'child', depth: 3 }),
    ],
  })], { threadId: 'thread_01', runId: 'run_01', selectedNodeId: 'grandchild' })

  const model = selectAgentNavigatorModel(state, { ...SCOPE, now: NOW })

  assert.deepEqual(keysOf(model.done), ['parent', 'child', 'grandchild'])
  assert.equal(model.done.find((row) => row.nodeId === 'parent').expanded, true)
  assert.equal(model.done.find((row) => row.nodeId === 'child').expanded, true)
  assert.equal(model.done.find((row) => row.nodeId === 'grandchild').selected, true)
  assert.deepEqual(model.done.map((row) => row.depth), [0, 1, 2])

  const unselected = selectAgentNavigatorModel(
    stateWith([makeSnapshot({
      nodes: [
        makeNode('parent', { status: 'completed' }),
        makeNode('child', { status: 'completed', parentNodeId: 'parent', depth: 2 }),
      ],
    })]),
    { ...SCOPE, now: NOW },
  )
  assert.deepEqual(keysOf(unselected.done), ['parent'])
  assert.equal(unselected.done[0].expanded, false)
  assert.equal(unselected.done[0].hasChildren, true)
})

test('manual collapse of a selected-ancestry node wins over auto-expansion', () => {
  const snapshot = makeSnapshot({
    nodes: [
      makeNode('parent', { status: 'running' }),
      makeNode('child', { status: 'running', parentNodeId: 'parent', depth: 2 }),
    ],
  })
  const state = stateWith([snapshot], {
    threadId: 'thread_01',
    runId: 'run_01',
    selectedNodeId: 'child',
    collapsedNodeIds: ['parent'],
  })

  const model = selectAgentNavigatorModel(state, { ...SCOPE, now: NOW })

  assert.deepEqual(keysOf(model.active), ['parent'])
  assert.equal(model.active[0].expanded, false)
  assert.equal(model.active[0].hiddenDescendantCount, 1)
})

test('a collapsed row reports hidden descendant count and highest-priority hidden attention', () => {
  const state = stateWith([makeSnapshot({
    nodes: [
      makeNode('parent', { status: 'running' }),
      makeNode('waiting', { status: 'waiting', parentNodeId: 'parent', depth: 2 }),
      makeNode('blocked', { status: 'approval_required', parentNodeId: 'parent', depth: 2 }),
    ],
  })])

  const model = selectAgentNavigatorModel(state, { ...SCOPE, now: NOW })
  const parent = model.active.find((row) => row.nodeId === 'parent')

  assert.equal(parent.expanded, false)
  assert.equal(parent.hiddenDescendantCount, 2)
  assert.equal(parent.hiddenAttentionStatus, 'approval_required')
  assert.equal(model.active.length, 1)
})

test('a non-terminal agent under a completed parent still surfaces in Active', () => {
  const state = stateWith([makeSnapshot({
    nodes: [
      makeNode('finished-parent', { status: 'completed' }),
      makeNode('background-child', {
        status: 'running',
        parentNodeId: 'finished-parent',
        depth: 2,
      }),
    ],
  })])

  const model = selectAgentNavigatorModel(state, { ...SCOPE, now: NOW })

  assert.deepEqual(keysOf(model.active), ['background-child'])
  assert.equal(model.active[0].depth, 0, 'it has no Active ancestor, so it is a top-level Active row')
  assert.deepEqual(keysOf(model.done), ['finished-parent'])
})

test('the Done section is bounded to a recent batch and reports the remainder', () => {
  const nodes = []
  for (let index = 0; index < DEFAULT_COMPLETED_BATCH_SIZE + 3; index += 1) {
    nodes.push(makeNode(`done_${index}`, {
      status: 'completed',
      finishedAt: NOW - (index * 1_000),
    }))
  }
  const state = stateWith([makeSnapshot({ nodes })])

  const model = selectAgentNavigatorModel(state, { ...SCOPE, now: NOW })

  assert.equal(model.done.length, DEFAULT_COMPLETED_BATCH_SIZE)
  assert.equal(model.doneTotal, DEFAULT_COMPLETED_BATCH_SIZE + 3)
  assert.equal(model.doneHidden, 3)
  assert.equal(model.done[0].nodeId, 'done_0', 'most recently finished agent comes first')

  const expanded = selectAgentNavigatorModel(
    stateWith([makeSnapshot({ nodes })], {
      threadId: 'thread_01',
      runId: 'run_01',
      completedBatchSize: DEFAULT_COMPLETED_BATCH_SIZE + 3,
    }),
    { ...SCOPE, now: NOW },
  )
  assert.equal(expanded.done.length, DEFAULT_COMPLETED_BATCH_SIZE + 3)
  assert.equal(expanded.doneHidden, 0)
})

test('the navigator spans every run in the thread and excludes other threads', () => {
  const state = stateWith([
    makeSnapshot({ runId: 'run_01', nodes: [makeNode('first', { status: 'running' })] }),
    makeSnapshot({ runId: 'run_02', nodes: [makeNode('second', { status: 'running' })] }),
    makeSnapshot({
      runId: 'run_03',
      threadId: 'thread_other',
      nodes: [makeNode('elsewhere', { status: 'running' })],
    }),
  ])

  const model = selectAgentNavigatorModel(state, { ...SCOPE, now: NOW })

  assert.deepEqual(keysOf(model.active).sort(), ['first', 'second'])
  assert.equal(model.active.every((row) => row.runId !== 'run_03'), true)
})

test('follow-up execution nodes remain one durable conversation row across runs', () => {
  const conversationId = 'conversation_docs_writer'
  const state = stateWith([
    makeSnapshot({
      runId: 'run_initial',
      status: 'completed',
      nodes: [makeNode('docs_writer_initial', {
        conversationId,
        status: 'completed',
        taskSummary: 'Review the CLI documentation.',
        resultSummary: 'Found one documentation gap.',
        createdAt: NOW - 30_000,
        finishedAt: NOW - 20_000,
      })],
    }),
    makeSnapshot({
      runId: 'run_followup',
      status: 'completed',
      nodes: [makeNode('docs_writer_followup', {
        conversationId,
        status: 'completed',
        taskSummary: 'Echo hello.',
        resultSummary: 'hello',
        createdAt: NOW - 10_000,
        finishedAt: NOW - 1_000,
      })],
    }),
  ])

  const model = selectAgentNavigatorModel(state, { ...SCOPE, now: NOW })

  assert.equal(model.doneTotal, 1)
  assert.equal(model.done.length, 1)
  assert.equal(model.done[0].runId, 'run_initial')
  assert.equal(model.done[0].nodeId, 'docs_writer_initial')
  assert.equal(model.done[0].label, 'Agent docs_writer_initial')
  assert.equal(model.done[0].preview, 'hello')
  assert.deepEqual(model.done[0].memberNodeIds, [
    'docs_writer_initial',
    'docs_writer_followup',
  ])
})

test('an active follow-up promotes its durable conversation row into Active', () => {
  const conversationId = 'conversation_docs_writer'
  const state = stateWith([
    makeSnapshot({
      runId: 'run_initial',
      status: 'completed',
      nodes: [makeNode('docs_writer_initial', {
        conversationId,
        status: 'completed',
        createdAt: NOW - 30_000,
        finishedAt: NOW - 20_000,
      })],
    }),
    makeSnapshot({
      runId: 'run_followup',
      status: 'running',
      nodes: [makeNode('docs_writer_followup', {
        conversationId,
        status: 'running',
        taskSummary: 'Continue the review.',
        createdAt: NOW - 1_000,
        startedAt: NOW - 900,
      })],
    }),
  ])

  const model = selectAgentNavigatorModel(state, { ...SCOPE, now: NOW })

  assert.equal(model.active.length, 1)
  assert.equal(model.doneTotal, 0)
  assert.equal(model.active[0].nodeId, 'docs_writer_initial')
  assert.equal(model.active[0].status, 'running')
  assert.equal(model.active[0].preview, 'Continue the review.')
})

test('the navigator reports an empty thread and switches on windowing past the row threshold', () => {
  const empty = selectAgentNavigatorModel(
    stateWith([makeSnapshot({ nodes: [] })]),
    { ...SCOPE, now: NOW },
  )
  assert.equal(empty.isEmpty, true)
  assert.equal(empty.active.length, 0)
  assert.equal(empty.virtualize, false)

  const many = []
  for (let index = 0; index < NAVIGATOR_VIRTUALIZE_MIN_ROWS + 5; index += 1) {
    many.push(makeNode(`live_${index}`, { status: 'running' }))
  }
  const busy = selectAgentNavigatorModel(
    stateWith([makeSnapshot({ nodes: many })]),
    { ...SCOPE, now: NOW },
  )
  assert.equal(busy.active.length, NAVIGATOR_VIRTUALIZE_MIN_ROWS + 5)
  assert.equal(busy.visibleRowCount, NAVIGATOR_VIRTUALIZE_MIN_ROWS + 5)
  assert.equal(busy.virtualize, true)
})

test('opaque provider nodes are marked partial visibility and expose no fabricated hierarchy', () => {
  const state = stateWith([makeSnapshot({
    nodes: [
      makeNode('opaque', {
        status: 'running',
        capabilitySnapshot: {
          mode: 'provider_opaque',
          visibilityReason: 'Provider does not expose child agents.',
        },
      }),
    ],
  })])

  const model = selectAgentNavigatorModel(state, { ...SCOPE, now: NOW })

  assert.equal(model.active[0].opaque, true)
  assert.equal(model.active[0].visibilityReason, 'Provider does not expose child agents.')
  assert.equal(model.active[0].hasChildren, false)
})

test('nextNavigatorExpansion records explicit intent in both directions', () => {
  const collapsed = nextNavigatorExpansion({}, 'alpha', false)
  assert.deepEqual(collapsed, { expandedNodeIds: [], collapsedNodeIds: ['alpha'] })

  const reopened = nextNavigatorExpansion(collapsed, 'alpha', true)
  assert.deepEqual(reopened, { expandedNodeIds: ['alpha'], collapsedNodeIds: [] })
})
