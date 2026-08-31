import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDelegationSynthesisPrompt } from '../../src/main/chat/moa-prompts.mjs'

function extractTag(prompt, tagName) {
  const start = `<${tagName}>`
  const end = `</${tagName}>`
  const from = prompt.indexOf(start)
  const to = prompt.indexOf(end)
  if (from < 0 || to < 0 || to < from) return ''
  return prompt.slice(from + start.length, to).trim()
}

function extractSummaryJson(prompt) {
  const jsonText = extractTag(prompt, 'delegation_summary_json')
  return JSON.parse(jsonText)
}

test('buildDelegationSynthesisPrompt omits read-only body dumps when reducer parsed cleanly', () => {
  const prompt = buildDelegationSynthesisPrompt({
    status: 'completed',
    delegationId: 'del_1',
    pattern: 'single_specialist',
    mergedSeverityConflicts: 1,
    taskCount: 2,
    summary: { completed: 2, failed: 0 },
    agents: [
      { taskId: 't1', role: 'perf', status: 'completed', output: 'Minor suggestions.' },
      { taskId: 't2', role: 'style', status: 'completed', output: 'Formatting notes.' },
    ],
    reducer: {
      parsedOk: true,
      dedupeCount: 0,
      droppedFindings: 0,
      findings: [
        { severity: 'low', file: 'a.js', issue: 'nit', evidence: 'n/a', suggestion: 'n/a', taskId: 't1', role: 'perf' },
      ],
      compactText: '- no blocking findings',
    },
    parsedOk: true,
  })

  const summary = extractSummaryJson(prompt)
  assert.equal(summary.pattern, 'single_specialist')
  assert.equal(summary.mergedSeverityConflicts, 1)
  assert.equal(summary.synthesisPayload.agentOutputMode, 'omitted')
  assert.equal(summary.synthesisPayload.agentOutputsIncluded, 0)
  assert.match(extractTag(prompt, 'agent_outputs'), /omitted/i)
  assert.match(prompt, /<reducer_packet>/)
  assert.match(prompt, /write-bearing, failed, or unparsed/i)
})

