import test from 'node:test'
import assert from 'node:assert/strict'
import { stripAnsiControlSequences } from '../../src/renderer/components/chat/ansi-output.mjs'

test('stripAnsiControlSequences removes CSI color sequences', () => {
  assert.equal(
    stripAnsiControlSequences('\u001b[32mSuccess!\u001b[39m Created app'),
    'Success! Created app',
  )
})

test('stripAnsiControlSequences removes OSC title sequences', () => {
  assert.equal(
    stripAnsiControlSequences('\u001b]0;window title\u0007visible output'),
    'visible output',
  )
})

test('stripAnsiControlSequences removes terminal cursor and line erase control sequences', () => {
  assert.equal(
    stripAnsiControlSequences('\u001b[?25lhello\u001b[K\u001b[?25h'),
    'hello',
  )
})

test('stripAnsiControlSequences normalizes misdecoded UTF-16LE log text', () => {
  assert.equal(
    stripAnsiControlSequences('\uFFFD\uFFFD\r\u0000\n\u0000>\u0000 \u0000a\u0000d\u0000d\u0000o\u0000m\u0000'),
    '\r\n> addom',
  )
})
