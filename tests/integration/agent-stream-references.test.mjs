import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  createAgentRunState,
  hydrateAgentRunSnapshot,
} from '../../src/renderer/store/agents/agent-run-reducer.mjs'
import {
  agentReferenceFingerprint,
  allReferencesTerminal,
  highestAttentionStatus,
  insertAgentReferenceGroups,
  isAgentDelegationToolKind,
  selectTurnAgentReferences,
} from '../../src/renderer/store/agents/agent-stream-references.mjs'

const NOW = 1_752_600_500_000
const TURN_ID = 'turn_01'

function makeNode(id, overrides = {}) {
  return {
    id,
    runId: 'run_01',
    parentNodeId: 'run_01_root',
    rootNodeId: 'run_01_root',
    depth: 1,
    branchPath: ['run_01_root', id],
    providerId: 'openrouter',
    modelId: 'anthropic/claude-sonnet-5',
    roleId: 'reviewer',
    roleLabel: `Agent ${id}`,
    taskSummary: `Task ${id}`,
    status: 'running',
    capabilitySnapshot: { mode: 'managed_hierarchy', visibilityReason: null },
    workspaceMode: 'local_worktree',
    createdAt: NOW,
    startedAt: NOW,
    finishedAt: null,
    childCount: 0,
    resultSummary: null,
    errorSummary: null,
    ...overrides,
  }
}

function snapshot({ runId = 'run_01', turnId = TURN_ID, nodes = [] } = {}) {
  const rootId = `${runId}_root`
  return {
    schemaVersion: 1,
    run: {
      id: runId,
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId,
      rootNodeId: rootId,
      status: 'running',
      createdAt: NOW - 20_000,
      lastRunSequence: 5,
    },
    nodes: [
      makeNode(rootId, { runId, parentNodeId: null, rootNodeId: rootId, depth: 0 }),
      ...nodes.map((node) => ({
        ...node,
        runId,
        rootNodeId: rootId,
        parentNodeId: node.parentNodeId === 'run_01_root' ? rootId : node.parentNodeId,
      })),
    ],
    attempts: [],
    approvals: [],
    artifacts: [],
    workspaces: [],
    mergeQueue: [],
    lastRunSequence: 5,
    nodeSequences: {},
  }
}

function stateWith(snapshots) {
  let state = createAgentRunState()
  for (const entry of snapshots) state = hydrateAgentRunSnapshot(state, entry)
  return state
}

function toolItem(id, { toolKind = 'delegate_to_agents', startedAt = 0 } = {}) {
  return {
    id,
    kind: 'tool',
    toolKind,
    state: 'succeeded',
    label: id,
    expandedEvidence: { startedAt, completedAt: startedAt + 10 },
  }
}

test('only direct children of the turn own runs become parent-stream references', () => {
  const state = stateWith([
    snapshot({
      nodes: [
        makeNode('alpha'),
        makeNode('grandchild', { parentNodeId: 'alpha', depth: 2 }),
      ],
    }),
    snapshot({ runId: 'run_02', turnId: 'turn_other', nodes: [makeNode('other')] }),
  ])

  const references = selectTurnAgentReferences(state, TURN_ID)

  assert.deepEqual(references.map((entry) => entry.nodeId), ['alpha'])
  assert.equal(references[0].descendantCount, 1)
})

test('a reference carries one short result line and never the child prose', () => {
  const state = stateWith([snapshot({
    nodes: [makeNode('alpha', {
      status: 'completed',
      resultSummary: 'Reviewed the parser.\nFull reasoning follows and should stay in the child.',
    })],
  })])

  const [reference] = selectTurnAgentReferences(state, TURN_ID)

  assert.equal(reference.preview, 'Reviewed the parser.')
  assert.equal(reference.status, 'completed')
})

test('a failing child reports its own failure and lifts descendant attention to the parent', () => {
  const state = stateWith([snapshot({
    nodes: [
      makeNode('alpha', { status: 'running' }),
      makeNode('nested', { parentNodeId: 'alpha', depth: 2, status: 'approval_required' }),
      makeNode('beta', { status: 'failed', errorSummary: 'Provider rejected the request' }),
    ],
  })])

  const references = selectTurnAgentReferences(state, TURN_ID)
  const alpha = references.find((entry) => entry.nodeId === 'alpha')
  const beta = references.find((entry) => entry.nodeId === 'beta')

  assert.equal(alpha.attentionStatus, 'approval_required')
  assert.equal(beta.attentionStatus, 'failed')
  assert.equal(beta.preview, 'Provider rejected the request')
  assert.equal(highestAttentionStatus(references), 'approval_required')
})

