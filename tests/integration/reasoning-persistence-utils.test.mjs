import test from 'node:test'
import assert from 'node:assert/strict'

import { resolvePersistedReasoningDetailFromState } from '../../src/renderer/components/chat/reasoning-persistence-utils.mjs'

test('resolvePersistedReasoningDetailFromState prefers explicit final text', () => {
  const detail = resolvePersistedReasoningDetailFromState({
    activeThreadId: 'thread-1',
    messages: [
      { id: 'msg-1', role: 'assistant', reasoning: 'streamed reasoning text' },
    ],
  }, {
    threadId: 'thread-1',
    messageId: 'msg-1',
    fullText: 'final reasoning summary',
    reasoningTokens: 82,
  })

  assert.equal(detail, 'final reasoning summary')
})

test('resolvePersistedReasoningDetailFromState falls back to already-streamed reasoning text', () => {
  const detail = resolvePersistedReasoningDetailFromState({
    activeThreadId: 'thread-1',
    messages: [
      { id: 'msg-1', role: 'assistant', reasoning: 'streamed reasoning text' },
    ],
  }, {
    threadId: 'thread-1',
    messageId: 'msg-1',
    fullText: '',
    reasoningTokens: 82,
  })

  assert.equal(detail, 'streamed reasoning text')
})

test('resolvePersistedReasoningDetailFromState does not synthesize token usage as reasoning text', () => {
  const detail = resolvePersistedReasoningDetailFromState({
    activeThreadId: 'thread-1',
    messages: [
      { id: 'msg-1', role: 'assistant', reasoning: '' },
    ],
  }, {
    threadId: 'thread-1',
    messageId: 'msg-1',
    fullText: '',
    reasoningTokens: 82,
  })

  assert.equal(detail, '')
})

test('resolvePersistedReasoningDetailFromState can resolve assistant reasoning from inactive thread state', () => {
  const detail = resolvePersistedReasoningDetailFromState({
    activeThreadId: 'thread-active',
    messages: [],
    threadStateById: {
      'thread-other': {
        messages: [
          { id: 'msg-2', role: 'assistant', reasoning: 'inactive-thread reasoning' },
        ],
      },
    },
  }, {
    threadId: 'thread-other',
    messageId: 'msg-2',
    fullText: '',
    reasoningTokens: 0,
  })

  assert.equal(detail, 'inactive-thread reasoning')
})

test('resolvePersistedReasoningDetailFromState falls back to live execution reasoning for the turn', () => {
  const detail = resolvePersistedReasoningDetailFromState({
    activeThreadId: 'thread-1',
    messages: [
      {
        id: 'msg-1',
        role: 'assistant',
        reasoning: '',
        streamMeta: { turnId: 'turn-1' },
      },
    ],
    liveExecution: {
      turnsById: {
        'turn-1': {
          turnId: 'turn-1',
          eventOrder: ['reasoning:1', 'reasoning:2'],
          eventsById: {
            'reasoning:1': {
              id: 'reasoning:1',
              kind: 'reasoning',
              archived: false,
              detail: 'Commentary step',
            },
            'reasoning:2': {
              id: 'reasoning:2',
              kind: 'reasoning',
              archived: false,
              detail: 'Follow-up step',
            },
          },
        },
      },
    },
  }, {
    threadId: 'thread-1',
    messageId: 'msg-1',
    turnId: 'turn-1',
    fullText: '',
    reasoningTokens: 82,
  })

  assert.equal(detail, 'Commentary step\n\n---\n\nFollow-up step')
})

test('resolvePersistedReasoningDetailFromState can recover live execution reasoning from an inactive thread when threadId is missing', () => {
  const detail = resolvePersistedReasoningDetailFromState({
    activeThreadId: 'thread-active',
    messages: [],
    threadStateById: {
      'thread-other': {
        messages: [
          {
            id: 'msg-other',
            role: 'assistant',
            reasoning: '',
            streamMeta: { turnId: 'turn-other' },
          },
        ],
        liveExecution: {
          turnsById: {
            'turn-other': {
              turnId: 'turn-other',
              eventOrder: ['reasoning:other'],
              eventsById: {
                'reasoning:other': {
                  id: 'reasoning:other',
                  kind: 'reasoning',
                  archived: false,
                  detail: 'Recovered from inactive thread live execution',
                },
              },
            },
          },
        },
      },
    },
  }, {
    threadId: '',
    messageId: 'msg-other',
    turnId: 'turn-other',
    fullText: '',
    reasoningTokens: 4,
  })

  assert.equal(detail, 'Recovered from inactive thread live execution')
})
