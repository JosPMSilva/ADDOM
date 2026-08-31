function freezeTarget(target) {
  return Object.freeze({
    ...target,
    evidence: Object.freeze([...target.evidence]),
    limitations: Object.freeze([...target.limitations]),
  })
}

export const NATIVE_AGENT_SUPPORT_TARGETS = Object.freeze({
  openaiAccount: freezeTarget({
    runtimeRoute: 'openai_account_app_server',
    capabilityMode: 'partial_native_projection',
    releaseState: 'available',
    childIdentity: 'receiver_thread_id',
    childStream: 'unavailable',
    childControl: 'unavailable',
    evidence: [
      'tests/fixtures/agent-runs/openai-native-collaboration',
      'tests/integration/ai-provider-openai-account.test.mjs',
    ],
    limitations: [
      'The current bridge exposes receiver thread identity but no child transcript.',
      'Only root-turn cancellation is proven.',
      'OpenAIAccountBridge has no child transcript read RPC; childStreams stays false until Sprint 4 substance is proven.',
    ],
  }),
  cursor: freezeTarget({
    runtimeRoute: 'cursor_agent_cli',
    capabilityMode: 'partial_native_projection',
    releaseState: 'available',
    childIdentity: 'unavailable',
    childStream: 'unavailable',
    childControl: 'unavailable',
    evidence: [
      'tests/fixtures/agent-runs/cursor-root-session',
      'tests/fixtures/cursor-agent/stream-success.ndjson',
    ],
    limitations: [
      'The checked-in protocol proves a root session only.',
      'Task-like tool labels are not stable child identity.',
      'Sprint 5 freeze: no child demux until a sanitized multi-Task capture proves stable ids; adapter never emits node_discovered from Task labels.',
    ],
  }),
  openaiResponses: freezeTarget({
    runtimeRoute: 'openai_responses_multi_agent_beta',
    capabilityMode: 'native_hierarchy',
    releaseState: 'contract_only',
    childIdentity: 'agent_path',
    childStream: 'agent_attributed_items',
    childControl: 'hosted_actions',
    evidence: [
      'https://developers.openai.com/api/docs/guides/responses-multi-agent',
    ],
    limitations: [
      'ADDOM does not yet ship this beta runtime route.',
      'The beta item schema may change.',
    ],
  }),
})
