import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import Database from 'better-sqlite3'

import { createManagedAgentRuntime } from '../../src/main/agents/agent-managed-runtime.mjs'
import { createAddomManagedAgentAdapter } from '../../src/main/agents/providers/addom-managed-agent-adapter.mjs'
import { createOpenAINativeAgentAdapter } from '../../src/main/agents/providers/openai-native-agent-adapter.mjs'
import { createAgentProviderRegistry } from '../../src/main/agents/providers/agent-provider-registry.mjs'
import { createAgentRunQueryService } from '../../src/main/agents/agent-run-query-service.mjs'
import { createOpenAIAccountCollaborationProjection } from '../../src/main/agents/openai-account-collaboration-projection.mjs'
import { projectAgentRunGraph } from '../../src/main/agents/agent-run-renderer-projection.mjs'
import { runMigrations } from '../../src/main/memory/db-migrations.mjs'
import { seedAgentWorkspace } from '../helpers/agent-runtime-fixtures.mjs'
import {
  createAgentRunState,
  hydrateAgentRunSnapshot,
} from '../../src/renderer/store/agents/agent-run-reducer.mjs'
import { selectTurnAgentReferences } from '../../src/renderer/store/agents/agent-stream-references.mjs'

const TS = 1_752_600_100_000
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function readSource(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8')
}

function createDatabase() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  seedAgentWorkspace(db)
  return db
}

function createRuntime(db) {
  const registry = createAgentProviderRegistry()
  registry.register(createAddomManagedAgentAdapter())
  registry.register(createOpenAINativeAgentAdapter({
    startOperation: async () => ({
      response: { id: 'turn_unused', conversation: { id: 'thread_unused' } },
      awaitResult: async () => ({ text: '', usage: null }),
      cancel: async () => {},
    }),
  }))
  return createManagedAgentRuntime({
    db,
    adapterRegistry: registry,
    now: (() => {
      let value = TS
      return () => ++value
    })(),
  })
}

test('chat-supplied collaboration events materialize durable opaque children bound to turnId', async () => {
  const db = createDatabase()
  try {
    const runtime = createRuntime(db)
    assert.equal(typeof runtime.ingestOpenAIAccountCollaboration, 'function')

    await runtime.ingestOpenAIAccountCollaboration({
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_account_01',
      modelId: 'gpt-5.6-sol',
      event: {
        phase: 'started',
        providerEventId: 'item_spawn_1:started',
        providerActivityId: 'item_spawn_1',
        spawnRequestId: 'item_spawn_1',
        parentProviderThreadId: 'thread_root_1',
        providerThreadId: null,
        status: 'running',
      },
    })
    await runtime.ingestOpenAIAccountCollaboration({
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_account_01',
      modelId: 'gpt-5.6-sol',
      event: {
        phase: 'completed',
        providerEventId: 'item_spawn_1:completed',
        providerActivityId: 'item_spawn_1',
        spawnRequestId: 'item_spawn_1',
        parentProviderThreadId: 'thread_root_1',
        providerThreadId: 'thread_child_1',
        status: 'completed',
      },
    })
    await runtime.finalizeOpenAIAccountCollaboration({
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_account_01',
    })

    const query = createAgentRunQueryService({ db, repository: runtime.repository })
    const listed = query.listRuns({ projectId: 'project_01', threadId: 'thread_01' })
    assert.equal(listed.runs.length, 1)
    assert.equal(listed.runs[0].turnId, 'turn_account_01')

    const graph = runtime.repository.getRunGraph(listed.runs[0].id)
    const children = graph.nodes.filter((node) => node.id !== graph.run.rootNodeId)
    assert.equal(children.length, 1)
    assert.equal(children[0].providerThreadId, 'thread_child_1')
    assert.equal(children[0].capabilitySnapshot.mode, 'provider_opaque')
    assert.equal(children[0].capabilitySnapshot.childStreams, false)
    assert.equal(children[0].capabilitySnapshot.addressableChildren, false)
    assert.equal(children[0].capabilitySnapshot.capabilityKey, 'provider_managed_partial_visibility')
    assert.ok(children[0].capabilitySnapshot.visibilityReason)
    assert.equal(children[0].workspaceMode, 'opaque_no_write_surface')
    assert.equal(children[0].transcriptEvidence, 'status_only')
    assert.equal(children[0].status, 'completed')
    assert.equal(graph.run.status, 'completed')

    let state = createAgentRunState()
    state = hydrateAgentRunSnapshot(state, projectAgentRunGraph(graph))
    const refs = selectTurnAgentReferences(state, 'turn_account_01')
    assert.equal(refs.length, 1)
    assert.equal(refs[0].nodeId, children[0].id)
  } finally {
    db.close()
  }
})

