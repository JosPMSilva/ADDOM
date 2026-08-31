import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CHAT_COMPANION_AGENTS,
  CHAT_COMPANION_DOCUMENT,
  CHAT_COMPANION_GIT,
  CHAT_COMPANION_MODE_FOCUSED,
  CHAT_COMPANION_MODE_SPLIT,
  activateChatCompanionView,
  clampChatCompanionWidth,
  closeChatCompanionView,
  createChatCompanionViewRegistry,
  createDocumentCompanionView,
  filterChatCompanionViewsForThread,
  formatAgentCompanionLabel,
  moveChatCompanionView,
  normalizeChatCompanion,
  openChatCompanionView,
  resolveChatCompanionMaximumWidth,
  shouldCloseAgentCompanionOnThreadChange,
  shouldShowAgentCompanionTrigger,
  toggleChatCompanion,
} from '../../src/renderer/components/chat/chat-companion-state.mjs'
import {
  createAgentRunState,
  hydrateAgentRunSnapshot,
} from '../../src/renderer/store/agents/agent-run-reducer.mjs'
import { selectAgentCompanionStatus } from '../../src/renderer/store/agents/agent-run-selectors.mjs'

const NOW = 1_752_600_500_000
const SCOPE = Object.freeze({ projectId: 'project_01', threadId: 'thread_01' })

/** Mirrors i18next enough to assert the chosen key and interpolated count. */
function translate(key, options = {}) {
  const count = Number(options?.count || 0)
  return `${key}:${count}`
}

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

function stateWith(nodes, { threadId = SCOPE.threadId } = {}) {
  return hydrateAgentRunSnapshot(createAgentRunState(), {
    schemaVersion: 1,
    run: {
      id: 'run_01',
      projectId: SCOPE.projectId,
      threadId,
      turnId: 'turn_01',
      rootNodeId: 'run_01_root',
      status: 'running',
      createdAt: NOW - 20_000,
      lastRunSequence: 5,
    },
    nodes: [
      makeNode('run_01_root', { parentNodeId: null, depth: 0 }),
      ...nodes,
    ],
    attempts: [],
    approvals: [],
    artifacts: [],
    workspaces: [],
    mergeQueue: [],
    lastRunSequence: 5,
    nodeSequences: {},
  })
}

test('chat companions normalize and toggle exclusively', () => {
  assert.equal(normalizeChatCompanion('git'), CHAT_COMPANION_GIT)
  assert.equal(normalizeChatCompanion('agents'), CHAT_COMPANION_AGENTS)
  assert.equal(normalizeChatCompanion('source-control'), '')
  assert.equal(toggleChatCompanion('', 'git'), CHAT_COMPANION_GIT)
  assert.equal(toggleChatCompanion('agents', 'git'), CHAT_COMPANION_GIT)
  assert.equal(toggleChatCompanion('git', 'git'), '')
})

test('the static registry accepts bounded test descriptors without changing the shell', () => {
  const registry = createChatCompanionViewRegistry([
    { type: CHAT_COMPANION_GIT, singleton: true },
    { type: CHAT_COMPANION_AGENTS, singleton: true },
    { type: CHAT_COMPANION_DOCUMENT, singleton: false },
    { type: 'test-view', singleton: true },
  ])

  assert.equal(registry.get('test-view')?.singleton, true)
  assert.equal(registry.get(CHAT_COMPANION_DOCUMENT)?.singleton, false)
  assert.throws(
    () => createChatCompanionViewRegistry([{ type: '../unsafe', singleton: true }]),
    /invalid companion view type/i,
  )
})

test('document views reuse canonical project paths and evict the oldest document deterministically', () => {
  const initial = {
    activeKey: '',
    views: [{ key: CHAT_COMPANION_GIT, type: CHAT_COMPANION_GIT, label: 'Git' }],
  }
  const firstDocument = createDocumentCompanionView({
    projectId: 'project_1',
    filePath: 'docs/plan.md',
    label: 'Plan',
  })
  const opened = openChatCompanionView(initial, firstDocument, { maxDocuments: 2 })
  const reused = openChatCompanionView(opened, createDocumentCompanionView({
    projectId: 'project_1',
    filePath: 'docs\\plan.md',
    label: 'Renamed label',
  }), { maxDocuments: 2 })
  const second = openChatCompanionView(reused, createDocumentCompanionView({
    projectId: 'project_1',
    filePath: 'docs/two.md',
  }), { maxDocuments: 2 })
  const third = openChatCompanionView(second, createDocumentCompanionView({
    projectId: 'project_1',
    filePath: 'docs/three.md',
  }), { maxDocuments: 2 })

  assert.equal(reused.views.length, 2)
  assert.equal(reused.activeKey, firstDocument.key)
  assert.deepEqual(
    third.views.map((view) => view.key),
    [CHAT_COMPANION_GIT, second.views.at(-1).key, third.activeKey],
  )
})

