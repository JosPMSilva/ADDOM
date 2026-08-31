import test from 'node:test'
import assert from 'node:assert/strict'

import {
  appendOutput,
  formatFailureOutput,
  formatSuccessOutput,
} from '../../src/main/tools/command-tools-core.mjs'

test('appendOutput tracks truncation stats and tail preview metadata', () => {
  const state = { text: '', truncated: false }
  appendOutput(state, 'line-1\nline-2\n', 10)
  appendOutput(state, 'line-3\nline-4\n', 10)

  assert.equal(state.truncated, true)
  assert.equal(state.text.length, 10)
  assert.equal(state.maxChars, 10)
  assert.ok(Number(state.totalChars) > state.text.length)
  assert.ok(Number(state.newlineCount) >= 2)
  assert.match(String(state.tailPreview || ''), /line-4/)
})

test('formatSuccessOutput includes truncation summary with tail preview and custom max label', () => {
  const stdoutState = { text: '', truncated: false }
  const stderrState = { text: '', truncated: false }
  appendOutput(stdoutState, 'alpha\nbeta\ngamma\ndelta\n', 8)
  appendOutput(stdoutState, 'tail-a\ntail-b\n', 8)
  appendOutput(stderrState, '', 8)

  const output = formatSuccessOutput(stdoutState, stderrState)
  assert.match(output, /stdout:\n/)
  assert.match(output, /\[stdout truncated at 8 chars\]/)
  assert.match(output, /Hint: Command output was truncated to protect context usage\./)
  assert.match(output, /Truncation summary:/)
  assert.match(output, /stdout: captured 8 \/ \d+ chars/)
  assert.match(output, /tail preview/)
  assert.match(output, /tail-b/)
})

test('formatFailureOutput summarizes truncated stderr independently', () => {
  const stdoutState = { text: '', truncated: false }
  const stderrState = { text: '', truncated: false }
  appendOutput(stdoutState, 'ok\n', 100)
  appendOutput(stderrState, 'err-1\nerr-2\nerr-3\n', 6)
  appendOutput(stderrState, 'final-error-line\n', 6)

  const output = formatFailureOutput(stdoutState, stderrState)
  assert.match(output, /stdout:\nok/)
  assert.match(output, /stderr:\n/)
  assert.match(output, /\[stderr truncated at 6 chars\]/)
  assert.match(output, /Truncation summary:/)
  assert.match(output, /stderr: captured 6 \/ \d+ chars/)
  assert.match(output, /final-error-line/)
})
