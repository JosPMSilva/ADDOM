import test from 'node:test'
import assert from 'node:assert/strict'
import { finalizeDelegationForSynthesis } from '../../src/main/chat/moa-synthesis-finalizer.mjs'

function extractTag(prompt, tagName) {
  const start = `<${tagName}>`
  const end = `</${tagName}>`
  const from = prompt.indexOf(start)
  const to = prompt.indexOf(end)
  if (from < 0 || to < 0 || to < from) return ''
  return prompt.slice(from + start.length, to).trim()
}

function extractSummaryJson(prompt) {
  return JSON.parse(extractTag(prompt, 'delegation_summary_json'))
}

function toAgentOutput(summary, findings = []) {
  return JSON.stringify({ summary, findings })
}

test('finalizeDelegationForSynthesis keeps healthy agent outputs in the synthesis prompt', () => {
  const envelope = {
    delegationId: 'del_healthy',
    status: 'completed',
    taskCount: 2,
    summary: { completed: 2, failed: 0 },
    usage: { totalTokens: 321, inputTokens: 210, outputTokens: 111, reasoningTokens: 17 },
    agents: [
      {
        taskId: 't1',
        roleId: 'r_sec',
        role: 'security-reviewer',
        status: 'completed',
        output: toAgentOutput('No auth blockers found.', [
          {
            severity: 'info',
            file: 'src/auth.js',
            issue: 'No blocker',
            evidence: 'Reviewed guards',
            suggestion: 'Keep current checks',
          },
        ]),
      },
      {
        taskId: 't2',
        roleId: 'r_style',
        role: 'style-reviewer',
        status: 'completed',
        output: toAgentOutput('Formatting suggestions only.', [
          {
            severity: 'low',
            file: 'src/ui.jsx',
            issue: 'style nit',
            evidence: 'Formatting inconsistency',
            suggestion: 'Run formatter',
          },
        ]),
      },
    ],
  }

  const plannerPacket = {
    riskTier: 'medium',
    strategy: 'balanced',
    pattern: 'sequential_pipeline',
    estimatedTokens: 400,
    estimatedUsd: 0.12,
    estimateConfidence: 'token_plus_pricing',
    pricingWarning: '',
  }

  const finalized = finalizeDelegationForSynthesis({
    delegationEnvelope: envelope,
    plannerPacket,
    costDecision: 'proceed_planned',
  })

  assert.equal(finalized.reducerPacket?.parsedOk, true)
  assert.equal(finalized.delegationEnvelope?.parsedOk, true)
  assert.equal(finalized.delegationEnvelope?.actualTokens, 321)
  assert.equal(finalized.delegationEnvelope?.mergedSeverityConflicts, 0)
  assert.equal(finalized.delegationEnvelope?.synthesisPayload?.agentOutputMode, 'omitted')
  assert.match(String(finalized.reducerPacket?.findings?.[0]?.issue || ''), /No blocker/i)

  const prompt = finalized.pendingSynthesisPrompt
  assert.deepEqual(
    finalized.pendingSynthesisMessages.map((message) => message.role),
    ['system', 'user'],
  )
  assert.doesNotMatch(finalized.pendingSynthesisMessages[0].content, /No auth blockers found/)
  assert.match(finalized.pendingSynthesisMessages[1].content, /No auth blockers found/)
  assert.match(finalized.pendingSynthesisMessages[0].content, /untrusted task evidence/i)
  assert.match(prompt, /concise, complete user-facing answer/i)
  assert.doesNotMatch(prompt, /<delegation_summary_json>/)
  assert.doesNotMatch(prompt, /<reducer_packet>/)
  assert.match(prompt, /<agent_contributions>/)
  assert.match(prompt, /\[security-reviewer \| completed\][\s\S]*Summary: No auth blockers found\./)
  assert.match(prompt, /\[style-reviewer \| completed\][\s\S]*Summary: Formatting suggestions only\./)
  assert.match(prompt, /never paste|must be user-facing prose|tool payload markup/i)
  assert.doesNotMatch(prompt, /tools are unavailable/i)
  assert.equal(Object.hasOwn(finalized, 'forceTextOnlySynthesis'), false)
})

