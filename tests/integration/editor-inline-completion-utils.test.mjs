import test from 'node:test'
import assert from 'node:assert/strict'
import {
  INLINE_COMPLETION_LIMITS,
  buildInlineCompletionMessages,
  isLocalProviderId,
  normalizeInlineCompletionPayload,
  sanitizeInlineCompletionText,
} from '../../src/main/ipc-handlers/editor-completion-utils.mjs'

test('normalizeInlineCompletionPayload enforces required fields and clamps context lengths', () => {
  const invalid = normalizeInlineCompletionPayload({
    providerId: '',
    model: 'gpt-5',
    prefix: 'const value = ',
  })
  assert.equal(invalid.ok, false)
  assert.equal(invalid.error, 'provider_required')

  const longPrefix = 'a'.repeat(INLINE_COMPLETION_LIMITS.MAX_PREFIX_CHARS + 250)
  const longSuffix = 'b'.repeat(INLINE_COMPLETION_LIMITS.MAX_SUFFIX_CHARS + 250)
  const normalized = normalizeInlineCompletionPayload({
    providerId: 'OpenAI',
    model: 'gpt-5',
    filePath: '/demo/file.ts',
    language: 'TypeScript',
    prefix: longPrefix,
    suffix: longSuffix,
    cursorLineNumber: 12,
    cursorColumn: 5,
  })
  assert.equal(normalized.ok, true)
  assert.equal(normalized.value.providerId, 'openai')
  assert.equal(normalized.value.model, 'gpt-5')
  assert.equal(normalized.value.language, 'typescript')
  assert.equal(normalized.value.prefix.length, INLINE_COMPLETION_LIMITS.MAX_PREFIX_CHARS)
  assert.equal(normalized.value.suffix.length, INLINE_COMPLETION_LIMITS.MAX_SUFFIX_CHARS)
  assert.equal(normalized.value.cursorLineNumber, 12)
  assert.equal(normalized.value.cursorColumn, 5)
})

test('buildInlineCompletionMessages encodes file/language/cursor and surrounding context', () => {
  const messages = buildInlineCompletionMessages({
    filePath: 'src/app.js',
    language: 'javascript',
    cursorLineNumber: 4,
    cursorColumn: 18,
    prefix: 'function add(a, b) {\n  return ',
    suffix: '\n}\n',
  })
  assert.equal(Array.isArray(messages), true)
  assert.equal(messages.length, 2)
  assert.equal(messages[0].role, 'system')
  assert.match(String(messages[1].content || ''), /File:\s+src\/app\.js/)
  assert.match(String(messages[1].content || ''), /Language:\s+javascript/)
  assert.match(String(messages[1].content || ''), /Cursor:\s+line 4, column 18/)
  assert.match(String(messages[1].content || ''), /<before_cursor>/)
  assert.match(String(messages[1].content || ''), /<after_cursor>/)
})

test('sanitizeInlineCompletionText removes fences and repeated context', () => {
  const raw = '```ts\nreturn total\n```\n'
  const sanitized = sanitizeInlineCompletionText(raw, {
    prefix: 'function sum(a, b) {\n  ',
    suffix: '\n}',
  })
  assert.equal(sanitized, 'return total')

  const repeated = sanitizeInlineCompletionText('al = 1', {
    prefix: 'const tot',
    suffix: '',
  })
  assert.equal(repeated, 'al = 1')
})

test('isLocalProviderId detects local providers only', () => {
  assert.equal(isLocalProviderId('ollama'), true)
  assert.equal(isLocalProviderId('lmstudio'), true)
  assert.equal(isLocalProviderId('openai'), false)
})
