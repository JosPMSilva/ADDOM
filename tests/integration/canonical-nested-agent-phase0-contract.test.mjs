import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildCanonicalFinalDocument } from '../../src/common/chat/final-document-contract.mjs'
import {
  buildCanonicalTurnFromEvents,
  selectCanonicalFinalDocument,
} from '../../src/common/chat/canonical-turn-engine.mjs'
import { createManagedProviderEventAppender } from '../../src/main/agents/agent-managed-provider-event-appender.mjs'
import { clipAgentError, clipAgentText } from '../../src/main/agents/agent-managed-runtime-values.mjs'
import { listAgentConversationActions } from '../../src/renderer/components/agents/agent-conversation-actions.mjs'
import { buildExecutionStreamItems } from '../../src/renderer/components/chat/live-execution-stream-items.mjs'
import { agentConversationCanFollowup } from '../../src/renderer/components/agents/agent-conversation-view-model.mjs'

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const fixture = JSON.parse(fs.readFileSync(path.join(
  TEST_DIR,
  '../fixtures/canonical-nested-conversation-phase0/fixture.json',
), 'utf8'))

function createProviderAppenderHarness() {
  const appended = []
  const append = createManagedProviderEventAppender({
    collaborationProjection: { materializeProviderDiscoveredChild() {} },
    draft(kind, fields) {
      return { kind, ...fields }
    },
    eventStore: {
      append(event) {
        appended.push(event)
        return event
      },
    },
    repository: {
      getRunGraph() {
        return {
          nodes: [{ id: 'node_child_01', parentNodeId: 'node_root_01' }],
          attempts: [{ id: 'attempt_child_01', providerCorrelationKey: 'managed:child_01' }],
        }
      },
    },
  })
  return { append, appended }
}

function buildChildItemsAfterJsonReload() {
  return JSON.parse(JSON.stringify(fixture.childTranscriptItems))
}

test('Phase 2: registered structured commentary and reasoning fields survive child ingestion without object prose', () => {
  const { append, appended } = createProviderAppenderHarness()
  for (const providerEvent of fixture.providerEvents) {
    append({
      runId: 'run_01',
      nodeId: 'node_child_01',
      attemptId: 'attempt_child_01',
      adapterId: 'addom-managed',
    }, providerEvent)
  }

  const deltas = appended.map((event) => event.payload.delta)
  assert.deepEqual(deltas, fixture.expectedProviderDeltas)
  assert.ok(deltas.every((delta) => !String(delta).includes('[object Object]')))
})

test('Phase 7: canonical text ingress rejects the historical object sentinel and managed final helpers never stringify objects', () => {
  const { append, appended } = createProviderAppenderHarness()
  append({
    runId: 'run_01', nodeId: 'node_child_01', attemptId: 'attempt_child_01', adapterId: 'addom-managed',
  }, {
    providerEventId: 'legacy-object-sentinel', kind: 'commentary', occurredAt: 1,
    payload: { text: '[object Object]' },
  })

  assert.deepEqual(appended, [])
  assert.equal(clipAgentText({ unexpected: 'structured payload' }), '')
  assert.equal(clipAgentError({ unexpected: 'structured failure' }), 'Agent execution failed.')
  assert.equal(clipAgentError({ message: 'Provider failed safely.' }), 'Provider failed safely.')
})

test('Phase 2: equivalent root and child logical turns produce identical execution chronology live', () => {
  const rootItems = buildExecutionStreamItems(fixture.rootTurn, {}, { collapseSettled: true })
  const childItems = buildExecutionStreamItems(
    buildCanonicalTurnFromEvents(fixture.childTranscriptItems, { status: 'completed' }),
    {},
    { collapseSettled: true },
  )

  assert.deepEqual(childItems, rootItems)
})

test('Phase 2: child chronology and reasoning boundaries survive JSON reload/replay', () => {
  const rootItems = buildExecutionStreamItems(fixture.rootTurn, {}, { collapseSettled: true })
  const replayedChildItems = buildExecutionStreamItems(
    buildCanonicalTurnFromEvents(buildChildItemsAfterJsonReload(), { status: 'completed' }),
    {},
    { collapseSettled: true },
  )

  assert.deepEqual(replayedChildItems, rootItems)
})

test('Phase 2: child final selection keeps the root rich final-document contract', () => {
  const expected = buildCanonicalFinalDocument({
    ...fixture.expectedChildFinal,
    hasAuthoritativeMessageBinding: true,
  })
  const actual = selectCanonicalFinalDocument(fixture.childTranscriptItems)

  assert.deepEqual(actual, expected)
})

test('Phase 3: a completed child with supported continuation exposes a follow-up action', () => {
  assert.equal(agentConversationCanFollowup(fixture.completedChildNode), true)
  assert.equal(agentConversationCanFollowup(fixture.completedChildNode, { submitting: true }), false)
  assert.deepEqual(listAgentConversationActions(fixture.completedChildNode), [])
})
