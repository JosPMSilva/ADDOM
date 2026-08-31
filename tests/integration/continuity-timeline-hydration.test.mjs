import test from 'node:test'
import assert from 'node:assert/strict'
import { COMPACTION_MODES } from '../../src/main/chat/continuity/compaction-mode-contract.mjs'
import { mapTimelineFromPersistedEvents } from '../../src/renderer/store/chat/timeline-hydration.mjs'
import { collectTurnFileChanges } from '../../src/renderer/components/chat/turn-file-changes.mjs'

test('timeline hydration maps continuity events and produces latest continuity status', () => {
  const now = Date.now()
  const events = [
    {
      eventId: 1,
      turnId: 'turn_1',
      kind: 'continuity_retrieval_used',
      role: 'system',
      content: 'retrieval',
      meta: { threadId: 'thread_a', turnId: 'turn_1', scope: 'thread_project', selectedFacts: 4, selectedInvariants: 2 },
      createdAt: now,
    },
    {
      eventId: 2,
      turnId: 'turn_1',
      kind: 'continuity_packet_built',
      role: 'system',
      content: 'packet',
      meta: {
        threadId: 'thread_a',
        turnId: 'turn_1',
        packetId: 'pkt_1',
        profile: 'balanced',
        tokenBudget: 1600,
        packetTokens: 1200,
        sourceRefCount: 6,
        driftRisk: 'low',
      },
      createdAt: now + 1,
    },
    {
      eventId: 3,
      turnId: 'turn_1',
      kind: 'continuity_compaction_applied',
      role: 'system',
      content: 'compacted',
      meta: { threadId: 'thread_a', turnId: 'turn_1', removedMessages: 10, estimatedBeforeTokens: 18000, estimatedAfterTokens: 9000 },
      createdAt: now + 2,
    },
  ]

  const mapped = mapTimelineFromPersistedEvents(events)
  assert.ok(Array.isArray(mapped.toolActivity))
  assert.ok(mapped.toolActivity.length >= 3)
  const retrievalActivity = mapped.toolActivity.find((item) => item.eventKind === 'continuity_retrieval_used')
  assert.ok(retrievalActivity)
  assert.equal(retrievalActivity.label, 'Continuity retrieval used')
  assert.match(String(retrievalActivity.detail || ''), /scope: thread_project/)
  assert.match(String(retrievalActivity.detail || ''), /facts: 4/)
  assert.match(String(retrievalActivity.detail || ''), /invariants: 2/)
  assert.equal(mapped.continuityStatus.profile, 'balanced')
  assert.equal(mapped.continuityStatus.packetId, 'pkt_1')
  assert.equal(mapped.continuityStatus.phase, 'compacted')
  assert.equal(mapped.continuityStatus.removedMessages, 10)
})

test('timeline hydration preserves rich continuity retrieval labels from persisted content', () => {
  const mapped = mapTimelineFromPersistedEvents([{
    eventId: 100,
    turnId: 'turn_2',
    kind: 'continuity_retrieval_used',
    role: 'system',
    content: 'Continuity retrieval used (3 facts, 1 invariants).',
    meta: { threadId: 'thread_b', turnId: 'turn_2', scope: 'thread_project', selectedFacts: 3, selectedInvariants: 1 },
    createdAt: Date.now(),
  }])

  const retrievalActivity = mapped.toolActivity.find((item) => item.eventKind === 'continuity_retrieval_used')
  assert.ok(retrievalActivity)
  assert.equal(retrievalActivity.label, 'Continuity retrieval used (3 facts, 1 invariants).')
  assert.match(String(retrievalActivity.detail || ''), /facts: 3/)
  assert.match(String(retrievalActivity.detail || ''), /invariants: 1/)
})

