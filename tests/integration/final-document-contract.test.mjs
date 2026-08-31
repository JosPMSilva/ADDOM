import test from 'node:test'
import assert from 'node:assert/strict'

import { buildCanonicalFinalDocument } from '../../src/common/chat/final-document-contract.mjs'

test('buildCanonicalFinalDocument derives a stable fallback final-document part from message text', () => {
  const finalDocument = buildCanonicalFinalDocument({
    threadId: 'thread_1',
    turnId: 'turn_1',
    messageId: 'assistant_1',
    text: 'Final answer.',
  })

  assert.ok(finalDocument)
  assert.equal(finalDocument.messageId, 'assistant_1')
  assert.equal(finalDocument.text, 'Final answer.')
  assert.deepEqual(finalDocument.parts, [{
    threadId: 'thread_1',
    turnId: 'turn_1',
    messageId: 'assistant_1',
    partId: 'assistant_1:final-document:1',
    appendOrder: 1,
    sequence: 1,
    status: 'completed',
    ownership: 'final-document',
    kind: 'markdown',
    text: 'Final answer.',
  }])
})

test('buildCanonicalFinalDocument never coerces an unknown object into user-facing prose', () => {
  assert.equal(
    buildCanonicalFinalDocument({
      messageId: 'assistant_unknown_object',
      text: { unexpected: 'provider payload' },
      hasAuthoritativeMessageBinding: true,
    }),
    null,
  )
})

test('buildCanonicalFinalDocument sorts and deduplicates canonical final parts by append order', () => {
  const finalDocument = buildCanonicalFinalDocument({
    threadId: 'thread_2',
    turnId: 'turn_2',
    messageId: 'assistant_2',
    finalDocument: {
      parts: [
        { partId: 'assistant_2:final-document:2', appendOrder: 2, text: 'Second.\n' },
        { partId: 'assistant_2:final-document:1', appendOrder: 1, text: 'First.\n' },
        { partId: 'assistant_2:final-document:2-duplicate', appendOrder: 2, text: 'Duplicate second.\n' },
        { appendOrder: 3, text: 'Third.\n' },
      ],
    },
    hasAuthoritativeMessageBinding: true,
  })

  assert.ok(finalDocument)
  assert.equal(finalDocument.text, 'First.\nSecond.\nThird.\n')
  assert.deepEqual(finalDocument.parts.map((part) => ({
    partId: part.partId,
    appendOrder: part.appendOrder,
    sequence: part.sequence,
    status: part.status,
    text: part.text,
  })), [
    { partId: 'assistant_2:final-document:1', appendOrder: 1, sequence: 1, status: 'completed', text: 'First.\n' },
    { partId: 'assistant_2:final-document:2', appendOrder: 2, sequence: 2, status: 'completed', text: 'Second.\n' },
    { partId: 'assistant_2:final-document:3', appendOrder: 3, sequence: 3, status: 'completed', text: 'Third.\n' },
  ])
})

test('buildCanonicalFinalDocument ignores non-authoritative finalDocument payloads and falls back to full text', () => {
  const finalDocument = buildCanonicalFinalDocument({
    threadId: 'thread_legacy',
    turnId: 'turn_legacy',
    messageId: 'event:55',
    text: 'Legacy assistant text.',
    finalDocument: {
      parts: [
        { appendOrder: 1, partId: 'wrong-part', text: 'Injected part.' },
      ],
    },
    hasAuthoritativeMessageBinding: false,
  })

  assert.ok(finalDocument)
  assert.equal(finalDocument.text, 'Legacy assistant text.')
  assert.deepEqual(finalDocument.parts.map((part) => ({
    partId: part.partId,
    appendOrder: part.appendOrder,
    sequence: part.sequence,
    text: part.text,
  })), [
    {
      partId: 'event:55:final-document:1',
      appendOrder: 1,
      sequence: 1,
      text: 'Legacy assistant text.',
    },
  ])
})
