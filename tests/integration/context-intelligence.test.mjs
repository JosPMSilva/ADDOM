import test from 'node:test'
import assert from 'node:assert/strict'
import {
  __resetCreateStreamWithToolsForTests,
  __setCreateStreamWithToolsForTests,
} from '../../src/main/api-clients/ai-provider.mjs'
import { resolveModelContextLimit } from '../../src/main/api-clients/model-context-limits.mjs'
import {
  compactHistoryForContextWindow,
  estimateHistoryTokens,
} from '../../src/main/chat/context-compaction.mjs'

test.afterEach(() => {
  __resetCreateStreamWithToolsForTests()
})

test('resolveModelContextLimit returns exact metadata for known registry models', () => {
  const resolved = resolveModelContextLimit('openai', 'gpt-5.4')
  assert.equal(resolved.source, 'verified_fallback')
  assert.equal(resolved.provenance, 'verified_fallback')
  assert.equal(resolved.precision, 'verified_fallback')
  assert.ok(Number.isFinite(resolved.limitTokens))
  assert.ok(resolved.limitTokens > 0)
  assert.equal(resolved.limitTokens, 1_050_000)
  assert.equal(resolved.maxOutputTokens, 128_000)
})

test('resolveModelContextLimit treats removed ids as unknown instead of retaining migration metadata', () => {
  for (const [providerId, modelId] of [
    ['gemini', 'gemini-2.0-flash-001'],
    ['grok', 'grok-4-0709'],
  ]) {
    const resolved = resolveModelContextLimit(providerId, modelId)
    assert.equal(resolved.source, 'estimated')
    assert.equal(resolved.provenance, 'estimated')
    assert.equal(resolved.precision, 'estimated')
    assert.equal(resolved.limitTokens, 128_000)
    assert.equal(resolved.maxOutputTokens, null)
    assert.match(String(resolved.note || ''), /unknown custom model/i)
  }
})

test('resolveModelContextLimit falls back to estimated for unknown custom models', () => {
  const resolved = resolveModelContextLimit('openai', 'my-custom-model')
  assert.equal(resolved.source, 'estimated')
  assert.equal(resolved.provenance, 'estimated')
  assert.equal(resolved.precision, 'estimated')
  assert.ok(Number.isFinite(resolved.limitTokens))
  assert.ok(resolved.limitTokens >= 8_000)
})

test('resolveModelContextLimit derives family-prefix estimates from the registry instead of a hand-maintained table', () => {
  const resolved = resolveModelContextLimit('openai', 'gpt-5.4-preview-custom')

  assert.equal(resolved.source, 'estimated')
  assert.equal(resolved.provenance, 'estimated')
  assert.equal(resolved.precision, 'estimated')
  assert.equal(resolved.limitTokens, 1050000)
  assert.equal(resolved.maxOutputTokens, 128000)
  assert.match(String(resolved.note || ''), /generated catalog family prefix/i)
})

test('compactHistoryForContextWindow keeps short history unchanged', async () => {
  const history = [
    { role: 'system', content: 'You are ADDOM' },
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'hi' },
  ]
  const before = estimateHistoryTokens(history)
  const compacted = await compactHistoryForContextWindow(history, { modelLimit: 128_000 })
  assert.equal(compacted.compacted, false)
  assert.equal(compacted.estimatedBeforeTokens, before)
  assert.equal(compacted.history.length, history.length)
})

test('compactHistoryForContextWindow summarizes older segments when over threshold', async () => {
  const filler = 'A'.repeat(8_000)
  const history = [{ role: 'system', content: 'You are ADDOM' }]
  for (let i = 0; i < 24; i += 1) {
    history.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `${i} ${filler}` })
  }

  const compacted = await compactHistoryForContextWindow(history, { modelLimit: 32_000 })
  assert.equal(compacted.compacted, true)
  assert.ok(compacted.removedCount > 0)
  assert.ok(compacted.estimatedAfterTokens < compacted.estimatedBeforeTokens)
  assert.match(compacted.summary, /\[ADDOM Context Compaction/)
  assert.match(compacted.summary, /summary_method: fallback/)
  assert.match(compacted.summary, /payload_policy: stripped_history_v3/)
})

