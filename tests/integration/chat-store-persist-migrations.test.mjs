import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createChatStorePersistConfig } from '../../src/renderer/store/chat/use-chat-store-persist-config.mjs'
import { sanitizeLegacyPlanState } from '../../src/renderer/store/chat/legacy-plan-state-migration.mjs'
import { CHAT_STORE_SCHEMA_VERSION } from '../../src/renderer/store/chat/use-chat-store-migrations.mjs'

function createPersistConfig() {
  return createChatStorePersistConfig({
    chatStorageKey: 'chat-store-test',
    sanitizePlanState: sanitizeLegacyPlanState,
    sanitizePersistedMessages: (messages) => (Array.isArray(messages) ? messages : []),
    canonicalizeSelectedModel: (providerId, modelId) => ({ providerId, modelId, changed: false }),
  })
}

test('chat store migrate upgrades legacy state through explicit schema versions', () => {
  const config = createPersistConfig()
  const migrated = config.migrate({
    selectedProvider: ' openai ',
    selectedModel: ' gpt-4o ',
    chatMode: 'invalid_mode',
    planState: {
      canonicalPlan: {
        messageId: ' msg_plan ',
        summary: ' Preserve OpenAI first. ',
        requests: [{ id: ' req_1 ', type: ' artifact_review ' }],
      },
      pendingRequestIds: ['req_1', 'req_1', '', null],
      linkedMessageIds: ['msg_1', 'msg_1'],
    },
    messages: [{ id: 'legacy_1' }],
  }, 0)

  assert.equal(migrated._storeVersion, CHAT_STORE_SCHEMA_VERSION)
  assert.equal(migrated.chatMode, 'execute')
  assert.equal(migrated.selectedProvider, 'openai')
  assert.equal(migrated.selectedModel, 'gpt-4o')
  assert.equal(Object.hasOwn(migrated, 'planState'), false)
  assert.equal(migrated.legacyPlanStateMigrationCandidate.canonicalPlan.messageId, 'msg_plan')
  assert.equal(migrated.legacyPlanStateMigrationCandidate.canonicalPlan.requests[0]?.id, 'req_1')
  assert.deepEqual(migrated.legacyPlanStateMigrationCandidate.dismissedPlanMessageIds, [])
  assert.deepEqual(migrated.legacyPlanStateMigrationCandidate.pendingRequestIds, ['req_1'])
  assert.deepEqual(migrated.legacyPlanStateMigrationCandidate.linkedMessageIds, ['msg_1'])
  assert.equal(Array.isArray(migrated.messages), true)
})

test('chat store migrate keeps future schema version while still sanitizing core fields', () => {
  const config = createPersistConfig()
  const migrated = config.migrate({
    _storeVersion: 99,
    selectedProvider: ' anthropic ',
    selectedModel: ' claude-sonnet-4 ',
    chatMode: 'thinking',
    planState: {
      dismissedPlanMessageIds: ['msg_plan', 'msg_plan', ''],
      pendingRequestIds: ['req_f'],
    },
  }, 99)

  assert.equal(migrated._storeVersion, 99)
  assert.equal(migrated.chatMode, 'thinking')
  assert.equal(migrated.selectedProvider, 'anthropic')
  assert.equal(migrated.selectedModel, 'claude-sonnet-4')
  assert.equal(Object.hasOwn(migrated, 'planState'), false)
  assert.deepEqual(migrated.legacyPlanStateMigrationCandidate.dismissedPlanMessageIds, ['msg_plan'])
  assert.deepEqual(migrated.legacyPlanStateMigrationCandidate.pendingRequestIds, ['req_f'])
})

test('chat store migrate handles malformed persisted payloads safely', () => {
  const config = createPersistConfig()
  const migrated = config.migrate(null, 0)

  assert.equal(migrated._storeVersion, CHAT_STORE_SCHEMA_VERSION)
  assert.equal(migrated.chatMode, 'execute')
  assert.equal(migrated.selectedProvider, '')
  assert.equal(migrated.selectedModel, '')
  assert.equal(Object.hasOwn(migrated, 'planState'), false)
  assert.equal(migrated.legacyPlanStateMigrationCandidate, null)
})

test('chat store helpers use common model-registry logic instead of importing main-process modules', () => {
  const source = fs.readFileSync(
    path.resolve('src/renderer/store/chat/use-chat-store-helpers.mjs'),
    'utf8',
  )
  assert.match(source, /common\/api-clients\/model-registry\.mjs/)
  assert.doesNotMatch(source, /main\/api-clients\/model-registry\.mjs/)
})
