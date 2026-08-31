import test from 'node:test'
import assert from 'node:assert/strict'
import { reduceDelegationOutputs } from '../../src/main/moa/delegation-reducer.mjs'

test('reducer falls back to raw mode for malformed agent output and still ranks valid findings', () => {
  const agents = [
    {
      taskId: 'task_bad',
      roleId: 'role_bad',
      role: 'Bad Output Agent',
      status: 'completed',
      output: 'not-json-output',
    },
    {
      taskId: 'task_ok',
      roleId: 'role_ok',
      role: 'Good Output Agent',
      status: 'completed',
      output: JSON.stringify({
        summary: 'Findings',
        findings: [
          {
            severity: 'security',
            file: 'src/auth.mjs',
            issue: 'Missing authorization check',
            evidence: 'endpoint lacks guard',
            suggestion: 'enforce permission gate',
          },
          {
            severity: 'security',
            file: 'src/auth.mjs',
            issue: 'Missing authorization check',
            evidence: 'duplicate evidence',
            suggestion: 'same finding duplicate',
          },
          {
            severity: 'info',
            file: 'src/misc.mjs',
            issue: '',
            evidence: 'empty issue should be dropped',
            suggestion: 'n/a',
          },
        ],
      }),
    },
  ]

  const reduced = reduceDelegationOutputs(agents)
  assert.equal(reduced.parsedOk, false)
  assert.equal(reduced.rawFallbacks.length, 1)
  assert.equal(reduced.findings.length, 1)
  assert.ok(reduced.dedupeCount >= 1)
  assert.ok(reduced.droppedFindings >= 0)
  assert.equal(reduced.findings[0].severity, 'security')
  assert.ok(String(reduced.compactText).includes('parsedOk: false'))
})

test('reducer preserves non-findings contract summaries without treating them as raw failures', () => {
  const agents = [
    {
      taskId: 'task_score',
      roleId: 'role_score',
      role: 'Scorecard Agent',
      status: 'completed',
      outputContractType: 'scorecard',
      output: JSON.stringify({
        summary: 'Quality scorecard.',
        scorecard: [
          { label: 'Architecture', score: 77, rationale: 'Mostly consistent boundaries.' },
        ],
      }),
    },
  ]

  const reduced = reduceDelegationOutputs(agents)
  assert.equal(reduced.parsedOk, true)
  assert.equal(reduced.rawFallbacks.length, 0)
  assert.equal(reduced.findings.length, 0)
  assert.equal(reduced.agentsummaries[0]?.contractType, 'scorecard')
  assert.equal(reduced.agentsummaries[0]?.scorecard, 1)
})

test('reducer merges duplicate findings by issue and promotes the highest severity', () => {
  const agents = [
    {
      taskId: 'task_a',
      roleId: 'role_a',
      role: 'Security Reviewer',
      status: 'completed',
      output: JSON.stringify({
        summary: 'Security review.',
        findings: [
          {
            severity: 'correctness',
            file: 'src/auth.mjs',
            issue: 'Missing authorization check',
            evidence: 'Route lacks guard.',
            suggestion: 'Add middleware.',
          },
        ],
      }),
    },
    {
      taskId: 'task_b',
      roleId: 'role_b',
      role: 'Architecture Reviewer',
      status: 'completed',
      output: JSON.stringify({
        summary: 'Architecture review.',
        findings: [
          {
            severity: 'security',
            file: 'src/auth.mjs',
            issue: 'Missing authorization check',
            evidence: 'Admin path can be reached directly.',
            suggestion: 'Enforce policy check at entrypoint.',
          },
        ],
      }),
    },
  ]

  const reduced = reduceDelegationOutputs(agents)
  assert.equal(reduced.findings.length, 1)
  assert.equal(reduced.dedupeCount, 1)
  assert.equal(reduced.mergedSeverityConflicts, 1)
  assert.equal(reduced.findings[0].severity, 'security')
  assert.match(String(reduced.findings[0].evidence || ''), /Route lacks guard/)
  assert.match(String(reduced.findings[0].evidence || ''), /Admin path can be reached directly/)
})

