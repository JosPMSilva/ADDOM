import test from 'node:test'
import assert from 'node:assert/strict'

function createMemoryLocalStorage() {
  const map = new Map()
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null
    },
    setItem(key, value) {
      map.set(String(key), String(value))
    },
    removeItem(key) {
      map.delete(String(key))
    },
    clear() {
      map.clear()
    },
  }
}

async function withChatStore(testFn) {
  const prevWindow = globalThis.window
  const prevLocalStorage = globalThis.localStorage
  const localStorage = createMemoryLocalStorage()
  const complianceCalls = []
  let injectedCrypto = false
  if (!globalThis.crypto) {
    globalThis.crypto = { randomUUID: () => `uuid_${Math.random().toString(36).slice(2, 10)}` }
    injectedCrypto = true
  }

  globalThis.window = {
    localStorage,
    addom: {
      chat: {
        logComplianceEvent: (payload) => {
          complianceCalls.push(payload)
        },
      },
    },
  }
  globalThis.localStorage = localStorage

  try {
    const mod = await import(`../../src/renderer/store/useChatStore.js?compliance_store=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
    const store = mod.default
    if (typeof store?.setState === 'function' && typeof store?.getInitialState === 'function') {
      store.setState(store.getInitialState(), true)
    }
    await testFn({ store, complianceCalls })
  } finally {
    globalThis.window = prevWindow
    globalThis.localStorage = prevLocalStorage
    if (injectedCrypto) delete globalThis.crypto
  }
}

test('useChatStore compliance notice logging records shown and skips when muted by session key', async () => {
  await withChatStore(async ({ store, complianceCalls }) => {
    const api = store.getState()
    api.setActiveThread('thread_test')
    const noticePayload = {
      type: 'warning',
      text: 'Compliance reminder: provider switch.',
      meta: {
        complianceNotice: true,
        sessionSuppressKey: 'compliance:provider-switch',
        noticeType: 'provider_switch',
        threadId: 'thread_test',
        toProviderId: 'openai',
        toModelId: 'gpt-5.2',
      },
    }

    api.pushNotice(noticePayload)
    assert.equal(store.getState().notices.length, 1)
    assert.equal(complianceCalls.length, 1)
    assert.equal(complianceCalls[0].noticeAction, 'shown')
    assert.equal(complianceCalls[0].noticeType, 'provider_switch')

    api.suppressNoticeForSession('compliance:provider-switch')
    assert.equal(store.getState().notices.length, 0)
    assert.equal(complianceCalls.length, 2)
    assert.equal(complianceCalls[1].noticeAction, 'skipped')

    api.pushNotice(noticePayload)
    assert.equal(store.getState().notices.length, 0)
    assert.equal(complianceCalls.length, 2)
  })
})

test('useChatStore dismissNotice logs skipped compliance action', async () => {
  await withChatStore(async ({ store, complianceCalls }) => {
    const api = store.getState()
    api.setActiveThread('thread_test')
    api.pushNotice({
      type: 'warning',
      text: 'Compliance reminder: repetitive dispatch.',
      meta: {
        complianceNotice: true,
        noticeType: 'repetitive_dispatch_pattern',
        threadId: 'thread_test',
      },
    })
    assert.equal(store.getState().notices.length, 1)
    const noticeId = String(store.getState().notices[0].id || '')
    assert.ok(noticeId)

    api.dismissNotice(noticeId)
    assert.equal(store.getState().notices.length, 0)
    assert.equal(complianceCalls.length, 2)
    assert.equal(complianceCalls[0].noticeAction, 'shown')
    assert.equal(complianceCalls[1].noticeAction, 'skipped')
  })
})

test('useChatStore pushNotice keeps only the latest capped notice window', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_test')
    for (let i = 0; i < 10; i += 1) {
      api.pushNotice({
        type: 'info',
        text: `Notice ${i}`,
        meta: { threadId: 'thread_test' },
      })
    }

    const notices = store.getState().notices
    assert.equal(notices.length, 8)
    assert.deepEqual(
      notices.map((notice) => notice.text),
      ['Notice 2', 'Notice 3', 'Notice 4', 'Notice 5', 'Notice 6', 'Notice 7', 'Notice 8', 'Notice 9'],
    )
  })
})
