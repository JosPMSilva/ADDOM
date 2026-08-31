import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_ORCHESTRATOR_CONTRIBUTIONS,
  buildChildFinalContinuation,
  buildOrchestratorSynthesis,
  assertParentFollowupBudget,
} from '../../src/main/agents/agent-orchestrator-synthesis.mjs'
import { createAgentMessageBroker } from '../../src/main/agents/agent-message-broker.mjs'
import { completeManagedAttemptWithFinalMessage } from '../../src/main/agents/agent-managed-final-message.mjs'
import { finalizeDelegationForSynthesis } from '../../src/main/chat/moa-synthesis-finalizer.mjs'

function child(index, { status = 'completed', conclusion = null } = {}) {
  return buildChildFinalContinuation({
    conversationId: `conversation_${String(index).padStart(3, '0')}`,
    turnId: `turn_${String(index).padStart(3, '0')}`,
    nodeId: `node_${String(index).padStart(3, '0')}`,
    finalMessageId: status === 'completed' ? `final_${String(index).padStart(3, '0')}` : null,
    status,
    provenance: { authorKind: 'agent', authorId: `node_${String(index).padStart(3, '0')}` },
    conclusion: conclusion || `Conclusion ${index}: ${'evidence '.repeat(900)}`,
  })
}

test('child finals become attributable orchestration continuations rather than transcript prose', () => {
  const continuation = child(1)

  assert.equal(continuation.kind, 'child_turn_final')
  assert.deepEqual(continuation.source, {
    conversationId: 'conversation_001',
    turnId: 'turn_001',
    nodeId: 'node_001',
    finalMessageId: 'final_001',
  })
  assert.equal(continuation.inspectable, true)
  assert.equal(Object.hasOwn(continuation, 'transcript'), false)
  assert.ok(continuation.conclusion.length < 2_000)
})

for (const count of [5, 20, 100]) {
  test(`${count}-child root synthesis stays bounded, deterministic, and attributable`, () => {
    const children = Array.from({ length: count }, (_, index) => child(index + 1, {
      status: index === count - 1 ? 'failed' : 'completed',
      conclusion: `child-${index + 1} ${'detail '.repeat(1_000)}`,
    })).reverse()
    const synthesis = buildOrchestratorSynthesis({
      continuations: children,
      orchestratorIntent: 'review_only',
    })

    assert.equal(synthesis.kind, 'orchestrator_child_synthesis')
    assert.equal(synthesis.intent, 'review_only')
    assert.equal(synthesis.totals.observed, count)
    assert.equal(synthesis.totals.failed, 1)
    assert.ok(synthesis.totals.included <= MAX_ORCHESTRATOR_CONTRIBUTIONS)
    assert.equal(synthesis.totals.omitted, count - synthesis.totals.included)
    assert.equal(synthesis.contributions[0].source.turnId, `turn_${String(count).padStart(3, '0')}`)
    assert.ok(synthesis.contributions.every((entry) => entry.source.conversationId && entry.source.turnId))
    assert.ok(synthesis.inspectableFailures.every((entry) => entry.source.turnId === `turn_${String(count).padStart(3, '0')}`))
    assert.ok(JSON.stringify(synthesis).length < 20_000)
    assert.equal(Object.hasOwn(synthesis, 'transcript'), false)
  })
}

test('parent follow-ups are provenance-bound and cannot exceed their turn budget', () => {
  const projection = {
    messages: [
      { authorKind: 'orchestrator', sourceTurnId: 'parent_turn', sourceConversationId: 'parent_conversation' },
      { authorKind: 'orchestrator', sourceTurnId: 'parent_turn', sourceConversationId: 'parent_conversation' },
    ],
  }
  assert.doesNotThrow(() => assertParentFollowupBudget({
    projection, sourceConversationId: 'parent_conversation', sourceTurnId: 'parent_turn', limit: 3,
  }))
  assert.throws(() => assertParentFollowupBudget({
    projection: { messages: [...projection.messages, projection.messages[0]] },
    sourceConversationId: 'parent_conversation', sourceTurnId: 'parent_turn', limit: 3,
  }), /follow-up limit/i)
  assert.throws(() => assertParentFollowupBudget({ projection, sourceTurnId: '', limit: 3 }), /provenance/i)
})

