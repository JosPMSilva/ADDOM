import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  createCursorAgentStreamParser,
  normalizeCursorAgentEvent,
} from '../../src/main/cursor-agent/cursor-agent-protocol.mjs'

test('Cursor protocol parses the supported sanitized stream fixture', () => {
  const fixture = fs.readFileSync(new URL('../fixtures/cursor-agent/stream-success.ndjson', import.meta.url), 'utf8')
  const parser = createCursorAgentStreamParser()
  const events = parser.push(`${fixture}\n`)
  parser.finish()

  assert.equal(events[0].kind, 'init')
  assert.equal(events[0].model, 'Composer 2.5')
  assert.equal(events.at(-1).kind, 'result')
  assert.equal(events.at(-1).status, 'success')
})

test('Cursor protocol ignores additive unknown events but rejects malformed required events', () => {
  assert.equal(normalizeCursorAgentEvent({ type: 'future_event', value: 1 }).kind, 'unknown')
  assert.throws(
    () => normalizeCursorAgentEvent({ type: 'system', subtype: 'init', cwd: 'C:\\repo' }),
    /session_id/i,
  )
})

test('Cursor protocol preserves streamed thinking deltas and completion', () => {
  assert.deepEqual(
    normalizeCursorAgentEvent({
      type: 'thinking',
      subtype: 'delta',
      text: 'Checking the command',
      session_id: 'session-1',
    }),
    {
      kind: 'thinking_delta',
      sessionId: 'session-1',
      text: 'Checking the command',
    },
  )
  assert.deepEqual(
    normalizeCursorAgentEvent({
      type: 'thinking',
      subtype: 'completed',
      session_id: 'session-1',
    }),
    {
      kind: 'thinking_completed',
      sessionId: 'session-1',
    },
  )
})

test('Cursor protocol skips stream-partial assistant duplicates per Cursor docs', () => {
  const parser = createCursorAgentStreamParser()
  const events = parser.push([
    JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Hel' }] },
      session_id: 'session-1',
      timestamp_ms: 100,
    }),
    JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
      session_id: 'session-1',
      timestamp_ms: 101,
    }),
    // Pre-tool buffered flush — duplicate; skip when model_call_id is present.
    JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
      session_id: 'session-1',
      timestamp_ms: 102,
      model_call_id: 'call-1',
    }),
    // Final end-of-turn flush — duplicate once partial timestamps were seen.
    JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
      session_id: 'session-1',
    }),
  ].join('\n') + '\n')
  parser.finish()

  assert.deepEqual(
    events.filter((entry) => entry.kind === 'assistant_delta').map((entry) => entry.text),
    ['Hel', 'Hello'],
  )
})

test('Cursor protocol keeps non-partial complete assistant segments without timestamp fields', () => {
  const parser = createCursorAgentStreamParser()
  const events = parser.push([
    JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'I will inspect the project.' }] },
      session_id: 'session-1',
    }),
    JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'The README identifies the project.' }] },
      session_id: 'session-1',
    }),
  ].join('\n') + '\n')
  parser.finish()

  assert.deepEqual(
    events.filter((entry) => entry.kind === 'assistant_delta').map((entry) => entry.text),
    ['I will inspect the project.', 'The README identifies the project.'],
  )
})
