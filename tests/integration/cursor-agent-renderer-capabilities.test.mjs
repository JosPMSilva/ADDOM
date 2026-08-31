import test from 'node:test'
import assert from 'node:assert/strict'

import { providerSupportsContextMeter } from '../../src/renderer/components/chat/chat-context-meter-usage.mjs'
import {
  cursorRequiresFullAccessCorrection,
  resolveCursorExecutionCorrection,
} from '../../src/renderer/components/chat/cursor-agent-renderer-capabilities.mjs'
import { executeSendMessage } from '../../src/renderer/components/chat/chat-panel-helpers.mjs'
import { getCursorAgentModels } from '../../src/common/api-clients/cursor-agent-provider.mjs'

test('Cursor does not advertise reasoning while print-mode stream JSON suppresses thinking events', () => {
  for (const model of getCursorAgentModels()) {
    assert.equal(model.supportsReasoning, false)
  }
})

test('Cursor omits context telemetry instead of rendering an unknown meter', () => {
  assert.equal(providerSupportsContextMeter({
    id: 'cursor',
    capabilities: { contextTelemetry: false },
  }), false)
})

test('ordinary providers retain the context meter by default', () => {
  assert.equal(providerSupportsContextMeter({ id: 'openai' }), true)
  assert.equal(providerSupportsContextMeter(null), true)
})

test('Cursor offers one permission correction outside Full Access', () => {
  const cursor = {
    id: 'cursor',
    capabilities: { requiresExecuteMode: true, requiresFullAccess: true },
  }
  assert.equal(cursorRequiresFullAccessCorrection(cursor, 'ask'), true)
  assert.equal(cursorRequiresFullAccessCorrection(cursor, 'autonomy'), true)
  assert.equal(cursorRequiresFullAccessCorrection(cursor, 'full_access'), false)
  assert.equal(cursorRequiresFullAccessCorrection({ id: 'openai' }, 'ask'), false)
})

test('Cursor exposes every execution correction before a turn is submitted', () => {
  const cursor = {
    id: 'cursor',
    capabilities: { requiresExecuteMode: true, requiresFullAccess: true },
  }

  assert.deepEqual(resolveCursorExecutionCorrection(cursor, {
    chatMode: 'plan',
    permissionMode: 'ask',
  }), {
    requiresExecuteMode: true,
    requiresFullAccess: true,
  })
  assert.deepEqual(resolveCursorExecutionCorrection(cursor, {
    chatMode: 'execute',
    permissionMode: 'full_access',
  }), {
    requiresExecuteMode: false,
    requiresFullAccess: false,
  })
  assert.deepEqual(resolveCursorExecutionCorrection({ id: 'openai' }, {
    chatMode: 'plan',
    permissionMode: 'ask',
  }), {
    requiresExecuteMode: false,
    requiresFullAccess: false,
  })
})

test('Cursor preflight rejects invalid mode or permission before mutating the timeline', () => {
  const cursor = {
    id: 'cursor',
    capabilities: { requiresExecuteMode: true, requiresFullAccess: true },
  }
  const calls = []
  const attempt = ({ chatMode, permissionMode }) => executeSendMessage({
    rawContent: 'Inspect the project without changing it.',
    selectedProvider: 'cursor',
    selectedModel: 'composer-2.5',
    selectedProviderManifest: cursor,
    activeThreadId: 'thread-cursor-boundary',
    projectFolder: 'C:\\repo',
    chatMode,
    permissionMode,
    addUserMessage: () => calls.push('user'),
    addAssistantPlaceholder: () => calls.push('assistant'),
    setAttachedImages: () => calls.push('attachments'),
    consumePendingContextPrefix: () => calls.push('context'),
    chatStream: () => calls.push('stream'),
  })

  assert.equal(attempt({ chatMode: 'plan', permissionMode: 'full_access' }), false)
  assert.equal(attempt({ chatMode: 'execute', permissionMode: 'ask' }), false)
  assert.deepEqual(calls, [])
})