test('a completed child emits a normal structured continuation to its direct parent', () => {
  const events = []
  const broker = createAgentMessageBroker({
    eventStore: { appendMany: (drafts) => events.push(...drafts) },
    repository: {
      getRunGraph: () => ({
        run: { id: 'run_01' },
        nodes: [
          { id: 'node_parent', parentNodeId: null },
          { id: 'node_child', parentNodeId: 'node_parent' },
        ],
        attempts: [],
      }),
    },
    messageIdFactory: () => 'continuation_01',
    now: () => 1,
  })
  const continuation = child(1)

  assert.deepEqual(broker.returnChildFinal({
    runId: 'run_01', fromNodeId: 'node_child', toNodeId: 'node_parent', continuation,
  }), { delivered: true, messageId: 'continuation_01', continuation })
  assert.deepEqual(events.map((event) => event.kind), [
    'agent_orchestration_continuation_sent',
    'agent_orchestration_continuation_received',
  ])
  assert.equal(events[1].payload.continuation.source.turnId, 'turn_001')
  assert.equal(Object.hasOwn(events[1].payload, 'text'), false)
})

test('the final direct child returns its continuation before run-count synchronization can close the run', () => {
  const calls = []
  let runTerminal = false
  const completedTurn = {
    conversation: { id: 'conversation_direct_01' },
    turn: { id: 'turn_direct_01', status: 'completed' },
    message: { id: 'final_direct_01' },
  }

  completeManagedAttemptWithFinalMessage({
    correlation: 'provider:session',
    conversationRepository: {
      appendFinalForAttempt() {
        calls.push('conversation_final')
        return completedTurn
      },
    },
    db: { transaction: (work) => () => work() },
    draft: (kind, input) => ({ kind, ...input }),
    entry: { runId: 'run_direct_01', attemptId: 'attempt_direct_01' },
    eventStore: { append: () => calls.push('agent_final_message') },
    messageBroker: {
      returnChildFinal() {
        assert.equal(runTerminal, false)
        calls.push('child_continuation')
        return { delivered: true }
      },
    },
    node: { id: 'node_direct_01', parentNodeId: 'root_direct_01' },
    result: { summary: 'Direct child completed.', usage: null },
    runService: { completeAttempt: () => calls.push('attempt_completed') },
    syncRunCounts() {
      runTerminal = true
      calls.push('run_counts_synced')
    },
  })

  assert.deepEqual(calls, [
    'agent_final_message',
    'conversation_final',
    'child_continuation',
    'attempt_completed',
    'run_counts_synced',
  ])
})

test('the existing root synthesis finalizer carries child continuations as bounded untrusted evidence', () => {
  const childSynthesis = buildOrchestratorSynthesis({
    orchestratorIntent: 'review_only',
    continuations: [
      child(1),
      child(2, { status: 'failed', conclusion: 'Child 2 failed after partial inspection.' }),
    ],
  })
  const finalized = finalizeDelegationForSynthesis({
    delegationEnvelope: {
      status: 'completed_with_errors',
      summary: { completed: 1, failed: 1 },
      agents: [],
      childSynthesis,
    },
    orchestratorIntent: 'review_only',
  })

  assert.equal(finalized.delegationEnvelope.childSynthesis.totals.observed, 2)
  assert.match(finalized.pendingSynthesisMessages[0].content, /untrusted task evidence/i)
  assert.match(finalized.pendingSynthesisMessages[1].content, /orchestrator_child_synthesis/)
  assert.match(finalized.pendingSynthesisMessages[1].content, /turn_002/)
  assert.doesNotMatch(finalized.pendingSynthesisMessages[0].content, /Child 2 failed after partial inspection/)
})
