import test from 'node:test'
import assert from 'node:assert/strict'

import { buildAgentMessages } from '../../src/main/moa/agent-runtime-helpers.mjs'
import { buildRuntimeHandoff, shouldUseSequentialPattern } from '../../src/main/tools/agent-executor.mjs'

test('sequential pattern detection is limited to pipeline-style patterns', () => {
  assert.equal(shouldUseSequentialPattern('sequential_pipeline'), true)
  assert.equal(shouldUseSequentialPattern('review_gate'), true)
  assert.equal(shouldUseSequentialPattern('parallel_independent'), false)
  assert.equal(shouldUseSequentialPattern('single_specialist'), false)
})

test('buildRuntimeHandoff creates a structured step contract from completed upstream agents only', () => {
  const handoff = buildRuntimeHandoff('review_gate', [
    {
      taskId: 'task_1',
      roleId: 'role_arch',
      role: 'Architect',
      status: 'completed',
      outputContractType: 'findings',
      output: JSON.stringify({
        summary: 'Step 1 output.',
        findings: [
          {
            severity: 'correctness',
            file: 'src/app.ts',
            issue: 'Pipeline step issue.',
            suggestion: 'Apply the follow-up check.',
          },
        ],
      }),
    },
    { taskId: 'task_2', role: 'Reviewer', status: 'failed', output: 'Should be ignored.' },
  ])

  const parsed = JSON.parse(handoff)
  assert.equal(parsed.version, 1)
  assert.equal(parsed.pattern, 'review_gate')
  assert.equal(parsed.previousSteps.length, 1)
  assert.equal(parsed.previousSteps[0].taskId, 'task_1')
  assert.equal(parsed.previousSteps[0].roleId, 'role_arch')
  assert.equal(parsed.previousSteps[0].role, 'Architect')
  assert.equal(parsed.previousSteps[0].outputContractType, 'findings')
  assert.equal(parsed.previousSteps[0].parsedOk, true)
  assert.match(parsed.previousSteps[0].summary, /Step 1 output/)
  assert.equal(parsed.previousSteps[0].findings.length, 1)
  assert.equal(parsed.previousSteps[0].findings[0].severity, 'correctness')
  assert.equal(parsed.previousSteps[0].findings[0].file, 'src/app.ts')
})

test('buildAgentMessages includes runtime handoff as a separate prompt section', () => {
  const messages = buildAgentMessages({
    instruction: 'Review the implementation result.',
    injected_context: 'File: src/auth.ts',
    expected_output_format: 'Return concise findings.',
    runtime_handoff: '{"version":1,"pattern":"review_gate","previousSteps":[{"taskId":"task_1","role":"Builder","outputContractType":"findings"}]}',
  }, {
    name: 'Security Reviewer',
    systemPrompt: 'Audit auth flows.',
  })

  assert.equal(messages.length, 2)
  assert.match(String(messages[1]?.content || ''), /Context provided:/)
  assert.match(String(messages[1]?.content || ''), /Structured upstream step contract/)
  assert.match(String(messages[1]?.content || ''), /review_gate/)
  assert.match(String(messages[1]?.content || ''), /Builder/)
  assert.match(String(messages[1]?.content || ''), /outputContractType/)
})
