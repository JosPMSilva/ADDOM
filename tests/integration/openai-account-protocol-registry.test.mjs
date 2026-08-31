import test from 'node:test'
import assert from 'node:assert/strict'

import {
  OPENAI_ACCOUNT_ITEM_HANDLER_REGISTRY,
  OPENAI_ACCOUNT_ITEM_QUALIFICATION_REGISTRY,
  OPENAI_ACCOUNT_NOTIFICATION_HANDLER_REGISTRY,
  OPENAI_ACCOUNT_SERVER_REQUEST_HANDLER_REGISTRY,
  buildOpenAIAccountProtocolDriftWarning,
  buildOpenAIAccountProtocolCapabilitySnapshot,
  classifyOpenAIAccountItemType,
  classifyOpenAIAccountNotificationMethod,
  classifyOpenAIAccountServerRequestMethod,
  createOpenAIAccountUnknownActivityState,
  createSanitizedOpenAIAccountUnknownActivity,
  trackOpenAIAccountUnknownActivity,
} from '../../src/main/api-clients/ai-provider-openai-account-protocol-registry.mjs'

test('OpenAI account protocol registry exposes one explicit decision per registered surface', () => {
  const snapshot = buildOpenAIAccountProtocolCapabilitySnapshot({
    runtimeIdentity: {
      executable: 'codex.exe',
      version: '0.124.0',
      platformFamily: 'desktop',
      platformOs: 'windows',
    },
  })

  assert.equal(
    Object.keys(snapshot.itemTypes).length,
    Object.keys(OPENAI_ACCOUNT_ITEM_HANDLER_REGISTRY).length,
  )
  assert.equal(
    Object.keys(snapshot.notifications).length,
    Object.keys(OPENAI_ACCOUNT_NOTIFICATION_HANDLER_REGISTRY).length,
  )
  assert.equal(
    Object.keys(snapshot.serverRequests).length,
    Object.keys(OPENAI_ACCOUNT_SERVER_REQUEST_HANDLER_REGISTRY).length,
  )
  assert.deepEqual(snapshot.runtime, {
    executable: 'codex.exe',
    version: '0.124.0',
    platformFamily: 'desktop',
    platformOs: 'windows',
  })
  assert.equal(snapshot.itemTypes.imageGeneration.handlerId, 'account_native_activity')
  assert.equal(snapshot.itemTypes.imageGeneration.status, 'supported')
  assert.deepEqual(snapshot.itemTypes.imageGeneration.qualification, {
    status: 'qualified',
    fixtureId: 'openai-account-image-generation-v1',
  })
  assert.deepEqual(snapshot.itemTypes.hookPrompt, {
    status: 'ignored_by_policy',
    handlerId: 'hidden_hook_context',
    reason: 'hidden_provider_context',
    handlerStatus: 'ignored_by_policy',
    qualification: {
      status: 'qualified',
      fixtureId: 'openai-account-hook-prompt-v1',
    },
  })
  assert.equal(snapshot.serverRequests['item/tool/call'].status, 'supported')
})

test('protocol capability support requires both a loaded handler and qualification evidence', () => {
  const snapshot = buildOpenAIAccountProtocolCapabilitySnapshot({
    itemQualificationRegistry: {
      ...OPENAI_ACCOUNT_ITEM_QUALIFICATION_REGISTRY,
      imageGeneration: {
        status: 'unqualified',
        fixtureId: 'openai-account-image-generation-v1',
      },
    },
  })

  assert.equal(snapshot.itemTypes.imageGeneration.handlerStatus, 'supported')
  assert.equal(snapshot.itemTypes.imageGeneration.status, 'partially_supported')
  assert.equal(snapshot.itemTypes.imageGeneration.qualification.status, 'unqualified')
})

test('item classification distinguishes hidden hook context from unknown future activity', () => {
  assert.deepEqual(classifyOpenAIAccountItemType('hookPrompt'), {
    itemType: 'hookPrompt',
    declared: true,
    status: 'ignored_by_policy',
    handlerId: 'hidden_hook_context',
    reason: 'hidden_provider_context',
  })
  assert.deepEqual(classifyOpenAIAccountItemType('futureActivity'), {
    itemType: 'futureActivity',
    declared: false,
    status: 'unknown',
    handlerId: 'sanitized_unknown_activity',
    reason: 'unregistered_protocol_item',
  })
})