test('timeline hydration surfaces persisted openai continuity status metadata after background recovery', () => {
  const now = Date.now()
  const events = [
    {
      eventId: 10,
      turnId: 'turn_bg_1',
      kind: 'background_response_completed',
      role: 'system',
      content: 'OpenAI background response completed.',
      meta: {
        threadId: 'thread_bg_a',
        turnId: 'turn_bg_1',
        jobId: 'oaibg-test-1',
        responseId: 'resp_bg_1',
        model: 'gpt-5.2',
        totalTokens: 21,
        recovered: true,
      },
      createdAt: now,
    },
    {
      eventId: 11,
      turnId: 'turn_bg_1',
      kind: 'openai_continuity_status',
      role: 'system',
      content: 'OpenAI response state tracked: resp_bg_1',
      meta: {
        threadId: 'thread_bg_a',
        turnId: 'turn_bg_1',
        providerId: 'openai',
        model: 'gpt-5.2',
        continuityMode: 'local_first_hybrid',
        transportMode: 'responses_websocket_experimental',
        configuredTransportMode: 'responses_auto',
        transportSelectionReason: 'auto_preferred_model',
        accountDelegationBackend: 'openai_native',
        accountCollaborationModeId: 'plan',
        websocketReuseMode: 'thread_socket_reused',
        websocketPooledConnection: true,
        websocketReusedConnection: true,
        websocketReconnectAttempt: 2,
        websocketReconnectMaxAttempts: 6,
        websocketReconnectReason: 'socket_closed_before_terminal',
        websocketRecovered: true,
        websocketBypassReason: 'background_mode_enabled',
        websocketStoredResponseRecoveryAttempted: true,
        websocketRecoveredFromStoredResponse: true,
        promptCachingEnabled: true,
        compactionStrategy: COMPACTION_MODES.PROVIDER_TRUNCATION,
        selectedCompactionMode: COMPACTION_MODES.PROVIDER_TRUNCATION,
        candidateCompactionModes: [COMPACTION_MODES.PROVIDER_TRUNCATION, COMPACTION_MODES.LOCAL_SUMMARY],
        serverSideCompactionEnabled: true,
        serverSideCompactionThresholdTokens: 180000,
        lastCompactionId: 'cmp_bg_1',
        background: true,
        responseId: 'resp_bg_1',
        conversationId: 'conv_bg_1',
        storeEnabled: true,
        status: 'completed',
        cachedTokens: 9,
        autoCompactionApplied: true,
        autoCompactionIds: ['cmp_bg_auto_1'],
      },
      createdAt: now + 1,
    },
  ]

  const mapped = mapTimelineFromPersistedEvents(events)
  const continuityActivity = mapped.toolActivity.find((item) => item.eventKind === 'openai_continuity_status')

  assert.ok(continuityActivity)
  assert.equal(continuityActivity.type, 'info')
  assert.equal(continuityActivity.label, 'OpenAI response state tracked')
  assert.match(String(continuityActivity.detail || ''), /response_id: resp_bg_1/)
  assert.match(String(continuityActivity.detail || ''), /conversation_id: conv_bg_1/)
  assert.match(String(continuityActivity.detail || ''), /status: completed/)
  assert.match(String(continuityActivity.detail || ''), /continuity_mode: local_first_hybrid/)
  assert.match(String(continuityActivity.detail || ''), /transport_mode: responses_websocket_experimental/)
  assert.match(String(continuityActivity.detail || ''), /configured_transport_mode: responses_auto/)
  assert.match(String(continuityActivity.detail || ''), /transport_selection_reason: auto_preferred_model/)
  assert.match(String(continuityActivity.detail || ''), /delegation_backend: openai_native/)
  assert.match(String(continuityActivity.detail || ''), /native_collaboration_mode: plan/)
  assert.match(String(continuityActivity.detail || ''), /websocket_reuse_mode: thread_socket_reused/)
  assert.match(String(continuityActivity.detail || ''), /websocket_pooled_connection: true/)
  assert.match(String(continuityActivity.detail || ''), /websocket_reused_connection: true/)
  assert.match(String(continuityActivity.detail || ''), /websocket_reconnect_attempt: 2/)
  assert.match(String(continuityActivity.detail || ''), /websocket_reconnect_max_attempts: 6/)
  assert.match(String(continuityActivity.detail || ''), /websocket_reconnect_reason: socket_closed_before_terminal/)
  assert.match(String(continuityActivity.detail || ''), /websocket_recovered: true/)
  assert.match(String(continuityActivity.detail || ''), /websocket_bypass_reason: background_mode_enabled/)
  assert.match(String(continuityActivity.detail || ''), /websocket_stored_response_recovery_attempted: true/)
  assert.match(String(continuityActivity.detail || ''), /websocket_recovered_from_stored_response: true/)
  assert.match(String(continuityActivity.detail || ''), /prompt_caching_enabled: true/)
  assert.match(String(continuityActivity.detail || ''), /compaction_strategy: provider_truncation/)
  assert.match(String(continuityActivity.detail || ''), /compaction mode: provider truncation/)
  assert.match(String(continuityActivity.detail || ''), /server_side_compaction_enabled: true/)
  assert.match(String(continuityActivity.detail || ''), /server_side_threshold_tokens: 180000/)
  assert.match(String(continuityActivity.detail || ''), /background: true/)
  assert.match(String(continuityActivity.detail || ''), /cached_tokens: 9/)
  assert.equal(continuityActivity.compactionMilestone, undefined)
  assert.equal(continuityActivity.compactionMilestoneTitle, undefined)
})

test('timeline hydration keeps sanitized unknown Codex diagnostics out of the viewport', () => {
  const mapped = mapTimelineFromPersistedEvents([{
    eventId: 12,
    turnId: 'turn_protocol_gap',
    kind: 'openai_continuity_status',
    role: 'system',
    content: 'OpenAI response state tracked',
    meta: {
      threadId: 'thread_protocol_gap',
      turnId: 'turn_protocol_gap',
      providerId: 'openai',
      authMethod: 'account',
      accountProtocol: {
        runtime: {
          executable: 'codex.exe',
          version: '0.124.0',
          platformFamily: 'desktop',
          platformOs: 'windows',
        },
        unknownActivities: [{
          protocolMethod: 'item/completed',
          itemType: 'hookPrompt',
          itemId: 'private-item-id',
          lifecycle: 'completed',
          providerStatus: 'completed',
          supportStatus: 'unknown',
          handlerId: 'sanitized_unknown_activity',
          reason: 'schema_item_without_safe_handler',
          runtimeVersion: '0.124.0',
          rawPayload: 'must-not-render',
        }],
      },
    },
    createdAt: Date.now(),
  }])

  const unknownActivity = mapped.toolActivity.find((activity) => (
    String(activity?.eventKind || '') === 'openai_account_native_unknown_activity'
  ))

  assert.equal(unknownActivity, undefined)
  const renderedActivity = JSON.stringify(mapped.toolActivity)
  assert.doesNotMatch(renderedActivity, /Codex app-server activity/)
  assert.doesNotMatch(renderedActivity, /private-item-id/)
  assert.doesNotMatch(renderedActivity, /must-not-render/)
})

