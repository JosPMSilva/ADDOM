import assert from 'node:assert/strict'
import test from 'node:test'

import {
  agentConversationHasActiveTurn,
  buildAgentConversationTimeline,
  buildAgentConversationTurnGroups,
  resolveAgentConversationRoutePresentation,
  shouldCollapseAgentConversationReasoning,
} from '../../src/renderer/components/agents/agent-conversation-view-model.mjs'

test('agent route presentation resolves configured provider and model labels with durable ID fallbacks', () => {
  assert.deepEqual(resolveAgentConversationRoutePresentation({
    node: { providerId: 'openai-account', modelId: 'gpt-5.6-sol' },
    providers: [{
      id: 'openai',
      name: 'OpenAI',
      models: [{ id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' }],
    }],
  }), {
    providerId: 'openai-account',
    modelId: 'gpt-5.6-sol',
    providerLabel: 'OpenAI',
    modelLabel: 'GPT-5.6 Sol',
    label: 'OpenAI · GPT-5.6 Sol',
  })

  assert.deepEqual(resolveAgentConversationRoutePresentation({
    node: { providerId: 'future-provider', modelId: 'future/model' },
  }), {
    providerId: 'future-provider',
    modelId: 'future/model',
    providerLabel: 'future-provider',
    modelLabel: 'future/model',
    label: 'future-provider · future/model',
  })
  assert.equal(resolveAgentConversationRoutePresentation({ node: {} }), null)
})

test('durable agent messages preserve registered rich parts through the root message contract', () => {
  const timeline = buildAgentConversationTimeline([
    { id: 'message_user', turnId: 'turn_01', kind: 'authored', contentParts: [{ kind: 'markdown', text: 'Please check this.' }] },
    { id: 'message_final', turnId: 'turn_01', kind: 'final', contentParts: [
      { kind: 'markdown', text: 'Checked.' },
      { kind: 'link', label: 'Evidence', href: 'https://example.com/evidence' },
      { kind: 'file', id: 'file_01', label: 'report.md' },
    ] },
  ], { threadId: 'thread_01' })
  assert.equal(timeline[0].content, 'Please check this.')
  assert.equal(timeline[1].role, 'assistant')
  assert.match(timeline[1].finalDocument.text, /Checked\./)
  assert.match(timeline[1].finalDocument.text, /\[Evidence\]\(https:\/\/example\.com\/evidence\)/)
  assert.match(timeline[1].finalDocument.text, /report\.md/)
  assert.equal(timeline[1].finalDocument.parts.length, 3)
  assert.doesNotMatch(JSON.stringify(timeline), /\[object Object\]/)
})

test('durable messages and execution evidence group in canonical turn order', () => {
  const groups = buildAgentConversationTurnGroups({
    turns: [
      { id: 'turn_01', sequence: 1, status: 'completed' },
      { id: 'turn_02', sequence: 2, status: 'running' },
    ],
    messages: [
      { id: 'user_01', turnId: 'turn_01', kind: 'authored', contentParts: [{ kind: 'markdown', text: 'First' }] },
      { id: 'final_01', turnId: 'turn_01', kind: 'final', contentParts: [{ kind: 'markdown', text: 'First result' }] },
      { id: 'user_02', turnId: 'turn_02', kind: 'authored', contentParts: [{ kind: 'markdown', text: 'Second' }] },
    ],
    executionItems: [
      { id: 'event_02', turnId: 'turn_02', kind: 'agent_commentary_delta', content: 'Second work' },
      { id: 'event_01', turnId: 'turn_01', kind: 'agent_commentary_delta', content: 'First work' },
    ],
    threadId: 'thread_01',
  })

  assert.deepEqual(groups.map((group) => group.turn.id), ['turn_01', 'turn_02'])
  assert.deepEqual(groups[0].messages.map((message) => message.content), ['First', 'First result'])
  assert.deepEqual(groups[0].executionItems.map((item) => item.content), ['First work'])
  assert.deepEqual(groups[1].messages.map((message) => message.content), ['Second'])
  assert.deepEqual(groups[1].executionItems.map((item) => item.content), ['Second work'])
})

test('natural assistant deltas form one live draft and disappear behind the authoritative final', () => {
  const executionItems = [
    { id: 'draft_1', turnId: 'turn_live', kind: 'agent_assistant_delta', content: 'The result ', presentation: 'user', transcriptSequence: 1 },
    { id: 'draft_2', turnId: 'turn_live', kind: 'agent_assistant_delta', content: 'is ready.', presentation: 'user', transcriptSequence: 2 },
    { id: 'transport_1', turnId: 'turn_live', kind: 'agent_assistant_delta', content: '{"summary":"internal"}', presentation: 'internal', transcriptSequence: 3 },
  ]
  const live = buildAgentConversationTurnGroups({
    turns: [{ id: 'turn_live', sequence: 1, status: 'running' }],
    messages: [{ id: 'user_live', turnId: 'turn_live', kind: 'authored', contentParts: [{ kind: 'markdown', text: 'Check this' }] }],
    executionItems,
    threadId: 'thread_01',
  })

  assert.deepEqual(live[0].messages.map((message) => message.content), ['Check this', 'The result is ready.'])
  assert.equal(live[0].messages[1].role, 'assistant')
  assert.equal(live[0].messages[1].status, 'streaming')
  assert.equal(live[0].executionItems.length, 0)

  const settled = buildAgentConversationTurnGroups({
    turns: [{ id: 'turn_live', sequence: 1, status: 'completed' }],
    messages: [
      { id: 'user_live', turnId: 'turn_live', kind: 'authored', contentParts: [{ kind: 'markdown', text: 'Check this' }] },
      { id: 'final_live', turnId: 'turn_live', kind: 'final', contentParts: [{ kind: 'markdown', text: 'Authoritative result.' }] },
    ],
    executionItems,
    threadId: 'thread_01',
  })
  assert.deepEqual(settled[0].messages.map((message) => message.content), ['Check this', 'Authoritative result.'])
  assert.equal(settled[0].executionItems.length, 0)
})

test('active durable turns keep the agent composer in queued state', () => {
  assert.equal(agentConversationHasActiveTurn([{ status: 'completed' }, { status: 'queued' }]), true)
  assert.equal(agentConversationHasActiveTurn([{ status: 'completed' }]), false)
})

test('agent reasoning follows the root lifecycle: expanded live and collapsed only after settlement', () => {
  for (const status of ['pending', 'queued', 'running', 'waiting']) {
    assert.equal(shouldCollapseAgentConversationReasoning(status), false, status)
  }
  for (const status of ['completed', 'failed', 'cancelled']) {
    assert.equal(shouldCollapseAgentConversationReasoning(status), true, status)
  }
})
