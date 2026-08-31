import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createAddomManagedAgentAdapter,
} from '../../src/main/agents/providers/addom-managed-agent-adapter.mjs'

const TS = 1_752_600_000_000

test('ADDOM managed adapter exposes provider-neutral node stream and terminal events', async () => {
  const calls = []
  const adapter = createAddomManagedAgentAdapter({
    now: (() => {
      let value = TS
      return () => value += 1
    })(),
    runSingleAgentFn: async (task, role, apiKey, projectFolder, emitLegacy, signal, runtime) => {
      calls.push({ task, role, apiKey, projectFolder, signal })
      emitLegacy('moa:agent-start', { taskId: task.task_id })
      await runtime.onAgentStreamEvent({
        kind: 'commentary',
        payload: { delta: 'Inspecting the parser.' },
      })
      await runtime.onAgentStreamEvent({
        kind: 'reasoning',
        payload: { delta: 'Checking state transitions.' },
      })
      await runtime.onAgentStreamEvent({
        kind: 'tool_started',
        payload: { toolCallId: 'tool_01', toolName: 'read_file', toolClass: 'read' },
      })
      await runtime.onAgentStreamEvent({
        kind: 'tool_output',
        payload: { toolCallId: 'tool_01', output: 'file contents' },
      })
      await runtime.onAgentStreamEvent({
        kind: 'tool_completed',
        payload: { toolCallId: 'tool_01', status: 'completed' },
      })
      return {
        status: 'completed',
        output: '{"summary":"Parser is correct.","findings":[]}',
        reportMarkdown: 'Parser is correct.',
        usage: null,
        stagedChanges: [],
      }
    },
  })
  const events = []
  const session = await adapter.create({
    providerId: 'openrouter',
    modelId: 'anthropic/claude-sonnet-5',
    capturedAt: TS,
    appendEvent: async (event) => events.push(event),
    context: {
      task: {
        task_id: 'task_01',
        instruction: 'Inspect the parser.',
        injected_context: 'src/parser.mjs',
        expected_output_format: 'Concise report',
      },
      role: {
        id: 'reviewer',
        name: 'Reviewer',
        providerId: 'openrouter',
        model: 'anthropic/claude-sonnet-5',
      },
      apiKey: 'test-key',
      projectFolder: 'C:/workspace/project-01',
      runtime: {},
    },
  })

  const result = await adapter.start(session.sessionId)

  assert.equal(calls.length, 1)
  assert.equal(result.status, 'completed')
  assert.equal(result.summary, 'Parser is correct.')
  assert.equal(session.capabilitySnapshot.nodeCapabilities.childRetry, true)
  assert.equal(session.capabilitySnapshot.nodeCapabilities.approvalAttribution, true)
  assert.equal(session.capabilitySnapshot.nodeCapabilities.workspaceIsolation, true)
  assert.deepEqual(events.map((event) => event.kind), [
    'created',
    'status',
    'commentary',
    'reasoning',
    'tool_started',
    'tool_output',
    'tool_completed',
    'result',
  ])
  assert.equal(
    events.at(-1).payload.legacyResult.output,
    '{"summary":"Parser is correct.","findings":[]}',
  )
})

test('ADDOM managed adapter cancellation aborts the private provider controller', async () => {
  let observedSignal = null
  let release
  const adapter = createAddomManagedAgentAdapter({
    runSingleAgentFn: async (_task, _role, _apiKey, _folder, _emit, signal) => {
      observedSignal = signal
      await new Promise((resolve) => {
        release = resolve
        signal.addEventListener('abort', resolve, { once: true })
      })
      return { status: 'aborted', error: 'Aborted', output: null, usage: null }
    },
  })
  const session = await adapter.create({
    providerId: 'openrouter',
    modelId: 'model-test',
    appendEvent: async () => {},
    context: {
      task: { task_id: 'task_01' },
      role: { id: 'reviewer', name: 'Reviewer', providerId: 'openrouter', model: 'model-test' },
      apiKey: '',
      projectFolder: 'C:/workspace/project-01',
      runtime: {},
    },
  })

  const started = adapter.start(session.sessionId)
  await Promise.resolve()
  await adapter.cancel(session.sessionId, { reason: 'parent_cancelled' })
  await started

  assert.equal(observedSignal.aborted, true)
  release?.()
})

test('ADDOM managed adapter fails closed after the first canonical event append failure', async () => {
  let appendAttempts = 0
  const adapter = createAddomManagedAgentAdapter({
    runSingleAgentFn: async (_task, _role, _apiKey, _folder, _emit, _signal, runtime) => {
      await assert.rejects(
        runtime.onAgentStreamEvent({
          kind: 'commentary',
          payload: { delta: 'First event.' },
        }),
        /canonical append failed/i,
      )
      await assert.rejects(
        runtime.onAgentStreamEvent({
          kind: 'commentary',
          payload: { delta: 'Second event.' },
        }),
        /canonical append failed/i,
      )
      return {
        status: 'completed',
        output: 'This result must not be accepted.',
        usage: null,
        stagedChanges: [],
      }
    },
  })
  const session = await adapter.create({
    providerId: 'openrouter',
    modelId: 'model-test',
    appendEvent: async (event) => {
      if (event.kind !== 'commentary') return
      appendAttempts += 1
      throw new Error('canonical append failed')
    },
    context: {
      task: { task_id: 'task_01' },
      role: { id: 'reviewer', name: 'Reviewer', providerId: 'openrouter', model: 'model-test' },
      apiKey: '',
      projectFolder: 'C:/workspace/project-01',
      runtime: {},
    },
  })

  await assert.rejects(adapter.start(session.sessionId), /canonical append failed/i)
  assert.equal(appendAttempts, 1)
})