test('timeline hydration rebuilds collectible file rows from persisted provider-native OpenAI events', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 200,
      turnId: 'turn_native_files',
      kind: 'provider_tool_output',
      role: 'assistant',
      content: 'file_change',
      meta: {
        threadId: 'thread_native_files',
        turnId: 'turn_native_files',
        toolName: 'file_change',
        output: {
          changes: [
            {
              path: 'public/index.html',
              kind: 'modify',
              diff: '@@ -1,2 +1,3 @@\n <main>\n-  <h1>Old</h1>\n+  <h1>New</h1>\n+  <p>Fresh</p>',
            },
            { path: 'public/styles.css', kind: 'create', addedLines: 44, removedLines: 0 },
          ],
        },
      },
      createdAt: 10,
    },
    {
      eventId: 201,
      turnId: 'turn_native_files',
      kind: 'openai_continuity_status',
      role: 'system',
      content: 'OpenAI response state tracked',
      meta: {
        threadId: 'thread_native_files',
        turnId: 'turn_native_files',
        responseId: 'resp_native_files',
        accountNativeActivity: {
          fileChange: {
            itemIds: ['file_native_1'],
            changes: [
              {
                path: 'public/index.html',
                kind: 'modify',
                diff: '@@ -1,2 +1,3 @@\n <main>\n-  <h1>Old</h1>\n+  <h1>New</h1>\n+  <p>Fresh</p>',
              },
              {
                path: 'public/styles.css',
                kind: 'create',
                diff: '@@ -0,0 +1,2 @@\n+.page {\n+  color: red;\n+}',
              },
            ],
            paths: ['public/index.html', 'public/styles.css'],
            changeKinds: ['modify', 'create'],
            statuses: ['completed'],
            outputPreview: 'apply_patch succeeded',
          },
        },
      },
      createdAt: 11,
    },
  ])

  const providerOutputActivity = mapped.toolActivity.find((activity) => (
    String(activity?.eventKind || '') === 'provider_tool_output'
  ))
  assert.ok(providerOutputActivity)
  assert.equal(Array.isArray(providerOutputActivity.fileChanges), true)
  assert.equal(providerOutputActivity.fileChanges.length, 2)
  assert.match(String(providerOutputActivity.fileChanges[0]?.diffText || ''), /<h1>New<\/h1>/)

  const nativeSummaryActivity = mapped.toolActivity.find((activity) => (
    String(activity?.eventKind || '') === 'openai_account_native_file_change'
  ))
  assert.ok(nativeSummaryActivity)
  assert.equal(Array.isArray(nativeSummaryActivity.fileChanges), true)
  assert.equal(nativeSummaryActivity.fileChanges.length, 2)
  assert.match(String(nativeSummaryActivity.fileChanges[0]?.diffText || ''), /<h1>New<\/h1>/)
  assert.match(String(nativeSummaryActivity.fileChanges[1]?.diffText || ''), /\.page/)

  const rows = collectTurnFileChanges(mapped.toolActivity)
  assert.deepEqual(
    rows.map((row) => ({
      filePath: row.fileChange.filePath,
      changeType: row.fileChange.changeType,
      addedLines: row.fileChange.addedLines,
      removedLines: row.fileChange.removedLines,
    })),
    [
      {
        filePath: 'public/index.html',
        changeType: 'modified',
        addedLines: 2,
        removedLines: 1,
      },
      {
        filePath: 'public/styles.css',
        changeType: 'created',
        addedLines: 44,
        removedLines: 0,
      },
    ],
  )
  assert.match(String(rows[0]?.fileChange?.diffText || ''), /<h1>New<\/h1>/)
})

test('timeline hydration coalesces durable provider progress updates by stable tool identity', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 210,
      turnId: 'turn_progress_replay',
      kind: 'provider_tool_status',
      role: 'assistant',
      content: 'Reading src/app.mjs',
      meta: {
        threadId: 'thread_progress_replay',
        turnId: 'turn_progress_replay',
        providerId: 'openai',
        model: 'gpt-5.4',
        type: 'running',
        toolCallId: 'mcp_progress_1',
        toolName: 'mcp_tool_call',
        delta: 'Reading src/app.mjs',
        activityKind: 'openai_account_mcp_progress',
        durable: true,
      },
      createdAt: 10,
    },
    {
      eventId: 211,
      turnId: 'turn_progress_replay',
      kind: 'provider_tool_status',
      role: 'assistant',
      content: 'Reviewing exports',
      meta: {
        threadId: 'thread_progress_replay',
        turnId: 'turn_progress_replay',
        providerId: 'openai',
        model: 'gpt-5.4',
        type: 'running',
        toolCallId: 'mcp_progress_1',
        toolName: 'mcp_tool_call',
        delta: 'Reviewing exports',
        activityKind: 'openai_account_mcp_progress',
        durable: true,
      },
      createdAt: 11,
    },
  ])

  const turn = mapped.liveExecution.turnsById.turn_progress_replay
  assert.ok(turn)
  const matchingSessions = Object.values(turn.sessionsById || {})
    .filter((session) => session?.id === 'session:turn_progress_replay:mcp_progress_1')
  assert.equal(matchingSessions.length, 1)
  assert.equal(matchingSessions[0].inputDetail, 'Reviewing exports')
})

