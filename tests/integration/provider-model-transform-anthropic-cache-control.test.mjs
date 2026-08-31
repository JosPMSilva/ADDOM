import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveProviderModelTransform } from '../../src/main/api-clients/provider-model-transform.mjs'

const STABLE_SYSTEM_PROMPT = [
  'You are ADDOM.',
  '',
  '[ADDOM Runtime Context]',
  'os_family=windows',
  'shell_hint=powershell',
].join('\n')

const VOLATILE_EXECUTION_BRIEF = [
  '[ADDOM EXECUTION BRIEF]',
  'This block is authoritative for this turn.',
  'Enabled tools: read_file, edit_file',
  '[ADDOM EXECUTION BRIEF END]',
].join('\n')

const VOLATILE_MEMORY_CONTEXT = [
  'The following is relevant durable context from this project.',
  'Use it silently to inform your responses. Do not repeat or quote it back to the user.',
  '',
  '- [#42] Architecture: Keep the provider transform test-focused.',
].join('\n')

test('anthropic transform adds cache control only to the stable leading system/runtime block', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-6',
  })

  const normalized = transform.normalizeMessages({
    messages: [
      {
        role: 'system',
        content: [
          STABLE_SYSTEM_PROMPT,
          VOLATILE_EXECUTION_BRIEF,
          VOLATILE_MEMORY_CONTEXT,
        ].join('\n\n'),
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool_result',
            call_id: 'tool:1',
            name: 'read_file',
            result: { ok: true, path: 'src/main/api-clients/provider-model-transform.mjs' },
          },
        ],
      },
      {
        role: 'user',
        content: 'Confirm Anthropic cache metadata only lands on stable prompt content.',
      },
    ],
  })

  assert.equal(normalized.length, 4)
  assert.deepEqual(normalized[0], {
    role: 'system',
    content: STABLE_SYSTEM_PROMPT,
    providerOptions: {
      anthropic: {
        cacheControl: { type: 'ephemeral' },
      },
    },
  })
  assert.equal(normalized[1].role, 'system')
  assert.match(String(normalized[1].content || ''), /\[ADDOM EXECUTION BRIEF\]/)
  assert.match(String(normalized[1].content || ''), /relevant durable context/i)
  assert.equal(normalized[1].providerOptions, undefined)
  assert.equal(normalized[2].role, 'tool')
  assert.equal(normalized[2].providerOptions, undefined)
  assert.equal(normalized[2].content?.[0]?.providerOptions, undefined)
})

test('anthropic transform coalesces later system messages into the leading system block', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'anthropic',
    modelId: 'claude-haiku-4-5',
  })

  const normalized = transform.normalizeMessages({
    messages: [
      {
        role: 'system',
        content: [
          STABLE_SYSTEM_PROMPT,
          VOLATILE_EXECUTION_BRIEF,
        ].join('\n\n'),
      },
      { role: 'user', content: 'Run the check.' },
      { role: 'assistant', content: 'Checking.' },
      { role: 'system', content: '[ADDOM Runtime Notice]\nTool execution completed.' },
      { role: 'user', content: 'Now summarize.' },
    ],
  })

  assert.deepEqual(normalized.map((message) => message.role), [
    'system',
    'system',
    'system',
    'user',
    'assistant',
    'user',
  ])
  assert.equal(normalized[0].content, STABLE_SYSTEM_PROMPT)
  assert.deepEqual(normalized[0].providerOptions, {
    anthropic: {
      cacheControl: { type: 'ephemeral' },
    },
  })
  assert.match(String(normalized[1].content || ''), /\[ADDOM EXECUTION BRIEF\]/)
  assert.equal(normalized[1].providerOptions, undefined)
  assert.match(String(normalized[2].content || ''), /\[ADDOM Runtime Notice\]/)
  assert.equal(normalized[2].providerOptions, undefined)
})

test('non-anthropic transforms do not inject Anthropic cache control metadata', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'openai',
    modelId: 'gpt-4.1-mini',
  })

  const normalized = transform.normalizeMessages({
    messages: [
      {
        role: 'system',
        content: [
          STABLE_SYSTEM_PROMPT,
          VOLATILE_EXECUTION_BRIEF,
        ].join('\n\n'),
      },
      {
        role: 'user',
        content: 'Leave provider-local cache controls out of OpenAI requests.',
      },
    ],
  })

  assert.equal(normalized.length, 2)
  assert.equal(normalized[0].role, 'system')
  assert.equal(normalized[0].content, [STABLE_SYSTEM_PROMPT, VOLATILE_EXECUTION_BRIEF].join('\n\n'))
  assert.equal(normalized[0].providerOptions, undefined)
})
