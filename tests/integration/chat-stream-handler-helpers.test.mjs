import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

import {
  applyToolCapabilityDiagnostics,
  handleCursorAgentProviderTurn,
  normalizeChatTurnOptions,
  persistTurnUserMessage,
  resolveEffectiveTurnUserMessage,
} from '../../src/main/ipc-handlers/chat-stream-handler-helpers.mjs'
import { mapTimelineFromPersistedEvents } from '../../src/renderer/store/chat/timeline-hydration.mjs'

test('Cursor provider turns forward successful tool results to post-turn tasks', async () => {
  const postTurns = []
  const persistedEvents = []
  const handled = await handleCursorAgentProviderTurn({
    payload: {
      providerId: 'cursor', projectId: 'project-1', threadId: 'thread-1', model: 'composer-2.5',
      currentUserMessage: 'Create the file.',
    },
    mode: 'execute',
    permissionMode: 'full_access',
    activeTurnId: 'turn-1',
    authoritativeProjectFolder: 'C:\\repo',
    persistTimelineEvent: (kind, payload) => persistedEvents.push({ kind, ...payload }),
    executeCursorAgent: async () => ({ status: 'completed', full: 'Created.', toolResults: [{ toolName: 'write' }] }),
    runPostTurn: (payload) => postTurns.push(payload),
  })

  assert.equal(handled, true)
  assert.deepEqual(postTurns, [{
    userMessage: 'Create the file.',
    assistantText: 'Created.',
    toolResults: [{ toolName: 'write' }],
  }])
  assert.equal(persistedEvents.length, 1)
  assert.equal(persistedEvents[0].kind, 'user_message')
  assert.equal(persistedEvents[0].content, 'Create the file.')
  assert.equal(persistedEvents[0].turn, 'turn-1')
})

test('Plan action turn options retain only a bounded typed lifecycle action', () => {
  const input = {
    planAction: {
      kind: 'synthesize_direction',
      planId: 'plan-1',
      requestId: 'request-1',
      expectedRevision: 4,
      expectedDirectionRevision: 3,
      expectedAnswerRevision: 2,
      ignored: 'drop-me',
    },
  }
  const expected = {
    kind: 'synthesize_direction',
    planId: 'plan-1',
    requestId: 'request-1',
    expectedRevision: 4,
    expectedDirectionRevision: 3,
    expectedAnswerRevision: 2,
  }
  assert.deepEqual(normalizeChatTurnOptions(input).planAction, expected)
  assert.deepEqual(preloadNormalizers.normalizeChatTurnOptions(input).planAction, expected)

  const revision = {
    planAction: {
      kind: 'revise_plan',
      planId: 'plan-1',
      requestId: 'plan-revision-1',
      expectedRevision: 8,
      expectedDirectionRevision: 3,
      ignored: 'drop-me',
    },
  }
  const expectedRevision = {
    kind: 'revise_plan',
    planId: 'plan-1',
    requestId: 'plan-revision-1',
    expectedRevision: 8,
    expectedDirectionRevision: 3,
  }
  assert.deepEqual(normalizeChatTurnOptions(revision).planAction, expectedRevision)
  assert.deepEqual(preloadNormalizers.normalizeChatTurnOptions(revision).planAction, expectedRevision)
})

