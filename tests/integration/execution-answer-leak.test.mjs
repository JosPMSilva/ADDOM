import test from 'node:test'
import assert from 'node:assert/strict'

import { shouldRouteTextDeltaToReasoning } from '../../src/main/api-clients/ai-provider-adapter-stream-helpers.mjs'
import { stripLeakedAssistantAnswerFromExecutionDetail } from '../../src/renderer/store/chat/execution-answer-leak.mjs'

test('shouldRouteTextDeltaToReasoning keeps OpenAI interleaved replay enabled', () => {
  const onReasoning = () => {}
  assert.equal(
    shouldRouteTextDeltaToReasoning(
      { providerNamespace: 'openaiCompatible', field: 'reasoning_content' },
      onReasoning,
      { providerId: 'openai' },
    ),
    true,
  )
})

test('shouldRouteTextDeltaToReasoning keeps capability-selected OpenRouter replay enabled', () => {
  const onReasoning = () => {}
  assert.equal(
    shouldRouteTextDeltaToReasoning(
      { providerNamespace: 'openaiCompatible', field: 'reasoning_content' },
      onReasoning,
      { providerId: 'openrouter' },
    ),
    true,
  )
})

test('stripLeakedAssistantAnswerFromExecutionDetail keeps thinking titles and drops smashed answer suffixes', () => {
  const detail = '**Implementing new services page**I\'ll add a new page under app/services.'
  const assistant = 'I\'ll add a new page under app/services.'
  assert.equal(
    stripLeakedAssistantAnswerFromExecutionDetail(detail, assistant),
    '**Implementing new services page**',
  )
})

test('stripLeakedAssistantAnswerFromExecutionDetail drops exact answer duplicates', () => {
  const answer = 'Creating a calculator.py file. Run tests with pytest.'
  assert.equal(stripLeakedAssistantAnswerFromExecutionDetail(answer, answer), '')
})

test('stripLeakedAssistantAnswerFromExecutionDetail strips partial answer prefixes from smashed titles', () => {
  const detail = '**Creating simple electrical calculator**Done — I created a simple Python electrical calculator at: V, I,'
  const assistant = [
    'Done — I created a simple Python electrical calculator at:',
    '',
    '`electrical_calculator.py`',
    '',
    'If you want, I can add a tiny test next.',
  ].join('\n')
  assert.equal(
    stripLeakedAssistantAnswerFromExecutionDetail(detail, assistant),
    '**Creating simple electrical calculator**',
  )
})

test('isReasoningSectionHeading recognizes bold-wrapped OpenRouter titles', async () => {
  const { isReasoningSectionHeading, shouldStartNewReasoningBlock, splitSmashedReasoningHeadingProse } = await import(
    '../../src/renderer/store/chat/live-execution-store-reasoning.mjs'
  )
  assert.equal(isReasoningSectionHeading('**Creating simple electrical calculator**'), true)
  assert.equal(
    shouldStartNewReasoningBlock(
      { kind: 'reasoning', detail: '**Creating simple electrical calculator**', startsWithHeading: true },
      'Done — I created a simple Python electrical calculator.',
    ),
    true,
  )
  assert.deepEqual(
    splitSmashedReasoningHeadingProse('**Creating simple electrical calculator**Done — I created a tool.'),
    {
      heading: '**Creating simple electrical calculator**',
      prose: 'Done — I created a tool.',
    },
  )
})
