import test from 'node:test'
import assert from 'node:assert/strict'

import { bootstrapTurnHistory } from '../../src/main/chat/chat-turn-bootstrap.mjs'
import { MOA_ORCHESTRATOR_PROMPT } from '../../src/main/chat/moa-prompts.mjs'

test('bootstrapTurnHistory strips legacy MoA orchestrator prompt and emits prompt-composition telemetry', async () => {
  const sent = []
  const persisted = []
  const history = await bootstrapTurnHistory({
    history: [{
      role: 'system',
      content: `You are ADDOM.\n\n${MOA_ORCHESTRATOR_PROMPT}\n\n[MoA ROLE CATALOG]\nlegacy role data\n[MoA ROLE CATALOG END]`,
    }],
    mode: 'execute',
    modeSystemPrompt: 'You are ADDOM.',
    runtimeContextBlock: '[ADDOM Runtime Context]\nOS: Windows',
    providerId: 'openai',
    model: 'gpt-5.3-codex',
    userMessage: 'Investigate the bug',
    projectFolder: '',
    activeThreadId: 'thread-1',
    activeTurnId: 'turn-1',
    delegationAvailable: true,
    executionBriefPrompt: '[ADDOM EXECUTION BRIEF]\nEnabled tools: agent_catalog, delegate_tasks\n[ADDOM EXECUTION BRIEF END]',
    emitPromptComposition: true,
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
  })

  assert.equal(history.length, 1)
  assert.doesNotMatch(history[0].content, /\[MoA ORCHESTRATOR MODE\]/)
  assert.doesNotMatch(history[0].content, /\[MoA ROLE CATALOG\]/)
  const promptTelemetry = sent.find((entry) => entry.channel === 'chat:prompt-composition')
  assert.ok(promptTelemetry)
  assert.equal(promptTelemetry.payload.threadId, 'thread-1')
  assert.equal(promptTelemetry.payload.turnId, 'turn-1')
  assert.equal(promptTelemetry.payload.delegationAvailable, true)
  assert.equal(promptTelemetry.payload.moaControlPromptTokens, 0)
  assert.equal(promptTelemetry.payload.roleCatalogInjected, false)
  assert.ok(promptTelemetry.payload.systemPromptTokens > 0)
  const persistedTelemetry = persisted.find((entry) => entry.kind === 'prompt_composition')
  assert.ok(persistedTelemetry)
})

test('bootstrapTurnHistory does not emit prompt-composition telemetry when developer diagnostics are disabled', async () => {
  const sent = []
  const persisted = []

  await bootstrapTurnHistory({
    history: [{ role: 'system', content: 'You are ADDOM.' }],
    mode: 'execute',
    modeSystemPrompt: 'You are ADDOM.',
    runtimeContextBlock: '[ADDOM Runtime Context]\nOS: Windows',
    providerId: 'openai',
    model: 'gpt-5.3-codex',
    userMessage: 'Hey',
    projectFolder: '',
    activeThreadId: 'thread-2',
    activeTurnId: 'turn-2',
    delegationAvailable: false,
    executionBriefPrompt: '[ADDOM EXECUTION BRIEF]\nEnabled tools: read_file\n[ADDOM EXECUTION BRIEF END]',
    emitPromptComposition: false,
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
  })

  assert.equal(sent.some((entry) => entry.channel === 'chat:prompt-composition'), false)
  assert.equal(persisted.some((entry) => entry.kind === 'prompt_composition'), false)
})

test('bootstrapTurnHistory refreshes generated ADDOM system instructions for each turn', async () => {
  const history = await bootstrapTurnHistory({
    history: [{
      role: 'system',
      content: 'You are ADDOM.\n\n[ADDOM Internal Plan Direction Synthesis]\nSynthesis request ID: stale-request',
    }],
    mode: 'plan',
    modeSystemPrompt: 'You are ADDOM.\n\nPLAN MODE INSTRUCTIONS:\nPlan safely.\n\n[ADDOM Internal Plan Direction Synthesis]\nSynthesis request ID: current-request',
    runtimeContextBlock: '[ADDOM Runtime Context]\nOS: Windows',
    planModePrompt: 'PLAN MODE INSTRUCTIONS:\nPlan safely.',
    providerId: 'openai',
    model: 'gpt-5.6-codex',
    userMessage: '',
    projectFolder: '',
    activeThreadId: 'thread-plan',
    activeTurnId: 'turn-plan',
    delegationAvailable: false,
    executionBriefPrompt: '[ADDOM EXECUTION BRIEF]\nEnabled tools: plan_direction_finalize\n[ADDOM EXECUTION BRIEF END]',
  })

  assert.match(history[0].content, /Synthesis request ID: current-request/)
  assert.doesNotMatch(history[0].content, /Synthesis request ID: stale-request/)
})