test('the group settles only once every child has reached a terminal status', () => {
  const running = [{ status: 'running' }, { status: 'completed' }]
  const settled = [{ status: 'completed' }, { status: 'failed' }]

  assert.equal(allReferencesTerminal(running), false)
  assert.equal(allReferencesTerminal(settled), true)
  assert.equal(allReferencesTerminal([]), false)
})

test('references land after the delegation that spawned them, not at the end of the turn', () => {
  const items = [
    { id: 'reasoning:a', kind: 'commentary', label: 'Thinking' },
    toolItem('tool:delegate-1', { startedAt: 100 }),
    { id: 'reasoning:b', kind: 'commentary', label: 'More thinking' },
    toolItem('tool:delegate-2', { startedAt: 300 }),
    { id: 'reasoning:c', kind: 'commentary', label: 'Wrapping up' },
  ]
  const references = [
    { key: 'a', nodeId: 'alpha', spawnedAt: 120, status: 'completed' },
    { key: 'b', nodeId: 'beta', spawnedAt: 320, status: 'running' },
  ]

  const next = insertAgentReferenceGroups(items, references)

  assert.deepEqual(next.map((item) => item.id), [
    'reasoning:a',
    'tool:delegate-1',
    'agents:tool:delegate-1',
    'reasoning:b',
    'tool:delegate-2',
    'agents:tool:delegate-2',
    'reasoning:c',
  ])
  assert.deepEqual(next[2].references.map((entry) => entry.nodeId), ['alpha'])
  assert.deepEqual(next[5].references.map((entry) => entry.nodeId), ['beta'])
})

test('a child with no delegation row before it falls to the end instead of an unrelated tool', () => {
  const items = [
    toolItem('tool:read', { toolKind: 'read_file', startedAt: 50 }),
    toolItem('tool:delegate-1', { startedAt: 400 }),
  ]
  const references = [{ key: 'a', nodeId: 'alpha', spawnedAt: 100, status: 'running' }]

  const next = insertAgentReferenceGroups(items, references)

  assert.deepEqual(next.map((item) => item.id), [
    'tool:read',
    'tool:delegate-1',
    'agents:trailing',
  ])
})

test('a stream with no references is returned untouched', () => {
  const items = [toolItem('tool:delegate-1', { startedAt: 100 })]

  assert.equal(insertAgentReferenceGroups(items, []), items)
})

test('delegation tools are recognised across the delegate and spawn families', () => {
  assert.equal(isAgentDelegationToolKind('delegate_to_agents'), true)
  assert.equal(isAgentDelegationToolKind('delegate_tasks'), true)
  assert.equal(isAgentDelegationToolKind('spawn_agent'), true)
  assert.equal(isAgentDelegationToolKind('read_file'), false)
  assert.equal(isAgentDelegationToolKind(''), false)
})

test('the fingerprint ignores unrelated turns and changes when a child status changes', () => {
  const before = stateWith([snapshot({ nodes: [makeNode('alpha', { status: 'running' })] })])
  const after = stateWith([snapshot({ nodes: [makeNode('alpha', { status: 'completed' })] })])
  const unrelated = stateWith([
    snapshot({ nodes: [makeNode('alpha', { status: 'running' })] }),
    snapshot({ runId: 'run_02', turnId: 'turn_other', nodes: [makeNode('other')] }),
  ])

  assert.notEqual(agentReferenceFingerprint(before, TURN_ID), agentReferenceFingerprint(after, TURN_ID))
  assert.equal(agentReferenceFingerprint(before, TURN_ID), agentReferenceFingerprint(unrelated, TURN_ID))
  assert.equal(agentReferenceFingerprint(before, ''), '')
})

function readSource(relative) {
  return fs.readFileSync(path.join(process.cwd(), relative), 'utf8')
}

test('the turn block subscribes through the fingerprint rather than the whole agent store', () => {
  const source = readSource('src/renderer/components/chat/LiveExecutionStreamBlock.jsx')

  assert.match(source, /useAgentRunStore\(\s*\(state\) => agentReferenceFingerprint\(state, turn\?\.turnId\),\s*\)/)
  assert.match(source, /insertAgentReferenceGroups\(canonicalItems, references\)/)
  assert.match(source, /items=\{streamItems\}/)
})

test('the agents group is collapsible and opens the child conversation', () => {
  const source = readSource('src/renderer/components/agents/AgentStreamReferenceGroup.jsx')

  assert.match(source, /aria-expanded=\{!collapsed\}/)
  assert.match(source, /streamGroupCollapsePreference/)
  assert.match(source, /hasUserPreference/)
  assert.match(source, /planStreamReturnFocus/)
  assert.match(source, /action\.type === 'expand'/)
  assert.match(source, /selectNavigatorNode\(\{/)
  assert.doesNotMatch(source, /resultSummary/, 'the group shows previews, not child prose')
})