test('buildDelegationSynthesisPrompt gates body excerpts to revision-backed writers', () => {
  const longOutput = 'X'.repeat(4000)
  const prompt = buildDelegationSynthesisPrompt({
    status: 'completed',
    delegationId: 'del_2',
    pattern: 'review_gate',
    taskCount: 2,
    summary: { completed: 2, failed: 0, stagedWrites: 1 },
    agents: [
      {
        taskId: 't1',
        role: 'security',
        status: 'completed',
        output: `Critical issue details\n${longOutput}`,
        stagedChanges: [{
          filePath: 'src/auth.js',
          revisionId: 'rev_security',
          addedLines: 2,
          removedLines: 0,
        }],
      },
      { taskId: 't2', role: 'style', status: 'completed', output: 'Cosmetic changes only.' },
    ],
    reducer: {
      parsedOk: true,
      findings: [
        { severity: 'critical', file: 'src/auth.js', issue: 'auth bypass', evidence: 'missing authz', suggestion: 'enforce authz', taskId: 't1', role: 'security' },
      ],
      compactText: '- critical auth finding',
    },
    parsedOk: true,
  })

  const summary = extractSummaryJson(prompt)
  assert.equal(summary.pattern, 'review_gate')
  assert.equal(summary.synthesisPayload.agentOutputMode, 'gated_excerpts')
  assert.equal(summary.synthesisPayload.agentOutputsIncluded, 1)
  assert.equal(summary.synthesisPayload.agentOutputsTruncated, false)
  const agentOutputs = extractTag(prompt, 'agent_outputs')
  assert.match(agentOutputs, /\[AGENT security/i)
  assert.doesNotMatch(agentOutputs, /\[AGENT style/i)
})

test('buildDelegationSynthesisPrompt keeps read-only correctness findings in reducer without body dumps', () => {
  const prompt = buildDelegationSynthesisPrompt({
    status: 'completed',
    delegationId: 'del_correctness',
    pattern: 'review_gate',
    taskCount: 2,
    summary: { completed: 2, failed: 0 },
    agents: [
      { taskId: 't1', role: 'reviewer', status: 'completed', output: 'Correctness analysis details.' },
      { taskId: 't2', role: 'style', status: 'completed', output: 'Cosmetic changes only.' },
    ],
    reducer: {
      parsedOk: true,
      findings: [
        {
          severity: 'correctness',
          file: 'src/auth.js',
          issue: 'State machine skips validation',
          evidence: 'guard branch missing',
          suggestion: 'restore the validation step',
          taskId: 't1',
          role: 'reviewer',
        },
      ],
      compactText: '- correctness finding',
    },
    parsedOk: true,
  })

  const summary = extractSummaryJson(prompt)
  assert.equal(summary.synthesisPayload.agentOutputMode, 'omitted')
  assert.equal(summary.synthesisPayload.agentOutputsIncluded, 0)
  assert.match(extractTag(prompt, 'reducer_packet'), /correctness finding/)
  assert.match(extractTag(prompt, 'agent_outputs'), /omitted/i)
})

test('buildDelegationSynthesisPrompt falls back to projected salvage when reducer parsing fails', () => {
  const hugeText = 'agent raw\n' + 'A'.repeat(12_000)
  const prompt = buildDelegationSynthesisPrompt({
    status: 'completed',
    delegationId: 'del_3',
    pattern: 'parallel_independent',
    agents: [{ taskId: 't1', role: 'coder', status: 'completed', output: hugeText }],
    text: `FAT_ENVELOPE_${hugeText}`,
    reducer: { parsedOk: false },
    parsedOk: false,
  })

  const summary = extractSummaryJson(prompt)
  assert.equal(summary.pattern, 'parallel_independent')
  assert.equal(summary.synthesisPayload.agentOutputMode, 'raw_fallback')
  const agentOutputs = extractTag(prompt, 'agent_outputs')
  assert.match(agentOutputs, /agent raw/)
  assert.doesNotMatch(agentOutputs, /FAT_ENVELOPE_/)
  assert.ok(agentOutputs.length < hugeText.length)
  assert.ok(agentOutputs.length <= 40_000 + 120)
})

test('buildDelegationSynthesisPrompt carries structured non-finding reducer outputs', () => {
  const prompt = buildDelegationSynthesisPrompt({
    status: 'completed',
    delegationId: 'del_4',
    pattern: 'single_specialist',
    recommendationDedupeCount: 1,
    stagedChangeDedupeCount: 1,
    scorecardDedupeCount: 1,
    taskCount: 3,
    summary: { completed: 3, failed: 0 },
    reducer: {
      parsedOk: true,
      dedupeCount: 0,
      recommendationDedupeCount: 1,
      stagedChangeDedupeCount: 1,
      scorecardDedupeCount: 1,
      droppedFindings: 0,
      findings: [],
      recommendations: [
        {
          title: 'Add guard',
          priority: 'high',
          rationale: 'Protect the admin route.',
          file: 'src/auth.mjs',
          taskId: 't1',
          role: 'planner',
        },
      ],
      stagedChanges: [
        {
          filePath: 'src/auth.mjs',
          changeType: 'update',
          rationale: 'Insert the middleware check.',
          taskId: 't2',
          role: 'planner',
        },
      ],
      scorecard: [
        {
          label: 'Access control',
          score: 84,
          rationale: 'Coverage is strong with the guard.',
          taskId: 't3',
          role: 'reviewer',
        },
      ],
      compactText: '- structured reducer packet',
    },
    parsedOk: true,
  })

  const summary = extractSummaryJson(prompt)
  assert.equal(summary.recommendationDedupeCount, 1)
  assert.equal(summary.stagedChangeDedupeCount, 1)
  assert.equal(summary.scorecardDedupeCount, 1)
  assert.equal(summary.reducer.recommendations.length, 1)
  assert.equal(summary.reducer.recommendations[0].priority, 'high')
  assert.equal(summary.reducer.stagedChanges.length, 1)
  assert.equal(summary.reducer.stagedChanges[0].changeType, 'update')
  assert.equal(summary.reducer.scorecard.length, 1)
  assert.equal(summary.reducer.scorecard[0].score, 84)
})

test('synthesis distinguishes fanout accounting and requires grouped user-facing conclusions', () => {
  const prompt = buildDelegationSynthesisPrompt({
    status: 'completed',
    delegationId: 'del_limited',
    pattern: 'parallel_independent',
    requestedTaskCount: 12,
    plannedTaskCount: 12,
    admittedTaskCount: 5,
    executedTaskCount: 5,
    limitedTaskCount: 7,
    fanoutDecision: 'limit',
    taskCount: 5,
    summary: { completed: 5, failed: 0 },
    agents: Array.from({ length: 5 }, (_, index) => ({
      taskId: `task_${index + 1}`,
      role: `Reviewer ${index + 1}`,
      status: 'completed',
      output: `Conclusion ${index + 1}`,
    })),
    reducer: { parsedOk: true, findings: [], compactText: '- combined review complete' },
    parsedOk: true,
  })

  const summary = extractSummaryJson(prompt)
  assert.equal(summary.requestedTaskCount, 12)
  assert.equal(summary.plannedTaskCount, 12)
  assert.equal(summary.admittedTaskCount, 5)
  assert.equal(summary.executedTaskCount, 5)
  assert.equal(summary.limitedTaskCount, 7)
  assert.equal(summary.fanoutDecision, 'limit')
  assert.match(prompt, /Do not retry or replace those tasks/i)
  assert.match(prompt, /Do not enumerate every agent/i)
  assert.match(prompt, /Never claim agents ran in parallel unless/i)
})
