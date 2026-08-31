import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AGENT_OUTPUT_CONTRACT_TYPES,
  buildAgentOutputContractHint,
  parseAgentOutputContract,
  resolveAgentOutputContractType,
} from '../../src/main/moa/agent-output-contract.mjs'
import { buildAgentMessages } from '../../src/main/moa/agent-runtime-helpers.mjs'

test('resolveAgentOutputContractType infers contract types from task hints', () => {
  assert.equal(resolveAgentOutputContractType({
    expected_output_format: 'Return a JSON scorecard with labels, scores, and rationale.',
  }), AGENT_OUTPUT_CONTRACT_TYPES.scorecard)

  assert.equal(resolveAgentOutputContractType({
    expected_output_format: 'Return implementation recommendations and next steps.',
  }), AGENT_OUTPUT_CONTRACT_TYPES.recommendations)

  assert.equal(resolveAgentOutputContractType({
    expected_output_format: 'List staged changes with filePath and changeType.',
  }), AGENT_OUTPUT_CONTRACT_TYPES.stagedChanges)

  assert.equal(resolveAgentOutputContractType({
    expected_output_format: 'Return security findings with evidence and suggestions.',
  }), AGENT_OUTPUT_CONTRACT_TYPES.findings)
})

test('buildAgentOutputContractHint switches schema by contract type', () => {
  assert.match(
    buildAgentOutputContractHint({ expected_output_format: 'Return a scorecard.' }),
    /"scorecard"/,
  )
  assert.match(
    buildAgentOutputContractHint({ expected_output_format: 'Return implementation recommendations.' }),
    /"recommendations"/,
  )
  assert.match(
    buildAgentOutputContractHint({ expected_output_format: 'Return staged changes.' }),
    /"stagedChanges"/,
  )
})

test('parseAgentOutputContract normalizes recommendations and scorecards', () => {
  const recommendations = parseAgentOutputContract(JSON.stringify({
    summary: 'Recommended next actions.',
    recommendations: [
      { title: 'Split the auth service', priority: 'high', rationale: 'Reduces coupling.', file: 'src/auth/service.mjs' },
    ],
  }), { type: AGENT_OUTPUT_CONTRACT_TYPES.recommendations })

  assert.equal(recommendations.parsedOk, true)
  assert.equal(recommendations.contractType, AGENT_OUTPUT_CONTRACT_TYPES.recommendations)
  assert.equal(recommendations.recommendations.length, 1)
  assert.equal(recommendations.recommendations[0].priority, 'high')

  const scorecard = parseAgentOutputContract(JSON.stringify({
    summary: 'Quality scorecard.',
    scorecard: [
      { label: 'Security', score: 82, rationale: 'Guards are mostly present.' },
    ],
  }), { type: AGENT_OUTPUT_CONTRACT_TYPES.scorecard })

  assert.equal(scorecard.parsedOk, true)
  assert.equal(scorecard.contractType, AGENT_OUTPUT_CONTRACT_TYPES.scorecard)
  assert.equal(scorecard.scorecard.length, 1)
  assert.equal(scorecard.scorecard[0].score, 82)
})

test('buildAgentMessages exposes resolved contract type in the agent system prompt', () => {
  const messages = buildAgentMessages({
    instruction: 'Produce a scorecard.',
    injected_context: 'File: src/main/ipc-handlers/chat.mjs',
    expected_output_format: 'Return a scorecard with labels and scores.',
  }, {
    name: 'Architecture Reviewer',
    systemPrompt: 'Review architecture quality.',
  })

  assert.equal(messages.length, 2)
  assert.match(String(messages[0]?.content || ''), /Resolved output contract: scorecard\./)
  assert.match(String(messages[0]?.content || ''), /"scorecard"/)
})

test('buildAgentMessages lets direct agents answer naturally instead of forcing JSON', () => {
  const messages = buildAgentMessages({
    instruction: 'Reply with one short sentence confirming your role.',
    injected_context: 'User-directed agent run.',
    expected_output_format: 'Provide a concise result in plain text.',
    outputPresentation: 'natural',
  }, {
    name: 'Security Reviewer',
    systemPrompt: 'Review security.',
  })

  const systemPrompt = String(messages[0]?.content || '')
  assert.match(systemPrompt, /normal user-facing Markdown/i)
  assert.match(systemPrompt, /Lead with the outcome/i)
  assert.doesNotMatch(systemPrompt, /Return STRICT JSON/i)
})
