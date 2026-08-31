import test from 'node:test'
import assert from 'node:assert/strict'

import { runDelegationToolCall } from '../../src/main/chat/moa-tool-flow.mjs'
import { DEFAULT_MOA_POLICY } from '../../src/main/moa/moa-policy.mjs'
import { setSettingsPatch } from '../../src/main/settings.mjs'
import { createCanonicalRootEventWriter } from '../../src/main/chat/canonical-root-event-writer.mjs'
import { normalizeCanonicalRootEvent } from '../../src/common/chat/execution-event-contract.mjs'

test.beforeEach(async () => {
  await setSettingsPatch({
    providerAuthSettings: {
      openai: {
        authMethod: 'api_key',
      },
    },
  })
})

function createHarness({ strictCanonicalPersistence = false } = {}) {
  const sent = []
  const timeline = []
  const history = []
  const turnToolResults = []
  const harness = {
    sent,
    timeline,
    history,
    turnToolResults,
    send(channel, payload) {
      sent.push({ channel, payload })
    },
    persistTimelineEvent(kind, payload) {
      timeline.push({ kind, payload })
    },
  }
  if (strictCanonicalPersistence) {
    const writer = createCanonicalRootEventWriter({
      projectId: 'project_test',
      threadId: 'thread_test',
      turnId: 'turn_test',
      assistantMessageId: 'msg_runtime_role_ticket',
      providerId: 'openrouter',
      send: harness.send,
      appendOne: (_threadId, draft) => {
        const canonical = normalizeCanonicalRootEvent({
          ...draft,
          schemaVersion: 1,
          localSequence: timeline.length + 1,
          createdAt: draft.occurredAt,
          updatedAt: draft.occurredAt,
        })
        timeline.push({ kind: canonical.payload.timeline.kind, payload: canonical.payload.timeline })
        return { inserted: true, advanced: false, event: { canonical } }
      },
    })
    harness.persistTimelineEvent.commitAndProject = writer.commitAndProject
  }
  return harness
}

async function runDelegationForTest({
  toolInput,
  moaRoles = [],
  getApiKey = () => '',
  allowPreflightRepairRetry = false,
  isPreflightRepairRetryAttempt = false,
  activeAssistantMessageId = 'msg_runtime_role_ticket',
  strictCanonicalPersistence = false,
} = {}) {
  const harness = createHarness({ strictCanonicalPersistence })
  const result = await runDelegationToolCall({
    tc: {
      id: 'tc_delegate_1',
      name: 'delegate_to_agents',
      input: toolInput,
    },
    toolInput,
    stepId: 'turn_1:step:1',
    stepSequence: 1,
    stepStartedAt: Date.now(),
    activeThreadId: 'thread_test',
    activeTurnId: 'turn_test',
    activeAssistantMessageId,
    projectFolder: process.cwd(),
    loop: { abortController: new AbortController() },
    moaRoles,
    moaPolicy: DEFAULT_MOA_POLICY,
    moaBudgetPolicy: {},
    getApiKey,
    requestFanoutConfirmation: async () => ({ decision: 'launch_all' }),
    history: harness.history,
    turnToolResults: harness.turnToolResults,
    send: harness.send,
    persistTimelineEvent: harness.persistTimelineEvent,
    allowPreflightRepairRetry,
    orchestratorProviderId: 'openai',
    orchestratorModel: 'gpt-4o',
    isPreflightRepairRetryAttempt,
  })
  return { result, ...harness }
}