test('prose-only account turns create no collaboration agent children', async () => {
  const db = createDatabase()
  try {
    const runtime = createRuntime(db)
    await runtime.ingestOpenAIAccountCollaboration({
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_prose_01',
      modelId: 'gpt-5.6-sol',
      event: {
        phase: 'started',
        providerActivityId: 'item_no_receiver',
        spawnRequestId: 'item_no_receiver',
        parentProviderThreadId: 'thread_root_1',
        providerThreadId: null,
        status: 'running',
      },
    })
    const query = createAgentRunQueryService({ db, repository: runtime.repository })
    const listed = query.listRuns({ projectId: 'project_01', threadId: 'thread_01' })
    assert.equal(listed.runs.length, 0)
  } finally {
    db.close()
  }
})

test('account createStreamWithTools forwards onCollaborationEvent into options', () => {
  const source = readSource('src/main/api-clients/ai-provider-openai.mjs')
  assert.match(source, /onCollaborationEvent:\s*args\?\.options\?\.onCollaborationEvent/)
})

test('chat model step supplies serialized onCollaborationEvent for OpenAI account turns', () => {
  const modelStep = readSource('src/main/chat/chat-stream-model-step.mjs')
  const ingestHelper = readSource('src/main/chat/chat-stream-openai-collaboration-ingest.mjs')
  assert.match(modelStep, /createOpenAICollaborationIngestHandler/)
  assert.match(modelStep, /onCollaborationEvent/)
  assert.match(ingestHelper, /ingestOpenAIAccountCollaboration/)
  assert.match(ingestHelper, /collaborationIngestChain/)
  assert.match(modelStep, /settleProviderStreamWithCollaboration/)
  assert.match(ingestHelper, /collaborationIngest\.complete\(\)/)
  assert.match(ingestHelper, /OpenAI collaboration event dropped: missing project\/thread\/turn scope/)
})

test('sequential collaboration children remain appendable until parent turn completion', async () => {
  const db = createDatabase()
  try {
    const runtime = createRuntime(db)
    const scope = {
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_sequential_01',
      modelId: 'gpt-5.6-sol',
    }
    for (const child of ['a', 'b']) {
      await runtime.ingestOpenAIAccountCollaboration({
        ...scope,
        event: {
          phase: 'completed',
          providerEventId: `item_${child}:completed`,
          providerActivityId: `item_${child}`,
          spawnRequestId: `item_${child}`,
          providerThreadId: `thread_child_${child}`,
          status: 'completed',
        },
      })
    }

    const listed = createAgentRunQueryService({ db, repository: runtime.repository })
      .listRuns({ projectId: scope.projectId, threadId: scope.threadId })
    const before = runtime.repository.getRunGraph(listed.runs[0].id)
    assert.equal(before.run.status, 'running')
    assert.equal(before.nodes.filter((node) => node.id !== before.run.rootNodeId).length, 2)

    await runtime.finalizeOpenAIAccountCollaboration(scope)
    const after = runtime.repository.getRunGraph(listed.runs[0].id)
    assert.equal(after.run.status, 'completed')
  } finally {
    db.close()
  }
})