test('Cursor provider turns persist user prompts so timeline hydration can restore them after reload', async () => {
  const persistedEvents = []
  await handleCursorAgentProviderTurn({
    payload: {
      providerId: 'cursor',
      projectId: 'project-1',
      threadId: 'thread-1',
      model: 'composer-2.5',
      currentUserMessage: 'Upgrade the calculator to scientific mode.',
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Upgrade the calculator to scientific mode.' }] },
      ],
    },
    mode: 'execute',
    permissionMode: 'full_access',
    activeTurnId: 'turn-calc',
    authoritativeProjectFolder: 'C:\\repo',
    persistTimelineEvent: (kind, payload) => persistedEvents.push({ kind, ...payload }),
    executeCursorAgent: async () => ({ status: 'completed', full: 'Done.', toolResults: [] }),
    runPostTurn: () => {},
  })

  const mapped = mapTimelineFromPersistedEvents([{
    eventId: 1,
    kind: 'user_message',
    turnId: 'turn-calc',
    content: persistedEvents[0].content,
    createdAt: 100,
    meta: persistedEvents[0].meta,
  }])

  const userEntry = mapped.timeline.find((entry) => (
    entry?.kind === 'message' && entry?.message?.role === 'user'
  ))
  assert.ok(userEntry)
  const hydratedContent = userEntry.message.content
  const hydratedText = Array.isArray(hydratedContent)
    ? hydratedContent.map((part) => String(part?.text || '')).join(' ')
    : String(hydratedContent || '')
  assert.match(hydratedText, /Upgrade the calculator to scientific mode/)
})

test('persistTurnUserMessage keeps attachment parts when the visible prompt is empty', () => {
  const persistedEvents = []
  persistTurnUserMessage({
    persistTimelineEvent: (kind, payload) => persistedEvents.push({ kind, ...payload }),
    userMessage: '',
    fallbackUserEntry: {
      role: 'user',
      content: [{ type: 'image', attachmentId: 'att-1', mediaType: 'image/png', filename: 'diagram.png' }],
    },
    turnId: 'turn-image',
    meta: { threadId: 'thread-1', providerId: 'cursor' },
  })

  assert.equal(persistedEvents[0].kind, 'user_message')
  assert.deepEqual(persistedEvents[0].meta.userContentParts, [{
    type: 'image',
    attachmentId: 'att-1',
    kind: 'image',
    mediaType: 'image/png',
    filename: 'diagram.png',
  }])
})

const require = createRequire(import.meta.url)
const preloadNormalizers = require('../../src/preload/preload-normalizers.cjs')

test('resolveEffectiveTurnUserMessage prefers explicit currentUserMessage over persisted history', () => {
  const result = resolveEffectiveTurnUserMessage({
    hasExplicitCurrentUserMessage: true,
    currentUserMessage: 'Use the new prompt, not the previous one.',
    messages: [
      { role: 'user', content: 'Previous prompt from persisted history.' },
      { role: 'assistant', content: 'Old answer.' },
    ],
  })

  assert.equal(result.userMessage, 'Use the new prompt, not the previous one.')
  assert.equal(result.fallbackUserMessage, 'Previous prompt from persisted history.')
})

test('resolveEffectiveTurnUserMessage keeps an explicit empty prompt empty (plan turns)', () => {
  const result = resolveEffectiveTurnUserMessage({
    hasExplicitCurrentUserMessage: true,
    currentUserMessage: '',
    messages: [
      { role: 'user', content: 'Should not replace an intentional empty prompt.' },
    ],
  })

  assert.equal(result.userMessage, '')
  assert.equal(result.fallbackUserMessage, 'Should not replace an intentional empty prompt.')
})

test('resolveEffectiveTurnUserMessage falls back to the latest persisted user text content', () => {
  const result = resolveEffectiveTurnUserMessage({
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'Earlier prompt.' }] },
      { role: 'assistant', content: 'Answer.' },
      { role: 'user', content: [{ type: 'text', text: 'Latest prompt from history.' }] },
    ],
  })

  assert.equal(result.userMessage, 'Latest prompt from history.')
  assert.equal(result.fallbackUserMessage, 'Latest prompt from history.')
})

