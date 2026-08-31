import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveAuthoritativeCurrentReasoning } from '../../src/renderer/components/chat/chat-event-bridge-reasoning-route.mjs'

function readRepoSource(relativePath) {
  return fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', relativePath),
    'utf8',
  )
}

const bridgeSource = readRepoSource('src/renderer/components/ChatEventBridge.jsx')
const routeSource = readRepoSource('src/renderer/components/chat/chat-event-bridge-reasoning-route.mjs')

test('token usage metadata is not synthesized into a visible reasoning item', () => {
  assert.doesNotMatch(routeSource, /reasoning tokens:/i)
  assert.doesNotMatch(bridgeSource, /shouldRouteReasoningDetailToLiveExecution/)
})

test('text-backed reasoning summaries stay on the persisted reasoning activity path', () => {
  assert.doesNotMatch(
    bridgeSource,
    /if \(String\(reasoningDetail \|\| ''\)\.trim\(\)\) \{\s*useChatStore\.getState\(\)\.pushToolActivity\?\.\(reasoningActivity\)\s*\}/,
  )
})

test('authoritative reasoning keeps an explicitly empty current round distinct from cumulative full text', () => {
  assert.equal(resolveAuthoritativeCurrentReasoning({
    full: 'Plan the inspection.\n\n---\n\nConfirm the result.',
    current: '',
    hasCurrent: true,
  }), '')
  assert.equal(resolveAuthoritativeCurrentReasoning({
    full: 'Legacy reasoning summary.',
    hasCurrent: false,
  }), 'Legacy reasoning summary.')
})

test('execution commentary forwards the provider round as stable message identity', () => {
  assert.match(bridgeSource, /const appendExecutionStreamCommentary = \(\{[\s\S]*?round,[\s\S]*?\} = \{\}\) => \{/)
  assert.match(bridgeSource, /appendExecutionCommentary\?\.\(\{[\s\S]*?round,[\s\S]*?streamMeta:/)
})

test('terminal error and cancellation paths finalize live reasoning after flushing buffered chunks', () => {
  assert.match(
    bridgeSource,
    /const unError =[\s\S]*?flushBufferedAllForMessage\(id, 'error'\)\s*useChatStore\.getState\(\)\.markReasoningDone\(\s*id,\s*targetThreadId \? \{ threadId: targetThreadId \} : undefined,\s*\)/,
  )
  assert.match(
    bridgeSource,
    /const unCancelled =[\s\S]*?flushBufferedAllForMessage\(id, 'cancelled'\)\s*useChatStore\.getState\(\)\.markReasoningDone\(\s*id,\s*targetThreadId \? \{ threadId: targetThreadId \} : undefined,\s*\)/,
  )
})