test('late active status cannot regress a terminal collaboration child', async () => {
  const db = createDatabase()
  try {
    const runtime = createRuntime(db)
    const scope = {
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_monotonic_01',
      modelId: 'gpt-5.6-sol',
    }
    const baseEvent = {
      providerActivityId: 'item_monotonic',
      spawnRequestId: 'item_monotonic',
      providerThreadId: 'thread_child_monotonic',
    }
    await runtime.ingestOpenAIAccountCollaboration({
      ...scope,
      event: {
        ...baseEvent,
        phase: 'completed',
        providerEventId: 'item_monotonic:completed',
        status: 'completed',
      },
    })
    await runtime.ingestOpenAIAccountCollaboration({
      ...scope,
      event: {
        ...baseEvent,
        phase: 'started',
        providerEventId: 'item_monotonic:late-running',
        status: 'running',
      },
    })

    const listed = createAgentRunQueryService({ db, repository: runtime.repository })
      .listRuns({ projectId: scope.projectId, threadId: scope.threadId })
    const graph = runtime.repository.getRunGraph(listed.runs[0].id)
    const child = graph.nodes.find((node) => node.id !== graph.run.rootNodeId)
    assert.equal(child.status, 'completed')
    assert.equal(graph.recovery?.reconciliationState, 'provider_ahead')
  } finally {
    db.close()
  }
})

test('parent turn completion fails closed when a discovered collaboration child never reports terminal status', async () => {
  const db = createDatabase()
  try {
    const runtime = createRuntime(db)
    const scope = {
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_incomplete_child_01',
      modelId: 'gpt-5.6-sol',
    }
    await runtime.ingestOpenAIAccountCollaboration({
      ...scope,
      event: {
        phase: 'started',
        providerEventId: 'item_incomplete:started',
        providerActivityId: 'item_incomplete',
        spawnRequestId: 'item_incomplete',
        parentProviderThreadId: 'thread_root_incomplete',
        providerThreadId: 'thread_child_incomplete',
        status: 'running',
      },
    })

    const finalized = await runtime.finalizeOpenAIAccountCollaboration(scope)
    const child = finalized.nodes.find((node) => node.id !== finalized.run.rootNodeId)

    assert.equal(finalized.run.status, 'completed')
    assert.equal(finalized.run.completionReason, 'managed_tasks_partially_completed')
    assert.equal(child.status, 'failed')
    assert.match(child.errorSummary, /parent provider turn ended before a terminal status/i)
    assert.equal(finalized.recovery?.reconciliationState, 'provider_unverified_terminal')
  } finally {
    db.close()
  }
})

test('concurrent collaboration ingest does not duplicate runs or children', async () => {
  const db = createDatabase()
  try {
    const runtime = createRuntime(db)
    const scope = {
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_race_01',
      modelId: 'gpt-5.6-sol',
    }
    const started = {
      phase: 'started',
      providerEventId: 'item_race:started',
      providerActivityId: 'item_race',
      spawnRequestId: 'item_race',
      parentProviderThreadId: 'thread_root_race',
      providerThreadId: null,
      status: 'running',
    }
    const completed = {
      phase: 'completed',
      providerEventId: 'item_race:completed',
      providerActivityId: 'item_race',
      spawnRequestId: 'item_race',
      parentProviderThreadId: 'thread_root_race',
      providerThreadId: 'thread_child_race',
      status: 'completed',
    }

    await Promise.all([
      runtime.ingestOpenAIAccountCollaboration({ ...scope, event: started }),
      runtime.ingestOpenAIAccountCollaboration({ ...scope, event: completed }),
      runtime.ingestOpenAIAccountCollaboration({ ...scope, event: completed }),
    ])

    const query = createAgentRunQueryService({ db, repository: runtime.repository })
    const listed = query.listRuns({ projectId: 'project_01', threadId: 'thread_01' })
    assert.equal(listed.runs.length, 1)
    const graph = runtime.repository.getRunGraph(listed.runs[0].id)
    const children = graph.nodes.filter((node) => node.id !== graph.run.rootNodeId)
    assert.equal(children.length, 1)
    assert.equal(children[0].providerThreadId, 'thread_child_race')
    assert.equal(children[0].status, 'completed')
  } finally {
    db.close()
  }
})

