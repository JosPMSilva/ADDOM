import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isCompactionCommandText,
  parseCompactionCommand,
} from '../../src/renderer/components/chat/compaction-command-parser.mjs'

test('detects compaction command prefixes', () => {
  assert.equal(isCompactionCommandText('/compact'), true)
  assert.equal(isCompactionCommandText('/compact :: continue'), true)
  assert.equal(isCompactionCommandText('/compact-threshold 180000 :: continue'), true)
  assert.equal(isCompactionCommandText('normal chat message'), false)
})

test('parses /compact as a command-only manual compaction request', () => {
  const parsed = parseCompactionCommand('/compact')
  assert.equal(parsed?.ok, true)
  assert.equal(parsed?.prompt, '')
  assert.equal(parsed?.turnOptions?.openai?.forceManualCompaction, true)
  assert.equal(parsed?.turnOptions?.openai?.commandOnly, true)
})

test('parses /compact :: prompt as manual compaction plus forwarded prompt', () => {
  const parsed = parseCompactionCommand('/compact :: continue with the task')
  assert.equal(parsed?.ok, true)
  assert.equal(parsed?.prompt, 'continue with the task')
  assert.equal(parsed?.turnOptions?.openai?.forceManualCompaction, true)
  assert.equal(parsed?.turnOptions?.openai?.commandOnly, undefined)
})

test('parses /compact-threshold command with a token override', () => {
  const parsed = parseCompactionCommand('/compact-threshold 180000 :: continue with the task')
  assert.equal(parsed?.ok, true)
  assert.equal(parsed?.prompt, 'continue with the task')
  assert.equal(parsed?.turnOptions?.openai?.forceServerSideCompaction, true)
  assert.equal(parsed?.turnOptions?.openai?.serverSideCompactionThresholdTokens, 180000)
})

test('parses /compact-threshold for Anthropic as a provider-scoped context-management override', () => {
  const parsed = parseCompactionCommand('/compact-threshold 80000 :: continue with the task', {
    providerId: 'anthropic',
  })
  assert.equal(parsed?.ok, true)
  assert.equal(parsed?.prompt, 'continue with the task')
  assert.equal(parsed?.turnOptions?.anthropic?.forceContextManagementCompaction, true)
  assert.equal(parsed?.turnOptions?.anthropic?.contextManagementCompactionThresholdTokens, 80000)
  assert.equal(parsed?.turnOptions?.openai, undefined)
})

test('returns actionable errors for malformed threshold commands', () => {
  const missingSyntax = parseCompactionCommand('/compact-threshold')
  assert.equal(missingSyntax?.ok, false)
  assert.equal(missingSyntax?.error, 'invalid_syntax')

  const invalidThreshold = parseCompactionCommand('/compact-threshold abc :: continue')
  assert.equal(invalidThreshold?.ok, false)
  assert.equal(invalidThreshold?.error, 'invalid_threshold')
})
