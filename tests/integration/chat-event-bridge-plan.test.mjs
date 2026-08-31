import test from 'node:test'
import assert from 'node:assert/strict'

import {
  handlePlanDocumentReady,
  handlePlanLifecycleEvent,
} from '../../src/renderer/components/chat/chat-event-bridge-plan.mjs'

function createStores(activeThreadId = '') {
  const openedPlans = []
  const readyPlans = []
  return {
    openedPlans,
    readyPlans,
    useChatStore: {
      getState: () => ({
        setPendingPlanDirection: () => {},
        setPlanDocumentReady: (plan) => readyPlans.push(plan),
      }),
    },
    useAppStore: {
      getState: () => ({
        activeThreadId,
        openDocumentCompanion: (plan) => openedPlans.push(plan),
      }),
    },
  }
}

test('a background thread plan is recorded but does not replace the active thread companion', () => {
  const stores = createStores('thread_active')
  const plan = {
    projectRoot: 'C:/workspace/project',
    threadId: 'thread_background',
    planId: 'plan_background',
  }

  handlePlanDocumentReady(plan, stores)

  assert.deepEqual(stores.readyPlans, [plan])
  assert.deepEqual(stores.openedPlans, [])
})

test('the active thread plan opens its own companion', () => {
  const stores = createStores('thread_active')
  const plan = {
    projectRoot: 'C:/workspace/project',
    threadId: 'thread_active',
    planId: 'plan_active',
  }

  handlePlanDocumentReady(plan, stores)

  assert.deepEqual(stores.openedPlans, [{
    sourceKind: 'managed_plan',
    projectRoot: 'C:/workspace/project',
    threadId: 'thread_active',
    planId: 'plan_active',
  }])
})

test('a background revising plan cannot replace the active thread companion', () => {
  const stores = createStores('thread_active')

  handlePlanLifecycleEvent({
    projectRoot: 'C:/workspace/project',
    threadId: 'thread_background',
    plan: {
      planId: 'plan_background',
      threadId: 'thread_background',
      lifecycle: 'revising',
      document: { path: 'Plan.md' },
    },
  }, stores)

  assert.deepEqual(stores.openedPlans, [])
})
