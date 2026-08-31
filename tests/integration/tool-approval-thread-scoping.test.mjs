import test from 'node:test'
import assert from 'node:assert/strict'

async function withToolStore(testFn) {
  const prevWindow = globalThis.window
  const respondCalls = []
  globalThis.window = {
    addom: {
      tool: {
        respond: (...args) => {
          respondCalls.push(args)
        },
      },
    },
  }

  try {
    const mod = await import(`../../src/renderer/store/useToolStore.js?threadScope=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
    const store = mod.default
    if (typeof store?.setState === 'function' && typeof store?.getInitialState === 'function') {
      store.setState(store.getInitialState(), true)
    } else if (typeof store?.setState === 'function') {
      store.setState({ pendingByThreadId: {}, history: [] }, true)
    }
    return await testFn({ store, respondCalls, resolvePendingApprovalForThread: mod.resolvePendingApprovalForThread })
  } finally {
    globalThis.window = prevWindow
  }
}

function makeApproval(approvalId, threadId = '') {
  return {
    approvalId,
    threadId,
    responseChannel: `tool:approval-response:${approvalId}`,
    toolName: 'write_file',
    toolInput: { path: `src/${approvalId}.txt`, content: approvalId },
    meta: { label: 'Write File', risk: 'high' },
  }
}

test('useToolStore keeps thread-scoped approvals isolated', async () => {
  await withToolStore(async ({ store }) => {
    store.getState().setPending(makeApproval('approval_thread_a', 'thread_A'))
    store.getState().setPending(makeApproval('approval_thread_b', 'thread_B'))

    assert.equal(store.getState().getPendingForThread('thread_A')?.approvalId, 'approval_thread_a')
    assert.equal(store.getState().getPendingForThread('thread_B')?.approvalId, 'approval_thread_b')
    assert.equal(store.getState().getPendingForThread('thread_C'), null)
  })
})

test('useToolStore clears only the matching approval and preserves other threads', async () => {
  await withToolStore(async ({ store, respondCalls }) => {
    store.getState().setPending(makeApproval('approval_thread_a', 'thread_A'))
    store.getState().setPending(makeApproval('approval_thread_b', 'thread_B'))

    store.getState().approve('approval_thread_a')

    assert.equal(respondCalls.length, 1)
    assert.equal(respondCalls[0][0], 'approval_thread_a')
    assert.equal(store.getState().getPendingForThread('thread_A'), null)
    assert.equal(store.getState().getPendingForThread('thread_B')?.approvalId, 'approval_thread_b')

    store.getState().clearPending({ threadId: 'thread_B' })
    assert.equal(store.getState().getPendingForThread('thread_B'), null)
  })
})

test('useToolStore session-approves only the matching thread-scoped approval', async () => {
  await withToolStore(async ({ store, respondCalls }) => {
    store.getState().setPending({
      ...makeApproval('approval_thread_session_a', 'thread_A'),
      availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
    })
    store.getState().setPending(makeApproval('approval_thread_session_b', 'thread_B'))

    store.getState().approveForSession('approval_thread_session_a')

    assert.equal(respondCalls.length, 1)
    assert.equal(respondCalls[0][0], 'approval_thread_session_a')
    assert.equal(respondCalls[0][1], 'approved')
    assert.deepEqual(respondCalls[0][4], {
      remoteApproval: {
        decision: 'acceptForSession',
      },
    })
    assert.equal(store.getState().getPendingForThread('thread_A'), null)
    assert.equal(store.getState().getPendingForThread('thread_B')?.approvalId, 'approval_thread_session_b')
  })
})

test('resolvePendingApprovalForThread ignores legacy unscoped approvals and stays thread-scoped', async () => {
  await withToolStore(async ({ store, resolvePendingApprovalForThread }) => {
    store.getState().setPending(makeApproval('approval_thread_a', 'thread_A'))

    const pendingByThreadId = {
      ...store.getState().pendingByThreadId,
      '': makeApproval('approval_legacy'),
    }
    assert.equal(typeof resolvePendingApprovalForThread, 'function')
    assert.equal(resolvePendingApprovalForThread(pendingByThreadId, 'thread_A')?.approvalId, 'approval_thread_a')
    assert.equal(resolvePendingApprovalForThread(pendingByThreadId, 'thread_B'), null)
    assert.equal(resolvePendingApprovalForThread(pendingByThreadId, ''), null)
  })
})

test('useToolStore keeps approval visible and marks failure when renderer response dispatch is rejected', async () => {
  const prevWindow = globalThis.window
  globalThis.window = {
    addom: {
      tool: {
        respond: () => false,
      },
    },
  }

  try {
    const mod = await import(`../../src/renderer/store/useToolStore.js?approvalFailure=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
    const store = mod.default
    store.setState(store.getInitialState(), true)
    store.getState().setPending(makeApproval('approval_rejected', 'thread_rejected'))

    store.getState().approve('approval_rejected')

    assert.equal(store.getState().getPendingForThread('thread_rejected')?.approvalId, 'approval_rejected')
    assert.equal(store.getState().getApprovalAction('approval_rejected')?.status, 'failed')
    assert.match(store.getState().getApprovalAction('approval_rejected')?.message, /rejected/i)
  } finally {
    globalThis.window = prevWindow
  }
})
