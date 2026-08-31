import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  createAgentRunState,
  hydrateAgentRunSnapshot,
  selectAgentNavigatorNode,
  updateAgentRunPresentation,
} from '../../src/renderer/store/agents/agent-run-reducer.mjs'
import {
  selectAgentAncestry,
  selectThreadSelectedAgentRoute,
} from '../../src/renderer/store/agents/agent-run-selectors.mjs'

const NOW = 1_752_600_500_000
const THREAD_ID = 'thread_01'

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
    createdAt: NOW - 10_000,
    startedAt: NOW - 9_000,
    finishedAt: null,
    childCount: 0,
    resultSummary: null,
    errorSummary: null,
    ...overrides,
  }
}

function snapshot(nodes) {
  return {
    schemaVersion: 1,
    run: {
      id: 'run_01',
      projectId: 'project_01',
      threadId: THREAD_ID,
      rootNodeId: 'run_01_root',
      status: 'running',
      createdAt: NOW - 20_000,
      lastRunSequence: 5,
    },
    nodes: [
      makeNode('run_01_root', {
        parentNodeId: null,
        depth: 0,
        roleLabel: 'Primary agent',
      }),
      ...nodes,
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

function stateWith(nodes) {
  return hydrateAgentRunSnapshot(createAgentRunState(), snapshot(nodes))
}

test('the thread route resolves the selected agent without guessing a run', () => {
  let state = stateWith([makeNode('alpha')])
  state = selectAgentNavigatorNode(state, {
    threadId: THREAD_ID,
    runId: 'run_01',
    nodeId: 'alpha',
  })

  const route = selectThreadSelectedAgentRoute(state, THREAD_ID)

  assert.equal(route.runId, 'run_01')
  assert.equal(route.nodeId, 'alpha')
  assert.equal(route.missing, false)
  assert.equal(route.node.roleLabel, 'Agent alpha')
})

test('no selection leaves the thread on its own conversation', () => {
  const state = stateWith([makeNode('alpha')])

  assert.equal(selectThreadSelectedAgentRoute(state, THREAD_ID), null)
})

test('a selection whose agent is gone after reload reports missing instead of substituting', () => {
  let state = stateWith([makeNode('alpha')])
  state = selectAgentNavigatorNode(state, {
    threadId: THREAD_ID,
    runId: 'run_01',
    nodeId: 'ghost',
  })

  const route = selectThreadSelectedAgentRoute(state, THREAD_ID)

  assert.equal(route.missing, true)
  assert.equal(route.nodeId, 'ghost')
  assert.equal(route.node, null)
})

test('clearing the selection returns the thread route to null', () => {
  let state = stateWith([makeNode('alpha')])
  state = selectAgentNavigatorNode(state, { threadId: THREAD_ID, runId: 'run_01', nodeId: 'alpha' })
  state = selectAgentNavigatorNode(state, { threadId: THREAD_ID, runId: 'run_01', nodeId: '' })

  assert.equal(selectThreadSelectedAgentRoute(state, THREAD_ID), null)
})

test('the breadcrumb lists intermediate agents and omits the synthetic root', () => {
  const state = stateWith([
    makeNode('alpha'),
    makeNode('beta', { parentNodeId: 'alpha', depth: 2 }),
    makeNode('gamma', { parentNodeId: 'beta', depth: 3 }),
  ])

  const ancestry = selectAgentAncestry(state, 'run_01', 'gamma')

  assert.deepEqual(ancestry.map((entry) => entry.nodeId), ['alpha', 'beta'])
  assert.deepEqual(ancestry.map((entry) => entry.label), ['Agent alpha', 'Agent beta'])
})

test('a direct child of the run root has an empty breadcrumb', () => {
  const state = stateWith([makeNode('alpha')])

  assert.deepEqual(selectAgentAncestry(state, 'run_01', 'alpha'), [])
})

test('the return anchor survives closing the child conversation', () => {
  let state = stateWith([makeNode('alpha')])
  state = updateAgentRunPresentation(state, {
    threadId: THREAD_ID,
    runId: 'run_01',
    returnAnchor: { focusNodeId: 'alpha', focusSurface: 'stream' },
  })
  state = selectAgentNavigatorNode(state, { threadId: THREAD_ID, runId: 'run_01', nodeId: '' })

  assert.deepEqual(
    state.presentationByScope[`${THREAD_ID}:run_01`].returnAnchor,
    { focusNodeId: 'alpha', focusSurface: 'stream' },
  )
})

test('stream group collapse preferences merge per group id', () => {
  let state = stateWith([makeNode('alpha')])
  state = updateAgentRunPresentation(state, {
    threadId: THREAD_ID,
    runId: 'run_01',
    streamGroupCollapsePreference: { group_a: true },
  })
  state = updateAgentRunPresentation(state, {
    threadId: THREAD_ID,
    runId: 'run_01',
    streamGroupCollapsePreference: { group_b: false },
  })

  assert.deepEqual(
    state.presentationByScope[`${THREAD_ID}:run_01`].streamGroupCollapsePreference,
    { group_a: true, group_b: false },
  )
})

function readSource(relative) {
  return fs.readFileSync(path.join(process.cwd(), relative), 'utf8')
}

test('the chat surface keeps the thread mounted behind the opened agent', () => {
  const source = readSource('src/renderer/components/chat/ChatPanelView.jsx')

  assert.match(source, /useSelectedAgentConversation/)
  assert.match(source, /<AgentConversationView conversation=\{agentConversation\} \/>/)
  assert.match(source, /const behind = agentOpen \? \{ inert: '', 'aria-hidden': true \} : null/)
  const behindTargets = source.match(/\{\.\.\.behind\}/g) || []
  assert.equal(behindTargets.length, 2, 'timeline and composer regions are both made inert')
  assert.doesNotMatch(source, /agentOpen \? null : <ChatPanelTimelineArea/)
})

test('the child conversation reads its scoped durable state through the canonical chat surface', () => {
  const source = readSource('src/renderer/components/agents/AgentConversationView.jsx')

  assert.match(source, /import TurnShell from '\.\.\/chat\/TurnShell\.jsx'/)
  assert.doesNotMatch(source, /import CanonicalExecutionStream/)
  assert.match(source, /<TurnShell\b/)
  assert.match(source, /MemoMessageBubble/)
  assert.match(source, /AgentConversationComposer/)
  assert.match(source, /data-ui="agent-conversation-back"/)
  assert.match(source, /useTimelineVirtualization\(\{/)
  assert.doesNotMatch(source, /data-ui="agent-conversation-load-more"|Load more activity/)
  assert.match(source, /data-ui="agent-conversation-overflow"/)
  assert.match(source, /--app-chat-content-max-width/)
  assert.doesNotMatch(source, /AgentMessageDialog/)
  assert.doesNotMatch(source, /selectAgentFinalMessage/)
  assert.match(source, /agentConversation\.unavailableTitle/)
  assert.doesNotMatch(source, /useState\(\s*\[\s*\]\s*\)/, 'transcript state stays in the store')
  assert.match(
    source,
    /node\?\.taskSummary && !pending && messageCount === 0/,
    'the task fallback must not duplicate the first durable user message',
  )
})

test('agent conversation text stays selectable under global body select-none', () => {
  const html = readSource('src/renderer/index.html')
  const view = readSource('src/renderer/components/agents/AgentConversationView.jsx')
  const messageBubble = readSource('src/renderer/components/chat/MessageBubble.jsx')

  // Product default disables selection on <body>; readable surfaces must opt back in.
  assert.match(
    html,
    /<body\b[^>]*\bclass="[^"]*\bselect-none\b[^"]*"/,
    'renderer body keeps select-none as the global default',
  )
  assert.match(
    messageBubble,
    /\bselect-text\b/,
    'root chat bubbles remain the reference opt-in pattern',
  )
  assert.match(
    view,
    /className="[^"]*\bselect-text\b[^"]*"\s+data-ui="agent-conversation-body"/,
    'opened agent conversation body must opt into selection/copy',
  )
  // Durable final messages reuse the root message bubble under that opt-in region.
  assert.match(
    view,
    /<MemoMessageBubble\b/,
    'agent final answer stays under the selectable conversation body through the root message surface',
  )
})

test('the conversation hook reads durable state, pages conversation-wide evidence, and restores stream focus on close', () => {
  const source = readSource('src/renderer/components/agents/use-selected-agent-conversation.mjs')

  assert.match(source, /getConversation\(\{/)
  assert.match(source, /getConversationTranscriptPage\(\{/)
  assert.doesNotMatch(source, /hydrateAgentNodeTranscript/)
  assert.match(source, /followup\(\{/)
  assert.match(source, /returnAnchor: \{ focusNodeId: nodeId, focusSurface: 'stream' \}/)
  assert.match(source, /selectNavigatorNode\(\{ threadId, runId, nodeId: '' \}\)/)
})
