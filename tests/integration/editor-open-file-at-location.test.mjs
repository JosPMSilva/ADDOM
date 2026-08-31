import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import useEditorStore from '../../src/renderer/store/useEditorStore.js'

const originalWindow = global.window

function resetEditorStore() {
  useEditorStore.getState().clearAllTabs()
  useEditorStore.setState({
    tree: [],
    expandedDirs: new Set(),
    treeLoading: false,
    treeProjectFolder: '',
    treeError: '',
  })
}

beforeEach(() => {
  resetEditorStore()
})

afterEach(() => {
  global.window = originalWindow
  resetEditorStore()
})

test('openFileAtLocation queues a pending reveal until the editor consumes it', async () => {
  let resolveRead = null
  global.window = {
    addom: {
      file: {
        readFile: () => new Promise((resolve) => {
          resolveRead = resolve
        }),
      },
    },
  }

  const openPromise = useEditorStore.getState().openFileAtLocation(
    'C:/Users/example/Documents/ADDOM',
    'src/renderer/components/chat/chat-rich-content-renderer.jsx',
    164,
    1,
  )

  assert.equal(useEditorStore.getState().tabs.length, 1)
  assert.deepEqual(useEditorStore.getState().pendingReveal, {
    filePath: 'src/renderer/components/chat/chat-rich-content-renderer.jsx',
    line: 164,
    column: 1,
    requestId: useEditorStore.getState().pendingReveal.requestId,
  })

  resolveRead({ ok: true, content: 'export default null\n' })
  const result = await openPromise
  assert.equal(result.ok, true)
  assert.equal(useEditorStore.getState().tabs[0].loading, false)

  const pendingReveal = useEditorStore.getState().consumePendingReveal('src/renderer/components/chat/chat-rich-content-renderer.jsx')
  assert.equal(pendingReveal?.line, 164)
  assert.equal(pendingReveal?.column, 1)
  assert.equal(useEditorStore.getState().pendingReveal, null)
})

test('openFileAtLocation reuses already-open tabs and updates the pending reveal', async () => {
  let readCount = 0
  global.window = {
    addom: {
      file: {
        readFile: async () => {
          readCount += 1
          return { ok: true, content: 'export default 1\n' }
        },
      },
    },
  }

  const firstOpen = await useEditorStore.getState().openFileAtLocation(
    'C:/Users/example/Documents/ADDOM',
    'src/main/index.mjs',
    810,
    1,
  )
  assert.equal(firstOpen.ok, true)
  assert.equal(readCount, 1)
  assert.equal(useEditorStore.getState().tabs.length, 1)

  const firstPendingReveal = useEditorStore.getState().consumePendingReveal('src/main/index.mjs')
  assert.equal(firstPendingReveal?.line, 810)

  const secondOpen = await useEditorStore.getState().openFileAtLocation(
    'C:/Users/example/Documents/ADDOM',
    './src/main/index.mjs',
    824,
    1,
  )
  assert.equal(secondOpen.ok, true)
  assert.equal(secondOpen.existing, true)
  assert.equal(readCount, 1)
  assert.equal(useEditorStore.getState().tabs.length, 1)

  const secondPendingReveal = useEditorStore.getState().consumePendingReveal('src/main/index.mjs')
  assert.equal(secondPendingReveal?.line, 824)
})
