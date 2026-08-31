import test from 'node:test'
import assert from 'node:assert/strict'

import { executeApprovedToolStep } from '../../src/main/chat/chat-stream-tool-execution.mjs'
import { rejectOpenAIAccountNativeToolForMode } from '../../src/main/api-clients/ai-provider-openai-account-turn-mode.mjs'

test('last-mile execution denies a project mutation in Thinking before invoking an executor', async () => {
  const outcome = await executeApprovedToolStep({
    tc: { name: 'write_file' },
    toolInput: { path: 'README.md', content: 'blocked' },
    mode: 'thinking',
  })

  assert.equal(outcome.isError, true)
  assert.match(outcome.result, /write_file is not allowed in thinking mode/i)
})

test('last-mile execution permits a research tool in Plan', async () => {
  let called = false
  const outcome = await executeApprovedToolStep({
    tc: { name: 'read_file' },
    toolInput: { path: 'README.md' },
    mode: 'plan',
    loop: { abortController: new AbortController(), cancelled: false },
    helpers: {
      executeTool: async () => {
        called = true
        return { result: 'read' }
      },
      executeProviderNativeToolCall: async () => null,
      isOpenAILocalRuntimeToolName: () => false,
      resolveToolWriteArtifactMeta: async () => null,
      isAbortError: () => false,
    },
  })

  assert.equal(called, true)
  assert.equal(outcome.isError, false)
  assert.equal(outcome.result, 'read')
})

test('account lifecycle guard resolves a Plan dynamic tool by its actual read capability', () => {
  let rejectedError = null
  const rejected = rejectOpenAIAccountNativeToolForMode({
    protocolMethod: 'item/started',
    itemType: 'dynamicToolCall',
    item: {
      type: 'dynamicToolCall',
      tool: 'read_file',
    },
    turnMode: 'plan',
    rejectTurn: (error) => {
      rejectedError = error
    },
  })

  assert.equal(rejected, false)
  assert.equal(rejectedError, null)
})
