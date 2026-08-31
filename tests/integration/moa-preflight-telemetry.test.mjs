import test from 'node:test'
import assert from 'node:assert/strict'

import { buildMoaDelegationPreflightTelemetry } from '../../src/main/chat/moa-preflight-telemetry.mjs'

test('buildMoaDelegationPreflightTelemetry summarizes malformed preflight failures by code and retry state', () => {
  const payload = buildMoaDelegationPreflightTelemetry({
    providerId: 'openai',
    model: 'gpt-4o',
    rawTasks: [{}, {}, {}],
    delegationId: 'del_test',
    preflight: {
      ok: false,
      errors: [
        { code: 'missing_instruction', taskId: 'task_1' },
        { code: 'missing_output_format', taskId: 'task_1' },
        { code: 'role_not_found', taskId: 'task_1' },
        { code: 'missing_instruction', taskId: 'task_2' },
      ],
    },
    repairability: { repairable: true },
    repairPromptInjected: true,
    isRepairRetryAttempt: false,
  })

  assert.equal(payload.providerId, 'openai')
  assert.equal(payload.model, 'gpt-4o')
  assert.equal(payload.taskCount, 3)
  assert.equal(payload.preflightStatus, 'failed')
  assert.equal(payload.malformedDelegation, true)
  assert.equal(payload.repairable, true)
  assert.equal(payload.repairPromptInjected, true)
  assert.equal(payload.isRepairRetryAttempt, false)
  assert.equal(payload.retryOutcome, '')
  assert.equal(payload.errorCount, 4)
  assert.deepEqual(payload.errorCodes.map((r) => [r.code, r.count]), [
    ['missing_instruction', 2],
    ['missing_output_format', 1],
    ['role_not_found', 1],
  ])
  assert.deepEqual(payload.errorTasks, ['task_1', 'task_2'])
})

test('buildMoaDelegationPreflightTelemetry marks repair retry preflight success', () => {
  const payload = buildMoaDelegationPreflightTelemetry({
    providerId: 'openai',
    model: 'gpt-5',
    rawTasks: [{}, {}],
    preflight: { ok: true, errors: [] },
    repairability: { repairable: false },
    isRepairRetryAttempt: true,
  })

  assert.equal(payload.preflightStatus, 'ok')
  assert.equal(payload.isRepairRetryAttempt, true)
  assert.equal(payload.retryOutcome, 'success')
  assert.equal(payload.errorCount, 0)
  assert.equal(payload.malformedDelegation, false)
})