test('timeline hydration keeps completed native image generation succeeded after turn completion', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 212,
      turnId: 'turn_image_replay',
      kind: 'provider_tool_output',
      role: 'assistant',
      content: 'image_generation',
      meta: {
        threadId: 'thread_image_replay',
        turnId: 'turn_image_replay',
        providerId: 'openai',
        toolCallId: 'image_generation_1',
        toolName: 'image_generation',
        output: {
          type: 'imageGeneration',
          status: 'completed',
          savedPath: 'C:/generated/image.png',
          resultAvailable: true,
        },
      },
      createdAt: 10,
    },
    {
      eventId: 213,
      turnId: 'turn_image_replay',
      kind: 'openai_continuity_status',
      role: 'system',
      content: 'OpenAI response state tracked',
      meta: {
        threadId: 'thread_image_replay',
        turnId: 'turn_image_replay',
        providerId: 'openai',
        responseId: 'resp_image_replay',
        accountNativeActivity: {
          imageGeneration: {
            started: true,
            completed: true,
            itemIds: ['image_generation_1'],
            statuses: ['in_progress', 'completed'],
            savedPaths: ['C:/generated/image.png'],
            resultAvailable: true,
          },
        },
      },
      createdAt: 11,
    },
    {
      eventId: 214,
      turnId: 'turn_image_replay',
      kind: 'turn_completed',
      role: 'system',
      content: 'Turn completed (ok).',
      meta: {
        threadId: 'thread_image_replay',
        turnId: 'turn_image_replay',
        state: 'completed',
        status: 'ok',
        finishedAt: 12,
      },
      createdAt: 12,
    },
  ])

  const imageActivity = mapped.toolActivity.find((activity) => (
    String(activity?.eventKind || '') === 'openai_account_native_image_generation'
  ))
  assert.ok(imageActivity)
  assert.equal(imageActivity.type, 'result')
  assert.equal(imageActivity.stepId, 'image_generation_1')

  const turn = mapped.liveExecution.turnsById.turn_image_replay
  assert.ok(turn)
  const allSessions = Object.values(turn.sessionsById || {})
  assert.equal(allSessions.length, 1)
  const imageSessions = allSessions
    .filter((session) => session?.id === 'session:turn_image_replay:image_generation_1')
  assert.equal(imageSessions.length, 1)
  assert.equal(imageSessions[0].state, 'succeeded')
  assert.equal(turn.status, 'done')
})

test('timeline hydration does not fabricate file diff cards from summary-only OpenAI account file-change metadata', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 202,
      turnId: 'turn_native_summary_only',
      kind: 'openai_continuity_status',
      role: 'system',
      content: 'OpenAI response state tracked',
      meta: {
        threadId: 'thread_native_summary_only',
        turnId: 'turn_native_summary_only',
        responseId: 'resp_native_summary_only',
        accountNativeActivity: {
          fileChange: {
            itemIds: ['file_native_summary_only'],
            paths: ['public/index.html', 'public/styles.css'],
            changeKinds: ['modify', 'create'],
            statuses: ['completed'],
            outputPreview: 'apply_patch succeeded',
          },
        },
      },
      createdAt: 12,
    },
  ])

  const nativeSummaryActivity = mapped.toolActivity.find((activity) => (
    String(activity?.eventKind || '') === 'openai_account_native_file_change'
  ))
  assert.equal(nativeSummaryActivity, undefined)

  const rows = collectTurnFileChanges(mapped.toolActivity)
  assert.deepEqual(rows, [])
})

test('timeline hydration maps persisted websocket reconnect lifecycle events', () => {
  const now = Date.now()
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 60,
      turnId: 'turn_ws_1',
      kind: 'openai_websocket_reconnect',
      role: 'system',
      content: 'reconnecting',
      meta: {
        threadId: 'thread_ws_a',
        turnId: 'turn_ws_1',
        status: 'reconnecting',
        attempt: 2,
        maxAttempts: 6,
        reason: 'socket_closed_before_terminal',
        waitMs: 5000,
      },
      createdAt: now,
    },
    {
      eventId: 61,
      turnId: 'turn_ws_1',
      kind: 'openai_websocket_reconnect',
      role: 'system',
      content: 'fallback',
      meta: {
        threadId: 'thread_ws_a',
        turnId: 'turn_ws_1',
        status: 'fallback',
        attempt: 6,
        maxAttempts: 6,
        reason: 'socket_closed_before_terminal',
      },
      createdAt: now + 1,
    },
    {
      eventId: 62,
      turnId: 'turn_ws_1',
      kind: 'openai_websocket_reconnect',
      role: 'system',
      content: 'recovering_stored_response',
      meta: {
        threadId: 'thread_ws_a',
        turnId: 'turn_ws_1',
        status: 'recovering_stored_response',
        reason: 'socket_closed_after_partial_output',
        responseId: 'resp_ws_partial_1',
      },
      createdAt: now + 2,
    },
  ])

  const reconnecting = mapped.toolActivity.find((item) => item.label === 'Reconnecting... 2/6')
  const fallback = mapped.toolActivity.find((item) => item.label === 'Falling back to the standard OpenAI stream')
  const recoveringStoredResponse = mapped.toolActivity.find((item) => item.label === 'Recovering the final response from stored state')

  assert.ok(reconnecting)
  assert.ok(fallback)
  assert.ok(recoveringStoredResponse)
  assert.match(String(reconnecting.detail || ''), /wait_ms: 5000/)
  assert.match(String(recoveringStoredResponse.detail || ''), /response_id: resp_ws_partial_1/)
  assert.equal(fallback.type, 'warning')
})

