import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createStreamWithTools,
  __resetCreateStreamWithToolsForTests,
} from '../../src/main/api-clients/ai-provider.mjs'

test.afterEach(() => {
  __resetCreateStreamWithToolsForTests()
})

test('generic provider streaming refuses Cursor until a contained delegated-leaf adapter exists', async () => {
  await assert.rejects(
    () => createStreamWithTools(
      'cursor',
      '',
      [{ role: 'user', content: 'ping' }],
      { model: 'cursor-grok-4.5-high-fast' },
      () => {},
      () => {},
    ),
    /unknown provider/i,
  )
})
