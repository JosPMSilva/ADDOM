import assert from 'node:assert/strict'
import test from 'node:test'

import {
  hasDelegationPayload,
  stripDelegationPayloads,
} from '../../src/common/chat/strip-delegation-payload.mjs'

test('stripDelegationPayloads removes compact <delegation> XML and keeps surrounding prose', () => {
  const input = [
    'All three agents finished.',
    '',
    '<delegation state="completed">',
    '<summary>completed: 3 completed, 0 failed, 3 agent(s).</summary>',
    '<results>',
    '- Security Reviewer (completed): ALIVE',
    '</results>',
    '<directive>Reply in short prose only.</directive>',
    '</delegation>',
    '',
    'Open Agents for details.',
  ].join('\n')

  const stripped = stripDelegationPayloads(input)
  assert.match(stripped, /All three agents finished\./)
  assert.match(stripped, /Open Agents for details\./)
  assert.doesNotMatch(stripped, /<delegation\b/i)
  assert.doesNotMatch(stripped, /<summary>/i)
  assert.equal(hasDelegationPayload(input), true)
  assert.equal(hasDelegationPayload(stripped), false)
})

test('stripDelegationPayloads removes legacy AGENT DELEGATION RESULTS blocks', () => {
  const input = [
    'Before.',
    '=== AGENT DELEGATION RESULTS ===',
    'Delegation status: completed',
    'Role ID: role_sec',
    '=== END AGENT RESULTS ===',
    'After.',
  ].join('\n')

  const stripped = stripDelegationPayloads(input)
  assert.equal(stripped, 'Before.\n\nAfter.')
  assert.doesNotMatch(stripped, /AGENT DELEGATION RESULTS/)
})

test('stripDelegationPayloads collapses echo-only answers to empty', () => {
  const input = '<delegation state="completed"><summary>done</summary></delegation>'
  assert.equal(stripDelegationPayloads(input), '')
})

test('stripDelegationPayloads preserves delegation examples inside fenced code', () => {
  const input = [
    'Example:',
    '',
    '```xml',
    '<delegation state="completed">',
    '<summary>documented example</summary>',
    '</delegation>',
    '```',
  ].join('\n')

  assert.equal(stripDelegationPayloads(input), input)
  assert.equal(hasDelegationPayload(input), false)
})

test('stripDelegationPayloads suppresses an incomplete streamed delegation block', () => {
  const input = [
    'Visible prose.',
    '',
    '<delegation state="running">',
    '<summary>internal payload is still streaming',
  ].join('\n')

  assert.equal(stripDelegationPayloads(input), 'Visible prose.')
  assert.equal(hasDelegationPayload(input), true)
})