test('timeline hydration preserves coalesced OpenAI compaction chronology across reload', () => {
  const now = Date.now()
  const events = [
    {
      eventId: 40,
      turnId: 'turn_compact_1',
      kind: 'openai_compaction_event',
      role: 'system',
      content: 'OpenAI compaction requested.',
      meta: {
        activityId: 'openai_compaction:thread_compact_a:turn_compact_1:automatic:provider_chain_compaction',
        threadId: 'thread_compact_a',
        turnId: 'turn_compact_1',
        providerId: 'openai',
        model: 'gpt-5.4',
        status: 'requested',
        mode: 'automatic',
        reason: 'automatic_compaction_requested',
        selectedCompactionMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
        candidateCompactionModes: [COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION, COMPACTION_MODES.LOCAL_SUMMARY],
        compactionEventType: 'provider_chain_compaction',
        compactionEventPhase: 'running',
        compactionEventOccurred: false,
      },
      createdAt: now + 1,
    },
    {
      eventId: 41,
      turnId: 'turn_compact_1',
      kind: 'openai_compaction_event',
      role: 'system',
      content: 'OpenAI compaction running.',
      meta: {
        activityId: 'openai_compaction:thread_compact_a:turn_compact_1:automatic:provider_chain_compaction',
        threadId: 'thread_compact_a',
        turnId: 'turn_compact_1',
        providerId: 'openai',
        model: 'gpt-5.4',
        status: 'running',
        mode: 'automatic',
        reason: 'automatic_compaction_requested',
        selectedCompactionMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
        candidateCompactionModes: [COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION, COMPACTION_MODES.LOCAL_SUMMARY],
        compactionEventType: 'provider_chain_compaction',
        compactionEventPhase: 'running',
        compactionEventOccurred: false,
      },
      createdAt: now + 2,
    },
    {
      eventId: 42,
      turnId: 'turn_compact_1',
      kind: 'openai_compaction_event',
      role: 'system',
      content: 'OpenAI compaction applied.',
      meta: {
        activityId: 'openai_compaction:thread_compact_a:turn_compact_1:automatic:provider_chain_compaction',
        threadId: 'thread_compact_a',
        turnId: 'turn_compact_1',
        providerId: 'openai',
        model: 'gpt-5.4',
        status: 'applied',
        mode: 'automatic',
        reason: 'compacted',
        selectedCompactionMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
        candidateCompactionModes: [COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION, COMPACTION_MODES.LOCAL_SUMMARY],
        compactionEventType: 'provider_chain_compaction',
        compactionEventPhase: 'resumed_after',
        compactionEventOccurred: true,
        responseId: 'resp_compact_1',
        compactionId: 'cmp_compact_1',
      },
      createdAt: now + 3,
    },
    {
      eventId: 43,
      turnId: 'turn_compact_2',
      kind: 'openai_compaction_event',
      role: 'system',
      content: 'OpenAI compaction failed.',
      meta: {
        activityId: 'openai_compaction:thread_compact_a:turn_compact_2:automatic:provider_chain_compaction',
        threadId: 'thread_compact_a',
        turnId: 'turn_compact_2',
        providerId: 'openai',
        model: 'gpt-5.4',
        status: 'failed',
        mode: 'automatic',
        reason: 'provider_error',
        selectedCompactionMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
        candidateCompactionModes: [COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION, COMPACTION_MODES.LOCAL_SUMMARY],
        compactionFailureReason: 'provider_error',
        fallbackCompactionMode: COMPACTION_MODES.LOCAL_SUMMARY,
        fallbackReason: 'provider_chain_compaction_unavailable',
        compactionEventType: 'provider_chain_compaction',
        compactionEventPhase: 'running',
        compactionEventOccurred: false,
      },
      createdAt: now + 4,
    },
  ]

  const mapped = mapTimelineFromPersistedEvents(events)
  const requested = mapped.toolActivity.find((item) => item.eventKind === 'openai_compaction_event' && item.status === 'requested')
  const running = mapped.toolActivity.find((item) => item.eventKind === 'openai_compaction_event' && item.status === 'running')
  const applied = mapped.toolActivity.find((item) => item.eventKind === 'openai_compaction_event' && item.status === 'applied')
  const failed = mapped.toolActivity.find((item) => item.eventKind === 'openai_compaction_event' && item.status === 'failed')

  assert.ok(requested)
  assert.ok(running)
  assert.ok(applied)
  assert.ok(failed)
  assert.equal(requested.type, 'info')
  assert.equal(running.type, 'info')
  assert.equal(applied.type, 'info')
  assert.equal(failed.type, 'warning')
  assert.equal(requested.id, 'openai_compaction:thread_compact_a:turn_compact_1:automatic:provider_chain_compaction')
  assert.equal(running.id, 'openai_compaction:thread_compact_a:turn_compact_1:automatic:provider_chain_compaction')
  assert.equal(applied.id, 'openai_compaction:thread_compact_a:turn_compact_1:automatic:provider_chain_compaction')
  assert.equal(requested.coalesce, true)
  assert.equal(running.coalesce, true)
  assert.equal(requested.label, 'Compacting context')
  assert.equal(running.label, 'Compacting context')
  assert.equal(applied.compactionMilestone, true)
  assert.match(String(failed.detail || ''), /compaction failure: provider error/)
  assert.match(String(failed.detail || ''), /fallback mode: local summary/)
  assert.match(String(failed.detail || ''), /mode: automatic/)
  assert.match(String(failed.detail || ''), /reason: provider_error/)

  const hydratedTurn = mapped.liveExecution.turnsById.turn_compact_1
  assert.ok(hydratedTurn)
  assert.deepEqual(hydratedTurn.eventOrder, ['activity:openai_compaction:thread_compact_a:turn_compact_1:automatic:provider_chain_compaction'])
  const coalescedEvent = hydratedTurn.eventsById['activity:openai_compaction:thread_compact_a:turn_compact_1:automatic:provider_chain_compaction']
  assert.ok(coalescedEvent)
  assert.equal(coalescedEvent.status, 'done')
  assert.equal(String(coalescedEvent?.activity?.compactionMilestoneTitle || ''), 'Context compacted before the next turn')
})