test('Cursor turns persist prompt before the agent run so reload can show it even if the run fails later', async () => {
  const persistedEvents = []
  let ran = false
  await assert.rejects(async () => {
    await handleCursorAgentProviderTurn({
      payload: {
        providerId: 'cursor',
        projectId: 'project-1',
        threadId: 'thread-1',
        model: 'composer-2.5',
        currentUserMessage: 'Persist me even if Cursor fails.',
      },
      mode: 'execute',
      permissionMode: 'full_access',
      activeTurnId: 'turn-fail',
      authoritativeProjectFolder: 'C:\\repo',
      persistTimelineEvent: (kind, payload) => persistedEvents.push({ kind, ...payload }),
      executeCursorAgent: async () => {
        ran = true
        throw new Error('Cursor Agent runtime is not ready.')
      },
      runPostTurn: () => {},
    })
  }, /Cursor Agent runtime is not ready/)

  assert.equal(ran, true)
  assert.equal(persistedEvents[0]?.kind, 'user_message')
  assert.equal(persistedEvents[0]?.content, 'Persist me even if Cursor fails.')
})

test('chat turn option normalizers preserve only supported processing modes', () => {
  assert.equal(normalizeChatTurnOptions({ processingMode: 'fast' }).processingMode, 'fast')
  assert.equal(normalizeChatTurnOptions({ processingMode: 'turbo' }).processingMode, undefined)
  assert.equal(preloadNormalizers.normalizeChatTurnOptions({ processingMode: 'standard' }).processingMode, 'standard')
  assert.equal(preloadNormalizers.normalizeChatTurnOptions({ processingMode: 'turbo' }).processingMode, undefined)
})

test('chat turn option normalizers discard obsolete renderer-owned plan state', () => {
  const legacyPlanState = {
    mode: 'plan',
    summary: 'Renderer-owned state must not cross the preload boundary.',
    canonicalPlan: { messageId: 'legacy_plan' },
  }

  for (const normalize of [normalizeChatTurnOptions, preloadNormalizers.normalizeChatTurnOptions]) {
    assert.equal(normalize({ planState: legacyPlanState }).planState, undefined)
  }
})

test('chat turn option normalizers preserve only bounded required agent delegation fields', () => {
  const input = {
    route: 'orchestrated_fanout',
    ignored: 'drop me',
    tasks: Array.from({ length: 105 }, (_, index) => ({
      task_id: ` task_${index + 1} `,
      agentRoleId: ` role_${index + 1} `,
      agentRole: ` Reviewer ${index + 1} `,
      instruction: ` Inspect surface ${index + 1}. `,
      injected_context: 'x'.repeat(10_000),
      expected_output_format: 'Return findings.',
      providerId: 'must-not-cross-renderer-boundary',
    })),
  }

  for (const normalize of [normalizeChatTurnOptions, preloadNormalizers.normalizeChatTurnOptions]) {
    const required = normalize({ requiredAgentDelegation: input }).requiredAgentDelegation
    assert.equal(required.route, 'orchestrated_fanout')
    assert.equal(required.tasks.length, 100)
    assert.deepEqual(Object.keys(required.tasks[0]).sort(), [
      'agentRole',
      'agentRoleId',
      'expected_output_format',
      'injected_context',
      'instruction',
      'task_id',
    ])
    assert.equal(required.tasks[0].task_id, 'task_1')
    assert.equal(required.tasks[0].injected_context.length, 4_000)
  }
})

test('OpenAI account support diagnostics use qualified contract entries instead of raw model eligibility', () => {
  const errorDiagnostics = {}
  applyToolCapabilityDiagnostics({
    errorDiagnostics,
    activeToolDefinitions: {},
    requestedToolCount: 0,
    modelCapabilities: { supportsTools: true, supportsChatToolSurface: true },
    adapterProfile: {
      openaiRuntimeSupport: {
        authMethod: 'account',
        hostedToolSupport: { image_generation: true, shell: true },
        accountCapabilityContract: {
          hostedTools: {
            image_generation: { supported: false },
            shell: { supported: true },
          },
        },
      },
    },
    providerId: 'openai',
  })

  assert.deepEqual(errorDiagnostics.supportedTools, ['shell'])
})
