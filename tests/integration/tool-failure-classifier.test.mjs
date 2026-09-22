import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveToolFailureDiagnostics } from '../../src/main/chat/tool-failure-classifier.mjs'

const cases = [
  {
    label: 'schema rejection',
    input: { isError: true, inputValidationError: { code: 'invalid_type' } },
    expected: ['input_validation', 'schema_rejected'],
  },
  {
    label: 'argument parse failure',
    input: { isError: true, result: 'Tool error: Failed to parse tool arguments as JSON.' },
    expected: ['argument_parse', 'arguments_parse_failed'],
  },
  {
    label: 'policy denial',
    input: { decision: 'denied', denyReason: 'policy_denied' },
    expected: ['policy', 'policy_denied'],
  },
  {
    label: 'user denial',
    input: { decision: 'denied', denyReason: 'user_denied' },
    expected: ['approval', 'user_denied'],
  },
  {
    label: 'missing dependency',
    input: { isError: true, missingDependencySuspected: true, result: 'Tool error: command not found' },
    expected: ['environment', 'missing_dependency'],
  },
  {
    label: 'nonzero command exit',
    input: { toolName: 'run_command', isError: true, result: 'Command failed with exit code 2 (PowerShell).' },
    expected: ['execution', 'nonzero_exit'],
  },
  {
    label: 'cancellation',
    input: { isError: true, decision: 'denied', denyReason: 'cancelled', cancelled: true, result: 'Tool error: operation aborted' },
    expected: ['execution', 'cancelled'],
  },
  {
    label: 'timeout',
    input: { toolName: 'browser_action', isError: true, result: 'Tool error: browser timed out' },
    expected: ['execution', 'timeout'],
  },
  {
    label: 'executor failure',
    input: { isError: true, result: 'Tool error: unexpected bridge failure' },
    expected: ['execution', 'executor_failed'],
  },
]

for (const fixture of cases) {
  test(`resolveToolFailureDiagnostics classifies ${fixture.label}`, () => {
    const result = resolveToolFailureDiagnostics(fixture.input)
    assert.equal(result.failureStage, fixture.expected[0])
    assert.equal(result.failureReasonCode, fixture.expected[1])
  })
}

test('resolveToolFailureDiagnostics records lint and capability failures without parsing prose', () => {
  const lint = resolveToolFailureDiagnostics({
    isError: true,
    lintResult: {
      decision: 'reject',
      lintCode: 'apply_patch_missing_hunk',
      failureClass: 'MALFORMED_PATCH_SYNTAX',
    },
  })
  const capability = resolveToolFailureDiagnostics({
    isError: true,
    modeCapability: { allowed: false, reason: 'plan_mode_write_blocked' },
  })

  assert.deepEqual(lint, {
    failureClass: 'MALFORMED_PATCH_SYNTAX',
    failureStage: 'pre_execution_lint',
    failureReasonCode: 'lint_rejected',
  })
  assert.equal(capability.failureStage, 'capability')
  assert.equal(capability.failureReasonCode, 'mode_not_allowed')
})

test('resolveToolFailureDiagnostics distinguishes capability recovery from pre-execution guards', () => {
  const hiddenTool = resolveToolFailureDiagnostics({
    isError: true,
    lintResult: {
      decision: 'reject',
      lintCode: 'hidden_known_tool',
      failureClass: 'HIDDEN_KNOWN_TOOL',
    },
  })
  const inspection = resolveToolFailureDiagnostics({
    toolName: 'edit_file',
    isError: true,
    result: 'Tool error: edit_file requires a prior read_file or view_file_range.',
  })

  assert.equal(hiddenTool.failureStage, 'capability')
  assert.equal(hiddenTool.failureReasonCode, 'tool_surface_unavailable')
  assert.equal(inspection.failureStage, 'pre_execution_guard')
  assert.equal(inspection.failureReasonCode, 'inspection_required')
})

test('resolveToolFailureDiagnostics leaves successful outcomes unclassified', () => {
  assert.deepEqual(resolveToolFailureDiagnostics({
    toolName: 'read_file',
    result: 'file contents',
    isError: false,
    decision: 'approved',
  }), {
    failureClass: '',
    failureStage: '',
    failureReasonCode: '',
  })
})
