import test from 'node:test'
import assert from 'node:assert/strict'

import {
  documentReadingCursorClass,
  resolveManagedPlanPrimaryAction,
} from '../../src/renderer/components/chat/document-companion-plan-review.mjs'
import {
  clampPlanReviewComposerHeight,
  createPlanReviewComposerDragSession,
  MAX_PLAN_REVIEW_COMPOSER_HEIGHT,
  MIN_PLAN_REVIEW_COMPOSER_HEIGHT,
} from '../../src/renderer/components/chat/document-companion-plan-review-resize.mjs'

test('managed plan review exposes exactly one lifecycle action', () => {
  assert.deepEqual(resolveManagedPlanPrimaryAction({
    lifecycle: 'ready_for_review', review: { pendingChanges: [] },
  }), { kind: 'implement', disabled: false })
  assert.deepEqual(resolveManagedPlanPrimaryAction({
    lifecycle: 'ready_for_review', review: { pendingChanges: [{ id: 'change_1' }] },
  }), { kind: 'submit_changes', disabled: false })
  assert.deepEqual(resolveManagedPlanPrimaryAction({
    lifecycle: 'revising', review: { pendingChanges: [{ id: 'change_1' }] },
  }), { kind: 'submit_changes', disabled: true })
  assert.deepEqual(resolveManagedPlanPrimaryAction({
    lifecycle: 'approved', review: { pendingChanges: [] },
  }), { kind: 'implement', disabled: false })
  assert.deepEqual(resolveManagedPlanPrimaryAction({
    lifecycle: 'approved', review: { pendingChanges: [{ id: 'legacy_change' }] },
  }), { kind: 'submit_changes', disabled: false })
})

test('managed plans use an arrow at rest and expose the text cursor only while pressing', () => {
  assert.equal(documentReadingCursorClass('managed_plan'), 'cursor-default active:cursor-text')
  assert.equal(documentReadingCursorClass('project'), 'cursor-text')
})

test('plan review composer starts compact and grows to six visible lines at most', () => {
  assert.equal(MIN_PLAN_REVIEW_COMPOSER_HEIGHT, 48)
  assert.equal(MAX_PLAN_REVIEW_COMPOSER_HEIGHT, 112)
  assert.equal(clampPlanReviewComposerHeight(32), MIN_PLAN_REVIEW_COMPOSER_HEIGHT)
  assert.equal(clampPlanReviewComposerHeight(96.4), 96)
  assert.equal(clampPlanReviewComposerHeight(999), MAX_PLAN_REVIEW_COMPOSER_HEIGHT)
})

test('plan review composer resize previews and commits only a bounded height', () => {
  const listeners = new Map()
  const eventTarget = {
    addEventListener(type, listener) {
      listeners.set(type, listener)
    },
    removeEventListener(type) {
      listeners.delete(type)
    },
  }
  const captureTarget = {
    addEventListener() {},
    removeEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
  }
  const previews = []
  let committedHeight = null
  createPlanReviewComposerDragSession({
    eventTarget,
    captureTarget,
    pointerId: 7,
    startClientY: 100,
    startHeight: MIN_PLAN_REVIEW_COMPOSER_HEIGHT,
    onPreview: (height) => previews.push(height),
    onCommit: (height) => {
      committedHeight = height
    },
  })

  listeners.get('pointermove')({ pointerId: 7, clientY: 900 })
  listeners.get('pointerup')({ pointerId: 7, clientY: 900 })

  assert.deepEqual(previews, [MAX_PLAN_REVIEW_COMPOSER_HEIGHT, MAX_PLAN_REVIEW_COMPOSER_HEIGHT])
  assert.equal(committedHeight, MAX_PLAN_REVIEW_COMPOSER_HEIGHT)
  assert.equal(listeners.size, 0)
})
