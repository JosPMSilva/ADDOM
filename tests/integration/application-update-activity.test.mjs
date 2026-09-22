import test from 'node:test'
import assert from 'node:assert/strict'

import { createApplicationUpdateActivityMonitor } from '../../src/main/updater/application-update-activity.mjs'

function validPreflight(dirtyTabCount = 0) {
  return { dirtyTabCount, capturedAt: 1_000 }
}

function createSources(overrides = {}) {
  return {
    now: () => 1_000,
    listChatRuns: () => [],
    listManagedRuns: () => [],
    listManagedApprovals: () => [],
    listOpenAIBackgroundJobs: () => [],
    listBackgroundCommands: () => [],
    listTrackedCursorAgentPids: () => [],
    listTerminalSessions: () => [],
    ...overrides,
  }
}

test('activity monitor reports every production work source with sanitized count labels', async () => {
  const cases = [
    ['listChatRuns', [{ id: 'chat-secret' }], 'running-task'],
    ['listManagedRuns', [{ id: 'agent-secret', status: 'waiting' }], 'running-task'],
    ['listOpenAIBackgroundJobs', [{ id: 'response-secret', status: 'queued' }], 'running-task'],
    ['listBackgroundCommands', [{ command: 'private command', status: 'running' }], 'running-task'],
    ['listTrackedCursorAgentPids', [4455], 'running-task'],
    ['listTerminalSessions', [{ id: 'terminal-secret', status: 'running' }], 'active-terminal'],
    ['listManagedApprovals', [{ id: 'approval-secret', status: 'pending' }], 'pending-approval'],
  ]

  for (const [sourceName, rows, expectedKind] of cases) {
    const monitor = createApplicationUpdateActivityMonitor(createSources({
      [sourceName]: () => rows,
    }))
    const blockers = await monitor.collectBlockers({ rendererPreflight: validPreflight() })
    assert.equal(blockers.some((blocker) => blocker.kind === expectedKind), true, sourceName)
    const serialized = JSON.stringify(blockers)
    assert.doesNotMatch(serialized, /secret|private command|4455/i)
  }
})

test('activity monitor reports unsaved tabs without exposing filenames', async () => {
  const monitor = createApplicationUpdateActivityMonitor(createSources())

  assert.deepEqual(await monitor.collectBlockers({
    rendererPreflight: validPreflight(3),
  }), [{
    kind: 'unsaved-work',
    label: '3 unsaved editor tabs',
  }])
})

test('activity monitor fails closed when renderer preflight is missing or malformed', async () => {
  const monitor = createApplicationUpdateActivityMonitor(createSources())

  for (const rendererPreflight of [undefined, null, {}, { dirtyTabCount: -1, capturedAt: 1_000 }]) {
    assert.deepEqual(await monitor.collectBlockers({ rendererPreflight }), [{
      kind: 'unsaved-work',
      label: 'ADDOM could not verify that editor work is saved',
    }])
  }
})

test('activity monitor fails closed when renderer preflight is stale or implausibly future-dated', async () => {
  const monitor = createApplicationUpdateActivityMonitor(createSources({ now: () => 10_000 }))

  for (const rendererPreflight of [
    { dirtyTabCount: 0, capturedAt: 1_000 },
    { dirtyTabCount: 0, capturedAt: 12_000 },
  ]) {
    assert.deepEqual(await monitor.collectBlockers({ rendererPreflight }), [{
      kind: 'unsaved-work',
      label: 'ADDOM could not verify that editor work is saved',
    }])
  }
})

test('activity monitor fails closed without exposing activity-source errors', async () => {
  const monitor = createApplicationUpdateActivityMonitor(createSources({
    listBackgroundCommands: () => { throw new Error('C:\\Users\\example\\secret-command') },
  }))

  const blockers = await monitor.collectBlockers({ rendererPreflight: validPreflight() })
  assert.deepEqual(blockers, [{
    kind: 'running-task',
    label: 'ADDOM could not verify that all work is idle',
  }])
  assert.doesNotMatch(JSON.stringify(blockers), /private|secret-command/i)
})

test('activity monitor fails closed when an activity source returns malformed data', async () => {
  const monitor = createApplicationUpdateActivityMonitor({
    listChatRuns: () => null,
    now: () => 1_000,
  })

  assert.deepEqual(await monitor.collectBlockers({
    rendererPreflight: { dirtyTabCount: 0, capturedAt: 1_000 },
  }), [{
    kind: 'running-task',
    label: 'ADDOM could not verify that all work is idle',
  }])
})

test('activity monitor ignores terminal records and completed background work', async () => {
  const monitor = createApplicationUpdateActivityMonitor(createSources({
    listManagedRuns: () => [{ status: 'completed' }, { status: 'failed' }, { status: 'cancelled' }],
    listManagedApprovals: () => [{ status: 'resolved' }],
    listOpenAIBackgroundJobs: () => [{ status: 'completed' }, { status: 'failed' }],
    listBackgroundCommands: () => [{ status: 'exited' }, { status: 'stopped' }],
    listTerminalSessions: () => [{ status: 'exited' }, { status: 'closed' }],
  }))

  assert.deepEqual(await monitor.collectBlockers({ rendererPreflight: validPreflight() }), [])
})
