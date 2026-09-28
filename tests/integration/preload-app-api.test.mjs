import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createAppApi } = require('../../src/preload/preload-misc-apis.cjs')

test('app preload exposes a narrow second-instance subscription', () => {
  const subscriptions = []
  const cleanup = () => {}
  const listener = () => {}
  const appApi = createAppApi({
    invokeVersioned: () => {},
    sendVersioned: () => {},
    subVersioned: (...args) => {
      subscriptions.push(args)
      return cleanup
    },
    requireNonEmptyString: (value) => value,
  })

  assert.equal(appApi.onSecondInstance(listener), cleanup)
  assert.deepEqual(subscriptions, [['app:second-instance', listener]])
})
