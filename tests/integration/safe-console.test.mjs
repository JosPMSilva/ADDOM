import test from 'node:test'
import assert from 'node:assert/strict'

import { EventEmitter } from 'node:events'

import {
  installBrokenConsolePipeGuards,
  isBrokenConsolePipeError,
  safeDebug,
} from '../../src/main/utils/safe-console.mjs'

test('safeDebug suppresses broken console pipe errors', () => {
  const originalDebug = console.debug
  const pipeError = new Error('EPIPE: broken pipe, write')
  pipeError.code = 'EPIPE'

  console.debug = () => {
    throw pipeError
  }

  try {
    assert.doesNotThrow(() => safeDebug('[thread-session] run:start'))
  } finally {
    console.debug = originalDebug
  }
})

test('safeDebug rethrows non-pipe console failures', () => {
  const originalDebug = console.debug
  const unexpectedError = new Error('unexpected logger failure')
  unexpectedError.code = 'EOTHER'

  console.debug = () => {
    throw unexpectedError
  }

  try {
    assert.throws(() => safeDebug('[thread-session] run:start'), /unexpected logger failure/)
  } finally {
    console.debug = originalDebug
  }
})

test('isBrokenConsolePipeError recognizes common closed stream failures', () => {
  assert.equal(isBrokenConsolePipeError(Object.assign(new Error('broken pipe'), { code: 'EPIPE' })), true)
  assert.equal(isBrokenConsolePipeError(Object.assign(new Error('stream gone'), { code: 'ERR_STREAM_DESTROYED' })), true)
  assert.equal(isBrokenConsolePipeError(new Error('write after end')), true)
  assert.equal(isBrokenConsolePipeError(new Error('permission denied')), false)
})

test('broken console pipe guards are idempotent and suppress only closed-stream errors', () => {
  const stream = new EventEmitter()
  installBrokenConsolePipeGuards([stream, stream])
  installBrokenConsolePipeGuards([stream])

  assert.equal(stream.listenerCount('error'), 1)
  assert.doesNotThrow(() => stream.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' })))
  assert.throws(
    () => stream.emit('error', Object.assign(new Error('unexpected stream failure'), { code: 'EOTHER' })),
    /unexpected stream failure/,
  )
})
