import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import {
  convertFileWithMarkItDown,
  resolveMarkItDownConvertScriptPath,
} from '../../src/main/attachments/markitdown-runtime.mjs'

test('convertFileWithMarkItDown invokes python with packaged script path', async () => {
  let capturedExecutable = ''
  let capturedArgs = []
  let capturedTimeout = 0

  const inputPath = path.resolve('tests/fixtures/markitdown-sample.pdf')
  const scriptPath = resolveMarkItDownConvertScriptPath()
  const outcome = await convertFileWithMarkItDown({
    inputPath,
    executable: 'python',
    scriptPath,
    runCommandFn: async (executable, args, timeoutMs) => {
      capturedExecutable = executable
      capturedArgs = args
      capturedTimeout = timeoutMs
      return {
        ok: true,
        code: 0,
        timedOut: false,
        stdout: '{"ok": true, "text": "converted"}',
        stderr: '',
        errorMessage: '',
      }
    },
  })

  assert.equal(outcome.ok, true)
  assert.equal(outcome.reasonCode, 'ok')
  assert.equal(outcome.text, 'converted')
  assert.equal(capturedExecutable, 'python')
  assert.equal(capturedArgs[0], scriptPath)
  assert.equal(capturedArgs[1], inputPath)
  assert.equal(capturedArgs.includes('-c'), false)
  assert.equal(Number(capturedTimeout) > 0, true)
})

test('convertFileWithMarkItDown fails explicitly when script file is missing', async () => {
  let called = false
  const missingScriptPath = path.resolve('tests/fixtures/missing_markitdown_convert.py')
  const outcome = await convertFileWithMarkItDown({
    inputPath: path.resolve('tests/fixtures/markitdown-source.docx'),
    executable: 'python',
    scriptPath: missingScriptPath,
    runCommandFn: async () => {
      called = true
      return {
        ok: true,
        code: 0,
        timedOut: false,
        stdout: '{"ok": true, "text": "unexpected"}',
        stderr: '',
        errorMessage: '',
      }
    },
  })

  assert.equal(outcome.ok, false)
  assert.equal(outcome.reasonCode, 'runtime_script_missing')
  assert.match(String(outcome.message || ''), /script/i)
  assert.equal(called, false)
})
