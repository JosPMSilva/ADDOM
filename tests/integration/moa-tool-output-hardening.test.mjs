import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatDelegationText,
  formatDelegationToolOutput,
  applyDelegationEnvelopeTexts,
} from '../../src/main/moa/delegation-summary.mjs'
import {
  buildDelegationSynthesisPrompt,
  buildMinimalDelegationSynthesisPrompt,
  isCleanDelegationForMinimalSynthesis,
} from '../../src/main/chat/moa-prompts.mjs'
import { finalizeDelegationForSynthesis } from '../../src/main/chat/moa-synthesis-finalizer.mjs'

const SAMPLE_ENVELOPE = {
  status: 'completed',
  pattern: 'parallel',
  durationMs: 12_000,
  taskCount: 2,
  plannedTaskCount: 2,
  executedTaskCount: 2,
  usage: { totalTokens: 100, inputTokens: 80, outputTokens: 20, reasoningTokens: 5 },
  summary: {
    completed: 2,
    failed: 0,
    timeout: 0,
    stale: 0,
    aborted: 0,
    budgetExceeded: 0,
    rateLimited: 0,
    notFound: 0,
    missingApiKey: 0,
    stagedWrites: 0,
  },
  agents: [
    {
      taskId: 'task_1',
      role: 'Security Reviewer',
      roleId: 'role_sec',
      status: 'completed',
      output: 'Security Reviewer is ALIVE.',
    },
    {
      taskId: 'task_2',
      role: 'Docs Writer',
      roleId: 'role_docs',
      status: 'completed',
      output: 'Docs Writer is ALIVE.',
    },
  ],
  stagedChanges: [],
  errors: [],
}

const CLEAN_PARSED_ENVELOPE = {
  ...SAMPLE_ENVELOPE,
  agents: [
    {
      taskId: 'task_1',
      role: 'Security Reviewer',
      roleId: 'role_sec',
      status: 'completed',
      output: JSON.stringify({
        summary: 'Security Reviewer is ALIVE.',
        findings: [{ severity: 'info', file: 'a.ts', issue: 'ok', evidence: 'n/a', suggestion: 'keep' }],
      }),
    },
    {
      taskId: 'task_2',
      role: 'Docs Writer',
      roleId: 'role_docs',
      status: 'completed',
      output: JSON.stringify({
        summary: 'Docs Writer is ALIVE.',
        findings: [],
      }),
    },
  ],
}

test('formatDelegationToolOutput is compact and omits the legacy ledger markers', () => {
  const text = formatDelegationToolOutput(SAMPLE_ENVELOPE)
  assert.match(text, /<delegation\b/)
  assert.match(text, /state="completed"/)
  assert.match(text, /Security Reviewer/)
  assert.match(text, /Docs Writer/)
  assert.match(text, /ALIVE/)
  assert.doesNotMatch(text, /AGENT DELEGATION RESULTS/)
  assert.doesNotMatch(text, /Role ID:/)
  assert.doesNotMatch(text, /Token usage:/)
  assert.match(text, /short prose|Agents/i)
})

test('applyDelegationEnvelopeTexts keeps ledger as debugText and compact as text', () => {
  const envelope = applyDelegationEnvelopeTexts({ ...SAMPLE_ENVELOPE })
  assert.doesNotMatch(String(envelope.text || ''), /AGENT DELEGATION RESULTS/)
  assert.match(String(envelope.debugText || ''), /AGENT DELEGATION RESULTS/)
  assert.equal(envelope.text, formatDelegationToolOutput(envelope))
  assert.equal(envelope.debugText, formatDelegationText(envelope))
})

test('isCleanDelegationForMinimalSynthesis accepts all-completed no-writes envelopes', () => {
  assert.equal(isCleanDelegationForMinimalSynthesis({ ...CLEAN_PARSED_ENVELOPE, parsedOk: true }), true)
  assert.equal(isCleanDelegationForMinimalSynthesis({
    ...CLEAN_PARSED_ENVELOPE,
    status: 'completed_with_errors',
    summary: { ...CLEAN_PARSED_ENVELOPE.summary, failed: 1, completed: 1 },
    agents: [
      CLEAN_PARSED_ENVELOPE.agents[0],
      { ...CLEAN_PARSED_ENVELOPE.agents[1], status: 'failed', error: 'boom', output: '' },
    ],
  }), false)
  assert.equal(isCleanDelegationForMinimalSynthesis({
    ...CLEAN_PARSED_ENVELOPE,
    parsedOk: true,
    stagedChanges: [{ filePath: 'a.ts', revisionId: 'rev_1' }],
  }), false)
  assert.equal(isCleanDelegationForMinimalSynthesis({
    ...CLEAN_PARSED_ENVELOPE,
    parsedOk: false,
  }), false)
  assert.equal(isCleanDelegationForMinimalSynthesis({
    ...CLEAN_PARSED_ENVELOPE,
    parsedOk: true,
    agents: [
      CLEAN_PARSED_ENVELOPE.agents[0],
      {
        ...CLEAN_PARSED_ENVELOPE.agents[1],
        stagedChanges: [{ filePath: 'b.ts', revisionId: 'rev_2' }],
      },
    ],
  }), false)
})

test('clean-path synthesis uses minimal prompt with hard bans', () => {
  const finalized = finalizeDelegationForSynthesis({
    delegationEnvelope: { ...CLEAN_PARSED_ENVELOPE },
  })
  const prompt = String(finalized.pendingSynthesisPrompt || '')
  assert.equal(finalized.delegationEnvelope?.parsedOk, true)
  assert.match(prompt, /concise, complete user-facing answer/i)
  assert.doesNotMatch(prompt, /<delegation_summary_json>/)
  assert.match(prompt, /never paste|must be user-facing prose|tool payload markup/i)
  assert.match(prompt, /Role IDs|duration\/token|<delegation>/i)
})

test('dirty-path synthesis keeps structured packet and hard bans', () => {
  const prompt = buildDelegationSynthesisPrompt({
    ...CLEAN_PARSED_ENVELOPE,
    status: 'completed_with_errors',
    partialSuccess: true,
    agents: [
      CLEAN_PARSED_ENVELOPE.agents[0],
      { ...CLEAN_PARSED_ENVELOPE.agents[1], status: 'failed', error: 'No output', output: '' },
    ],
    summary: { ...CLEAN_PARSED_ENVELOPE.summary, completed: 1, failed: 1 },
  })
  assert.match(prompt, /<delegation_summary_json>/)
  assert.match(prompt, /never paste|must be user-facing prose|tool payload markup/i)
})

test('parse-fail completed delegation uses structured salvage via finalizer', () => {
  const finalized = finalizeDelegationForSynthesis({
    delegationEnvelope: { ...SAMPLE_ENVELOPE },
  })
  assert.equal(finalized.delegationEnvelope?.parsedOk, false)
  const prompt = String(finalized.pendingSynthesisPrompt || '')
  assert.match(prompt, /<delegation_summary_json>/)
  assert.doesNotMatch(prompt, /short paragraph summarizing outcomes/i)
})

test('minimal synthesis prompt helper stays free of ledger markers', () => {
  const prompt = buildMinimalDelegationSynthesisPrompt(CLEAN_PARSED_ENVELOPE)
  assert.doesNotMatch(prompt, /AGENT DELEGATION RESULTS/)
  assert.doesNotMatch(prompt, /Token usage:/)
})