test('document view labels always use the canonical filename instead of originating link copy', () => {
  const projectDocument = createDocumentCompanionView({
    projectId: 'project_1',
    filePath: 'docs/HARDWARE_TOOL_IMPROVEMENT_PLAN.md',
    label: 'View the revised HARDWARE_TOOL_IMPROVEMENT_PLAN.md',
  })
  const evidenceDocument = createDocumentCompanionView({
    sourceKind: 'evidence',
    filePath: 'C:/tmp/evidence/session/result.md',
    sourceFilePath: 'session/result.md',
    label: 'Read the generated result.md',
  })

  assert.equal(projectDocument.label, 'HARDWARE_TOOL_IMPROVEMENT_PLAN.md')
  assert.equal(evidenceDocument.label, 'result.md')
})

test('a managed plan keeps one thread-scoped companion key across document revisions', () => {
  const first = createDocumentCompanionView({
    sourceKind: 'managed_plan',
    projectRoot: 'C:/workspace/project',
    threadId: 'thread_1',
    planId: 'plan_1',
    initialDocument: { ok: true, revision: 1, content: '# First' },
  })
  const refreshed = createDocumentCompanionView({
    sourceKind: 'managed_plan',
    projectRoot: 'C:/workspace/project',
    threadId: 'thread_1',
    planId: 'plan_1',
    initialDocument: { ok: true, revision: 2, content: '# Revised' },
  })
  const opened = openChatCompanionView({ views: [first], activeKey: first.key }, refreshed)

  assert.equal(first.key, refreshed.key)
  assert.equal(opened.views.length, 1)
  assert.equal(opened.views[0].initialDocument.revision, 2)
})

test('thread switching retains only the managed plan owned by the active thread', () => {
  const projectDocument = createDocumentCompanionView({
    projectId: 'project_1',
    filePath: 'docs/reference.md',
  })
  const threadOnePlan = createDocumentCompanionView({
    sourceKind: 'managed_plan',
    projectRoot: 'C:/workspace/project',
    threadId: 'thread_1',
    planId: 'plan_1',
  })
  const threadTwoPlan = createDocumentCompanionView({
    sourceKind: 'managed_plan',
    projectRoot: 'C:/workspace/project',
    threadId: 'thread_2',
    planId: 'plan_2',
  })
  const state = {
    activeKey: threadOnePlan.key,
    views: [projectDocument, threadOnePlan, threadTwoPlan],
  }

  const threadOne = filterChatCompanionViewsForThread(state, 'thread_1')
  const threadTwo = filterChatCompanionViewsForThread({
    ...state,
    activeKey: threadTwoPlan.key,
  }, 'thread_2')

  assert.notEqual(threadOnePlan.key, threadTwoPlan.key)
  assert.deepEqual(threadOne.views.map((view) => view.key), [projectDocument.key, threadOnePlan.key])
  assert.equal(threadOne.activeKey, threadOnePlan.key)
  assert.deepEqual(threadTwo.views.map((view) => view.key), [projectDocument.key, threadTwoPlan.key])
  assert.equal(threadTwo.activeKey, threadTwoPlan.key)
})

test('closing and activating views use stable deterministic fallback', () => {
  const doc = createDocumentCompanionView({ projectId: 'project_1', filePath: 'PLAN.md' })
  const state = {
    activeKey: doc.key,
    views: [
      { key: CHAT_COMPANION_GIT, type: CHAT_COMPANION_GIT, label: 'Git' },
      { key: CHAT_COMPANION_AGENTS, type: CHAT_COMPANION_AGENTS, label: 'Agents' },
      doc,
    ],
  }
  const closed = closeChatCompanionView(state, doc.key)

  assert.equal(closed.activeKey, CHAT_COMPANION_AGENTS)
  assert.equal(activateChatCompanionView(closed, CHAT_COMPANION_GIT).activeKey, CHAT_COMPANION_GIT)
  assert.equal(activateChatCompanionView(closed, 'missing').activeKey, CHAT_COMPANION_AGENTS)
})

test('closing a linked document returns to its originating companion view', () => {
  const doc = createDocumentCompanionView({
    projectId: 'project_1',
    filePath: 'docs/child.md',
    originViewKey: CHAT_COMPANION_GIT,
  })
  const closed = closeChatCompanionView({
    activeKey: doc.key,
    views: [
      { key: CHAT_COMPANION_GIT, type: CHAT_COMPANION_GIT, label: 'Git' },
      { key: CHAT_COMPANION_AGENTS, type: CHAT_COMPANION_AGENTS, label: 'Agents' },
      doc,
    ],
  }, doc.key)

  assert.equal(closed.activeKey, CHAT_COMPANION_GIT)
})