test('timeline hydration keeps the latest reduced thread occupancy after compaction-applied usage updates', () => {
  const now = Date.now()
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 44,
      turnId: 'turn_compact_usage_1',
      kind: 'chat_usage',
      role: 'system',
      content: 'usage before compaction',
      meta: {
        threadId: 'thread_compact_usage_a',
        turnId: 'turn_compact_usage_1',
        modelLimit: 200000,
        effectiveOccupancyTokens: 180000,
        contextOccupancyTokens: 180000,
        contextRemainingTokens: 20000,
        occupancyAvailable: true,
        occupancySource: 'provider_thread_context',
        occupancyConfidence: 'provider_verified',
        providerOccupancyTokens: 180000,
      },
      createdAt: now,
    },
    {
      eventId: 45,
      turnId: 'turn_compact_usage_1',
      kind: 'openai_compaction_event',
      role: 'system',
      content: 'OpenAI compaction applied.',
      meta: {
        activityId: 'openai_compaction:thread_compact_usage_a:turn_compact_usage_1:automatic:provider_chain_compaction',
        threadId: 'thread_compact_usage_a',
        turnId: 'turn_compact_usage_1',
        providerId: 'openai',
        model: 'gpt-5.4',
        status: 'applied',
        mode: 'automatic',
        reason: 'compacted',
        compactionEventType: 'provider_chain_compaction',
        compactionEventPhase: 'resumed_after',
        compactionEventOccurred: true,
      },
      createdAt: now + 1,
    },
    {
      eventId: 46,
      turnId: 'turn_compact_usage_2',
      kind: 'chat_usage',
      role: 'system',
      content: 'usage after compaction',
      meta: {
        threadId: 'thread_compact_usage_a',
        turnId: 'turn_compact_usage_2',
        modelLimit: 200000,
        effectiveOccupancyTokens: 40000,
        contextOccupancyTokens: 40000,
        contextRemainingTokens: 160000,
        occupancyAvailable: true,
        occupancySource: 'provider_thread_context',
        occupancyConfidence: 'provider_verified',
        providerOccupancyTokens: 40000,
      },
      createdAt: now + 2,
    },
  ])

  assert.equal(mapped.contextUsage.contextOccupancyTokens, 40000)
  assert.equal(mapped.contextUsage.contextRemainingTokens, 160000)
  assert.equal(mapped.contextUsage.occupancySource, 'provider_thread_context')
  assert.equal(mapped.contextUsage.occupancyConfidence, 'provider_verified')
})

test('timeline hydration preserves recalculating compaction usage refresh metadata across reload', () => {
  const now = Date.now()
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 47,
      turnId: 'turn_compact_reload_before',
      kind: 'chat_usage',
      role: 'system',
      content: 'usage before compaction refresh',
      meta: {
        threadId: 'thread_compact_reload_a',
        turnId: 'turn_compact_reload_before',
        usage: { inputTokens: 80, outputTokens: 20, totalTokens: 100 },
        rollingInputTokens: 180,
        rollingOutputTokens: 40,
        rollingTotalTokens: 220,
        modelLimit: 400000,
        contextOccupancyTokens: 12000,
        contextRemainingTokens: 388000,
        occupancySource: 'provider_thread_context',
        occupancyConfidence: 'provider_verified',
        providerOccupancyTokens: 12000,
      },
      createdAt: now,
    },
    {
      eventId: 48,
      turnId: 'turn_compact_reload_after',
      kind: 'chat_usage',
      role: 'system',
      content: 'usage after compaction refresh',
      meta: {
        threadId: 'thread_compact_reload_a',
        turnId: 'turn_compact_reload_after',
        usage: {},
        compactionStrategy: 'codex_thread_compaction',
        compactionScope: 'thread_reset',
        compactionSource: 'provider',
        usageRefreshState: 'recalculating',
        occupancySource: 'unavailable',
        occupancyConfidence: 'unavailable',
        authMethod: 'account',
        transportMode: 'codex_app_server_chatgpt',
      },
      createdAt: now + 1,
    },
  ])

  assert.equal(mapped.contextUsage.turnId, 'turn_compact_reload_after')
  assert.equal(mapped.contextUsage.rollingTotalTokens, 220)
  assert.equal(mapped.contextUsage.compactionStrategy, 'codex_thread_compaction')
  assert.equal(mapped.contextUsage.compactionScope, 'thread_reset')
  assert.equal(mapped.contextUsage.compactionSource, 'provider')
  assert.equal(mapped.contextUsage.usageRefreshState, 'recalculating')
  assert.equal(mapped.contextUsage.occupancySource, 'unavailable')
  assert.equal(mapped.contextUsage.occupancyConfidence, 'unavailable')
  assert.equal(mapped.contextUsage.authMethod, 'account')
})

