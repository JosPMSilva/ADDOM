import test from 'node:test'
import assert from 'node:assert/strict'

import {
  extractOpenRouterReasoningFromRawChunk,
  extractTextFromOpenRouterReasoningDetails,
} from '../../src/main/api-clients/ai-provider-openrouter-reasoning.mjs'

test('extractTextFromOpenRouterReasoningDetails keeps summary and text, skips encrypted and redacted', () => {
  const text = extractTextFromOpenRouterReasoningDetails([
    {
      type: 'reasoning.summary',
      summary: 'Inspect the repo first.',
    },
    {
      type: 'reasoning.encrypted',
      data: 'eyJlbmNyeXB0ZWQiOiJ0cnVlIn0=',
    },
    {
      type: 'reasoning.text',
      text: ' Then apply a narrow patch.',
    },
    {
      type: 'reasoning.text',
      text: '[REDACTED]',
    },
  ])

  assert.equal(text, 'Inspect the repo first. Then apply a narrow patch.')
})

test('extractOpenRouterReasoningFromRawChunk reads delta.reasoning_details when plain reasoning fields are absent', () => {
  const delta = extractOpenRouterReasoningFromRawChunk({
    choices: [{
      delta: {
        reasoning_details: [{
          type: 'reasoning.text',
          text: 'Plan the tool calls.',
          format: 'openai-responses-v1',
        }],
      },
    }],
  })

  assert.equal(delta, 'Plan the tool calls.')
})

test('extractOpenRouterReasoningFromRawChunk skips details when reasoning_content is already present', () => {
  const delta = extractOpenRouterReasoningFromRawChunk({
    choices: [{
      delta: {
        reasoning_content: 'Already mapped by AI SDK.',
        reasoning_details: [{
          type: 'reasoning.text',
          text: 'Would duplicate if extracted.',
        }],
      },
    }],
  })

  assert.equal(delta, '')
})

test('extractOpenRouterReasoningFromRawChunk skips details when reasoning field is already present', () => {
  const delta = extractOpenRouterReasoningFromRawChunk({
    choices: [{
      delta: {
        reasoning: 'Already mapped by AI SDK.',
        reasoning_details: [{
          type: 'reasoning.text',
          text: 'Would duplicate if extracted.',
        }],
      },
    }],
  })

  assert.equal(delta, '')
})

test('extractOpenRouterReasoningFromRawChunk still reads details when reasoning is whitespace-only', () => {
  const delta = extractOpenRouterReasoningFromRawChunk({
    choices: [{
      delta: {
        reasoning: '   ',
        reasoning_details: [{
          type: 'reasoning.text',
          text: 'Visible after blank reasoning field.',
        }],
      },
    }],
  })

  assert.equal(delta, 'Visible after blank reasoning field.')
})

test('extractOpenRouterReasoningFromRawChunk invents no prose for encrypted-only details', () => {
  const delta = extractOpenRouterReasoningFromRawChunk({
    choices: [{
      delta: {
        reasoning_details: [{
          type: 'reasoning.encrypted',
          data: 'eyJlbmNyeXB0ZWQiOiJ0cnVlIn0=',
          format: 'openai-responses-v1',
        }],
      },
    }],
  })

  assert.equal(delta, '')
})
