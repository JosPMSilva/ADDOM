import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTimelineAutoScrollSignal,
  resolveTimelineGrowthFollowAction,
  resolveTimelineFollowState,
  resolveTimelineViewportResizeFollowAction,
} from '../../src/renderer/components/chat/use-chat-panel-bottom-anchor.mjs'

test('resolveTimelineFollowState opts out of follow mode when the user scrolls upward', () => {
  const next = resolveTimelineFollowState({
    previousScrollTop: 520,
    currentScrollTop: 460,
    distanceToBottom: 180,
  })

  assert.deepEqual(next, {
    nearBottom: false,
    showJumpToLatest: true,
  })
})

test('resolveTimelineFollowState ignores incidental upward movement near the bottom', () => {
  const next = resolveTimelineFollowState({
    previousScrollTop: 520,
    currentScrollTop: 516,
    distanceToBottom: 18,
  })

  assert.deepEqual(next, {
    nearBottom: true,
    showJumpToLatest: false,
  })
})

test('resolveTimelineFollowState stays in follow mode when still near the bottom', () => {
  const next = resolveTimelineFollowState({
    previousScrollTop: 520,
    currentScrollTop: 518,
    distanceToBottom: 18,
  })

  assert.deepEqual(next, {
    nearBottom: true,
    showJumpToLatest: false,
  })
})

test('resolveTimelineGrowthFollowAction follows content growth when already at the bottom', () => {
  const next = resolveTimelineGrowthFollowAction({
    wasNearBottom: true,
    previousScrollHeight: 1200,
    nextScrollHeight: 1340,
    distanceToBottom: 140,
  })

  assert.deepEqual(next, {
    shouldScroll: true,
    nearBottom: true,
    showJumpToLatest: false,
  })
})

test('resolveTimelineGrowthFollowAction preserves user scrollback during content growth', () => {
  const next = resolveTimelineGrowthFollowAction({
    wasNearBottom: false,
    previousScrollHeight: 1200,
    nextScrollHeight: 1340,
    distanceToBottom: 280,
  })

  assert.deepEqual(next, {
    shouldScroll: false,
    nearBottom: false,
    showJumpToLatest: true,
  })
})

test('resolveTimelineViewportResizeFollowAction follows a resized viewport only while opted in', () => {
  assert.deepEqual(resolveTimelineViewportResizeFollowAction({
    wasNearBottom: true,
    previousClientHeight: 620,
    nextClientHeight: 500,
  }), {
    shouldScroll: true,
  })

  assert.deepEqual(resolveTimelineViewportResizeFollowAction({
    wasNearBottom: false,
    previousClientHeight: 620,
    nextClientHeight: 500,
  }), {
    shouldScroll: false,
  })

  assert.deepEqual(resolveTimelineViewportResizeFollowAction({
    wasNearBottom: true,
    previousClientHeight: 500,
    nextClientHeight: 500,
  }), {
    shouldScroll: false,
  })
})

test('buildTimelineAutoScrollSignal changes when the live streaming message grows', () => {
  const before = buildTimelineAutoScrollSignal({
    timeline: [{ id: 'entry-1', kind: 'message' }],
    messages: [{ id: 'assistant-1', status: 'streaming', content: 'hello', reasoning: '' }],
    streamingId: 'assistant-1',
  })
  const after = buildTimelineAutoScrollSignal({
    timeline: [{ id: 'entry-1', kind: 'message' }],
    messages: [{ id: 'assistant-1', status: 'streaming', content: 'hello world', reasoning: '' }],
    streamingId: 'assistant-1',
  })

  assert.notEqual(before, after)
})

test('buildTimelineAutoScrollSignal stays stable across equivalent array instances', () => {
  const left = buildTimelineAutoScrollSignal({
    timeline: [{ id: 'entry-1', kind: 'message' }],
    messages: [{ id: 'assistant-1', status: 'streaming', content: 'hello', reasoning: 'step' }],
    streamingId: 'assistant-1',
    planActionBusy: false,
    webPreview: null,
  })
  const right = buildTimelineAutoScrollSignal({
    timeline: [{ id: 'entry-1', kind: 'message' }],
    messages: [{ id: 'assistant-1', status: 'streaming', content: 'hello', reasoning: 'step' }],
    streamingId: 'assistant-1',
    planActionBusy: false,
    webPreview: null,
  })

  assert.equal(left, right)
})