test('locally evidenced ThreadItem families all have explicit decisions without claiming later variants', () => {
  const evidencedItemTypes = [
    'userMessage',
    'hookPrompt',
    'agentMessage',
    'plan',
    'reasoning',
    'commandExecution',
    'fileChange',
    'mcpToolCall',
    'dynamicToolCall',
    'collabAgentToolCall',
    'webSearch',
    'imageView',
    'imageGeneration',
    'enteredReviewMode',
    'exitedReviewMode',
    'contextCompaction',
  ]

  for (const itemType of evidencedItemTypes) {
    const decision = classifyOpenAIAccountItemType(itemType)
    assert.equal(decision.declared, true, `${itemType} should be declared`)
    assert.notEqual(decision.status, 'unknown', `${itemType} should have an explicit safe decision`)
  }

  for (const itemType of ['sleep', 'subAgentActivity']) {
    assert.deepEqual(classifyOpenAIAccountItemType(itemType), {
      itemType,
      declared: false,
      status: 'unknown',
      handlerId: 'sanitized_unknown_activity',
      reason: 'unregistered_protocol_item',
    })
  }
})

test('notification and server-request classifiers preserve their different safe defaults', () => {
  for (const [method, handlerId] of [
    ['turn/plan/updated', 'turn_plan_update'],
    ['turn/diff/updated', 'turn_diff_update'],
    ['item/commandExecution/terminalInteraction', 'terminal_interaction'],
    ['item/mcpToolCall/progress', 'mcp_tool_progress'],
    ['model/rerouted', 'model_reroute'],
    ['configWarning', 'config_warning'],
    ['hook/started', 'hook_lifecycle'],
    ['hook/completed', 'hook_lifecycle'],
    ['item/autoApprovalReview/started', 'auto_approval_review'],
    ['item/autoApprovalReview/completed', 'auto_approval_review'],
    ['error', 'turn_error'],
  ]) {
    assert.deepEqual(classifyOpenAIAccountNotificationMethod(method), {
      method,
      declared: true,
      status: 'supported',
      handlerId,
      reason: '',
    })
  }
  assert.deepEqual(classifyOpenAIAccountNotificationMethod('item/fileChange/patchUpdated'), {
    method: 'item/fileChange/patchUpdated',
    declared: false,
    status: 'unknown',
    handlerId: 'sanitized_unknown_activity',
    reason: 'unregistered_protocol_notification',
  })
  for (const method of ['model/safetyBuffering/updated', 'model/verification']) {
    assert.deepEqual(classifyOpenAIAccountNotificationMethod(method), {
      method,
      declared: false,
      status: 'unknown',
      handlerId: 'sanitized_unknown_activity',
      reason: 'unregistered_protocol_notification',
    })
  }
  for (const method of ['warning', 'guardianWarning']) {
    assert.deepEqual(classifyOpenAIAccountNotificationMethod(method), {
      method,
      declared: false,
      status: 'unknown',
      handlerId: 'sanitized_unknown_activity',
      reason: 'unregistered_protocol_notification',
    })
  }
  assert.deepEqual(classifyOpenAIAccountServerRequestMethod('item/permissions/requestApproval'), {
    method: 'item/permissions/requestApproval',
    declared: true,
    status: 'supported',
    handlerId: 'permission_approval',
    reason: '',
  })
  for (const [method, handlerId] of [
    ['execCommandApproval', 'legacy_exec_command_approval'],
    ['applyPatchApproval', 'legacy_apply_patch_approval'],
  ]) {
    assert.deepEqual(classifyOpenAIAccountServerRequestMethod(method), {
      method,
      declared: true,
      status: 'supported',
      handlerId,
      reason: 'schema_qualified_runtime_versions',
    })
  }
  assert.deepEqual(classifyOpenAIAccountServerRequestMethod('mcpServer/elicitation/request'), {
    method: 'mcpServer/elicitation/request',
    declared: true,
    status: 'supported',
    handlerId: 'mcp_elicitation',
    reason: '',
  })
  assert.deepEqual(classifyOpenAIAccountServerRequestMethod('currentTime/read'), {
    method: 'currentTime/read',
    declared: true,
    status: 'supported',
    handlerId: 'current_time',
    reason: '',
  })
  assert.deepEqual(classifyOpenAIAccountServerRequestMethod('attestation/generate'), {
    method: 'attestation/generate',
    declared: true,
    status: 'unsupported_by_policy',
    handlerId: 'attestation_unavailable',
    reason: 'client_attestation_unavailable',
  })
  assert.deepEqual(classifyOpenAIAccountServerRequestMethod('account/chatgptAuthTokens/refresh'), {
    method: 'account/chatgptAuthTokens/refresh',
    declared: true,
    status: 'unsupported_by_policy',
    handlerId: 'external_auth_refresh_unavailable',
    reason: 'managed_account_auth',
  })
})

