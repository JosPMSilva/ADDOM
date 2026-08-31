import test from 'node:test'
import assert from 'node:assert/strict'

import { __testAiProviderInternals } from '../../src/main/api-clients/ai-provider.mjs'

const { flattenUserContentPartsToString, normalizeMessagesForProvider, prepareOpenAIContinuationMessages } = __testAiProviderInternals

test('flattenUserContentPartsToString preserves text and converts attachments to readable placeholders', () => {
  const content = [
    { type: 'text', text: 'Please review this.' },
    { type: 'image', mediaType: 'image/png', filename: 'diagram.png' },
    { type: 'file', mediaType: 'application/pdf', filename: 'spec.pdf' },
  ]

  const flattened = flattenUserContentPartsToString(content)
  assert.match(flattened, /Please review this\./)
  assert.match(flattened, /Image attachment omitted/i)
  assert.match(flattened, /diagram\.png/i)
  assert.match(flattened, /File attachment omitted/i)
  assert.match(flattened, /spec\.pdf/i)
})

test('normalizeMessagesForProvider flattens only user content for groq', () => {
  const messages = [
    { role: 'system', content: 'You are ADDOM.' },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'hello' },
        { type: 'image', filename: 'img.png' },
      ],
    },
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'I can help.' }, { type: 'tool-call', toolCallId: 't1', toolName: 'read_file', input: {} }],
    },
  ]

  const normalized = normalizeMessagesForProvider('groq', messages, { modelId: 'openai/gpt-oss-120b' })
  assert.equal(typeof normalized[1].content, 'string')
  assert.match(String(normalized[1].content), /hello/i)
  assert.match(String(normalized[1].content), /Image attachment omitted/i)
  assert.ok(Array.isArray(normalized[2].content), 'assistant tool-call content should remain structured')
})

test('normalizeMessagesForProvider flattens multimodal user content for retained text-only groq models', () => {
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'describe this image' },
        { type: 'image', filename: 'img.png', mediaType: 'image/png' },
      ],
    },
  ]

  const normalized = normalizeMessagesForProvider('groq', messages, {
    modelId: 'qwen/qwen3.6-27b',
  })

  assert.equal(typeof normalized[0].content, 'string')
  assert.match(normalized[0].content, /describe this image/i)
  assert.match(normalized[0].content, /Image attachment omitted/i)
})

test('normalizeMessagesForProvider leaves non-groq providers unchanged', () => {
  const messages = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'hello' }, { type: 'image', filename: 'img.png' }],
    },
  ]
  const normalized = normalizeMessagesForProvider('openai', messages, { modelId: 'gpt-5.4' })
  assert.ok(Array.isArray(normalized[0].content))
})

test('normalizeMessagesForProvider preserves canonical assistant phase only for OpenAI models that support it', () => {
  const messages = [
    { role: 'assistant', content: 'Working...', phase: 'commentary' },
  ]

  const supported = normalizeMessagesForProvider('openai', messages, { modelId: 'gpt-5.4' })
  const websocketPreferred = normalizeMessagesForProvider('openai', messages, { modelId: 'gpt-5.4-2026-02-15' })
  const unsupported = normalizeMessagesForProvider('openai', messages, { modelId: 'gpt-4.1' })
  const otherProvider = normalizeMessagesForProvider('anthropic', messages, { modelId: 'claude-sonnet-4' })

  assert.equal(supported[0].phase, 'commentary')
  assert.equal(websocketPreferred[0].phase, 'commentary')
  assert.equal(Object.prototype.hasOwnProperty.call(unsupported[0], 'phase'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(otherProvider[0], 'phase'), false)
})

test('prepareOpenAIContinuationMessages keeps only tool outputs for previous-response tool continuation', () => {
  const reduced = prepareOpenAIContinuationMessages([
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'assistant', content: 'Previous turn complete.' },
    { role: 'user', content: 'Update the file and explain the diff.' },
    {
      role: 'tool',
      content: [{
        type: 'tool-result',
        toolCallId: 'call_apply_patch_1',
        toolName: 'apply_patch',
        output: { type: 'json', value: { status: 'success', output: 'Patch applied.' } },
      }],
    },
  ], {
    openai: {
      previousResponseId: 'resp_tool_round_1',
      store: true,
    },
  })

  assert.deepEqual(reduced.messages, [
    { role: 'system', content: 'You are ADDOM.' },
    {
      role: 'tool',
      content: [{
        type: 'tool-result',
        toolCallId: 'call_apply_patch_1',
        toolName: 'apply_patch',
        output: { type: 'json', value: { status: 'success', output: 'Patch applied.' } },
      }],
    },
  ])
  assert.equal(reduced.openAIContext.previousResponseId, 'resp_tool_round_1')
})

test('normalizeMessagesForProvider preserves canonical tool messages while sanitizing tool-result media payloads', () => {
  const normalized = normalizeMessagesForProvider('openai', [
    {
      role: 'tool',
      content: [{
        type: 'tool-result',
        toolCallId: 'call_browser_1',
        toolName: 'browser_action',
        output: {
          type: 'json',
          value: {
            content: [
              { type: 'text', text: 'Screenshot generated.' },
              { type: 'image', filename: 'capture.jpg', mediaType: 'image/jpeg', image: 'raw-image' },
            ],
            screenshotBase64: 'raw-screenshot',
            screenshotMediaType: 'image/jpeg',
            screenshotFilepath: 'captures/page.jpg',
          },
        },
      }],
    },
  ], { modelId: 'gpt-5.4' })

  assert.equal(normalized[0].role, 'tool')
  assert.equal(normalized[0].content[0].type, 'tool-result')
  assert.equal(normalized[0].content[0].toolName, 'browser_action')
  assert.deepEqual(normalized[0].content[0].output.value.content, [
    { type: 'text', text: 'Screenshot generated.' },
    { type: 'text', text: '[Tool result image omitted: capture.jpg]' },
  ])
  assert.equal(normalized[0].content[0].output.value.screenshotOmitted, true)
  assert.equal(normalized[0].content[0].output.value.screenshotPlaceholder, '[Tool result image omitted: captures/page.jpg]')
  assert.equal(Object.prototype.hasOwnProperty.call(normalized[0].content[0].output.value, 'screenshotBase64'), false)
})

test('normalizeMessagesForProvider routes Mistral through shared tool-id normalization and sequence repair', () => {
  const normalized = normalizeMessagesForProvider('mistral', [
    {
      role: 'assistant',
      content: [{ type: 'tool_call', call_id: 'call:1/with spaces', name: 'search', args: { q: 'docs' } }],
    },
    {
      role: 'tool',
      content: [{ type: 'tool_result', call_id: 'call:1/with spaces', name: 'search', result: { ok: true } }],
    },
    { role: 'user', content: 'continue' },
  ], { modelId: 'mistral-medium-2508' })

  assert.equal(normalized[0].content[0].toolCallId.length, 9)
  assert.match(normalized[0].content[0].toolCallId, /^[a-z0-9]+$/i)
  assert.equal(normalized[1].content[0].toolCallId, normalized[0].content[0].toolCallId)
  assert.deepEqual(normalized[1].content[0].output, { type: 'json', value: { ok: true } })
  assert.deepEqual(normalized[2], {
    role: 'assistant',
    content: [{ type: 'text', text: 'Done.' }],
  })
  assert.equal(normalized[3].role, 'user')
})
