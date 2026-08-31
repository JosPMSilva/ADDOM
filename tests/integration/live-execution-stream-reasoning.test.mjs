import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let buildRenderItems = null
let ReasoningDisplayRow = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/live-execution-stream-reasoning.jsx')
  buildRenderItems = mod?.buildRenderItems || null
  ReasoningDisplayRow = mod?.ReasoningDisplayRow || null
})

test('reasoning rows render without decorative vertical rails or reserved rail padding', () => {
  assert.equal(typeof ReasoningDisplayRow, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ReasoningDisplayRow, {
      item: {
        event: { id: 'reasoning:test', detail: 'Inspecting the current implementation.' },
        reasoningDisplayKind: 'narrative_block',
        normalizedDetail: 'Inspecting the current implementation.',
      },
      isLiveTurn: true,
      showCursor: true,
    }),
  )

  assert.doesNotMatch(html, /w-\[2px\]/)
  assert.doesNotMatch(html, /pl-4/)
  assert.match(html, /Inspecting the current implementation\./)
})

test('collapsed completed reasoning renders without a decorative vertical rail', () => {
  assert.equal(typeof ReasoningDisplayRow, 'function')
  const detail = Array.from(
    { length: 5 },
    (_, index) => `Reasoning paragraph ${index + 1} contains enough detail to exercise the completed collapsed presentation without changing its disclosure behavior.`,
  ).join('\n\n')
  const html = renderToStaticMarkup(
    React.createElement(ReasoningDisplayRow, {
      item: {
        event: { id: 'reasoning:completed', detail },
        reasoningDisplayKind: 'narrative_block',
        normalizedDetail: detail,
      },
      isLiveTurn: false,
      showCursor: false,
    }),
  )

  assert.match(html, /data-chat-render="reasoning-collapsed"/)
  assert.doesNotMatch(html, /w-\[2px\]|pl-4/)
  assert.match(html, /Show reasoning/)
})

after(async () => {
  await closeViteSsrLoader()
})

test('buildRenderItems merges fragmented local OpenAI streamed reasoning into one narrative block', () => {
  assert.equal(typeof buildRenderItems, 'function')

  const items = buildRenderItems([
    {
      id: 'reasoning:1',
      kind: 'reasoning',
      status: 'done',
      detail: 'Checking repository status',
      reasoningBlock: true,
      reasoningChunks: ['Checking repository status'],
      messageId: 'assistant_local_reasoning',
      reasoningMeta: { mode: 'live', chunkCount: 3, model: 'gpt-5.4' },
      streamMeta: { providerId: 'openai', authMethod: 'api_key', transportMode: 'responses_stream' },
    },
    {
      id: 'reasoning:2',
      kind: 'reasoning',
      status: 'done',
      detail: '\n\nI need to figure out',
      reasoningBlock: true,
      reasoningChunks: ['\n\nI need to figure out'],
      messageId: 'assistant_local_reasoning',
      reasoningMeta: { mode: 'live', chunkCount: 3, model: 'gpt-5.4' },
      streamMeta: { providerId: 'openai', authMethod: 'api_key', transportMode: 'responses_stream' },
    },
    {
      id: 'reasoning:3',
      kind: 'reasoning',
      status: 'done',
      detail: '.',
      reasoningBlock: true,
      reasoningChunks: ['.'],
      messageId: 'assistant_local_reasoning',
      reasoningMeta: { mode: 'live', chunkCount: 3, model: 'gpt-5.4' },
      streamMeta: { providerId: 'openai', authMethod: 'api_key', transportMode: 'responses_stream' },
    },
  ])

  assert.equal(items.length, 1)
  assert.equal(items[0]?.type, 'reasoning_group')
  assert.match(String(items[0]?.normalizedDetail || ''), /Checking repository status/)
  assert.match(String(items[0]?.normalizedDetail || ''), /I need to figure out\./)
})

test('buildRenderItems keeps account-auth reasoning summaries on the existing non-local grouping path', () => {
  assert.equal(typeof buildRenderItems, 'function')

  const items = buildRenderItems([
    {
      id: 'reasoning:1',
      kind: 'reasoning',
      status: 'done',
      detail: 'Checking repository status',
      reasoningBlock: true,
      reasoningChunks: ['Checking repository status'],
      messageId: 'assistant_account_reasoning',
      reasoningMeta: { mode: 'summary_end', model: 'gpt-5.4' },
      streamMeta: { providerId: 'openai', authMethod: 'account', transportMode: 'codex_app_server_chatgpt' },
    },
    {
      id: 'reasoning:2',
      kind: 'reasoning',
      status: 'done',
      detail: '\n\nI need to figure out',
      reasoningBlock: true,
      reasoningChunks: ['\n\nI need to figure out'],
      messageId: 'assistant_account_reasoning',
      reasoningMeta: { mode: 'summary_end', model: 'gpt-5.4' },
      streamMeta: { providerId: 'openai', authMethod: 'account', transportMode: 'codex_app_server_chatgpt' },
    },
    {
      id: 'reasoning:3',
      kind: 'reasoning',
      status: 'done',
      detail: '.',
      reasoningBlock: true,
      reasoningChunks: ['.'],
      messageId: 'assistant_account_reasoning',
      reasoningMeta: { mode: 'summary_end', model: 'gpt-5.4' },
      streamMeta: { providerId: 'openai', authMethod: 'account', transportMode: 'codex_app_server_chatgpt' },
    },
  ])

  assert.equal(items.length, 3)
  assert.equal(items.every((item) => item?.reasoningDisplayKind === 'narrative_block'), true)
})

test('buildRenderItems does not apply the local streamed merge profile to execution commentary rows', () => {
  assert.equal(typeof buildRenderItems, 'function')

  const items = buildRenderItems([
    {
      id: 'reasoning:1',
      kind: 'reasoning',
      status: 'done',
      detail: 'Checking repository status',
      reasoningBlock: true,
      reasoningChunks: ['Checking repository status'],
      messageId: 'execution_commentary:turn_local_reasoning',
      reasoningMeta: { mode: 'live', chunkCount: 2, model: 'gpt-5.4' },
      streamMeta: { providerId: 'openai', authMethod: 'api_key', transportMode: 'responses_stream' },
    },
    {
      id: 'reasoning:2',
      kind: 'reasoning',
      status: 'done',
      detail: '\n\nI need to figure out',
      reasoningBlock: true,
      reasoningChunks: ['\n\nI need to figure out'],
      messageId: 'execution_commentary:turn_local_reasoning',
      reasoningMeta: { mode: 'live', chunkCount: 2, model: 'gpt-5.4' },
      streamMeta: { providerId: 'openai', authMethod: 'api_key', transportMode: 'responses_stream' },
    },
  ])

  assert.equal(items.length, 2)
})