test('compactHistoryForContextWindow strips truncated and pruned tool payloads from the fallback summary source', async () => {
  const secretPayload = 'SECRET_TOOL_PAYLOAD_SHOULD_NOT_SURVIVE_COMPACTION'
  const history = [
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'user', content: `Investigate prompt pressure.\n${'alpha '.repeat(2_000)}` },
    {
      role: 'tool',
      content: [{
        type: 'tool-result',
        toolName: 'read_file',
        output: {
          type: 'text',
          value: [
            '[Tool result truncated for model context]',
            'tool: read_file',
            'provider: anthropic',
            'model: claude-sonnet-4-6',
            'budget_profile: anthropic_strict',
            'original_chars: 24000',
            'omitted_chars: 22000',
            'preview: head',
            'budget_chars: 2000',
            'full_output_persistence: enabled',
            '',
            secretPayload,
          ].join('\n'),
        },
      }],
    },
    { role: 'assistant', content: `I will preserve only the budget metadata.\n${'beta '.repeat(1_500)}` },
    {
      role: 'tool',
      content: [{
        type: 'tool-result',
        toolName: 'search_code',
        output: {
          type: 'text',
          value: [
            '[Old tool result cleared for prompt budget]',
            'tool: search_code',
            'status: success',
            'reason: old_low_value_tool_output',
            'original_chars: 18000',
            'output_sha256: abcdef1234567890',
          ].join('\n'),
        },
        toolResultHistoryPruned: {
          pruned: true,
          placeholderVersion: 2,
          reason: 'old_low_value_tool_output',
          retentionClass: 'low_value_history',
          originalChars: 18_000,
          outputSha256: 'abcdef1234567890',
        },
      }],
    },
  ]

  for (let index = 0; index < 22; index += 1) {
    history.push({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `${index}: ${'gamma '.repeat(1_800)}`,
    })
  }

  const compacted = await compactHistoryForContextWindow(history, { modelLimit: 32_000 })

  assert.equal(compacted.compacted, true)
  assert.equal(compacted.summaryMethod, 'fallback')
  assert.match(compacted.summary, /truncated_tool_results: 1/)
  assert.match(compacted.summary, /pruned_tool_results: 1/)
  assert.match(compacted.summary, /persisted_tool_results: 1/)
  assert.match(compacted.summary, /tool_result read_file success \[truncated_for_model_context\]/)
  assert.match(compacted.summary, /tool_result search_code success \[history_pruned\]/)
  assert.doesNotMatch(compacted.summary, /SECRET_TOOL_PAYLOAD_SHOULD_NOT_SURVIVE_COMPACTION/)
})

test('compactHistoryForContextWindow uses the empty tool surface and stripped transcript for llm compaction', async () => {
  const secretPayload = 'SECRET_LLM_COMPACTION_INPUT_SHOULD_NOT_SURVIVE'
  let capturedProviderId = ''
  let capturedApiKey = ''
  let capturedMessages = []
  let capturedOptions = null

  __setCreateStreamWithToolsForTests(async (providerId, apiKey, messages, options) => {
    capturedProviderId = providerId
    capturedApiKey = apiKey
    capturedMessages = Array.isArray(messages) ? messages : []
    capturedOptions = options
    return {
      text: '- Preserve the prior decision.\n- Continue from stripped tool metadata only.',
    }
  })

  const history = [
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'user', content: `Continue the investigation.\n${'delta '.repeat(2_000)}` },
    {
      role: 'tool',
      content: [{
        type: 'tool-result',
        toolName: 'read_file',
        output: {
          type: 'text',
          value: [
            '[Tool result truncated for model context]',
            'tool: read_file',
            'provider: openai',
            'model: gpt-5.2',
            'budget_profile: standard',
            'original_chars: 12000',
            'omitted_chars: 10000',
            'preview: head',
            'budget_chars: 2000',
            'full_output_persistence: enabled',
            '',
            secretPayload,
          ].join('\n'),
        },
      }],
    },
  ]
  for (let index = 0; index < 22; index += 1) {
    history.push({
      role: index % 2 === 0 ? 'assistant' : 'user',
      content: `${index}: ${'epsilon '.repeat(1_800)}`,
    })
  }

  const compacted = await compactHistoryForContextWindow(history, {
    modelLimit: 32_000,
    providerId: 'openai',
    model: 'gpt-5.2',
    apiKey: 'sk-test',
  })

  assert.equal(compacted.compacted, true)
  assert.equal(compacted.llmSummaryUsed, true)
  assert.equal(compacted.summaryMethod, 'llm')
  assert.equal(capturedProviderId, 'openai')
  assert.equal(capturedApiKey, 'sk-test')
  assert.deepEqual(capturedOptions?.tools, {})
  assert.equal(capturedOptions?.model, 'gpt-5.2')
  assert.equal(capturedMessages.length, 2)
  assert.match(String(capturedMessages[1]?.content || ''), /tool_result read_file success \[truncated_for_model_context\]/)
  assert.match(String(capturedMessages[1]?.content || ''), /persistence=enabled/)
  assert.doesNotMatch(String(capturedMessages[1]?.content || ''), /SECRET_LLM_COMPACTION_INPUT_SHOULD_NOT_SURVIVE/)
  assert.match(compacted.summary, /summary_method: llm/)
})
