import assert from 'node:assert/strict'
import test from 'node:test'

import { formatDelegationText } from '../../src/main/moa/delegation-summary.mjs'
import {
  DELEGATION_RETURN_BUDGETS,
  hasRevisionBackedStagedWrites,
  projectAgentReturnForOrchestrator,
} from '../../src/main/moa/delegation-return-projection.mjs'
import { buildDelegationSynthesisPrompt } from '../../src/main/chat/moa-prompts.mjs'
import { reduceDelegationOutputs } from '../../src/main/moa/delegation-reducer.mjs'

const BIG_OUTPUT = `${'x'.repeat(5_000)}`
const CONTRACT_OUTPUT = JSON.stringify({
  summary: 'Reviewed auth module',
  findings: [{
    severity: 'security',
    file: 'src/auth.ts',
    issue: 'Missing auth check',
    evidence: 'handler lacks guard',
    suggestion: 'Add auth middleware',
  }],
})

test('read-only completed agent projects contract, not full raw output', () => {
  const agent = {
    taskId: 'task_1',
    role: 'Reviewer',
    status: 'completed',
    output: CONTRACT_OUTPUT,
    outputContractType: 'findings',
    stagedChanges: [],
  }
  const projected = projectAgentReturnForOrchestrator(agent)
  assert.equal(projected.rich, false)
  assert.equal(projected.mode, 'contract')
  assert.match(projected.text, /Reviewed auth module/)
  assert.match(projected.text, /Missing auth check/)
  assert.equal(projected.text.includes(BIG_OUTPUT), false)
  assert.ok(projected.text.length < CONTRACT_OUTPUT.length + 200)
})

test('revision-backed writer gets staged inventory in projection', () => {
  const agent = {
    taskId: 'task_2',
    role: 'Builder',
    status: 'completed',
    output: CONTRACT_OUTPUT,
    outputContractType: 'findings',
    stagedChanges: [{
      filePath: 'src/auth.ts',
      revisionId: 'rev_01',
      addedLines: 4,
      removedLines: 1,
    }],
  }
  assert.equal(hasRevisionBackedStagedWrites(agent), true)
  const projected = projectAgentReturnForOrchestrator(agent)
  assert.equal(projected.rich, true)
  assert.match(projected.text, /Staged changes: 1/)
  assert.match(projected.text, /rev_01/)
})

test('reducer-declared staged without revisionId stays slim', () => {
  const agent = {
    taskId: 'task_3',
    role: 'Planner',
    status: 'completed',
    output: JSON.stringify({
      summary: 'Proposed write',
      stagedChanges: [{ filePath: 'a.ts', changeType: 'update', rationale: 'fix' }],
    }),
    outputContractType: 'staged_changes',
    stagedChanges: [],
  }
  const projected = projectAgentReturnForOrchestrator(agent)
  assert.equal(projected.rich, false)
  assert.doesNotMatch(projected.text, /revision /)
})

test('formatDelegationText uses projection and keeps agents[].output full on envelope', () => {
  const agents = [
    {
      taskId: 'task_a',
      role: 'Analyst',
      status: 'completed',
      output: CONTRACT_OUTPUT + BIG_OUTPUT,
      outputContractType: 'findings',
      stagedChanges: [],
    },
    {
      taskId: 'task_b',
      role: 'Writer',
      status: 'completed',
      output: CONTRACT_OUTPUT,
      outputContractType: 'findings',
      stagedChanges: [{
        filePath: 'src/new.ts',
        revisionId: 'rev_99',
        addedLines: 10,
        removedLines: 0,
      }],
    },
  ]
  const text = formatDelegationText({
    status: 'completed',
    summary: { completed: 2, failed: 0, stagedWrites: 1 },
    usage: { totalTokens: 10, inputTokens: 5, outputTokens: 5, reasoningTokens: 0 },
    agents,
  })
  assert.match(text, /Reviewed auth module/)
  assert.match(text, /rev_99/)
  assert.equal(text.includes(BIG_OUTPUT), false)
  assert.ok(agents[0].output.includes(BIG_OUTPUT))
  assert.ok(text.length < agents[0].output.length)
})

test('synthesis omits read-only bodies when reducer parsedOk', () => {
  const agents = [{
    taskId: 'task_a',
    role: 'Analyst',
    status: 'completed',
    output: CONTRACT_OUTPUT,
    outputContractType: 'findings',
    stagedChanges: [],
  }]
  const reducer = reduceDelegationOutputs(agents)
  const prompt = buildDelegationSynthesisPrompt({
    status: 'completed',
    parsedOk: true,
    summary: { completed: 1, failed: 0 },
    usage: {},
    agents,
    reducer,
    stagedChanges: [],
  })
  assert.match(prompt, /reducer packet first/i)
  assert.match(prompt, /omitted/i)
  assert.match(prompt, /"agentOutputMode": "omitted"/)
  const outputs = prompt.split('<agent_outputs>')[1]?.split('</agent_outputs>')[0] || ''
  assert.match(outputs, /omitted/i)
  assert.doesNotMatch(outputs, /"findings"/)
  assert.doesNotMatch(prompt, /inspect full agent outputs/i)
})