test('unknown activity envelopes retain only bounded protocol metadata', () => {
  const envelope = createSanitizedOpenAIAccountUnknownActivity({
    protocolMethod: 'item/started',
    item: {
      id: 'unknown-1',
      type: 'futureActivity',
      status: 'inProgress',
      prompt: 'private prompt',
      result: 'data:image/png;base64,private-bytes',
      environment: { SECRET: 'do-not-copy' },
    },
    runtimeIdentity: {
      executable: 'codex.exe',
      version: '0.124.0',
      platformFamily: 'desktop',
      platformOs: 'windows',
    },
  })

  assert.deepEqual(envelope, {
    protocolMethod: 'item/started',
    itemType: 'futureActivity',
    itemId: 'unknown-1',
    lifecycle: 'started',
    providerStatus: 'inProgress',
    supportStatus: 'unknown',
    handlerId: 'sanitized_unknown_activity',
    reason: 'unregistered_protocol_item',
    runtimeVersion: '0.124.0',
  })
  assert.equal(JSON.stringify(envelope).includes('private'), false)
  assert.equal(JSON.stringify(envelope).includes('SECRET'), false)
})

test('protocol drift warnings expose one sanitized signature without provider content', () => {
  const warning = buildOpenAIAccountProtocolDriftWarning({
    protocolMethod: 'item/started',
    itemType: 'futureActivity',
    itemId: 'private-provider-id',
    lifecycle: 'started',
    providerStatus: 'inProgress',
    supportStatus: 'unknown',
    handlerId: 'sanitized_unknown_activity',
    reason: 'unregistered_protocol_item',
    runtimeVersion: '0.124.0',
  })

  assert.deepEqual(warning, {
    type: 'warning',
    text: 'Codex app-server activity',
    meta: {
      noticeKind: 'provider_protocol_drift',
      reason: 'unrecognized_provider_activity',
      providerId: 'openai',
      transportMode: 'codex_app_server_chatgpt',
      protocolMethod: 'item/started',
      protocolItemType: 'futureActivity',
      runtimeVersion: '0.124.0',
      dedupeKey: 'openai_account_protocol_drift:0.124.0:item:futureActivity',
    },
  })
  assert.equal(JSON.stringify(warning).includes('private-provider-id'), false)
})

test('unknown activity state deduplicates exact lifecycle events and stays bounded', () => {
  let state = createOpenAIAccountUnknownActivityState()
  const first = createSanitizedOpenAIAccountUnknownActivity({
    protocolMethod: 'item/started',
    item: { id: 'unknown-1', type: 'futureActivity' },
  })
  state = trackOpenAIAccountUnknownActivity(state, first)
  state = trackOpenAIAccountUnknownActivity(state, first)
  for (let index = 2; index <= 40; index += 1) {
    state = trackOpenAIAccountUnknownActivity(state, createSanitizedOpenAIAccountUnknownActivity({
      protocolMethod: 'item/completed',
      item: { id: `unknown-${index}`, type: `futureActivity${index}` },
    }))
  }

  assert.equal(state.events.length, 32)
  assert.equal(state.events[0].itemId, 'unknown-9')
  assert.equal(state.events.at(-1).itemId, 'unknown-40')
})
