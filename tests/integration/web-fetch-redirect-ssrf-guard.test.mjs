import test from 'node:test'
import assert from 'node:assert/strict'
import dns from 'node:dns/promises'

import { fetchPage } from '../../src/main/tools/web-fetch-tool.mjs'
import { DEFAULT_MAX_RESPONSE_BODY_BYTES } from '../../src/main/utils/ssrf-guard.mjs'

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

test('fetchPage blocks redirect chains that resolve to private addresses', async () => {
  let fetchCalls = 0
  await withPatchedNetwork({
    lookup: async (hostname) => {
      if (hostname === 'safe.example') return [{ address: '93.184.216.34', family: 4 }]
      if (hostname === 'bad.internal') return [{ address: '127.0.0.1', family: 4 }]
      throw new Error(`Unexpected hostname: ${hostname}`)
    },
    fetchImpl: async (url, options = {}) => {
      fetchCalls += 1
      assert.equal(String(url), 'http://93.184.216.34/start')
      assert.equal(options.headers?.Host, 'safe.example')
      return new Response('', {
        status: 302,
        headers: { location: 'http://bad.internal/private' },
      })
    },
  }, async () => {
    await assert.rejects(
      () => fetchPage('', { url: 'http://safe.example/start', reason: 'test redirect safety' }, { webFetchRequesterKey: 'redirect-private-hop' }),
      /Blocked:/,
    )
    assert.equal(fetchCalls, 1)
  })
})

test('fetchPage validates each redirect hop and returns final URL details', async () => {
  let fetchCalls = 0
  await withPatchedNetwork({
    lookup: async (hostname) => {
      if (hostname === 'safe.example') return [{ address: '93.184.216.34', family: 4 }]
      if (hostname === 'other.example') return [{ address: '93.184.216.35', family: 4 }]
      throw new Error(`Unexpected hostname: ${hostname}`)
    },
    fetchImpl: async (url, options = {}) => {
      fetchCalls += 1
      const target = String(url)
      if (target === 'http://93.184.216.34/start') {
        assert.equal(options.headers?.Host, 'safe.example')
        return new Response('', {
          status: 302,
          headers: { location: 'https://other.example/final' },
        })
      }
      if (target === 'https://93.184.216.35/final') {
        assert.equal(options.headers?.Host, 'other.example')
        return new Response('hello from final page', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        })
      }
      throw new Error(`Unexpected URL: ${target}`)
    },
  }, async () => {
    const output = await fetchPage('', { url: 'http://safe.example/start', reason: 'follow redirect' }, { webFetchRequesterKey: 'redirect-follow-final' })
    assert.match(output, /URL: https:\/\/other\.example\/final/)
    assert.match(output, /Redirects followed: 1/)
    assert.match(output, /hello from final page/)
    assert.equal(fetchCalls, 2)
  })
})

test('fetchPage blocks direct loopback literals before issuing fetch', async () => {
  let fetchCalled = false
  await withPatchedNetwork({
    lookup: async () => {
      throw new Error('dns lookup should not run for loopback literals')
    },
    fetchImpl: async () => {
      fetchCalled = true
      return new Response('unexpected', { status: 200, headers: { 'content-type': 'text/plain' } })
    },
  }, async () => {
    await assert.rejects(
      () => fetchPage('', { url: 'http://127.0.0.1/local', reason: 'should block' }, { webFetchRequesterKey: 'direct-loopback-block' }),
      /Blocked:/,
    )
    assert.equal(fetchCalled, false)
  })
})

test('fetchPage blocks additional private, metadata, and IPv6 literal targets before issuing fetch', async () => {
  const blockedUrls = [
    'http://[::ffff:127.0.0.1]/mapped-loopback',
    'http://[::ffff:0:127.0.0.1]/translated-loopback',
    'http://[0:0:0:0:0:0:0:1]/expanded-loopback',
    'http://10.0.0.1/private-a',
    'http://172.16.0.1/private-b',
    'http://192.168.1.1/private-c',
    'http://169.254.169.254/aws-metadata',
    'http://100.100.100.200/alibaba-metadata',
    'http://[fd00::1]/ula',
  ]

  for (const url of blockedUrls) {
    let fetchCalled = false
    await withPatchedNetwork({
      lookup: async () => {
        throw new Error(`dns lookup should not run for blocked literal: ${url}`)
      },
      fetchImpl: async () => {
        fetchCalled = true
        return new Response('unexpected', { status: 200, headers: { 'content-type': 'text/plain' } })
      },
    }, async () => {
      await assert.rejects(
        () => fetchPage('', { url, reason: 'should block literal private address' }, { webFetchRequesterKey: `blocked-${url}` }),
        /Blocked:/,
      )
      assert.equal(fetchCalled, false, `fetch should not run for ${url}`)
    })
  }
})

test('fetchPage pins the validated IP used for the actual request to avoid DNS rebinding', async () => {
  let lookupCalls = 0
  await withPatchedNetwork({
    lookup: async (hostname) => {
      lookupCalls += 1
      if (hostname === 'safe.example') {
        return lookupCalls === 1
          ? [{ address: '93.184.216.34', family: 4 }]
          : [{ address: '127.0.0.1', family: 4 }]
      }
      throw new Error(`Unexpected hostname: ${hostname}`)
    },
    fetchImpl: async (url, options = {}) => {
      assert.equal(String(url), 'http://93.184.216.34/pinned')
      assert.equal(options.headers?.Host, 'safe.example')
      return new Response('pinned response', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    },
  }, async () => {
    const output = await fetchPage('', { url: 'http://safe.example/pinned', reason: 'pin rebinding target' }, { webFetchRequesterKey: 'dns-rebinding-pin' })
    assert.match(output, /pinned response/)
    assert.equal(lookupCalls, 1)
  })
})

test('fetchPage truncates oversized response bodies before full allocation', async () => {
  const largeBody = 'a'.repeat(DEFAULT_MAX_RESPONSE_BODY_BYTES + 1024)
  await withPatchedNetwork({
    lookup: async (hostname) => {
      if (hostname === 'safe.example') return [{ address: '93.184.216.34', family: 4 }]
      throw new Error(`Unexpected hostname: ${hostname}`)
    },
    fetchImpl: async () => new Response(largeBody, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    }),
  }, async () => {
    const output = await fetchPage('', { url: 'http://safe.example/large', reason: 'size limit' }, { webFetchRequesterKey: 'body-truncation-limit' })
    assert.match(output, /Response body truncated - exceeded 5242880 byte safety limit/i)
  })
})
