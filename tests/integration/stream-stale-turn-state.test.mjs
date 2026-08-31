import test from 'node:test'
import assert from 'node:assert/strict'

import { emitStreamFailure } from '../../src/main/chat/chat-stream-error-output.mjs'

test('emitStreamFailure emits a visible stale phase before completing stale/no-progress turns', () => {
  const sent = []
  const persisted = []
  const err = new Error('Provider stream made no progress.')
  err.code = 'provider_stream_stale'
  err.streamStale = true

  emitStreamFailure({
    outerErr: err,
    providerId: 'openai',
    model: 'gpt-test',
    errorDiagnostics: {},
    send: (channel, payload) => sent.push({ channel, payload }),
    sendTurnState: (state, payload) => sent.push({ channel: 'chat:turn-state', payload: { ...payload, state } }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
  })

  const states = sent
    .filter((row) => row.channel === 'chat:turn-state')
    .map((row) => row.payload.state)
  assert.deepEqual(states, ['stale', 'completed'])
  assert.equal(sent.some((row) => row.channel === 'chat:error'), true)
  assert.equal(persisted[0]?.kind, 'chat_error')
})

