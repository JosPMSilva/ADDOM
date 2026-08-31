import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ASSISTANT_PHASE_COMMENTARY,
  ASSISTANT_PHASE_FINAL_ANSWER,
  ASSISTANT_PHASE_UNSPECIFIED,
  ASSISTANT_STREAM_PHASE_CONTRACT,
  normalizeAssistantPhase,
} from '../../src/common/chat/assistant-phase.mjs'

test('normalizeAssistantPhase canonicalizes commentary and final-answer aliases', () => {
  assert.equal(normalizeAssistantPhase('commentary'), ASSISTANT_PHASE_COMMENTARY)
  assert.equal(normalizeAssistantPhase('assistant_commentary'), ASSISTANT_PHASE_COMMENTARY)
  assert.equal(normalizeAssistantPhase('assistant-commentary'), ASSISTANT_PHASE_COMMENTARY)
  assert.equal(normalizeAssistantPhase('assistant commentary'), ASSISTANT_PHASE_COMMENTARY)

  assert.equal(normalizeAssistantPhase('final_answer'), ASSISTANT_PHASE_FINAL_ANSWER)
  assert.equal(normalizeAssistantPhase('final-answer'), ASSISTANT_PHASE_FINAL_ANSWER)
  assert.equal(normalizeAssistantPhase('final answer'), ASSISTANT_PHASE_FINAL_ANSWER)
  assert.equal(normalizeAssistantPhase('assistant_final_answer'), ASSISTANT_PHASE_FINAL_ANSWER)
})

test('normalizeAssistantPhase leaves absent or unknown phase unclassified', () => {
  assert.equal(normalizeAssistantPhase(), ASSISTANT_PHASE_UNSPECIFIED)
  assert.equal(normalizeAssistantPhase(''), ASSISTANT_PHASE_UNSPECIFIED)
  assert.equal(normalizeAssistantPhase('unknown'), ASSISTANT_PHASE_UNSPECIFIED)
})

test('assistant stream phase contract documents commentary, final answer, and absent handling', () => {
  assert.deepEqual(ASSISTANT_STREAM_PHASE_CONTRACT[ASSISTANT_PHASE_COMMENTARY], {
    owner: 'execution_stream',
    meaning: 'Mid-turn assistant commentary or progress update.',
  })
  assert.deepEqual(ASSISTANT_STREAM_PHASE_CONTRACT[ASSISTANT_PHASE_FINAL_ANSWER], {
    owner: 'assistant_message',
    meaning: 'User-facing final assistant answer.',
  })
  assert.deepEqual(ASSISTANT_STREAM_PHASE_CONTRACT.absent, {
    normalizedPhase: '',
    meaning: 'Phase metadata is absent or unknown.',
    handling: 'Treat as unclassified unless a shared stream policy promotes equivalent OpenAI activity to commentary.',
  })
})
