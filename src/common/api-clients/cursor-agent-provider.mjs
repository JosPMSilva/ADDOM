export const CURSOR_AGENT_PROVIDER_ID = 'cursor'
export const CURSOR_AGENT_MODEL_ID = 'composer-2.5'
export const CURSOR_AGENT_GROK_4_5_HIGH_FAST_MODEL_ID = 'cursor-grok-4.5-high-fast'

export const CURSOR_AGENT_MODEL_IDS = Object.freeze([
  CURSOR_AGENT_MODEL_ID,
  CURSOR_AGENT_GROK_4_5_HIGH_FAST_MODEL_ID,
])

export const CURSOR_AGENT_PROVIDER = Object.freeze({
  id: CURSOR_AGENT_PROVIDER_ID,
  label: 'Cursor',
  type: 'remote',
  providerClass: 'agent_runtime',
  logoPath: 'provider-logos/cursor.svg',
  keyPlaceholder: 'crsr_...',
  keyUrl: 'https://cursor.com/dashboard?tab=integrations',
  availableAuthMethods: ['account', 'api_key'],
  capabilities: Object.freeze({
    agentRuntime: true,
    chatExecute: true,
    requiresExecuteMode: true,
    requiresFullAccess: true,
    addomTools: false,
    inlineCompletion: false,
    subagents: false,
    projectKnowledge: false,
    contextTelemetry: false,
    quotaTelemetry: false,
    compactionTelemetry: false,
  }),
})

export const CURSOR_AGENT_MODELS = Object.freeze([
  Object.freeze({
    id: CURSOR_AGENT_MODEL_ID,
    label: 'Composer 2.5',
    family: 'Composer',
    providerClass: 'agent_runtime',
    supportsTools: false,
    supportsReasoning: false,
    contextWindowTokens: null,
  }),
  Object.freeze({
    id: CURSOR_AGENT_GROK_4_5_HIGH_FAST_MODEL_ID,
    label: 'Grok 4.5 High Fast',
    family: 'Grok',
    providerClass: 'agent_runtime',
    supportsTools: false,
    supportsReasoning: false,
    contextWindowTokens: null,
  }),
])

export function isSupportedCursorAgentModelId(modelId = '') {
  return CURSOR_AGENT_MODEL_IDS.includes(String(modelId || '').trim().toLowerCase())
}

export function resolveCursorAgentModelId(modelId = '') {
  const normalized = String(modelId || '').trim().toLowerCase()
  if (!CURSOR_AGENT_MODEL_IDS.includes(normalized)) {
    throw new Error('Unsupported Cursor model.')
  }
  return normalized
}

export function getCursorAgentProviderManifestEntry() {
  return {
    ...CURSOR_AGENT_PROVIDER,
    name: CURSOR_AGENT_PROVIDER.label,
    defaultModel: CURSOR_AGENT_MODEL_ID,
    models: getCursorAgentModels(),
    capabilities: { ...CURSOR_AGENT_PROVIDER.capabilities },
  }
}

export function getCursorAgentModels() {
  return CURSOR_AGENT_MODELS.map((model) => ({ ...model }))
}