test('reducer merges recommendations, staged changes, and scorecard outputs deterministically', () => {
  const agents = [
    {
      taskId: 'task_a',
      roleId: 'role_a',
      role: 'Planner A',
      status: 'completed',
      outputContractType: 'recommendations',
      output: JSON.stringify({
        summary: 'Plan A.',
        recommendations: [
          {
            title: 'Add policy gate',
            priority: 'medium',
            rationale: 'Protect the admin entrypoint.',
            file: 'src/auth.mjs',
          },
        ],
      }),
    },
    {
      taskId: 'task_b',
      roleId: 'role_b',
      role: 'Planner B',
      status: 'completed',
      outputContractType: 'recommendations',
      output: JSON.stringify({
        summary: 'Plan B.',
        recommendations: [
          {
            title: 'Add policy gate',
            priority: 'high',
            rationale: 'Enforce the guard before role checks.',
            file: 'src/auth.mjs',
          },
        ],
      }),
    },
    {
      taskId: 'task_c',
      roleId: 'role_c',
      role: 'Change Planner A',
      status: 'completed',
      outputContractType: 'staged_changes',
      output: JSON.stringify({
        summary: 'Change list A.',
        stagedChanges: [
          {
            filePath: 'src/auth.mjs',
            changeType: 'update',
            rationale: 'Add middleware hook.',
          },
        ],
      }),
    },
    {
      taskId: 'task_d',
      roleId: 'role_d',
      role: 'Change Planner B',
      status: 'completed',
      outputContractType: 'staged_changes',
      output: JSON.stringify({
        summary: 'Change list B.',
        stagedChanges: [
          {
            filePath: 'src/auth.mjs',
            changeType: 'update',
            rationale: 'Wire the guard into the route.',
          },
        ],
      }),
    },
    {
      taskId: 'task_e',
      roleId: 'role_e',
      role: 'Reviewer A',
      status: 'completed',
      outputContractType: 'scorecard',
      output: JSON.stringify({
        summary: 'Scorecard A.',
        scorecard: [
          {
            label: 'Authentication posture',
            score: 60,
            rationale: 'Missing entrypoint guard.',
          },
        ],
      }),
    },
    {
      taskId: 'task_f',
      roleId: 'role_f',
      role: 'Reviewer B',
      status: 'completed',
      outputContractType: 'scorecard',
      output: JSON.stringify({
        summary: 'Scorecard B.',
        scorecard: [
          {
            label: 'Authentication posture',
            score: 80,
            rationale: 'Good route structure once the guard lands.',
          },
        ],
      }),
    },
  ]

  const reduced = reduceDelegationOutputs(agents)
  assert.equal(reduced.parsedOk, true)
  assert.equal(reduced.recommendations.length, 1)
  assert.equal(reduced.recommendationDedupeCount, 1)
  assert.equal(reduced.recommendations[0].priority, 'high')
  assert.match(String(reduced.recommendations[0].rationale || ''), /Protect the admin entrypoint/)
  assert.match(String(reduced.recommendations[0].rationale || ''), /Enforce the guard before role checks/)

  assert.equal(reduced.stagedChanges.length, 1)
  assert.equal(reduced.stagedChangeDedupeCount, 1)
  assert.match(String(reduced.stagedChanges[0].rationale || ''), /Add middleware hook/)
  assert.match(String(reduced.stagedChanges[0].rationale || ''), /Wire the guard into the route/)

  assert.equal(reduced.scorecard.length, 1)
  assert.equal(reduced.scorecardDedupeCount, 1)
  assert.equal(reduced.scorecard[0].score, 70)
  assert.match(String(reduced.scorecard[0].rationale || ''), /Missing entrypoint guard/)
  assert.match(String(reduced.scorecard[0].rationale || ''), /Good route structure once the guard lands/)
})

