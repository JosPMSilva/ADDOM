import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  REQUIRED_AGENT_FIXTURE_IDS,
  loadAgentFixtureCorpus,
  validateAgentFixtureCorpus,
} from '../../scripts/validate-agent-fixtures.mjs'
import { validateAgentAttempt } from '../../src/common/agents/agent-attempt-contract.mjs'
import {
  AGENT_CANCELLATION_SCOPES,
  resolveAgentCancellationSemantics,
} from '../../src/common/agents/agent-cancellation.mjs'
import { validateAgentNode } from '../../src/common/agents/agent-node-contract.mjs'
import { validateAgentRun } from '../../src/common/agents/agent-run-contract.mjs'
import { createAgentControllerRegistry } from '../../src/main/agents/agent-controller-registry.mjs'
import {
  createNativeAgentIdentityReconciler,
} from '../../src/main/agents/providers/native-agent-identity-reconciler.mjs'

const REQUIRED_COVERAGE = new Set([
  'normal_completion',
  'concurrent_siblings',
  'nested_provider_metadata',
  'delayed_events',
  'duplicate_events',
  'cancellation',
  'failure',
  'retry',
  'reload',
  'out_of_order_delivery',
  'spawn_query_during_initialization',
  'foreground_background_detachment',
  'background_child_turn_cancellation',
  'buffered_chunk_lifecycle_interleave',
  'restart_sequence_reseed',
  'child_transcript_without_parent_prose',
])

const FIXTURE_ROOT = path.resolve('tests/fixtures/agent-runs')

async function validateMutatedCorpus(mutate) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'addom-agent-fixtures-'))
  try {
    await fs.cp(FIXTURE_ROOT, tempRoot, { recursive: true })
    await mutate(tempRoot)
    return await validateAgentFixtureCorpus({ fixtureRoot: tempRoot })
  } finally {
    await fs.rm(tempRoot, { force: true, recursive: true })
  }
}

