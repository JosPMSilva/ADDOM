import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DELEGATION_SELECTION_INTENTS,
  DELEGATION_TURN_INTENTS,
  resolveDelegationRequestText,
  resolveDelegationSelectionIntent,
  resolveDelegationTurnContext,
  resolveDelegationTurnIntent,
} from '../../src/main/chat/delegation-turn-intent.mjs'
import {
  buildDelegationSynthesisPrompt,
  buildMinimalDelegationSynthesisPrompt,
} from '../../src/main/chat/moa-prompts.mjs'

test('delegation intent preserves review-only and authorized-fix boundaries', () => {
  assert.equal(
    resolveDelegationTurnIntent('Run the security and architecture agents, then report their findings.'),
    DELEGATION_TURN_INTENTS.REVIEW_ONLY,
  )
  assert.equal(
    resolveDelegationTurnIntent('Run the reviewers and apply the fixes they identify.'),
    DELEGATION_TURN_INTENTS.EXECUTE_AUTHORIZED,
  )
  assert.equal(
    resolveDelegationTurnIntent('What would you fix in this implementation?'),
    DELEGATION_TURN_INTENTS.FOLLOW_ORIGINAL_REQUEST,
  )
  assert.equal(
    resolveDelegationTurnIntent('Review both storage options and tell me which database we should choose.'),
    DELEGATION_TURN_INTENTS.MATERIAL_DECISION,
  )
})

test('current-turn all-role language becomes an application-owned exact fanout intent', () => {
  for (const message of [
    'Run all configured agent roles.',
    'Run every available role at once.',
    'Run all 4 configured roles once in parallel.',
    'These are the agent roles. Run each one of them.',
    'Run each of the 4 agent roles shown.',
  ]) {
    assert.equal(
      resolveDelegationSelectionIntent(message),
      DELEGATION_SELECTION_INTENTS.ALL_CONFIGURED_ROLES,
      message,
    )
  }

  assert.equal(
    resolveDelegationSelectionIntent('Run four security reviews.'),
    DELEGATION_SELECTION_INTENTS.MODEL_ROUTED,
  )
})

test('an explicit retry carries the latest all-role selection intent across an old thread', () => {
  const context = resolveDelegationTurnContext({
    userMessage: 'Try that again now.',
    history: [{ role: 'user', content: 'Run every configured agent role.' }],
  })

  assert.equal(
    context.delegationSelectionIntent,
    DELEGATION_SELECTION_INTENTS.ALL_CONFIGURED_ROLES,
  )
  assert.equal(
    resolveDelegationTurnContext({
      userMessage: 'Review this file.',
      history: [{ role: 'user', content: 'Run every configured agent role.' }],
    }).delegationSelectionIntent,
    DELEGATION_SELECTION_INTENTS.MODEL_ROUTED,
  )
  assert.equal(
    resolveDelegationTurnContext({
      userMessage: 'Try that again now.',
      history: [
        { role: 'user', content: 'Run every configured agent role.' },
        { role: 'user', content: 'Review only the package metadata.' },
      ],
    }).delegationSelectionIntent,
    DELEGATION_SELECTION_INTENTS.MODEL_ROUTED,
  )
})

test('delegation request text carries the latest substantive request through a retry turn', () => {
  const prior = 'Use exactly the configured Docs Writer role once.'
  assert.equal(
    resolveDelegationRequestText('Try that again now.', {
      history: [{ role: 'user', content: prior }],
    }),
    prior,
  )
  assert.equal(
    resolveDelegationRequestText('Use the Security Reviewer role.', {
      history: [{ role: 'user', content: prior }],
    }),
    'Use the Security Reviewer role.',
  )
})

test('material-decision synthesis presents attributable options and asks the user to choose', () => {
  const prompt = buildDelegationSynthesisPrompt({
    status: 'completed',
    orchestratorIntent: DELEGATION_TURN_INTENTS.MATERIAL_DECISION,
    summary: { completed: 2, failed: 0 },
    agents: [{ taskId: 'task_1', role: 'Architecture Reviewer', status: 'completed', output: 'Choose SQLite.' }],
  })

  assert.match(prompt, /material decision/i)
  assert.match(prompt, /ask the user to choose/i)
  assert.doesNotMatch(prompt, /apply staged revisions/i)
})

test('the language-neutral fallback keeps unclassified material choices non-mutating', () => {
  const prompt = buildDelegationSynthesisPrompt({
    status: 'completed',
    orchestratorIntent: DELEGATION_TURN_INTENTS.FOLLOW_ORIGINAL_REQUEST,
    summary: { completed: 2, failed: 0 },
    agents: [],
  })

  assert.match(prompt, /material choice/i)
  assert.match(prompt, /ask the user before consequential action/i)
})

test('review-only synthesis forbids edits and asks before applying actionable findings', () => {
  const prompt = buildDelegationSynthesisPrompt({
    status: 'completed_with_errors',
    orchestratorIntent: DELEGATION_TURN_INTENTS.REVIEW_ONLY,
    summary: { completed: 1, failed: 1 },
    agents: [{
      taskId: 'task_1',
      role: 'Security Reviewer',
      status: 'completed',
      output: 'One issue was found.',
    }],
  })

  assert.match(prompt, /Do not edit files or apply staged revisions/i)
  assert.match(prompt, /ask the user before implementing/i)
  assert.match(prompt, /final answer must end with a direct question/i)
  assert.doesNotMatch(prompt, /apply accepted revisions/i)
})

test('authorized synthesis continues into fixes instead of stopping at child reports', () => {
  const prompt = buildMinimalDelegationSynthesisPrompt({
    status: 'completed',
    orchestratorIntent: DELEGATION_TURN_INTENTS.EXECUTE_AUTHORIZED,
    summary: { completed: 1, failed: 0 },
    agents: [{
      taskId: 'task_1',
      role: 'Reviewer',
      status: 'completed',
      reportMarkdown: 'A fix is needed.',
    }],
  })

  assert.match(prompt, /continue with the authorized implementation or fixes/i)
  assert.match(prompt, /verify the result/i)
})

test('100-agent synthesis remains bounded and groups evidence instead of copying every report', () => {
  const agents = Array.from({ length: 100 }, (_, index) => ({
    taskId: `task_${index + 1}`,
    role: `Reviewer ${index + 1}`,
    status: 'completed',
    output: `unique-report-${index + 1} ${'detail '.repeat(2_000)}`,
    reportMarkdown: `unique-report-${index + 1} ${'detail '.repeat(2_000)}`,
    outputContractType: 'findings',
  }))
  const prompt = buildDelegationSynthesisPrompt({
    status: 'completed',
    orchestratorIntent: DELEGATION_TURN_INTENTS.REVIEW_ONLY,
    summary: { completed: 100, failed: 0 },
    agents,
    parsedOk: false,
  })

  assert.ok(prompt.length < 70_000, `expected bounded prompt, got ${prompt.length} characters`)
  assert.match(prompt, /unique-report-1/)
  assert.doesNotMatch(prompt, /unique-report-100/)
  assert.match(prompt, /Do not enumerate every agent/i)
})