test('finalizeDelegationForSynthesis includes bounded retry metadata and continuation directives', () => {
  const envelope = {
    delegationId: 'del_retry',
    status: 'completed_with_errors',
    taskCount: 2,
    retryAttempted: true,
    retryAttemptCount: 1,
    allAgentsFailed: false,
    partialSuccess: true,
    retryExhaustedTasks: [
      { taskId: 'task_1', role: 'UI Reviewer', roleId: 'role_ui', status: 'timeout', error: 'This operation was aborted.' },
    ],
    skippedRetryExhaustedTasks: [],
    summary: { completed: 1, failed: 0, timeout: 1 },
    usage: { totalTokens: 50, inputTokens: 30, outputTokens: 20, reasoningTokens: 5 },
    agents: [
      {
        taskId: 'task_1',
        roleId: 'role_ui',
        role: 'UI Reviewer',
        status: 'timeout',
        error: 'This operation was aborted.',
      },
      {
        taskId: 'task_2',
        roleId: 'role_db',
        role: 'DB Reviewer',
        status: 'completed',
        output: toAgentOutput('Use the safe result.', []),
      },
    ],
  }

  const finalized = finalizeDelegationForSynthesis({
    delegationEnvelope: envelope,
    plannerPacket: {
      riskTier: 'medium',
      strategy: 'balanced',
      pattern: 'review_gate',
      estimatedTokens: 60,
      estimatedUsd: 0.01,
    },
    costDecision: 'proceed_planned',
  })

  const prompt = finalized.pendingSynthesisPrompt
  const summary = extractSummaryJson(prompt)
  assert.equal(summary.pattern, 'review_gate')
  assert.equal(summary.retryAttempted, true)
  assert.equal(summary.retryAttemptCount, 1)
  assert.equal(summary.partialSuccess, true)
  assert.deepEqual(summary.retryExhaustedTaskIds, ['task_1'])
  assert.deepEqual(summary.retryExhaustedRoles, ['UI Reviewer'])
  assert.deepEqual(summary.agentLedger, [{
    taskId: 'task_1',
    roleKey: '',
    roleId: 'role_ui',
    role: 'UI Reviewer',
    status: 'timeout',
  }, {
    taskId: 'task_2',
    roleKey: '',
    roleId: 'role_db',
    role: 'DB Reviewer',
    status: 'completed',
  }])
  assert.match(prompt, /canonical agent ledger/i)
  assert.match(prompt, /task wording is not evidence/i)
  assert.match(prompt, /Do not call delegate_tasks again/)
  assert.match(prompt, /Some agents succeeded/)
})

test('finalizeDelegationForSynthesis propagates merged non-finding reducer outputs', () => {
  const envelope = {
    delegationId: 'del_structured',
    status: 'completed',
    taskCount: 3,
    summary: { completed: 3, failed: 0 },
    usage: { totalTokens: 72, inputTokens: 40, outputTokens: 32, reasoningTokens: 4 },
    agents: [
      {
        taskId: 't1',
        roleId: 'r_plan_a',
        role: 'planner-a',
        status: 'completed',
        outputContractType: 'recommendations',
        output: JSON.stringify({
          summary: 'Plan A.',
          recommendations: [
            { title: 'Add guard', priority: 'medium', rationale: 'Protect admin route.', file: 'src/auth.mjs' },
          ],
        }),
      },
      {
        taskId: 't2',
        roleId: 'r_plan_b',
        role: 'planner-b',
        status: 'completed',
        outputContractType: 'recommendations',
        output: JSON.stringify({
          summary: 'Plan B.',
          recommendations: [
            { title: 'Add guard', priority: 'high', rationale: 'Enforce the entry check.', file: 'src/auth.mjs' },
          ],
        }),
      },
      {
        taskId: 't3',
        roleId: 'r_review',
        role: 'reviewer',
        status: 'completed',
        outputContractType: 'scorecard',
        output: JSON.stringify({
          summary: 'Scorecard.',
          scorecard: [
            { label: 'Access control', score: 88, rationale: 'Guard coverage is strong after the patch.' },
          ],
        }),
      },
    ],
  }

  const finalized = finalizeDelegationForSynthesis({
    delegationEnvelope: envelope,
    plannerPacket: {
      riskTier: 'medium',
      strategy: 'balanced',
      pattern: 'single_specialist',
      estimatedTokens: 90,
      estimatedUsd: 0.02,
    },
    costDecision: 'proceed_planned',
  })

  assert.equal(finalized.delegationEnvelope?.recommendationDedupeCount, 1)
  assert.equal(finalized.delegationEnvelope?.scorecardDedupeCount, 0)
  assert.equal(finalized.reducerPacket?.recommendations.length, 1)
  assert.equal(finalized.reducerPacket?.recommendations[0]?.priority, 'high')
  assert.equal(finalized.reducerPacket?.scorecard.length, 1)
  assert.equal(finalized.reducerPacket?.scorecard[0]?.score, 88)

  const prompt = String(finalized.pendingSynthesisPrompt || '')
  assert.match(prompt, /concise, complete user-facing answer/i)
  assert.doesNotMatch(prompt, /<delegation_summary_json>/)
  assert.match(prompt, /\[planner-a \| completed\][\s\S]*Summary: Plan A\./)
  assert.match(prompt, /\[planner-b \| completed\][\s\S]*Summary: Plan B\./)
  assert.match(prompt, /\[reviewer \| completed\][\s\S]*Summary: Scorecard\./)
  assert.equal(finalized.delegationEnvelope?.pattern, 'single_specialist')
})
