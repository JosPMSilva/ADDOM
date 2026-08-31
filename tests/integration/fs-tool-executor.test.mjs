import test from 'node:test'
import assert from 'node:assert/strict'
import dns from 'node:dns/promises'

import { executeTool } from '../../src/main/tools/fs-tool-executor.mjs'

function withPatchedNetwork({ lookup, fetchImpl }, run) {
  const originalLookup = dns.lookup
  const originalFetch = global.fetch
  dns.lookup = lookup
  global.fetch = fetchImpl
  return Promise.resolve()
    .then(run)
    .finally(() => {
      dns.lookup = originalLookup
      global.fetch = originalFetch
    })
}

test('executeTool allows fetch_page without deprecated web-browsing gating', async () => {
  await withPatchedNetwork({
    lookup: async (hostname) => {
      if (hostname === 'safe.example') return [{ address: '93.184.216.34', family: 4 }]
      throw new Error(`Unexpected hostname: ${hostname}`)
    },
    fetchImpl: async () => new Response('hello from executor', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    }),
  }, async () => {
    const result = await executeTool(process.cwd(), 'fetch_page', {
      url: 'http://safe.example/test',
      reason: 'allow test',
    })

    assert.match(String(result?.result || ''), /hello from executor/i)
  })
})

test('executeTool wires browser_action into the real executor surface', async () => {
  const result = await executeTool(process.cwd(), 'browser_action', {
    action: 'close',
  }, {
    threadId: 'thread_browser_executor_test',
  })

  assert.equal(String(result?.result || ''), 'Browser closed.')
})