async function mutateJson(tempRoot, relativePath, mutate) {
  const filePath = path.join(tempRoot, relativePath)
  const value = JSON.parse(await fs.readFile(filePath, 'utf8'))
  mutate(value)
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

test('agent-run fixture corpus is deterministic, sanitized, and complete', async () => {
  const result = await validateAgentFixtureCorpus()

  assert.equal(result.valid, true, result.errors.join('\n'))
  assert.deepEqual(result.fixtureIds, REQUIRED_AGENT_FIXTURE_IDS)
  assert.equal(result.errors.length, 0)
})

test('agent-run fixtures cover the Phase 0 provider and lifecycle matrix offline', async () => {
  const corpus = await loadAgentFixtureCorpus()
  const coverage = new Set(corpus.flatMap(({ manifest }) => manifest.coverage))

  assert.deepEqual(
    [...REQUIRED_COVERAGE].filter((name) => !coverage.has(name)),
    [],
  )
  assert.equal(corpus.every(({ manifest }) => manifest.networkRequired === false), true)
})

test('captured provider fixtures make capability gaps explicit instead of fabricating parity', async () => {
  const corpus = await loadAgentFixtureCorpus()
  const byId = new Map(corpus.map((fixture) => [fixture.manifest.fixtureId, fixture]))

  const flatMoa = byId.get('flat-moa-completion')?.manifest
  assert.equal(flatMoa?.currentContract.identity, 'flat_task_identity')
  assert.equal(flatMoa?.expectedCapabilities.nodeScopedStream, false)
  assert.equal(flatMoa?.expectedCapabilities.nodeCancellation, false)

  const openai = byId.get('openai-native-collaboration')?.manifest
  assert.equal(openai?.expectedCapabilities.addressableChildIdentity, true)
  assert.equal(openai?.expectedCapabilities.nodeScopedStream, false)
  assert.equal(openai?.expectedCapabilities.nodeCancellation, false)
  assert.match(openai?.knownGaps.join(' ') || '', /child transcript/i)

  const cursor = byId.get('cursor-root-session')?.manifest
  assert.equal(cursor?.currentContract.identity, 'provider_root_session_only')
  assert.equal(cursor?.expectedCapabilities.addressableChildIdentity, false)
  assert.equal(cursor?.expectedCapabilities.nodeScopedStream, false)
  assert.equal(cursor?.currentContract.stream, 'root_session_stream_no_child_demux')
  assert.match(cursor?.knownGaps.join(' ') || '', /child task|Task-shaped|no second session/i)
})

test('current baseline preserves root-owned final answer evidence', async () => {
  const corpus = await loadAgentFixtureCorpus()
  const observed = corpus.filter(({ manifest }) => manifest.currentContract.rootFinalAuthority === 'observed')

  assert.ok(observed.length >= 3)
  assert.equal(observed.every(({ events }) => {
    const finals = events.events.filter((event) => event.kind === 'final_message')
    return finals.every((event) => event.nodeId === '<node-root>')
  }), true)
})

test('agent-run validator rejects unsafe or nondeterministic fixture mutations', async (t) => {
  const cases = [
    {
      name: 'credential',
      expected: /credential or secret/i,
      mutate: (root) => mutateJson(root, 'generic-provider-tool-stream/events.json', (events) => {
        events.events[0].payload.text = 'sk-examplecredential123'
      }),
    },
    {
      name: 'absolute user path',
      expected: /absolute user or host path/i,
      mutate: (root) => mutateJson(root, 'cursor-root-session/events.json', (events) => {
        events.events[2].payload.path = 'C:\\Users\\example\\private.txt'
      }),
    },
    {
      name: 'unstable identifiers and timestamps',
      expected: /must be a placeholder/i,
      mutate: (root) => mutateJson(root, 'flat-moa-completion/events.json', (events) => {
        events.events[0].eventId = 'event-real-123'
        events.events[0].timestamp = '2026-07-22T12:00:00.000Z'
      }),
    },
    {
      name: 'missing manifest',
      expected: /manifest\.json/i,
      mutate: (root) => fs.rm(path.join(root, 'duplicate-transport', 'manifest.json')),
    },
    {
      name: 'hash drift',
      expected: /contentHash drift/i,
      mutate: (root) => mutateJson(root, 'out-of-order-transport/events.json', (events) => {
        events.events[0].payload.status = 'changed'
      }),
    },
    {
      name: 'unknown schema version',
      expected: /unknown manifest schemaVersion/i,
      mutate: (root) => mutateJson(root, 'openai-native-collaboration/manifest.json', (manifest) => {
        manifest.schemaVersion = 2
      }),
    },
  ]

  for (const fixtureCase of cases) {
    await t.test(fixtureCase.name, async () => {
      const result = await validateMutatedCorpus(fixtureCase.mutate)
      assert.equal(result.valid, false)
      assert.match(result.errors.join('\n'), fixtureCase.expected)
    })
  }
})

test('canonical stable graph identity validators are distinct shared contracts', () => {
  assert.equal(typeof validateAgentRun, 'function')
  assert.equal(typeof validateAgentNode, 'function')
  assert.equal(typeof validateAgentAttempt, 'function')
  assert.notEqual(validateAgentRun, validateAgentNode)
  assert.notEqual(validateAgentNode, validateAgentAttempt)
})

test('provider-native projection preserves exact partial child identity without inventing a stream', async () => {
  const corpus = await loadAgentFixtureCorpus()
  const fixture = corpus.find(({ manifest }) => (
    manifest.fixtureId === 'openai-native-collaboration'
  ))
  let nodeSequence = 0
  const reconciler = createNativeAgentIdentityReconciler({
    namespace: 'openai-account',
    nodeIdFactory: () => `<canonical-native-node-${++nodeSequence}>`,
  })

  const lifecycle = fixture.events.events.filter((event) => (
    event.kind === 'provider_item_started'
    || event.kind === 'provider_item_completed'
  ))
  for (const event of lifecycle) {
    const phase = event.kind === 'provider_item_completed' ? 'completed' : 'started'
    if (phase === 'started') {
      reconciler.registerSpawnIntent({
        spawnRequestId: event.payload.itemId,
        parentProviderThreadId: event.payload.senderThreadId,
        expectedProviderThreadId: event.payload.receiverThreadId,
      })
    }
    reconciler.observeNode({
      providerEventId: event.eventId,
      providerActivityId: event.payload.itemId,
      providerThreadId: event.payload.receiverThreadId,
      parentProviderThreadId: event.payload.senderThreadId,
      spawnRequestId: event.payload.itemId,
      status: event.payload.agentStatus,
    })
  }

  const nodes = reconciler.listNodes()
  assert.equal(nodes.length, 2)
  const threadIds = nodes.map((node) => node.providerThreadId).toSorted()
  assert.deepEqual(threadIds, ['<provider-thread-worker-001>', '<provider-thread-worker-002>'])
  assert.equal(nodes.every((node) => node.parentProviderThreadId === '<provider-thread-root>'), true)
  assert.equal(fixture.manifest.expectedCapabilities.nodeScopedStream, false)
  assert.equal(fixture.manifest.currentContract.stream, 'unavailable_no_child_transcript_rpc')
  assert.match(fixture.manifest.knownGaps.join(' '), /no child transcript read RPC/i)
})

test('OpenAIAccountBridge surface has no child transcript read RPC', async () => {
  const { OpenAIAccountBridge } = await import('../../src/main/openai-account/openai-account-bridge.mjs')
  const methods = Object.getOwnPropertyNames(OpenAIAccountBridge.prototype)
  for (const required of ['startThread', 'resumeThread', 'startTurn', 'interruptTurn', 'listCollaborationModes']) {
    assert.equal(methods.includes(required), true, `missing ${required}`)
  }
  assert.equal(
    methods.some((name) => /transcript|history|listMessage|listTurn|listItem/i.test(name)),
    false,
  )
})

test('Cursor protocol NDJSON is root-session only with no Task child identity fields', async () => {
  const ndjson = await fs.readFile('tests/fixtures/cursor-agent/stream-success.ndjson', 'utf8')
  const lines = ndjson.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line))
  assert.ok(lines.length > 0)
  const sessionIds = [...new Set(lines.map((row) => row.session_id).filter(Boolean))]
  assert.deepEqual(sessionIds, ['00000000-0000-4000-8000-000000000001'])
  assert.equal(
    lines.some((row) => {
      const toolCall = row.tool_call || row.message?.tool_call || row.toolCall
      return toolCall && typeof toolCall === 'object' && Object.prototype.hasOwnProperty.call(toolCall, 'task')
    }),
    false,
  )
  const cursorEvents = (await loadAgentFixtureCorpus())
    .find(({ manifest }) => manifest.fixtureId === 'cursor-root-session')
    ?.events?.events || []
  assert.equal(cursorEvents.every((event) => event.nodeId === '<node-root>'), true)
  assert.equal(cursorEvents.some((event) => event.parentNodeId), false)
})

test('canonical node, parent-turn, subtree, and run cancellation contracts are executable', () => {
  assert.deepEqual(AGENT_CANCELLATION_SCOPES, ['node', 'parent_turn', 'subtree', 'run'])
  assert.equal(resolveAgentCancellationSemantics('parent_turn').backgroundDescendants, 'survive')
  assert.equal(resolveAgentCancellationSemantics('subtree').backgroundDescendants, 'cancel')
  assert.equal(typeof createAgentControllerRegistry().cancel, 'function')
})

test('cross-provider fixture finals remain root-owned across managed, native, and opaque evidence', async () => {
  const corpus = await loadAgentFixtureCorpus()
  const finalEvents = corpus.flatMap(({ events }) => (
    events.events.filter((event) => event.kind === 'final_message')
  ))

  assert.ok(finalEvents.length > 0)
  assert.equal(finalEvents.every((event) => event.nodeId === '<node-root>'), true)
})