test('timeline hydration preserves verified compaction usage refresh metadata across reload', () => {
  const now = Date.now()
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 49,
      turnId: 'turn_compact_verified_before',
      kind: 'chat_usage',
      role: 'system',
      content: 'usage before compaction refresh',
      meta: {
        threadId: 'thread_compact_verified_a',
        turnId: 'turn_compact_verified_before',
        usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 },
        rollingInputTokens: 220,
        rollingOutputTokens: 60,
        rollingTotalTokens: 280,
        modelLimit: 400000,
        contextOccupancyTokens: 180000,
        contextRemainingTokens: 220000,
        occupancySource: 'provider_thread_context',
        occupancyConfidence: 'provider_verified',
        providerOccupancyTokens: 180000,
      },
      createdAt: now,
    },
    {
      eventId: 50,
      turnId: 'turn_compact_verified_after',
      kind: 'chat_usage',
      role: 'system',
      content: 'usage after compaction refresh',
      meta: {
        threadId: 'thread_compact_verified_a',
        turnId: 'turn_compact_verified_after',
        usage: {},
        compactionStrategy: 'codex_thread_compaction',
        compactionScope: 'thread_reset',
        compactionSource: 'provider',
        usageRefreshState: 'verified',
        modelLimit: 400000,
        contextOccupancyTokens: 8000,
        effectiveOccupancyTokens: 8000,
        threadOccupancyTokens: 8000,
        providerOccupancyTokens: 8000,
        contextRemainingTokens: 392000,
        occupancySource: 'provider_thread_context',
        occupancyConfidence: 'provider_verified',
        authMethod: 'account',
        transportMode: 'codex_app_server_chatgpt',
      },
      createdAt: now + 1,
    },
  ])

  assert.equal(mapped.contextUsage.turnId, 'turn_compact_verified_after')
  assert.equal(mapped.contextUsage.rollingTotalTokens, 280)
  assert.equal(mapped.contextUsage.compactionStrategy, 'codex_thread_compaction')
  assert.equal(mapped.contextUsage.compactionScope, 'thread_reset')
  assert.equal(mapped.contextUsage.compactionSource, 'provider')
  assert.equal(mapped.contextUsage.usageRefreshState, 'verified')
  assert.equal(mapped.contextUsage.contextOccupancyTokens, 8000)
  assert.equal(mapped.contextUsage.contextRemainingTokens, 392000)
  assert.equal(mapped.contextUsage.occupancySource, 'provider_thread_context')
  assert.equal(mapped.contextUsage.occupancyConfidence, 'provider_verified')
  assert.equal(mapped.contextUsage.authMethod, 'account')
})

test('timeline hydration maps Anthropic compaction notices with provider-specific labeling', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 69,
      turnId: 'turn_anthropic_notice_1',
      kind: 'anthropic_compaction_notice',
      role: 'system',
      content: 'Anthropic compaction threshold override ignored: provide a positive token threshold for Anthropic context management.',
      meta: {
        threadId: 'thread_anthropic_notice_a',
        turnId: 'turn_anthropic_notice_1',
        type: 'warning',
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        reason: 'invalid_threshold',
      },
      createdAt: Date.now(),
    },
  ])

  const notice = mapped.toolActivity.find((item) => item.eventKind === 'anthropic_compaction_notice')
  assert.ok(notice)
  assert.equal(notice.label, 'Anthropic compaction notice')
  assert.equal(notice.type, 'warning')
  assert.match(String(notice.detail || ''), /provider: anthropic/i)
  assert.match(String(notice.detail || ''), /reason: invalid_threshold/i)
})

test('timeline hydration maps Anthropic compaction events as provider milestones', () => {
  const now = Date.now()
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 70,
      turnId: 'turn_anthropic_1',
      kind: 'anthropic_compaction_event',
      role: 'system',
      content: 'Anthropic context compaction applied.',
      meta: {
        threadId: 'thread_anthropic_a',
        turnId: 'turn_anthropic_1',
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        selectedCompactionMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
        candidateCompactionModes: [COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION, COMPACTION_MODES.LOCAL_SUMMARY],
        contextManagementApplied: true,
        contextManagementAppliedEdits: ['compact_20260112'],
        contextManagementCompactionThresholdTokens: 80_000,
        usageIterations: [
          { type: 'compaction', inputTokens: 1200, outputTokens: 140 },
          { type: 'message', inputTokens: 700, outputTokens: 110 },
        ],
      },
      createdAt: now,
    },
  ])

  const activity = mapped.toolActivity.find((item) => item.eventKind === 'anthropic_compaction_event')

  assert.ok(activity)
  assert.equal(activity.type, 'info')
  assert.equal(activity.id, 'anthropic_compaction:thread_anthropic_a:turn_anthropic_1:anthropic_context_management')
  assert.equal(activity.coalesce, true)
  assert.equal(activity.status, 'applied')
  assert.equal(activity.strategy, 'anthropic_context_management')
  assert.equal(activity.scope, 'partial_reduce')
  assert.equal(activity.source, 'provider')
  assert.equal(activity.usageRefreshState, 'none')
  assert.equal(activity.label, 'Anthropic context compaction applied')
  assert.match(String(activity.detail || ''), /compaction mode: provider chain compaction/)
  assert.match(String(activity.detail || ''), /applied_edits: compact_20260112/)
  assert.match(String(activity.detail || ''), /context_management_threshold_tokens: 80000/)
  assert.match(String(activity.detail || ''), /usage_iterations: compaction:1200\/140, message:700\/110/)
  assert.equal(activity.compactionMilestone, true)
  assert.equal(activity.compactionMilestoneTitle, 'Context automatically compacted')
})

