import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sendVersioned,
  onVersioned,
  handleVersioned,
  toVersionedChannel,
} from '../../src/main/ipc/ipc-versioning.mjs'

test('sendVersioned emits only one message on versioned channel', () => {
  const calls = []
  const sender = {
    send: (channel, payload) => calls.push({ channel, payload }),
  }
  sendVersioned(sender, 'chat:chunk', { text: 'x' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].channel, 'v1:chat:chunk')
  assert.deepEqual(calls[0].payload, { text: 'x' })
})

test('sendVersioned keeps already-versioned channel unchanged', () => {
  const calls = []
  const sender = {
    send: (channel, payload) => calls.push({ channel, payload }),
  }
  sendVersioned(sender, 'v1:chat:chunk', { text: 'x' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].channel, 'v1:chat:chunk')
})

test('onVersioned dual-registers receive channels and warns once for bare fallback', () => {
  const onCalls = []
  const ipcMain = {
    on: (channel, listener) => onCalls.push({ channel, listener }),
  }
  const received = []
  const listener = (...args) => {
    received.push(args)
    return 'ok'
  }
  const channel = 'chat:test-on-versioned'
  onVersioned(ipcMain, channel, listener)

  assert.equal(onCalls.length, 2)
  const versioned = onCalls.find((row) => row.channel === toVersionedChannel(channel))
  const legacy = onCalls.find((row) => row.channel === channel)
  assert.ok(versioned)
  assert.ok(legacy)

  const originalWarn = console.warn
  const warnings = []
  console.warn = (...args) => warnings.push(args.map((v) => String(v)).join(' '))
  try {
    assert.equal(versioned.listener('evt', { id: 1 }), 'ok')
    assert.equal(legacy.listener('evt', { id: 2 }), 'ok')
    assert.equal(legacy.listener('evt', { id: 3 }), 'ok')
  } finally {
    console.warn = originalWarn
  }

  assert.equal(received.length, 3)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /Legacy bare channel received/i)
  assert.match(warnings[0], new RegExp(channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('handleVersioned dual-registers handlers and warns once for bare fallback', async () => {
  const handleCalls = []
  const ipcMain = {
    handle: (channel, listener) => handleCalls.push({ channel, listener }),
  }
  const received = []
  const listener = async (...args) => {
    received.push(args)
    return { ok: true }
  }
  const channel = 'chat:test-handle-versioned'
  handleVersioned(ipcMain, channel, listener)

  assert.equal(handleCalls.length, 2)
  const versioned = handleCalls.find((row) => row.channel === toVersionedChannel(channel))
  const legacy = handleCalls.find((row) => row.channel === channel)
  assert.ok(versioned)
  assert.ok(legacy)

  const originalWarn = console.warn
  const warnings = []
  console.warn = (...args) => warnings.push(args.map((v) => String(v)).join(' '))
  try {
    const versionedResult = await versioned.listener('evt', { id: 1 })
    const legacyResult = await legacy.listener('evt', { id: 2 })
    const legacyResult2 = await legacy.listener('evt', { id: 3 })
    assert.deepEqual(versionedResult, { ok: true })
    assert.deepEqual(legacyResult, { ok: true })
    assert.deepEqual(legacyResult2, { ok: true })
  } finally {
    console.warn = originalWarn
  }

  assert.equal(received.length, 3)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /Legacy bare channel received/i)
  assert.match(warnings[0], new RegExp(channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})
