import test from 'node:test'
import assert from 'node:assert/strict'

import {
  evaluateDelegationPreflightRepairability,
  buildMoaDelegationPreflightRepairPrompt,
} from '../../src/main/chat/moa-preflight-repair-prompt.mjs'

test('evaluateDelegationPreflightRepairability allows shape/role-only preflight failures', () => {
  const preflight = {
    errors: [
      { code: 'missing_instruction', taskId: 'task_1' },
      { code: 'missing_output_format', taskId: 'task_1' },
      { code: 'role_not_found', taskId: 'task_1' },
    ],
  }
  const result = evaluateDelegationPreflightRepairability(preflight)
  assert.equal(result.repairable, true)
  assert.equal(result.reason, 'shape_or_role_errors_only')
})

test('evaluateDelegationPreflightRepairability blocks retry when account auth is blocked', () => {
  const preflight = {
    errors: [
      { code: 'missing_instruction', taskId: 'task_1' },
      { code: 'account_login_required', taskId: 'task_1' },
    ],
  }
  const result = evaluateDelegationPreflightRepairability(preflight)
  assert.equal(result.repairable, false)
  assert.equal(result.reason, 'contains_non_retryable_code')
})

test('buildMoaDelegationPreflightRepairPrompt includes errors and valid task-shape reminder', () => {
  const preflight = {
    tasks: [{
      task_id: 'task_1',
      agent_role_id: '',
      agent_role: '',
      instruction: '',
      injected_context: 'function login() { return true }',
      expected_output_format: '',
    }],
    errors: [
      { code: 'missing_instruction', taskId: 'task_1', message: 'Task "task_1" is missing "instruction".' },
      { code: 'missing_output_format', taskId: 'task_1', message: 'Task "task_1" is missing "expected_output_format".' },
      { code: 'role_not_found', taskId: 'task_1', message: 'Role "" is not configured in Settings > Subagents.' },
    ],
  }

  const prompt = buildMoaDelegationPreflightRepairPrompt({ preflight, allowRetry: true })

  assert.match(prompt, /\[MoA DELEGATION PRE-FLIGHT ERRORS\]/)
  assert.match(prompt, /Retry delegate_to_agents once with a corrected payload only if you can fully repair every delegated task/)
  assert.match(prompt, /If you cannot fully repair all tasks, do not call delegate_to_agents again in this turn/)
  assert.match(prompt, /Repair toward semantic routing hints/)
  assert.match(prompt, /Do not retry with empty strings, placeholder text, guessed role keys\/IDs, or missing semantic hints/)
  assert.match(prompt, /missing "instruction"/)
  assert.match(prompt, /missing "expected_output_format"/)
  assert.match(prompt, /Minimal valid task shape reminder/)
  assert.match(prompt, /"specialty": "security"/)
})

test('buildMoaDelegationPreflightRepairPrompt uses the visible delegation alias when provided', () => {
  const prompt = buildMoaDelegationPreflightRepairPrompt({
    preflight: {
      errors: [{ code: 'missing_instruction', taskId: 'task_1', message: 'Task "task_1" is missing "instruction".' }],
      tasks: [{ task_id: 'task_1', instruction: '', injected_context: 'src/auth.ts', expected_output_format: 'JSON findings' }],
    },
    allowRetry: true,
    toolName: 'delegate_tasks',
  })

  assert.match(prompt, /previous delegate_tasks call did not run/i)
  assert.match(prompt, /Retry delegate_tasks once/i)
  assert.match(prompt, /do not call delegate_tasks again/i)
  assert.match(prompt, /Do not select, pin, order, or repeat roles/i)
  assert.match(prompt, /ADDOM recompiles the execution plan/i)
  assert.match(prompt, /"context":/i)
  assert.doesNotMatch(prompt, /Every task must include: instruction, injected_context/i)
})

test('buildMoaDelegationPreflightRepairPrompt gives explicit retry actions for missing injected_context', () => {
  const preflight = {
    tasks: [
      {
        task_id: 'task_1',
        instruction: 'Review schema design.',
        injected_context: '',
        expected_output_format: 'Return concise findings.',
      },
      {
        task_id: 'task_2',
        instruction: 'Debug the failing migration.',
        injected_context: '',
        expected_output_format: 'Return root cause and fix.',
      },
    ],
    errors: [
      { code: 'missing_context', taskId: 'task_1', message: 'Task "task_1" is missing "injected_context".' },
      { code: 'missing_context', taskId: 'task_2', message: 'Task "task_2" is missing "injected_context".' },
    ],
  }

  const prompt = buildMoaDelegationPreflightRepairPrompt({ preflight, allowRetry: true })

  assert.match(prompt, /This failure happened before any agent ran\./)
  assert.match(prompt, /Repair actions for the retry:/)
  assert.match(prompt, /Missing injected_context on: task_1, task_2\./)
  assert.match(prompt, /retry delegation once/i)
})
