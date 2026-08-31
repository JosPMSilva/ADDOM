import test from 'node:test'
import assert from 'node:assert/strict'
import dns from 'node:dns/promises'

import { evaluateBrowserNavigationRequestPolicy } from '../../src/main/tools/browser-tool.mjs'

function withPatchedLookup(lookup, run) {
  const originalLookup = dns.lookup
  dns.lookup = lookup
  return Promise.resolve()
    .then(run)
    .finally(() => {
      dns.lookup = originalLookup
    })
}

test('browser navigation policy blocks public navigations that drift into private targets', async () => {
  await withPatchedLookup(async (hostname) => {
    if (hostname === 'safe.example') return [{ address: '93.184.216.34', family: 4 }]
    if (hostname === 'bad.internal') return [{ address: '127.0.0.1', family: 4 }]
    throw new Error(`Unexpected hostname: ${hostname}`)
  }, async () => {
    const policy = {
      targetClass: 'public_network',
      targetOrigin: 'https://safe.example',
      normalizedTargetOrigin: 'https://safe.example',
      enforceOrigin: false,
    }

    const allowed = await evaluateBrowserNavigationRequestPolicy(policy, 'https://safe.example/docs')
    assert.equal(allowed.allowed, true)

    const blocked = await evaluateBrowserNavigationRequestPolicy(policy, 'http://bad.internal/private')
    assert.equal(blocked.allowed, false)
    assert.equal(blocked.reason, 'navigation_target_class_changed')
    assert.match(String(blocked.message || ''), /public_network to private_network/i)
  })
})

test('browser navigation policy keeps private navigations bound to the approved origin', async () => {
  const policy = {
    targetClass: 'private_network',
    targetOrigin: 'http://127.0.0.1:3000',
    normalizedTargetOrigin: 'http://127.0.0.1:3000',
    enforceOrigin: true,
  }

  const sameOrigin = await evaluateBrowserNavigationRequestPolicy(policy, 'http://127.0.0.1:3000/dashboard')
  assert.equal(sameOrigin.allowed, true)

  const differentOrigin = await evaluateBrowserNavigationRequestPolicy(policy, 'http://127.0.0.1:4000/admin')
  assert.equal(differentOrigin.allowed, false)
  assert.equal(differentOrigin.reason, 'private_navigation_origin_changed')
  assert.match(String(differentOrigin.message || ''), /approved origin/i)
})

test('browser navigation policy blocks invalid or blocked navigation targets', async () => {
  const policy = {
    targetClass: 'public_network',
    targetOrigin: 'https://safe.example',
    normalizedTargetOrigin: 'https://safe.example',
    enforceOrigin: false,
  }

  const invalid = await evaluateBrowserNavigationRequestPolicy(policy, 'file:///etc/passwd')
  assert.equal(invalid.allowed, false)
  assert.equal(invalid.reason, 'invalid_navigation_target')

  const blocked = await evaluateBrowserNavigationRequestPolicy(policy, 'http://169.254.169.254/latest/meta-data')
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.reason, 'blocked_navigation_target')
})
