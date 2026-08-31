import test from 'node:test'
import assert from 'node:assert/strict'

import { buildToolRecoveryPrompt } from '../../src/main/chat/tool-recovery-prompt.mjs'

test('buildToolRecoveryPrompt instructs model to change command after failed round', () => {
  const prompt = buildToolRecoveryPrompt({
    roundResults: [
      {
        toolName: 'run_command',
        input: { command: 'npm run build' },
        result: 'Tool error: npm not found',
        isError: true,
      },
      {
        toolName: 'write_file',
        input: { path: 'src/app.js' },
        result: 'Tool call denied by user: write_file',
        decision: 'denied',
      },
    ],
    consecutiveErrorRounds: 1,
    maxConsecutiveErrorRounds: 3,
  })

  assert.match(prompt, /\[TOOL FAILURE RECOVERY\]/)
  assert.match(prompt, /Do not repeat the same tool call with identical arguments/)
  assert.match(prompt, /npm run build/)
  assert.match(prompt, /You have 2 recovery round/)
})

test('buildToolRecoveryPrompt handles empty results safely', () => {
  const prompt = buildToolRecoveryPrompt({})
  assert.match(prompt, /All tool calls in the previous round failed or were denied/)
  assert.match(prompt, /Rules for the next round/)
})

test('buildToolRecoveryPrompt emits class-specific patch recovery guidance', () => {
  const prompt = buildToolRecoveryPrompt({
    roundResults: [
      {
        toolName: 'apply_patch',
        result: 'Tool error: pre-execution lint [apply_patch_missing_hunk]: apply_patch patch text must start with "*** Begin Patch".',
        isError: true,
        failureClass: 'MALFORMED_PATCH_SYNTAX',
      },
    ],
    consecutiveErrorRounds: 1,
    maxConsecutiveErrorRounds: 3,
  })

  assert.match(prompt, /Patch recovery:/)
  assert.match(prompt, /if you retry apply_patch, send one valid patch string/i)
  assert.match(prompt, /use write_file/i)
})

test('buildToolRecoveryPrompt emits class-specific edit recovery guidance', () => {
  const prompt = buildToolRecoveryPrompt({
    roundResults: [
      {
        toolName: 'edit_file',
        result: 'Tool error: edit_file: old_text not found in src/app.js',
        isError: true,
        failureClass: 'EXACT_TEXT_NO_MATCH',
      },
    ],
    consecutiveErrorRounds: 1,
    maxConsecutiveErrorRounds: 3,
  })

  assert.match(prompt, /Edit recovery:/)
  assert.match(prompt, /read the current file/i)
})

test('buildToolRecoveryPrompt redirects long-running foreground commands toward terminal sessions', () => {
  const prompt = buildToolRecoveryPrompt({
    roundResults: [
      {
        toolName: 'run_command',
        input: { command: 'npm run dev' },
        result: 'Tool error: pre-execution lint [run_command_long_running_foreground]',
        isError: true,
        failureClass: 'COMMAND_POLICY_BLOCKED',
        lintCode: 'run_command_long_running_foreground',
      },
    ],
    consecutiveErrorRounds: 1,
    maxConsecutiveErrorRounds: 3,
  })

  assert.match(prompt, /Server\/watch recovery:/)
  assert.match(prompt, /Prefer terminal_session_open, terminal_session_write, and terminal_session_wait_for_output/i)
  assert.match(prompt, /background=true/i)
})