test('moving a companion view preserves the active view and clamps the destination', () => {
  const first = createDocumentCompanionView({ projectId: 'project_1', filePath: 'docs/first.md' })
  const second = createDocumentCompanionView({ projectId: 'project_1', filePath: 'docs/second.md' })
  const state = {
    activeKey: first.key,
    views: [
      { key: CHAT_COMPANION_AGENTS, type: CHAT_COMPANION_AGENTS, label: 'Agents' },
      first,
      second,
    ],
  }

  const moved = moveChatCompanionView(state, second.key, 0)
  assert.deepEqual(moved.views.map((view) => view.key), [second.key, CHAT_COMPANION_AGENTS, first.key])
  assert.equal(moved.activeKey, first.key)

  const clamped = moveChatCompanionView(moved, second.key, 99)
  assert.deepEqual(clamped.views.map((view) => view.key), [CHAT_COMPANION_AGENTS, first.key, second.key])
  assert.equal(clamped.activeKey, first.key)
})

test('split width clamps against a readable chat surface while modes stay explicit', () => {
  assert.equal(CHAT_COMPANION_MODE_SPLIT, 'split')
  assert.equal(CHAT_COMPANION_MODE_FOCUSED, 'focused')
  assert.equal(clampChatCompanionWidth(120, 1400), 280)
  assert.equal(clampChatCompanionWidth(900, 1400), 760)
  assert.equal(clampChatCompanionWidth(440, 1400), 440)
})

test('collapsed Projects allows a balanced 50:50 chat and companion split', () => {
  assert.equal(resolveChatCompanionMaximumWidth(2_048, { workspaceRailOpen: false }), 1_024)
  assert.equal(clampChatCompanionWidth(1_400, 2_048, { workspaceRailOpen: false }), 1_024)
  assert.equal(resolveChatCompanionMaximumWidth(2_048, { workspaceRailOpen: true }), 760)
})

test('a thread with no agents reports nothing for the trigger', () => {
  const status = selectAgentCompanionStatus(createAgentRunState(), SCOPE)

  assert.deepEqual(status, {
    visible: false,
    total: 0,
    activeCount: 0,
    failedCount: 0,
    attentionStatus: null,
  })
  assert.equal(shouldShowAgentCompanionTrigger(status, ''), false)
})

test('the trigger counts every agent in the thread including nested ones', () => {
  const state = stateWith([
    makeNode('alpha', { status: 'running' }),
    makeNode('nested', { parentNodeId: 'alpha', depth: 2, status: 'queued' }),
    makeNode('beta', { status: 'completed' }),
    makeNode('gamma', { status: 'failed' }),
  ])

  const status = selectAgentCompanionStatus(state, SCOPE)

  assert.equal(status.total, 4)
  assert.equal(status.activeCount, 2)
  assert.equal(status.failedCount, 1)
  assert.equal(status.attentionStatus, 'failed')
})

test('an approval outranks a failure in the trigger copy', () => {
  const state = stateWith([
    makeNode('alpha', { status: 'approval_required' }),
    makeNode('beta', { status: 'failed' }),
  ])

  const status = selectAgentCompanionStatus(state, SCOPE)

  assert.equal(status.attentionStatus, 'approval_required')
})

test('agents from another thread never reach this thread trigger', () => {
  const state = stateWith([makeNode('alpha')], { threadId: 'thread_other' })

  assert.equal(selectAgentCompanionStatus(state, SCOPE).total, 0)
})

test('the trigger stays available for settled agents so completed work can be revisited', () => {
  const state = stateWith([makeNode('alpha', { status: 'completed' })])
  const status = selectAgentCompanionStatus(state, SCOPE)

  assert.equal(status.visible, true)
  assert.equal(shouldShowAgentCompanionTrigger(status, ''), true)
  assert.equal(shouldShowAgentCompanionTrigger(status, CHAT_COMPANION_GIT), true)
})

test('trigger copy prefers active work, then approval, then failures', () => {
  assert.equal(
    formatAgentCompanionLabel(translate, { activeCount: 2, failedCount: 1 }),
    'core:agentTrigger.active:2',
  )
  assert.equal(
    formatAgentCompanionLabel(translate, {
      activeCount: 0,
      failedCount: 1,
      attentionStatus: 'approval_required',
    }),
    'core:agentTrigger.approval:0',
  )
  assert.equal(
    formatAgentCompanionLabel(translate, { activeCount: 0, failedCount: 3 }),
    'core:agentTrigger.failed:3',
  )
  assert.equal(formatAgentCompanionLabel(translate, null), 'core:agentTrigger.idle:0')
})

test('Agents closes only when navigation leaves its owner for a thread with no active agents', () => {
  assert.equal(shouldCloseAgentCompanionOnThreadChange({
    ownerThreadId: 'thread_a',
    activeThreadId: 'thread_a',
    hasActiveAgents: false,
  }), false)
  assert.equal(shouldCloseAgentCompanionOnThreadChange({
    ownerThreadId: 'thread_a',
    activeThreadId: 'thread_b',
    hasActiveAgents: false,
  }), true)
  assert.equal(shouldCloseAgentCompanionOnThreadChange({
    ownerThreadId: 'thread_a',
    activeThreadId: 'thread_b',
    hasActiveAgents: true,
  }), false)
})