test('non-revision staged rows do not leak into tool text', () => {
  const text = formatDelegationText({
    status: 'completed',
    summary: { completed: 1, failed: 0, stagedWrites: 1 },
    usage: {},
    agents: [{
      taskId: 'task_noise',
      role: 'ReducerNoise',
      status: 'completed',
      output: CONTRACT_OUTPUT,
      outputContractType: 'findings',
      stagedChanges: [{
        filePath: 'src/noise.ts',
        revisionId: '',
        changeType: 'update',
        addedLines: 3,
        removedLines: 1,
      }],
    }],
  })
  assert.doesNotMatch(text, /src\/noise\.ts/)
  assert.doesNotMatch(text, /Staged changes:/)
})

test('soft and hard envelope budgets bound dual-surface tool text', () => {
  const fatContract = JSON.stringify({
    summary: 's'.repeat(2_000),
    findings: Array.from({ length: 20 }, (_, i) => ({
      severity: 'info',
      file: `f${i}.ts`,
      issue: 'i'.repeat(500),
    })),
  })
  const agents = Array.from({ length: 3 }, (_, i) => ({
    taskId: `task_${i}`,
    role: `Analyst${i}`,
    status: 'completed',
    output: fatContract,
    outputContractType: 'findings',
    stagedChanges: [],
  }))
  const text = formatDelegationText({
    status: 'completed',
    summary: { completed: 3, failed: 0 },
    usage: {},
    agents,
  })
  assert.ok(text.length <= DELEGATION_RETURN_BUDGETS.envelopeHardChars + 120)
  assert.ok(text.length <= DELEGATION_RETURN_BUDGETS.envelopeSoftCharsPerAgent * agents.length + 2_000)
  assert.ok(agents.every((agent) => agent.output.length > 5_000))
})

test('revision inventory includes change type and synthesis uses projection not raw dump', () => {
  const noiseField = `RAW_DUMP_MARKER_${'z'.repeat(4_000)}`
  const writerOutput = JSON.stringify({
    summary: 'Reviewed auth module',
    findings: [{
      severity: 'security',
      file: 'src/auth.ts',
      issue: 'Missing auth check',
      evidence: 'handler lacks guard',
      suggestion: 'Add auth middleware',
    }],
    unusedTranscript: noiseField,
  })
  const agents = [{
    taskId: 'task_w',
    role: 'Writer',
    status: 'completed',
    output: writerOutput,
    outputContractType: 'findings',
    stagedChanges: [{
      filePath: 'src/auth.ts',
      revisionId: 'rev_typed',
      changeType: 'create',
      addedLines: 8,
      removedLines: 0,
    }],
  }]
  const toolText = formatDelegationText({
    status: 'completed',
    summary: { completed: 1, failed: 0, stagedWrites: 1 },
    usage: {},
    agents,
  })
  assert.match(toolText, /\[create\]/)
  assert.match(toolText, /rev_typed/)
  assert.doesNotMatch(toolText, /RAW_DUMP_MARKER_/)

  const reducer = reduceDelegationOutputs(agents)
  assert.equal(reducer.parsedOk, true)
  const prompt = buildDelegationSynthesisPrompt({
    status: 'completed',
    summary: { completed: 1, failed: 0 },
    usage: {},
    agents,
    reducer,
    stagedChanges: agents[0].stagedChanges,
  })
  assert.match(prompt, /"agentOutputMode": "gated_excerpts"/)
  assert.match(prompt, /rev_typed/)
  assert.doesNotMatch(prompt, /RAW_DUMP_MARKER_/)
})

test('parse-fail salvage stays clipped and does not re-expand agents[].output', () => {
  const huge = `UNPARSED_${'q'.repeat(30_000)}`
  const agents = [{
    taskId: 'task_fail_parse',
    role: 'Broken',
    status: 'completed',
    output: huge,
    outputContractType: 'findings',
    stagedChanges: [],
  }]
  const projected = projectAgentReturnForOrchestrator(agents[0])
  assert.equal(projected.mode, 'clipped_output')
  assert.ok(projected.text.length <= DELEGATION_RETURN_BUDGETS.parseFailClipChars)

  const prompt = buildDelegationSynthesisPrompt({
    status: 'completed',
    summary: { completed: 1, failed: 0 },
    usage: {},
    agents,
    // Force salvage path regardless of reducer heuristics.
    reducer: { parsedOk: false },
    text: `FAT_ENVELOPE_${huge}`,
    stagedChanges: [],
  })
  assert.match(prompt, /"agentOutputMode": "raw_fallback"/)
  assert.doesNotMatch(prompt, /FAT_ENVELOPE_/)
  assert.ok(!prompt.includes(huge))
  assert.ok(prompt.includes('UNPARSED_'))
  const outputs = prompt.split('<agent_outputs>')[1]?.split('</agent_outputs>')[0] || ''
  assert.ok(outputs.length <= DELEGATION_RETURN_BUDGETS.synthesisRawFallbackChars + 80)
})