test('concurrent projection ingest cannot heal an earlier canonical append failure', async () => {
  const graph = {
    run: {
      id: 'run_fail_closed',
      rootNodeId: 'node_root',
      status: 'running',
    },
    nodes: [{
      id: 'node_root',
      parentNodeId: null,
      modelId: 'gpt-5.6-sol',
    }],
  }
  let appendAttempts = 0
  const projection = createOpenAIAccountCollaborationProjection({
    adapterRegistry: {
      resolve: () => ({
        probe: async () => ({ adapterId: 'openai-native' }),
      }),
    },
    createRun: () => graph,
    draft: (kind, event) => ({ kind, ...event }),
    eventStore: {
      append() {
        appendAttempts += 1
        throw new Error('canonical append failed')
      },
    },
    idFactory: () => 'node_child',
    now: () => TS,
    repository: {
      getRunGraph: () => graph,
    },
  })
  const input = {
    projectId: 'project_01',
    threadId: 'thread_01',
    turnId: 'turn_fail_closed',
    modelId: 'gpt-5.6-sol',
    event: {
      phase: 'completed',
      providerEventId: 'item_fail_closed:completed',
      providerActivityId: 'item_fail_closed',
      spawnRequestId: 'item_fail_closed',
      providerThreadId: 'thread_child_fail_closed',
      status: 'completed',
    },
  }

  const results = await Promise.allSettled([
    projection.ingestOpenAIAccountCollaboration(input),
    projection.ingestOpenAIAccountCollaboration(input),
  ])

  assert.deepEqual(results.map((result) => result.status), ['rejected', 'rejected'])
  assert.equal(appendAttempts, 1)
})

test('account stream options path invokes onCollaborationEvent into agent ingest', async () => {
  const db = createDatabase()
  try {
    const runtime = createRuntime(db)
    const { createOpenAIAccountEntryPoints } = await import(
      '../../src/main/api-clients/ai-provider-openai-account-entrypoints.mjs'
    )

    let forwardedCallback = null
    const { createOpenAIAccountStreamPayload } = createOpenAIAccountEntryPoints({
      startOpenAIAccountTurnOperation: async ({ onCollaborationEvent } = {}) => {
        forwardedCallback = onCollaborationEvent
        assert.equal(typeof onCollaborationEvent, 'function')
        onCollaborationEvent({
          phase: 'started',
          providerEventId: 'item_opts:started',
          providerActivityId: 'item_opts',
          spawnRequestId: 'item_opts',
          parentProviderThreadId: 'thread_root_opts',
          providerThreadId: null,
          status: 'running',
        })
        onCollaborationEvent({
          phase: 'completed',
          providerEventId: 'item_opts:completed',
          providerActivityId: 'item_opts',
          spawnRequestId: 'item_opts',
          parentProviderThreadId: 'thread_root_opts',
          providerThreadId: 'thread_child_opts',
          status: 'completed',
        })
        return {
          turnId: 'turn_opts_01',
          modelId: 'gpt-5.6-sol',
          bridgeThreadId: 'thread_root_opts',
          resultPromise: Promise.resolve({ text: 'ok', usage: null }),
        }
      },
      buildOpenAIAccountTurnProviderMeta: () => ({}),
      cloneAccountCompactionState: () => ({}),
      cloneAccountCollaborationState: () => ({}),
      cloneAccountNativeActivityState: () => ({}),
      normalizeId: (value) => String(value || ''),
      normalizeProjectFolder: (value) => String(value || ''),
    })

    let collaborationIngestChain = Promise.resolve()
    const onCollaborationEvent = (collaborationEvent = {}) => {
      collaborationIngestChain = collaborationIngestChain
        .then(() => runtime.ingestOpenAIAccountCollaboration({
          projectId: 'project_01',
          threadId: 'thread_01',
          turnId: 'turn_opts_01',
          modelId: 'gpt-5.6-sol',
          event: collaborationEvent,
        }))
    }

    await createOpenAIAccountStreamPayload({
      messages: [{ role: 'user', content: 'hi' }],
      options: { onCollaborationEvent },
      onCollaborationEvent,
    })
    await collaborationIngestChain

    assert.equal(typeof forwardedCallback, 'function')
    const query = createAgentRunQueryService({ db, repository: runtime.repository })
    const listed = query.listRuns({ projectId: 'project_01', threadId: 'thread_01' })
    assert.equal(listed.runs.length, 1)
    assert.equal(listed.runs[0].turnId, 'turn_opts_01')
    const graph = runtime.repository.getRunGraph(listed.runs[0].id)
    const children = graph.nodes.filter((node) => node.id !== graph.run.rootNodeId)
    assert.equal(children.length, 1)
    assert.equal(children[0].providerThreadId, 'thread_child_opts')
  } finally {
    db.close()
  }
})