test('timeline hydration preserves estimated local continuity compaction usage refresh metadata across reload', () => {
  const now = Date.now()
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 71,
      turnId: 'turn_local_compact_before',
      kind: 'chat_usage',
      role: 'system',
      content: 'usage before local compaction refresh',
      meta: {
        threadId: 'thread_local_compact_a',
        turnId: 'turn_local_compact_before',
        usage: { inputTokens: 90, outputTokens: 10, totalTokens: 100 },
        rollingInputTokens: 190,
        rollingOutputTokens: 30,
        rollingTotalTokens: 220,
        modelLimit: 400000,
        contextOccupancyTokens: 180000,
        contextRemainingTokens: 220000,
        occupancySource: 'provider_thread_context',
        occupancyConfidence: 'provider_verified',
        providerOccupancyTokens: 180000,
      },
      createdAt: now,
    },
    {
      eventId: 72,
      turnId: 'turn_local_compact_after',
      kind: 'chat_usage',
      role: 'system',
      content: 'usage after local compaction refresh',
      meta: {
        threadId: 'thread_local_compact_a',
        turnId: 'turn_local_compact_after',
        usage: {},
        modelLimit: 400000,
        estimatedOccupancyTokens: 32000,
        effectiveOccupancyTokens: 32000,
        contextOccupancyTokens: 32000,
        contextRemainingTokens: 368000,
        occupancySource: 'thread_local_estimate',
        occupancyConfidence: 'calibrated_estimate',
        occupancyMethod: 'compaction_estimate',
        compactionStrategy: 'continuity_packet',
        compactionScope: 'partial_reduce',
        compactionSource: 'local',
        usageRefreshState: 'estimated',
      },
      createdAt: now + 1,
    },
  ])

  assert.equal(mapped.contextUsage.turnId, 'turn_local_compact_after')
  assert.equal(mapped.contextUsage.rollingTotalTokens, 220)
  assert.equal(mapped.contextUsage.compactionStrategy, 'continuity_packet')
  assert.equal(mapped.contextUsage.compactionScope, 'partial_reduce')
  assert.equal(mapped.contextUsage.compactionSource, 'local')
  assert.equal(mapped.contextUsage.usageRefreshState, 'estimated')
  assert.equal(mapped.contextUsage.contextOccupancyTokens, 32000)
  assert.equal(mapped.contextUsage.contextRemainingTokens, 368000)
  assert.equal(mapped.contextUsage.occupancySource, 'thread_local_estimate')
  assert.equal(mapped.contextUsage.occupancyConfidence, 'calibrated_estimate')
})

test('timeline hydration preserves assistant phase metadata for replay-sensitive turns', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 30,
      turnId: 'turn_phase_1',
      kind: 'assistant_message',
      role: 'assistant',
      content: 'Completed the task.',
      meta: {
        providerId: 'openai',
        model: 'gpt-5.4',
        phase: 'final_answer',
      },
      createdAt: Date.now(),
    },
  ])

  assert.equal(mapped.messages[0].role, 'assistant')
  assert.equal(mapped.messages[0].phase, 'final_answer')
})

test('timeline hydration maps continuity drift and invariant violations as non-fatal warnings', () => {
  const now = Date.now()
  const events = [
    {
      eventId: 20,
      turnId: 'turn_warn_1',
      kind: 'continuity_drift_detected',
      role: 'system',
      content: 'Continuity drift detected',
      meta: {
        threadId: 'thread_warn_a',
        turnId: 'turn_warn_1',
        driftRisk: 'medium',
        violationCount: 1,
      },
      createdAt: now,
    },
    {
      eventId: 21,
      turnId: 'turn_warn_1',
      kind: 'continuity_invariant_violated',
      role: 'system',
      content: 'Continuity invariant violated',
      meta: {
        threadId: 'thread_warn_a',
        turnId: 'turn_warn_1',
        violationCount: 1,
      },
      createdAt: now + 1,
    },
  ]

  const mapped = mapTimelineFromPersistedEvents(events)
  const driftActivity = mapped.toolActivity.find((item) => item.eventKind === 'continuity_drift_detected')
  const invariantActivity = mapped.toolActivity.find((item) => item.eventKind === 'continuity_invariant_violated')

  assert.ok(driftActivity)
  assert.ok(invariantActivity)
  assert.equal(driftActivity.type, 'warning')
  assert.equal(invariantActivity.type, 'warning')
  assert.equal(driftActivity.isError, false)
  assert.equal(invariantActivity.isError, false)
  assert.match(String(driftActivity.label || ''), /Continuity warning: drift detected/i)
  assert.match(String(invariantActivity.label || ''), /Continuity warning: invariant violated/i)
})
