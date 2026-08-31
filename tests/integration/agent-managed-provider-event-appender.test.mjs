import test from 'node:test'
import assert from 'node:assert/strict'

import { createManagedProviderEventAppender } from '../../src/main/agents/agent-managed-provider-event-appender.mjs'

function createHarness() {
  const appended = []
  const discovered = []
  const appender = createManagedProviderEventAppender({
    collaborationProjection: {
      materializeProviderDiscoveredChild(_entry, event) {
        discovered.push(event)
      },
    },
    draft(kind, fields) {
      return { kind, ...fields }
    },
    eventStore: {
      append(event) {
        if (
          (event.kind === 'agent_commentary_delta' || event.kind === 'agent_reasoning_delta' || event.kind === 'agent_assistant_delta')
          && (typeof event.payload?.delta !== 'string' || !event.payload.delta.trim())
        ) {
          throw new TypeError('event.payload.delta must be a non-empty string')
        }
        appended.push(event)
        return event
      },
    },
    repository: {
      getRunGraph() {
        return {
          nodes: [{ id: 'node_1', parentNodeId: null }],
          attempts: [{ id: 'attempt_1', providerCorrelationKey: 'corr_1' }],
        }
      },
    },
  })
  return {
    appended,
    discovered,
    append(providerEvent, adapterId = 'addom-managed') {
      appender(
        { runId: 'run_1', nodeId: 'node_1', attemptId: 'attempt_1', adapterId },
        providerEvent,
      )
    },
  }
}

test('managed provider event appender drops trim-empty commentary and reasoning deltas', () => {
  const { appended, append } = createHarness()

  append({
    providerEventId: 'empty-1',
    kind: 'commentary',
    occurredAt: 1,
    payload: { delta: '' },
  })
  append({
    providerEventId: 'ws-1',
    kind: 'reasoning',
    occurredAt: 2,
    payload: { delta: '\n' },
  })
  append({
    providerEventId: 'ws-2',
    kind: 'commentary',
    occurredAt: 3,
    payload: { delta: '   ' },
  })
  append({
    providerEventId: 'missing-1',
    kind: 'reasoning',
    occurredAt: 4,
    payload: {},
  })
  append({
    providerEventId: 'ok-1',
    kind: 'commentary',
    occurredAt: 5,
    payload: { delta: 'Alive.' },
  })

  assert.equal(appended.length, 1)
  assert.equal(appended[0].kind, 'agent_commentary_delta')
  assert.equal(appended[0].payload.delta, 'Alive.')
})

test('node discovery is projected only by the owning OpenAI native adapter', () => {
  const { discovered, append } = createHarness()
  const event = {
    providerEventId: 'node-1',
    kind: 'node_discovered',
    occurredAt: 1,
    payload: { providerThreadId: 'thread_child_1' },
  }

  assert.throws(() => append(event, 'addom-managed'), /does not own node discovery/i)
  append(event, 'openai-native')
  assert.deepEqual(discovered, [event])
})

test('managed provider event appender maps provider text payloads onto delta', () => {
  const { appended, append } = createHarness()

  append({
    providerEventId: 'text-1',
    kind: 'commentary',
    occurredAt: 1,
    payload: { text: 'From native adapter.' },
  })
  append({
    providerEventId: 'text-ws',
    kind: 'reasoning',
    occurredAt: 2,
    payload: { text: '\n' },
  })

  assert.equal(appended.length, 1)
  assert.equal(appended[0].payload.delta, 'From native adapter.')
})

test('managed provider event appender keeps assistant answer deltas out of commentary', () => {
  const { appended, append } = createHarness()

  append({
    providerEventId: 'assistant-1',
    kind: 'assistant_delta',
    occurredAt: 1,
    payload: { text: '{"summary":"transport payload"}', presentation: 'user' },
  })

  assert.equal(appended.length, 1)
  assert.equal(appended[0].kind, 'agent_assistant_delta')
  assert.equal(appended[0].payload.delta, '{"summary":"transport payload"}')
  assert.equal(appended[0].payload.presentation, 'user')
})

test('managed provider event appender prefers non-empty text when delta is trim-empty', () => {
  const { appended, append } = createHarness()

  append({
    providerEventId: 'dual-1',
    kind: 'commentary',
    occurredAt: 1,
    payload: { delta: '\n', text: 'Recovered from text.' },
  })

  assert.equal(appended.length, 1)
  assert.equal(appended[0].payload.delta, 'Recovered from text.')
})