test('runDelegationToolCall injects one-shot repair prompt for repairable malformed delegation preflight failures', async () => {
  const { result, sent, turnToolResults, history } = await runDelegationForTest({
    toolInput: {
      tasks: [
        {
          task_id: 'task_1',
          agent_role_id: '',
          agent_role: '',
          instruction: '',
          injected_context: 'File: src/auth.ts\nfunction login() {}',
          expected_output_format: '',
        },
      ],
    },
    moaRoles: [
      { id: 'role_sec', name: 'Security Reviewer', providerId: 'openai', model: 'gpt-5' },
    ],
    getApiKey: () => 'sk-test',
    allowPreflightRepairRetry: true,
    isPreflightRepairRetryAttempt: false,
  })

  assert.equal(result?.handled, true)
  assert.equal(result?.preflightRepairTriggered, true)
  assert.match(String(result?.pendingSynthesisPrompt || ''), /\[MoA DELEGATION PRE-FLIGHT ERRORS\]/)

  const telemetryEvent = sent.find((row) => row.channel === 'moa:delegation-preflight-telemetry')
  assert.ok(telemetryEvent, 'expected moa:delegation-preflight-telemetry event')
  assert.equal(telemetryEvent.payload.preflightStatus, 'failed')
  assert.equal(telemetryEvent.payload.malformedDelegation, true)
  assert.equal(telemetryEvent.payload.repairable, true)
  assert.equal(telemetryEvent.payload.repairPromptInjected, true)
  assert.equal(telemetryEvent.payload.isRepairRetryAttempt, false)

  const toolResultEvent = sent.find((row) => row.channel === 'chat:tool-result')
  assert.ok(toolResultEvent, 'expected chat:tool-result')
  assert.equal(toolResultEvent.payload.toolName, 'delegate_to_agents')
  assert.equal(toolResultEvent.payload.isError, true)
  assert.equal(toolResultEvent.payload.moa?.status, 'preflight_failed')

  assert.equal(turnToolResults.length, 1)
  assert.match(String(turnToolResults[0].result || ''), /<delegation state="/)
  assert.doesNotMatch(String(turnToolResults[0].result || ''), /AGENT DELEGATION RESULTS/)
  assert.ok(history.length >= 1, 'tool result message should be appended to history')
})

test('preflight failure remains repairable through strict canonical persistence before a provider is selected', async () => {
  const { result, sent } = await runDelegationForTest({
    toolInput: {
      tasks: [{
        task_id: 'task_1',
        instruction: '',
        injected_context: 'Relevant workspace paths:\n- .',
        expected_output_format: 'Return concise findings.',
      }],
    },
    moaRoles: [{
      id: 'role_review',
      name: 'Repository Reviewer',
      providerId: 'openrouter',
      model: 'vendor/review-model',
    }],
    getApiKey: () => 'provider-key',
    allowPreflightRepairRetry: true,
    strictCanonicalPersistence: true,
  })

  assert.equal(result.preflightRepairTriggered, true)
  assert.match(result.pendingSynthesisPrompt, /DELEGATION PRE-FLIGHT ERRORS/)
  const start = sent.find((entry) => entry.channel === 'moa:delegation-start')
  assert.equal(start.payload.agentSummary[0].providerId, '')
  assert.equal(start.payload.agentSummary[0].model, '')
})

test('runDelegationToolCall does not inject repair prompt for non-retryable preflight failure (account auth blocked)', async () => {
  await setSettingsPatch({
    providerAuthSettings: {
      openai: {
        authMethod: 'account',
      },
    },
  })

  const { result, sent } = await runDelegationForTest({
    toolInput: {
      tasks: [
        {
          task_id: 'task_1',
          agent_role_id: 'role_sec',
          agent_role: '',
          instruction: 'Audit auth middleware for vulnerabilities.',
          injected_context: 'File: src/auth.ts\nfunction login() {}',
          expected_output_format: 'Return JSON findings.',
        },
      ],
    },
    moaRoles: [
      { id: 'role_sec', name: 'Security Reviewer', providerId: 'openai', model: 'gpt-5' },
    ],
    getApiKey: () => '',
    allowPreflightRepairRetry: true,
    isPreflightRepairRetryAttempt: false,
  })

  assert.equal(result?.handled, true)
  assert.equal(result?.preflightRepairTriggered, false)
  assert.doesNotMatch(String(result?.pendingSynthesisPrompt || ''), /\[MoA DELEGATION PRE-FLIGHT ERRORS\]/)
  assert.match(String(result?.pendingSynthesisPrompt || ''), /Delegation did not run due to preflight\/policy errors/)

  const telemetryEvent = sent.find((row) => row.channel === 'moa:delegation-preflight-telemetry')
  assert.ok(telemetryEvent, 'expected moa:delegation-preflight-telemetry event')
  assert.equal(telemetryEvent.payload.preflightStatus, 'failed')
  assert.equal(telemetryEvent.payload.repairable, false)
  assert.equal(telemetryEvent.payload.repairPromptInjected, false)
  assert.equal(telemetryEvent.payload.errorCodes.some((row) => row.code === 'missing_api_key'), false)
  assert.equal(
    telemetryEvent.payload.errorCodes.some((row) => /bridge_not_checked|account_/i.test(String(row.code || ''))),
    true,
  )

  const workerErrorEvents = sent.filter((row) => row.channel === 'moa:agent-error')
  assert.equal(workerErrorEvents.length, 0)

  const delegationDoneEvent = sent.find((row) => row.channel === 'moa:delegation-done')
  assert.ok(delegationDoneEvent, 'expected moa:delegation-done event')
  assert.equal(delegationDoneEvent.payload.status, 'preflight_failed')
  assert.match(
    String(delegationDoneEvent.payload.errors?.[0]?.message || ''),
    /OpenAI account|bridge/i,
  )
})

test('runDelegationToolCall does not emit agent-error events for malformed delegation preflight failures', async () => {
  const { sent } = await runDelegationForTest({
    toolInput: {
      tasks: [
        {
          task_id: 'task_1',
          injected_context: 'File: src/auth.ts\nfunction login() {}',
        },
        {
          task_id: 'task_2',
          injected_context: 'File: src/session.ts\nfunction logout() {}',
        },
      ],
    },
    moaRoles: [
      { id: 'role_sec', name: 'Security Reviewer', providerId: 'openai', model: 'gpt-5' },
    ],
    getApiKey: () => 'sk-test',
    allowPreflightRepairRetry: true,
    isPreflightRepairRetryAttempt: false,
  })

  assert.equal(sent.filter((row) => row.channel === 'moa:agent-error').length, 0)
  const doneEvent = sent.find((row) => row.channel === 'moa:delegation-done')
  assert.ok(doneEvent, 'expected moa:delegation-done event')
  assert.equal(doneEvent.payload.status, 'preflight_failed')
  assert.ok(Array.isArray(doneEvent.payload.errors))
  assert.equal(doneEvent.payload.errors.length >= 4, true)
})

test('an unresolved semantic role stays in the orchestrated turn as a normal preflight failure', async () => {
  const { result, sent } = await runDelegationForTest({
    toolInput: {
      tasks: [
        {
          task_id: 'task_perf',
          specialty: 'desktop',
          task_type: 'investigation',
          goal: 'Investigate native window focus regressions in the Electron shell.',
          instruction: 'Investigate Electron IPC and native window focus regressions in the desktop shell.',
          injected_context: 'File: src/main/window-manager.mjs',
          expected_output_format: 'Return concise findings.',
        },
      ],
    },
    moaRoles: [
      { id: 'role_sec', name: 'Security Reviewer', providerId: 'openai', model: 'gpt-5' },
    ],
    getApiKey: () => 'sk-test',
    allowPreflightRepairRetry: true,
    isPreflightRepairRetryAttempt: false,
  })

  assert.equal(result?.handled, true)
  assert.equal(result?.preflightRepairTriggered, true)
  assert.match(String(result?.pendingSynthesisPrompt || ''), /\[MoA DELEGATION PRE-FLIGHT ERRORS\]/)

  const toolResultEvent = sent.find((row) => row.channel === 'chat:tool-result')
  assert.ok(toolResultEvent, 'expected chat:tool-result')
  assert.equal(toolResultEvent.payload.isError, true)
  assert.equal(toolResultEvent.payload.moa?.status, 'preflight_failed')
  assert.equal(toolResultEvent.payload.moa?.runtimeRoleProposal, undefined)
  assert.equal(sent.some((row) => row.channel === 'moa:runtime-role-lifecycle'), false)
})

test('runDelegationToolCall repairs explicit pinned role misses semantically instead of forcing role-catalog recovery', async () => {
  const { result } = await runDelegationForTest({
    toolInput: {
      tasks: [
        {
          task_id: 'task_explicit_only',
          agent_role_id: 'role_desktop',
          instruction: 'Investigate Electron IPC regressions.',
          injected_context: 'File: src/main/window-manager.mjs',
          expected_output_format: 'Return concise findings.',
        },
      ],
    },
    moaRoles: [
      { id: 'role_sec', name: 'Security Reviewer', providerId: 'openai', model: 'gpt-5' },
    ],
    getApiKey: () => 'sk-test',
    allowPreflightRepairRetry: true,
    isPreflightRepairRetryAttempt: false,
  })

  assert.equal(result?.handled, true)
  assert.equal(result?.preflightRepairTriggered, true)
  assert.equal(result?.runtimeRoleProposalTriggered, undefined)
  assert.match(String(result?.pendingSynthesisPrompt || ''), /\[MoA DELEGATION PRE-FLIGHT ERRORS\]/)
  assert.match(String(result?.pendingSynthesisPrompt || ''), /Repair toward semantic routing hints/)
  assert.doesNotMatch(String(result?.pendingSynthesisPrompt || ''), /\[MoA ROLE CATALOG\]/)
})
