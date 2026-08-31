import test from 'node:test'
import assert from 'node:assert/strict'

import { buildTurnInput } from '../../src/main/api-clients/ai-provider-openai-account-transcript.mjs'

test('OpenAI account turns preserve every current user screenshot as a full-resolution local image input', () => {
  const input = buildTurnInput([
    { role: 'assistant', content: 'What should I inspect?' },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Compare these screenshots.' },
        { type: 'image', localPath: 'C:\\attachment-cache\\first.png', mediaType: 'image/png' },
        { type: 'image', localPath: 'C:\\attachment-cache\\second.png', mediaType: 'image/png' },
      ],
    },
  ], { hasExistingThread: true })

  assert.deepEqual(input, [
    { type: 'text', text: 'Compare these screenshots.' },
    { type: 'localImage', path: 'C:\\attachment-cache\\first.png' },
    { type: 'localImage', path: 'C:\\attachment-cache\\second.png' },
  ])
})

test('OpenAI account turns retain inline images when no durable local path is available', () => {
  const input = buildTurnInput([
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Read this image.' },
        { type: 'image', image: 'aGVsbG8=', mediaType: 'image/png' },
      ],
    },
  ], { hasExistingThread: true })

  assert.deepEqual(input, [
    { type: 'text', text: 'Read this image.' },
    { type: 'image', url: 'data:image/png;base64,aGVsbG8=' },
  ])
})

test('OpenAI account initial turns append screenshots to the bootstrapped transcript', () => {
  const input = buildTurnInput([
    { role: 'system', content: 'Inspect the supplied UI.' },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What differs?' },
        { type: 'image', localPath: 'C:\\attachment-cache\\initial.png', mediaType: 'image/png' },
      ],
    },
  ])

  assert.equal(input[0]?.type, 'text')
  assert.match(input[0]?.text || '', /Conversation transcript:/)
  assert.match(input[0]?.text || '', /User: What differs\?/)
  assert.deepEqual(input.slice(1), [
    { type: 'localImage', path: 'C:\\attachment-cache\\initial.png' },
  ])
})

test('OpenAI account continuation turns prefer an explicit transcript-quiet lifecycle input', () => {
  const input = buildTurnInput([
    { role: 'user', content: 'Ask questions' },
    { role: 'assistant', content: 'Please answer the direction questions.' },
  ], {
    hasExistingThread: true,
    currentTurnInput: [{
      type: 'text',
      text: '[ADDOM Internal Plan Direction Synthesis]\nSynthesis request ID: request-1',
    }],
  })

  assert.deepEqual(input, [{
    type: 'text',
    text: '[ADDOM Internal Plan Direction Synthesis]\nSynthesis request ID: request-1',
  }])
})

test('OpenAI account first turns retain bootstrapped instructions around an explicit lifecycle input', () => {
  const input = buildTurnInput([
    { role: 'system', content: 'PLAN MODE INSTRUCTIONS: use plan tools.' },
    { role: 'user', content: 'Ask questions' },
  ], {
    currentTurnInput: [{
      type: 'text',
      text: '[ADDOM Internal Plan Direction Synthesis]\nSynthesis request ID: request-2',
    }],
  })

  assert.equal(input.length, 1)
  assert.match(input[0].text, /Higher-priority instructions:/)
  assert.match(input[0].text, /PLAN MODE INSTRUCTIONS: use plan tools\./)
  assert.match(input[0].text, /Current turn input:/)
  assert.match(input[0].text, /Synthesis request ID: request-2/)
})
