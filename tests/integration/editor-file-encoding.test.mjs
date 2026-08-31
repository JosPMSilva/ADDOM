import test from 'node:test'
import assert from 'node:assert/strict'

import {
  decodeTextFileBuffer,
  encodeTextFileContent,
} from '../../src/main/ipc-handlers/file-text-codec.mjs'

test('decodes full-integration-test-run.log as UTF-16 text instead of mojibake', () => {
  const sample = '\r\n> addom@1.0.0 test:integration:raw\r\n> node --test "tests/integration/*.test.mjs"\r\n'
  const buffer = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(sample, 'utf16le'),
  ])
  const decoded = decodeTextFileBuffer(buffer)

  assert.equal(decoded.encoding, 'utf16le')
  assert.match(decoded.content.slice(0, 80), /^\r?\n> addom@1\.0\.0 test:integration:raw/)
  assert.equal(decoded.content.slice(0, 80).includes('\u0000'), false)
})

test('UTF-16LE content round-trips with BOM preservation', () => {
  const sourceText = 'Line 1\r\nLine 2\r\n'
  const encoded = encodeTextFileContent(sourceText, 'utf16le')
  const decoded = decodeTextFileBuffer(encoded)

  assert.equal(encoded.subarray(0, 2).toString('hex'), 'fffe')
  assert.equal(decoded.encoding, 'utf16le')
  assert.equal(decoded.content, sourceText)
})

test('UTF-8 BOM content round-trips without mojibake', () => {
  const sourceText = 'Hello world\n'
  const encoded = encodeTextFileContent(sourceText, 'utf8-bom')
  const decoded = decodeTextFileBuffer(encoded)

  assert.equal(encoded.subarray(0, 3).toString('hex'), 'efbbbf')
  assert.equal(decoded.encoding, 'utf8-bom')
  assert.equal(decoded.content, sourceText)
})
