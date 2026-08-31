import test from 'node:test'
import assert from 'node:assert/strict'

import {
  settleProviderStreamWithCollaboration,
} from '../../src/main/chat/chat-stream-openai-collaboration-ingest.mjs'

test('provider stream settlement completes collaboration ingest before returning', async () => {
  const calls = []
  const result = await settleProviderStreamWithCollaboration(
    Promise.resolve({ text: 'done' }),
    {
      complete: async () => { calls.push('complete') },
      drain: async () => { calls.push('drain') },
    },
  )

  assert.deepEqual(result, { text: 'done' })
  assert.deepEqual(calls, ['complete'])
})

test('provider stream failure drains collaboration ingest and preserves both failures', async () => {
  const providerError = new Error('provider stream failed')
  const ingestError = new Error('collaboration persistence failed')

  await assert.rejects(
    settleProviderStreamWithCollaboration(
      Promise.reject(providerError),
      {
        complete: async () => assert.fail('complete must not run after provider failure'),
        drain: async () => { throw ingestError },
      },
    ),
    (error) => {
      assert.ok(error instanceof AggregateError)
      assert.deepEqual(error.errors, [providerError, ingestError])
      return true
    },
  )
})