test('restarted runtime rebinds durable children and applies status without duplicates', async () => {
  const db = createDatabase()
  try {
    const first = createRuntime(db)
    await first.ingestOpenAIAccountCollaboration({
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_restart_01',
      modelId: 'gpt-5.6-sol',
      event: {
        phase: 'completed',
        providerEventId: 'item_restart:running',
        providerActivityId: 'item_restart',
        spawnRequestId: 'item_restart',
        parentProviderThreadId: 'thread_root_restart',
        providerThreadId: 'thread_child_restart',
        status: 'running',
      },
    })
    const listedFirst = createAgentRunQueryService({ db, repository: first.repository })
      .listRuns({ projectId: 'project_01', threadId: 'thread_01' })
    assert.equal(listedFirst.runs.length, 1)
    const childId = first.repository.getRunGraph(listedFirst.runs[0].id)
      .nodes.find((node) => node.id !== listedFirst.runs[0].rootNodeId).id

    const second = createRuntime(db)
    await second.ingestOpenAIAccountCollaboration({
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_restart_01',
      modelId: 'gpt-5.6-sol',
      event: {
        phase: 'completed',
        providerEventId: 'item_restart:completed',
        providerActivityId: 'item_restart',
        spawnRequestId: 'item_restart',
        parentProviderThreadId: 'thread_root_restart',
        providerThreadId: 'thread_child_restart',
        status: 'completed',
      },
    })

    const listed = createAgentRunQueryService({ db, repository: second.repository })
      .listRuns({ projectId: 'project_01', threadId: 'thread_01' })
    assert.equal(listed.runs.length, 1)
    const graph = second.repository.getRunGraph(listed.runs[0].id)
    const children = graph.nodes.filter((node) => node.id !== graph.run.rootNodeId)
    assert.equal(children.length, 1)
    assert.equal(children[0].id, childId)
    assert.equal(children[0].status, 'completed')
  } finally {
    db.close()
  }
})

test('node_discovered provider events materialize opaque children bound to the run', async () => {
  const db = createDatabase()
  try {
    const runtime = createRuntime(db)
    await runtime.ingestOpenAIAccountCollaboration({
      projectId: 'project_01',
      threadId: 'thread_01',
      turnId: 'turn_discovered_01',
      modelId: 'gpt-5.6-sol',
      event: {
        phase: 'started',
        providerEventId: 'seed:running',
        providerActivityId: 'seed',
        spawnRequestId: 'seed',
        providerThreadId: 'thread_seed_only',
        status: 'running',
      },
    })
    const listed = createAgentRunQueryService({ db, repository: runtime.repository })
      .listRuns({ projectId: 'project_01', threadId: 'thread_01' })
    const runId = listed.runs[0].id
    const graph = runtime.repository.getRunGraph(runId)
    assert.equal(graph.run.status, 'running')

    const nodeId = runtime.materializeOpenAIAccountDiscoveredChild(
      { runId, nodeId: graph.run.rootNodeId },
      {
        providerEventId: 'openai-account:node:discovered_1',
        kind: 'node_discovered',
        payload: {
          providerThreadId: 'thread_discovered_1',
          spawnRequestId: 'item_discovered',
          providerActivityId: 'item_discovered',
          status: 'completed',
          transcriptEvidence: 'status_only',
          nodeCapabilityMode: 'provider_opaque',
        },
        providerMetadata: {
          providerActivityId: 'item_discovered',
          phase: 'completed',
        },
      },
    )

    const latest = runtime.repository.getRunGraph(runId)
    const children = latest.nodes.filter((node) => node.id !== latest.run.rootNodeId)
    assert.equal(children.length, 2)
    assert.ok(children.some((node) => node.id === nodeId && node.providerThreadId === 'thread_discovered_1'))
    assert.equal(
      children.find((node) => node.providerThreadId === 'thread_discovered_1').transcriptEvidence,
      'status_only',
    )
  } finally {
    db.close()
  }
})

test('live singleton factory registers openai-native adapter', () => {
  const source = readSource('src/main/agents/managed-agent-runtime-singleton.mjs')
  assert.match(source, /createOpenAINativeAgentAdapter/)
  assert.match(source, /adapterRegistry\.register\(createOpenAINativeAgentAdapter/)
  assert.match(source, /startOpenAIAccountBackgroundOperation/)
})
