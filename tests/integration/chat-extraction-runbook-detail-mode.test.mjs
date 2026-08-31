import test from 'node:test'
import assert from 'node:assert/strict'

import { buildRunbookErrorReason } from '../../src/main/chat/chat-error-hints.mjs'

function buildExtractionDiagnostics() {
  return {
    mode: 'execute',
    round: 0,
    conversion_attempted: true,
    converted_count: 0,
    skipped_count: 0,
    failed_count: 1,
    failure_reason_code: 'runtime_missing',
    failure_message_sanitized: 'Local MarkItDown runtime is not ready.',
    next_action_hint: 'Open setup instructions, install MarkItDown locally, then click "Re-check runtime".',
  }
}

test('buildRunbookErrorReason keeps extraction failures concise in basic mode', () => {
  const reason = buildRunbookErrorReason({
    err: null,
    providerId: 'groq',
    model: 'llama-3.3-70b',
    summarizedMessage: 'Local MarkItDown runtime is not ready.',
    providerDetail: 'Local MarkItDown runtime is not ready.',
    detailMode: 'basic',
    diagnostics: buildExtractionDiagnostics(),
  })

  assert.match(reason, /^Error:/i)
  assert.match(reason, /Why it failed: Local attachment text extraction fallback failed before model call\./i)
  assert.match(reason, /What to do next:/i)
  assert.doesNotMatch(reason, /Diagnostics:/i)
  assert.doesNotMatch(reason, /failure_reason_code:/i)
})

test('buildRunbookErrorReason includes extraction diagnostics in advanced mode', () => {
  const reason = buildRunbookErrorReason({
    err: null,
    providerId: 'groq',
    model: 'llama-3.3-70b',
    summarizedMessage: 'Local MarkItDown runtime is not ready.',
    providerDetail: 'Local MarkItDown runtime is not ready.',
    detailMode: 'advanced',
    diagnostics: buildExtractionDiagnostics(),
  })

  assert.match(reason, /^Error:/i)
  assert.match(reason, /Provider detail:/i)
  assert.match(reason, /Why it failed: Local attachment text extraction fallback failed before model call\./i)
  assert.match(reason, /Diagnostics:/i)
  assert.match(reason, /conversion_attempted: true/i)
  assert.match(reason, /failed_count: 1/i)
  assert.match(reason, /failure_reason_code: runtime_missing/i)
  assert.match(reason, /next_action_hint: Open setup instructions/i)
})
